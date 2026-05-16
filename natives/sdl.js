// JavaScript implementation of arc.backend.sdl.jni.SDL methods.
// Maps SDL2 surface (window/events/GL context) onto DOM + WebGL APIs.

import { mangleClass } from './jni.js';

// ── State shared with sdlgl.js ────────────────────────────────────────────────
export const state = {
  canvas: null,          // HTMLCanvasElement we render into
  gl: null,              // WebGL2RenderingContext (or WebGL1 fallback)
  glAttrs: {},           // accumulated SDL_GL_SetAttribute values
  events: [],            // pending input events for SDL_PollEvent
  windowHandle: 1,       // arbitrary non-zero id we return as "the window"
  glContextHandle: 2,    // arbitrary non-zero id we return as "the context"
  width: 1280,
  height: 720,
  textInputActive: false,
  lastError: '',
};

// SDL event types we care about (matching SDL2 headers)
const SDL_QUIT = 0x100;
const SDL_WINDOWEVENT = 0x200;
const SDL_KEYDOWN = 0x300;
const SDL_KEYUP = 0x301;
const SDL_TEXTINPUT = 0x303;
const SDL_MOUSEMOTION = 0x400;
const SDL_MOUSEBUTTONDOWN = 0x401;
const SDL_MOUSEBUTTONUP = 0x402;
const SDL_MOUSEWHEEL = 0x403;

// SDL_WINDOWEVENT subtypes
const SDL_WINDOWEVENT_RESIZED = 5;
const SDL_WINDOWEVENT_FOCUS_GAINED = 12;
const SDL_WINDOWEVENT_FOCUS_LOST = 13;

export function attachCanvas(canvas) {
  state.canvas = canvas;
  state.width  = canvas.width  = canvas.clientWidth  || 1280;
  state.height = canvas.height = canvas.clientHeight || 720;
  installEventListeners(canvas);
}

function installEventListeners(canvas) {
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    state.events.push({ type: SDL_MOUSEMOTION, x: e.clientX - r.left, y: e.clientY - r.top });
  });
  canvas.addEventListener('mousedown', (e) => {
    const r = canvas.getBoundingClientRect();
    state.events.push({ type: SDL_MOUSEBUTTONDOWN, button: e.button + 1, x: e.clientX - r.left, y: e.clientY - r.top });
  });
  canvas.addEventListener('mouseup', (e) => {
    const r = canvas.getBoundingClientRect();
    state.events.push({ type: SDL_MOUSEBUTTONUP, button: e.button + 1, x: e.clientX - r.left, y: e.clientY - r.top });
  });
  canvas.addEventListener('wheel', (e) => {
    state.events.push({ type: SDL_MOUSEWHEEL, x: -Math.sign(e.deltaX), y: -Math.sign(e.deltaY) });
    e.preventDefault();
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    state.events.push({ type: SDL_KEYDOWN, scancode: domToScancode(e.code), keycode: e.keyCode });
    if (state.textInputActive && e.key.length === 1) {
      state.events.push({ type: SDL_TEXTINPUT, text: e.key });
    }
  });
  window.addEventListener('keyup', (e) => {
    state.events.push({ type: SDL_KEYUP, scancode: domToScancode(e.code), keycode: e.keyCode });
  });
  window.addEventListener('resize', () => {
    canvas.width  = state.width  = canvas.clientWidth;
    canvas.height = state.height = canvas.clientHeight;
    state.events.push({ type: SDL_WINDOWEVENT, sub: SDL_WINDOWEVENT_RESIZED, w: state.width, h: state.height });
  });
  window.addEventListener('focus', () => {
    state.events.push({ type: SDL_WINDOWEVENT, sub: SDL_WINDOWEVENT_FOCUS_GAINED });
  });
  window.addEventListener('blur', () => {
    state.events.push({ type: SDL_WINDOWEVENT, sub: SDL_WINDOWEVENT_FOCUS_LOST });
  });
}

// Minimal DOM KeyboardEvent.code → SDL scancode mapping. Expand as needed.
function domToScancode(code) {
  // SDL_SCANCODE_* values from SDL2 scancodes.h
  const map = {
    'KeyA': 4, 'KeyB': 5, 'KeyC': 6, 'KeyD': 7, 'KeyE': 8, 'KeyF': 9,
    'KeyG': 10, 'KeyH': 11, 'KeyI': 12, 'KeyJ': 13, 'KeyK': 14, 'KeyL': 15,
    'KeyM': 16, 'KeyN': 17, 'KeyO': 18, 'KeyP': 19, 'KeyQ': 20, 'KeyR': 21,
    'KeyS': 22, 'KeyT': 23, 'KeyU': 24, 'KeyV': 25, 'KeyW': 26, 'KeyX': 27,
    'KeyY': 28, 'KeyZ': 29,
    'Digit1': 30, 'Digit2': 31, 'Digit3': 32, 'Digit4': 33, 'Digit5': 34,
    'Digit6': 35, 'Digit7': 36, 'Digit8': 37, 'Digit9': 38, 'Digit0': 39,
    'Enter': 40, 'Escape': 41, 'Backspace': 42, 'Tab': 43, 'Space': 44,
    'ArrowRight': 79, 'ArrowLeft': 80, 'ArrowDown': 81, 'ArrowUp': 82,
    'ShiftLeft': 225, 'ShiftRight': 229, 'ControlLeft': 224, 'ControlRight': 228,
    'AltLeft': 226, 'AltRight': 230,
  };
  return map[code] || 0;
}

