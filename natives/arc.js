function logArc(msg) {
  console.log(`[arc-native] ${msg}`);
}

const _loggedMissing = new Set();
function makeNoopStub(name) {
  // Throwing here propagates as an unhandled JNI exception and crashes the
  // JVM mid-frame, killing the whole page. Most missing Arc natives are
  // audio (Soloud) or text (FreeType) calls whose return value the game
  // tolerates being 0/null — so prefer a quiet no-op + one-time log, and
  // let the user *see* something even if it isn't fully functional.
  return async function missingArcNative() {
    if (!_loggedMissing.has(name)) {
      _loggedMissing.add(name);
      logArc(`stubbed (no-op): ${name}`);
    }
    return 0;
  };
}

let nextHandle = 1;
const allocHandle = () => nextHandle++;

// arc.util.Buffers' native methods. These can't be no-op'd: callers expect a
// real java.nio.ByteBuffer back, and dereference / .order() it immediately.
// We allocate via Java's own ByteBuffer.allocateDirect through the CheerpJ
// runtime handle (`lib`), which gives Mindustry a usable buffer object even
// though there's no real off-heap memory underneath in the browser.
const bufferNatives = {
  async Java_arc_util_Buffers_newDisposableByteBuffer(lib, capacity) {
    const ByteBuffer = await lib.java.nio.ByteBuffer;
    const buf = await ByteBuffer.allocateDirect(capacity | 0);
    // Attach a JS-side shadow Uint8Array so sdlgl.js can hand it directly to
    // gl.bufferData / gl.texImage2D without an async per-byte read. copyJni
    // mirrors writes into this shadow so the JS view stays in sync with the
    // Java NIO buffer.
    try { buf.__jsShadow = new Uint8Array(capacity | 0); } catch {}
    return buf;
  },
  async Java_arc_util_Buffers_freeMemory(lib, buf) {
    // No-op: GC will collect when the Java reference is dropped.
  },
  async Java_arc_util_Buffers_getBufferAddress(lib, buf) {
    // Non-zero placeholder. Arc's `getUnsafeBufferAddress` adds `position()`
    // and uses the result as a JNI handle; nothing in the WebGL path actually
    // dereferences this on the JS side, so any unique non-zero value works.
    return allocHandle();
  },
  async Java_arc_util_Buffers_clear(lib, buf, count) {
    if (!buf) return;
    // Best-effort: zero out [position..position+count) via buf.put(zero) loop.
    // Falls back to a no-op if the bridge doesn't expose those methods.
    try {
      const pos = await buf.position();
      for (let i = 0; i < count; i++) await buf.put(pos + i, 0);
    } catch {}
  },

  // Pixmap natives. Signatures (from javap):
  //   static native ByteBuffer createJni(long[] handleOut, int w, int h)
  //   static native ByteBuffer loadJni(long[] handleOut, byte[] data, int off, int len)
  //   static native void free(long handle)
  //   static native String getFailureReason()
  //
  // createJni allocates a blank RGBA8 buffer for a new Pixmap and writes a
  // synthetic native handle into handleOut[0]. The Java side stores the
  // returned ByteBuffer as `Pixmap.pixels`; the handle is opaque to us as
  // long as `free` accepts it later.
  async Java_arc_graphics_Pixmap_createJni(lib, handleOut, w, h) {
    const width = w | 0, height = h | 0;
    const size = Math.max(0, width * height * 4);
    const ByteBuffer = await lib.java.nio.ByteBuffer;
    const buf = await ByteBuffer.allocateDirect(size);
    const handle = allocHandle();
    if (handleOut) {
      // Java long[] supports indexed assignment through CheerpJ.
      try { handleOut[0] = handle; } catch {}
      if (typeof handleOut.put === 'function') {
        try { await handleOut.put(0, handle); } catch {}
      }
    }
    return buf;
  },

  // Image decode path (PNG/JPG bytes -> raw RGBA). We can't decode
  // synchronously in JS — createImageBitmap is the only browser-native option
  // and it's async, plus it doesn't give back pixel bytes without a canvas
  // round-trip. For now, return an empty RGBA buffer so Mindustry's
  // Pixmap.<init>(byte[]) doesn't AIOOBE; textures will be blank but the
  // loading path will continue. Real decode is a follow-up.
  async Java_arc_graphics_Pixmap_loadJni(lib, handleOut, data, off, len) {
    const ByteBuffer = await lib.java.nio.ByteBuffer;
    // 1×1 transparent placeholder; Pixmap reads width/height from this buffer
    // size indirectly through its own load() path, so keep size = 4 (1 RGBA).
    const buf = await ByteBuffer.allocateDirect(4);
    const handle = allocHandle();
    if (handleOut) {
      try { handleOut[0] = handle; } catch {}
      if (typeof handleOut.put === 'function') {
        try { await handleOut.put(0, handle); } catch {}
      }
    }
    return buf;
  },

  async Java_arc_graphics_Pixmap_free(lib, handle) {
    // No-op: the JS GC handles our buffers when Java drops its reference.
  },

  async Java_arc_graphics_Pixmap_getFailureReason(lib) {
    return '';
  },

  // FreeType natives. Arc checks the return of `initFreeTypeJni` against 0 to
  // detect failure. Returning any non-zero long keeps it happy. Glyph
  // rendering will fall through to our auto-stub no-ops downstream, so text
  // will render invisibly — but the game continues. Real FreeType-in-browser
  // is a follow-up (opentype.js or harfbuzzjs would be the libs to bind).
  async Java_arc_freetype_FreeType_initFreeTypeJni(lib) {
    return allocHandle();
  },
  async Java_arc_freetype_FreeType_getLastErrorCode(lib) {
    return 0;
  },
  async Java_arc_freetype_FreeType_doneFreeType(lib, h) { /* no-op */ },

  // --- FreeType.Library / Face / Glyph / Bitmap / *Metrics natives -----------
  //
  // Arc's FreeType binding treats `long` returns of 0 as failure and `boolean`
  // returns of false as failure. Without these, font loading throws
  // "Couldn't load font" partway through `FreeTypeFontGenerator.<init>`. We
  // return non-zero handles / `true` / non-null ByteBuffers so the generator
  // walks every glyph and "succeeds" — the resulting font has zero-sized
  // bitmaps, so all text renders invisibly. Real text rendering is a bigger
  // follow-up (opentype.js or harfbuzzjs in JS, or shipping a CJ-compiled
  // FreeType wasm).
  //
  // Inner classes mangle as `_00024<InnerClassName>`.

  async Java_arc_freetype_FreeType_00024Library_newMemoryFace(lib, handle, data, dataSize, faceIndex) {
    return allocHandle();
  },
  async Java_arc_freetype_FreeType_00024Library_strokerNew(lib, handle) {
    return allocHandle();
  },
  async Java_arc_freetype_FreeType_00024Face_doneFace(lib, h) {},
  async Java_arc_freetype_FreeType_00024Face_selectSize(lib, h, strikeIndex) { return true; },
  async Java_arc_freetype_FreeType_00024Face_setCharSize(lib, h, w, hgt, hr, vr) { return true; },
  async Java_arc_freetype_FreeType_00024Face_setPixelSizes(lib, h, w, hgt) { return true; },
  async Java_arc_freetype_FreeType_00024Face_loadGlyph(lib, h, idx, flags) { return true; },
  async Java_arc_freetype_FreeType_00024Face_loadChar(lib, h, ch, flags) { return true; },
  async Java_arc_freetype_FreeType_00024Face_hasKerning(lib, h) { return false; },
  async Java_arc_freetype_FreeType_00024Face_getGlyph(lib, h) { return allocHandle(); },
  async Java_arc_freetype_FreeType_00024Face_getSize(lib, h) { return allocHandle(); },
  async Java_arc_freetype_FreeType_00024Glyph_strokeBorder(lib, glyph, stroker, inside) { return allocHandle(); },
  async Java_arc_freetype_FreeType_00024Glyph_toBitmap(lib, glyph, renderMode) { return allocHandle(); },
  async Java_arc_freetype_FreeType_00024Glyph_getBitmap(lib, h) { return allocHandle(); },
  // 8x8 single-channel grayscale bitmap, fully opaque. Arc validates the
  // resulting glyphs to compute font metrics (x-height, line height); empty
  // bitmaps throw "No x-height character found in font". Returning a uniform
  // filled block makes every character look the same and ugly but lets the
  // font generator complete. Real per-glyph rendering needs a JS font lib.
  async Java_arc_freetype_FreeType_00024Bitmap_getBuffer(lib, h) {
    const ByteBuffer = await lib.java.nio.ByteBuffer;
    const buf = await ByteBuffer.allocateDirect(64);
    const shadow = new Uint8Array(64); shadow.fill(0xff);
    try { buf.__jsShadow = shadow; } catch {}
    return buf;
  },
  async Java_arc_freetype_FreeType_00024Bitmap_getWidth(lib, h) { return 8; },
  async Java_arc_freetype_FreeType_00024Bitmap_getRows(lib, h) { return 8; },
  async Java_arc_freetype_FreeType_00024Bitmap_getPitch(lib, h) { return 8; },
  async Java_arc_freetype_FreeType_00024Bitmap_getPixelMode(lib, h) { return 2; /* FT_PIXEL_MODE_GRAY */ },
  async Java_arc_freetype_FreeType_00024Bitmap_getNumGray(lib, h) { return 256; },

  // GlyphMetrics — values in 26.6 fixed point (1 pixel = 64 units).
  async Java_arc_freetype_FreeType_00024GlyphMetrics_getWidth(lib, h) { return 8 * 64; },
  async Java_arc_freetype_FreeType_00024GlyphMetrics_getHeight(lib, h) { return 8 * 64; },
  async Java_arc_freetype_FreeType_00024GlyphMetrics_getHoriBearingX(lib, h) { return 0; },
  async Java_arc_freetype_FreeType_00024GlyphMetrics_getHoriBearingY(lib, h) { return 8 * 64; },
  async Java_arc_freetype_FreeType_00024GlyphMetrics_getHoriAdvance(lib, h) { return 8 * 64; },
  async Java_arc_freetype_FreeType_00024GlyphMetrics_getVertBearingX(lib, h) { return 0; },
  async Java_arc_freetype_FreeType_00024GlyphMetrics_getVertBearingY(lib, h) { return 0; },
  async Java_arc_freetype_FreeType_00024GlyphMetrics_getVertAdvance(lib, h) { return 8 * 64; },

  // Glyph rect (bitmap_left / bitmap_top after rendering).
  async Java_arc_freetype_FreeType_00024Bitmap_getLeft(lib, h) { return 0; },
  async Java_arc_freetype_FreeType_00024Bitmap_getTop(lib, h) { return 8; },

  // SizeMetrics — face-level metrics in 26.6 fixed point.
  async Java_arc_freetype_FreeType_00024SizeMetrics_getAscender(lib, h) { return 8 * 64; },
  async Java_arc_freetype_FreeType_00024SizeMetrics_getDescender(lib, h) { return -2 * 64; },
  async Java_arc_freetype_FreeType_00024SizeMetrics_getHeight(lib, h) { return 10 * 64; },
  async Java_arc_freetype_FreeType_00024SizeMetrics_getMaxAdvance(lib, h) { return 8 * 64; },
  async Java_arc_freetype_FreeType_00024SizeMetrics_getXppem(lib, h) { return 16; },
  async Java_arc_freetype_FreeType_00024SizeMetrics_getYppem(lib, h) { return 16; },
  async Java_arc_freetype_FreeType_00024SizeMetrics_getXscale(lib, h) { return 65536; },
  async Java_arc_freetype_FreeType_00024SizeMetrics_getYscale(lib, h) { return 65536; },

  // Face-level basic info — must return sane non-zero values so Arc can
  // index glyphs and compute layout.
  async Java_arc_freetype_FreeType_00024Face_getNumGlyphs(lib, h) { return 256; },
  async Java_arc_freetype_FreeType_00024Face_getAscender(lib, h) { return 8; },
  async Java_arc_freetype_FreeType_00024Face_getDescender(lib, h) { return -2; },
  async Java_arc_freetype_FreeType_00024Face_getHeight(lib, h) { return 10; },
  async Java_arc_freetype_FreeType_00024Face_getMaxAdvanceWidth(lib, h) { return 8; },
  async Java_arc_freetype_FreeType_00024Face_getMaxAdvanceHeight(lib, h) { return 8; },
  async Java_arc_freetype_FreeType_00024Face_getCharIndex(lib, h, charCode) {
    // Return a unique non-zero glyph index per char so the cache distinguishes them.
    return ((charCode | 0) & 0xffff) || 1;
  },
  async Java_arc_freetype_FreeType_00024Face_getKerning(lib, h, l, r, mode) { return 0; },

  // Stroker / Glyph cleanup
  async Java_arc_freetype_FreeType_00024Stroker_done(lib, h) {},
  async Java_arc_freetype_FreeType_00024Glyph_done(lib, h) {},

  // Buffers.copyJni overloads. Without these the mesh upload path goes to our
  // auto-stub which silently drops the copy → WebGL sees an empty VBO → every
  // glDrawElements logs "Insufficient buffer size". Implement enough overloads
  // to cover the common cases; fall through to a generic loop for the rest.
  //
  // Signatures (from javap):
  //   void copyJni(Buffer src, int srcOff, Buffer dst, int dstOff, int count)
  //   void copyJni(float[] src, Buffer dst, int dstOff, int numFloats)
  //   void copyJni(byte[]  src, int srcOff, Buffer dst, int dstOff, int count)
  //   void copyJni(short[] src, int srcOff, Buffer dst, int dstOff, int count)
  //   void copyJni(int[]   src, int srcOff, Buffer dst, int dstOff, int count)
  //   void copyJni(float[] src, int srcOff, Buffer dst, int dstOff, int count)
  async Java_arc_util_Buffers_copyJni(lib, ...args) {
    // CheerpJ's JNI dispatch hands us overload variants through the same name;
    // distinguish by argument count and type.
    try {
      // 5-arg variant: (src, srcOff, dst, dstOff, count) — src is array or Buffer.
      // 4-arg variant: (float[] src, dst, dstOff, numFloats).
      let src, srcOff, dst, dstOff, count;
      if (args.length === 5) {
        [src, srcOff, dst, dstOff, count] = args;
      } else if (args.length === 4) {
        [src, dst, dstOff, count] = args;
        srcOff = 0;
      } else {
        return;
      }
      if (!src || !dst) return;
      // Read source element value at index i (handles JS arrays, Java arrays
      // via indexed access, and NIO buffers via get(i)).
      const readSrc = async (i) => {
        if (typeof src.get === 'function') {
          try { return await src.get(srcOff + i); } catch {}
        }
        return src[srcOff + i];
      };
      // Fast path: if dst has a JS shadow and src is a JS-accessible array
      // (Java byte[]/short[]/int[]/float[] expose .length + numeric indexing
      // synchronously), copy directly into the shadow with NO async awaits.
      // ~1000× faster than the bridge-per-byte path. WebGL reads from the
      // shadow via nioBufferToBytes, so the Java buffer being un-mirrored
      // doesn't matter unless Mindustry reads the buffer back (rare).
      const shadow = dst.__jsShadow;
      const srcSync = src && 'length' in src && typeof src.length === 'number'
                    && typeof src.get !== 'function';
      const n = count | 0;
      // One-time diagnostic so we know what path real copyJni calls take.
      if (!globalThis.__copyJniDiag) {
        globalThis.__copyJniDiag = { fast: 0, slow: 0 };
      }
      const d = globalThis.__copyJniDiag;
      if (shadow && srcSync) {
        d.fast++;
        if (d.fast + d.slow < 8 || (d.fast + d.slow) % 200 === 0) {
          console.log('[copyJni] fast', { count: n, fast: d.fast, slow: d.slow,
            shadowLen: shadow.length, srcLen: src.length });
        }
        for (let i = 0; i < n; i++) shadow[dstOff + i] = src[srcOff + i] & 0xff;
        return;
      }
      d.slow++;
      if (d.fast + d.slow < 8 || (d.fast + d.slow) % 200 === 0) {
        console.log('[copyJni] SLOW', { count: n, fast: d.fast, slow: d.slow,
          dstHasShadow: !!shadow,
          srcHasLength: src && 'length' in src,
          srcLengthType: src && typeof src.length,
          srcHasGet: src && typeof src.get === 'function',
          srcCtorName: src && src.constructor && src.constructor.name });
      }
      // Fallback: async bridge reads/writes (slow but correct).
      for (let i = 0; i < n; i++) {
        const v = await readSrc(i);
        if (shadow) {
          try { shadow[dstOff + i] = v & 0xff; continue; } catch {}
        }
        if (typeof dst.put === 'function') {
          try { await dst.put(dstOff + i, v); } catch {}
        } else {
          try { dst[dstOff + i] = v; } catch {}
        }
      }
    } catch (e) {
      console.warn('[copyJni] failed:', e?.message);
    }
  },
};

const soloudStubs = {
  async Java_arc_audio_Soloud_init() {
    logArc('Soloud.init() stubbed');
  },
  async Java_arc_audio_Soloud_deinit() {},
  async Java_arc_audio_Soloud_backendString() { return 'NoAudio'; },
  async Java_arc_audio_Soloud_backendId() { return 0; },
  async Java_arc_audio_Soloud_backendChannels() { return 2; },
  async Java_arc_audio_Soloud_backendSamplerate() { return 44100; },
  async Java_arc_audio_Soloud_backendBufferSize() { return 1024; },
  async Java_arc_audio_Soloud_version() { return 0; },
  async Java_arc_audio_Soloud_activeVoiceCount() { return 0; },
  async Java_arc_audio_Soloud_stopAll() {},
  async Java_arc_audio_Soloud_pauseAll() {},
  async Java_arc_audio_Soloud_setGlobalFilter() {},
  async Java_arc_audio_Soloud_filterFade() {},
  async Java_arc_audio_Soloud_filterSet() {},
  async Java_arc_audio_Soloud_busNew() { return allocHandle(); },
  async Java_arc_audio_Soloud_wavLoad() { return allocHandle(); },
  async Java_arc_audio_Soloud_idSeek() {},
  async Java_arc_audio_Soloud_idVolume() {},
  async Java_arc_audio_Soloud_idGetVolume() { return 0; },
  async Java_arc_audio_Soloud_idPan() {},
  async Java_arc_audio_Soloud_idPitch() {},
  async Java_arc_audio_Soloud_idPause() {},
  async Java_arc_audio_Soloud_idGetPause() { return false; },
  async Java_arc_audio_Soloud_idProtected() {},
  async Java_arc_audio_Soloud_idStop() {},
  async Java_arc_audio_Soloud_idLooping() {},
  async Java_arc_audio_Soloud_idGetLooping() { return false; },
  async Java_arc_audio_Soloud_idPosition() { return 0; },
  async Java_arc_audio_Soloud_idValid() { return false; },
  async Java_arc_audio_Soloud_streamLoad() { return allocHandle(); },
  async Java_arc_audio_Soloud_streamLength() { return 0; },
  async Java_arc_audio_Soloud_wavLength() { return 0; },
  async Java_arc_audio_Soloud_sourceDestroy() {},
  async Java_arc_audio_Soloud_sourceInaudible() {},
  async Java_arc_audio_Soloud_sourcePlay() { return -1; },
  async Java_arc_audio_Soloud_sourcePlayBus() { return -1; },
  async Java_arc_audio_Soloud_sourceCount() { return 0; },
  async Java_arc_audio_Soloud_sourcePriority() {},
  async Java_arc_audio_Soloud_sourceMinConcurrentInterrupt() {},
  async Java_arc_audio_Soloud_sourceMaxConcurrent() {},
  async Java_arc_audio_Soloud_sourceConcurrentGroup() {},
  async Java_arc_audio_Soloud_sourceLoop() {},
  async Java_arc_audio_Soloud_sourceSingleInstance() {},
  async Java_arc_audio_Soloud_sourceStop() {},
  async Java_arc_audio_Soloud_sourceFilter() {},
  async Java_arc_audio_Soloud_pauseDevice() { return 0; },
  async Java_arc_audio_Soloud_resumeDevice() { return 0; },
  async Java_arc_audio_Soloud_filterBiquad() { return allocHandle(); },
  async Java_arc_audio_Soloud_filterEcho() { return allocHandle(); },
  async Java_arc_audio_Soloud_filterLofi() { return allocHandle(); },
  async Java_arc_audio_Soloud_filterFlanger() { return allocHandle(); },
  async Java_arc_audio_Soloud_filterBassBoost() { return allocHandle(); },
  async Java_arc_audio_Soloud_filterWaveShaper() { return allocHandle(); },
  async Java_arc_audio_Soloud_filterRobotize() { return allocHandle(); },
  async Java_arc_audio_Soloud_filterFreeverb() { return allocHandle(); },
  async Java_arc_audio_Soloud_biquadSet() {},
  async Java_arc_audio_Soloud_echoSet() {},
  async Java_arc_audio_Soloud_lofiSet() {},
  async Java_arc_audio_Soloud_flangerSet() {},
  async Java_arc_audio_Soloud_waveShaperSet() {},
  async Java_arc_audio_Soloud_bassBoostSet() {},
  async Java_arc_audio_Soloud_robotizeSet() {},
  async Java_arc_audio_Soloud_freeverbSet() {},
};

// Concrete implementations win; soloudStubs cover audio; Proxy auto-stubs
// anything else under Java_arc_* as a no-op.
const concreteImpls = { ...bufferNatives, ...soloudStubs };

const nativeImpls = new Proxy(concreteImpls, {
  get(target, prop, receiver) {
    if (Reflect.has(target, prop)) {
      return Reflect.get(target, prop, receiver);
    }
    if (typeof prop === 'string' && prop.startsWith('Java_arc_')) {
      return makeNoopStub(prop);
    }
    return Reflect.get(target, prop, receiver);
  },
});

export default nativeImpls;