// ── JNI method implementations ────────────────────────────────────────────────
const methods = {
  // ── Init / lifecycle ────────────────────────────────────────────────────────
  'SDL_Init':           (lib, flags) => 0,
  'SDL_InitSubSystem':  (lib, flags) => 0,
  'SDL_QuitSubSystem':  (lib, flags) => {},
  'SDL_WasInit':        (lib, flags) => flags, // pretend everything is up
  'SDL_Quit':           (lib) => {},
  'SDL_SetHint':        (lib, name, value) => true,
  'SDL_GetError':       (lib) => state.lastError,

  // ── Version ─────────────────────────────────────────────────────────────────
  'SDL_GetCompiledVersion': (lib, arr) => writeIntArray(arr, [2, 28, 0]),
  'SDL_GetVersion':         (lib, arr) => writeIntArray(arr, [2, 28, 0]),

  // ── Clipboard ───────────────────────────────────────────────────────────────
  'SDL_SetClipboardText': async (lib, text) => {
    try { await navigator.clipboard.writeText(text); return 0; } catch { return -1; }
  },
  'SDL_GetClipboardText': async (lib) => {
    try { return await navigator.clipboard.readText(); } catch { return ''; }
  },

  // ── Window ──────────────────────────────────────────────────────────────────
  'SDL_CreateWindow': (lib, title, w, h, flags) => {
    if (state.canvas) {
      state.canvas.width  = state.width  = w;
      state.canvas.height = state.height = h;
    }
    if (typeof title === 'string') document.title = title;
    return state.windowHandle;
  },
  'SDL_DestroyWindow':      (lib, h) => {},
  'SDL_SetWindowIcon':      (lib, h, s) => {},
  'SDL_RestoreWindow':      (lib, h) => {},
  'SDL_MaximizeWindow':     (lib, h) => {},
  'SDL_MinimizeWindow':     (lib, h) => {},
  'SDL_SetWindowFullscreen':(lib, h, flags) => {
    if (flags && state.canvas?.requestFullscreen) state.canvas.requestFullscreen().catch(()=>{});
    else if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});
    return 0;
  },
  'SDL_SetWindowBordered':  (lib, h, b) => {},
  'SDL_SetWindowSize':      (lib, h, w, ht) => {
    if (state.canvas) { state.canvas.width = state.width = w; state.canvas.height = state.height = ht; }
  },
  'SDL_SetWindowPosition':  (lib, h, x, y) => {},
  'SDL_GetWindowDisplayIndex': (lib, h) => 0,
  'SDL_GetDisplayUsableBounds': (lib, d, arr) => writeIntArray(arr, [0, 0, screen.availWidth, screen.availHeight]),
  'SDL_GetDisplayBounds':       (lib, d, arr) => writeIntArray(arr, [0, 0, screen.width, screen.height]),
  'SDL_GetCurrentDisplayMode':  (lib, d, arr) => writeIntArray(arr, [screen.width, screen.height]),
  'SDL_GetDesktopDisplayMode':  (lib, d, arr) => writeIntArray(arr, [screen.width, screen.height]),
  'SDL_SetWindowAlwaysOnTop':   (lib, h, t) => {},
  'SDL_GetNumVideoDisplays':    (lib) => 1,
  'SDL_GetWindowFlags':         (lib, h) => 0,
  'SDL_SetWindowTitle':         (lib, h, t) => { if (typeof t === 'string') document.title = t; },

  // ── Surface / cursor (mostly no-ops; SDL_Cursor handles are dummy ids) ──────
  'SDL_CreateRGBSurfaceFrom': (lib, bytes, w, h) => 100,
  'SDL_CreateColorCursor':    (lib, surf, hx, hy) => 101,
  'SDL_CreateSystemCursor':   (lib, type) => 102,
  'SDL_SetCursor':            (lib, h) => {},
  'SDL_FreeCursor':           (lib, h) => {},
  'SDL_FreeSurface':          (lib, h) => {},

  // ── Dialog ──────────────────────────────────────────────────────────────────
  'SDL_ShowSimpleMessageBox': (lib, flags, title, msg) => {
    alert((title ? title + '\n\n' : '') + (msg || '')); return 0;
  },

  // ── Text input ──────────────────────────────────────────────────────────────
  'SDL_StartTextInput':   (lib) => { state.textInputActive = true; },
  'SDL_StopTextInput':    (lib) => { state.textInputActive = false; },
  'SDL_SetTextInputRect': (lib, x, y, w, h) => {},

  // ── Event polling ───────────────────────────────────────────────────────────
  'SDL_PollEvent': (lib, data) => {
    if (state.events.length === 0) return false;
    const ev = state.events.shift();
    // data[0] = event type; remaining slots depend on event type.
    // The exact slot layout is defined by Arc's SdlInput; we'll fill in
    // a reasonable approximation here and adjust when we see how Arc reads it.
    const out = [0, 0, 0, 0, 0, 0, 0, 0];
    out[0] = ev.type;
    if (ev.type === SDL_MOUSEMOTION) { out[1] = ev.x; out[2] = ev.y; }
    else if (ev.type === SDL_MOUSEBUTTONDOWN || ev.type === SDL_MOUSEBUTTONUP) {
      out[1] = ev.button; out[2] = ev.x; out[3] = ev.y;
    } else if (ev.type === SDL_MOUSEWHEEL) { out[1] = ev.x; out[2] = ev.y; }
    else if (ev.type === SDL_KEYDOWN || ev.type === SDL_KEYUP) {
      out[1] = ev.scancode; out[2] = ev.keycode;
    } else if (ev.type === SDL_WINDOWEVENT) {
      out[1] = ev.sub || 0; out[2] = ev.w || 0; out[3] = ev.h || 0;
    }
    writeIntArray(data, out);
    return true;
  },

  // ── GL context ──────────────────────────────────────────────────────────────
  'SDL_GL_SetAttribute':      (lib, attr, value) => { state.glAttrs[attr] = value; return 0; },
  'SDL_GL_ExtensionSupported':(lib, ext) => {
    if (!state.gl) return false;
    return state.gl.getSupportedExtensions().includes(ext);
  },
  'SDL_GL_CreateContext': (lib, win) => {
    if (!state.canvas) throw new Error('SDL_GL_CreateContext: no canvas attached');
    // `failIfMajorPerformanceCaveat: false` lets the context be created on
    // software renderers (SwiftShader / llvmpipe) — important for Chromebooks,
    // remote desktops, and machines without proper GPU drivers. Performance
    // will be poor but the game can still render.
    const opts = {
      alpha: false, antialias: false, depth: true, stencil: true,
      failIfMajorPerformanceCaveat: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false,
    };
    state.gl = state.canvas.getContext('webgl2', opts)
            || state.canvas.getContext('webgl', opts)
            || state.canvas.getContext('experimental-webgl', opts);
    if (!state.gl) throw new Error('WebGL not supported in this browser');
    return state.glContextHandle;
  },
  'SDL_GL_SetSwapInterval': (lib, on) => 0,
  'SDL_GL_SwapWindow': (lib, win) => {
    state.frameCount = (state.frameCount || 0) + 1;
    const now = performance.now();
    if (!state.lastFrameLog || now - state.lastFrameLog > 1000) {
      const fps = state.frameCount - (state.lastFrameCount || 0);
      const drawsPerSec = (state.drawCalls || 0) - (state.lastDrawCalls || 0);
      const clearsPerSec = (state.clearCount || 0) - (state.lastClearCount || 0);
      // FRAMEBUFFER_BINDING (0x8CA6) — null means default framebuffer (canvas).
      // If non-null at swap time, we never unbound an FBO before swap, which
      // means draws went off-screen and nothing reaches the canvas.
      let fbBinding = '?';
      try {
        const fb = state.gl && state.gl.getParameter(0x8CA6);
        fbBinding = fb === null ? 'CANVAS' : 'FBO#' + (fb && fb.constructor ? fb.constructor.name : 'unknown');
      } catch {}
      console.log('[render] frame ' + state.frameCount + ' (~' + fps + ' fps, '
        + drawsPerSec + ' draws/s, ' + clearsPerSec + ' clears/s, '
        + 'clearColor=' + JSON.stringify(state.lastClearColor || 'unset') + ', '
        + 'boundFB=' + fbBinding + ', '
        + 'canvas ' + state.width + 'x' + state.height + ')');
      state.lastFrameLog = now;
      state.lastFrameCount = state.frameCount;
      state.lastDrawCalls = state.drawCalls || 0;
      state.lastClearCount = state.clearCount || 0;
    }
  },
  'SDL_GL_GetDrawableSize': (lib, win, arr) => writeIntArray(arr, [state.width, state.height]),
};

// ── Helper: write a list of ints into a Java int[] handle ─────────────────────
// CheerpJ passes Java arrays as opaque handles; the `lib` object lets us
// access them. We don't know the exact API without testing, so this is a
// placeholder we'll refine after first runtime errors.
function writeIntArray(arr, values) {
  if (arr && typeof arr === 'object' && 'length' in arr) {
    for (let i = 0; i < Math.min(values.length, arr.length); i++) arr[i] = values[i];
  }
}

export default mangleClass('arc.backend.sdl.jni.SDL', methods);
