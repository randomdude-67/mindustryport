// JavaScript implementation of arc.backend.sdl.jni.SDLGL.
// Maps OpenGL ES 2.0/3.0 calls onto WebGL2 (falling back to WebGL1).
//
// Arc/libGDX work with integer object IDs; WebGL gives back WebGL*Object
// wrappers. We maintain a registry mapping int IDs ↔ WebGL objects.

import { mangleClass } from './jni.js';
import { state } from './sdl.js';

// ── ID registry ───────────────────────────────────────────────────────────────
function makeRegistry() {
  const fwd = new Map(); // id → obj
  const rev = new Map(); // obj → id
  let next = 1;
  return {
    add(obj) {
      if (!obj) return 0;
      const existing = rev.get(obj);
      if (existing) return existing;
      const id = next++;
      fwd.set(id, obj); rev.set(obj, id);
      return id;
    },
    get(id) { return fwd.get(id); },
    remove(id) {
      const o = fwd.get(id);
      if (o) { fwd.delete(id); rev.delete(o); }
    },
  };
}

const reg = {
  buffer: makeRegistry(),
  texture: makeRegistry(),
  framebuffer: makeRegistry(),
  renderbuffer: makeRegistry(),
  program: makeRegistry(),
  shader: makeRegistry(),
  vao: makeRegistry(),
  sampler: makeRegistry(),
  query: makeRegistry(),
  // uniform locations: a per-program (programId, name) → WebGLUniformLocation map
  uniformLoc: makeRegistry(),
};

const gl = () => state.gl;

// Convert a Java Buffer/array argument to a JS TypedArray view.
// CheerpJ passes Java NIO buffers; the exact representation is TBD until we
// actually run this. For now, accept either ArrayBuffer-likes or arrays.
function asTypedArray(buf, ctor = Uint8Array) {
  if (!buf) return null;
  if (buf instanceof ctor) return buf;
  if (buf.buffer instanceof ArrayBuffer) return new ctor(buf.buffer, buf.byteOffset || 0);
  if (buf instanceof ArrayBuffer) return new ctor(buf);
  if (Array.isArray(buf) || ('length' in buf && typeof buf[0] === 'number')) return new ctor(buf);
  return null;
}

const F32 = (b) => asTypedArray(b, Float32Array);
const I32 = (b) => asTypedArray(b, Int32Array);
const U32 = (b) => asTypedArray(b, Uint32Array);
const U8  = (b) => asTypedArray(b, Uint8Array);

// ── JNI implementations ───────────────────────────────────────────────────────
const m = {
  // Returns null on success; any non-null/non-empty return is treated by Arc
  // as the *error message* (printed as "GLEW failed to initialize: <return>").
  init: async (lib) => null,

  // ── Per-frame state ────────────────────────────────────────────────────────
  glClear:        async (lib, mask) => gl().clear(mask),
  glClearColor:   async (lib, r, g, b, a) => gl().clearColor(r, g, b, a),
  glClearDepthf:  async (lib, d) => gl().clearDepth(d),
  glClearStencil: async (lib, s) => gl().clearStencil(s),
  glColorMask:    async (lib, r, g, b, a) => gl().colorMask(!!r, !!g, !!b, !!a),
  glDepthFunc:    async (lib, f) => gl().depthFunc(f),
  glDepthMask:    async (lib, f) => gl().depthMask(!!f),
  glDepthRangef:  async (lib, n, f) => gl().depthRange(n, f),
  glCullFace:     async (lib, m) => gl().cullFace(m),
  glFrontFace:    async (lib, m) => gl().frontFace(m),
  glEnable:       async (lib, c) => gl().enable(c),
  glDisable:      async (lib, c) => gl().disable(c),
  glBlendFunc:    async (lib, s, d) => gl().blendFunc(s, d),
  glBlendColor:   async (lib, r, g, b, a) => gl().blendColor(r, g, b, a),
  glBlendEquation: async (lib, m) => gl().blendEquation(m),
  glBlendEquationSeparate: async (lib, mRGB, mA) => gl().blendEquationSeparate(mRGB, mA),
  glBlendFuncSeparate: async (lib, sRGB, dRGB, sA, dA) => gl().blendFuncSeparate(sRGB, dRGB, sA, dA),
  glLineWidth:    async (lib, w) => gl().lineWidth(w),
  glPolygonOffset: async (lib, f, u) => gl().polygonOffset(f, u),
  glScissor:      async (lib, x, y, w, h) => gl().scissor(x, y, w, h),
  glStencilFunc:  async (lib, f, r, m) => gl().stencilFunc(f, r, m),
  glStencilMask:  async (lib, m) => gl().stencilMask(m),
  glStencilOp:    async (lib, f, zf, zp) => gl().stencilOp(f, zf, zp),
  glStencilFuncSeparate: async (lib, face, f, r, m) => gl().stencilFuncSeparate(face, f, r, m),
  glStencilMaskSeparate: async (lib, face, m) => gl().stencilMaskSeparate(face, m),
  glStencilOpSeparate: async (lib, face, f, zf, zp) => gl().stencilOpSeparate(face, f, zf, zp),
  glViewport:     async (lib, x, y, w, h) => gl().viewport(x, y, w, h),
  glHint:         async (lib, t, m) => gl().hint(t, m),
  glPixelStorei:  async (lib, p, v) => gl().pixelStorei(p, v),
  glSampleCoverage: async (lib, v, inv) => gl().sampleCoverage(v, !!inv),
  glFinish:       async (lib) => gl().finish(),
  glFlush:        async (lib) => gl().flush(),

  // ── Errors / strings ───────────────────────────────────────────────────────
  glGetError:    async (lib) => gl().getError(),
  glGetString:   async (lib, n) => {
    // Mindustry parses GL_VERSION (0x1F02) looking for "OpenGL X.Y..." and
    // requires major >= 2 + FBO support. Chrome's WebGL returns strings like
    // "WebGL 2.0 (OpenGL ES 3.0 Chromium)" which fails that parse. Rewrite
    // the version string so Mindustry's check passes; FBO is always present
    // in WebGL 1+, so this is honest.
    const raw = gl().getParameter(n);
    if (n === 0x1F02 /* GL_VERSION */) {
      return 'OpenGL 3.0 (' + (raw || 'WebGL') + ')';
    }
    if (n === 0x1F00 /* GL_VENDOR */) return raw || 'Mozilla / CheerpJ';
    if (n === 0x1F01 /* GL_RENDERER */) return raw || 'WebGL';
    return raw || '';
  },
  glGetStringi:  async (lib, n, i) => '',
  glGetIntegerv: async (lib, p, out) => {
    const v = gl().getParameter(p);
    const arr = I32(out);
    if (arr) {
      if (typeof v === 'number') arr[0] = v;
      else if (v && v.length) for (let i = 0; i < Math.min(v.length, arr.length); i++) arr[i] = v[i];
    }
  },
  glGetFloatv: async (lib, p, out) => {
    const v = gl().getParameter(p);
    const arr = F32(out);
    if (arr) {
      if (typeof v === 'number') arr[0] = v;
      else if (v && v.length) for (let i = 0; i < Math.min(v.length, arr.length); i++) arr[i] = v[i];
    }
  },
  glGetBooleanv: async (lib, p, out) => {
    const v = gl().getParameter(p);
    const arr = U8(out);
    if (arr) arr[0] = v ? 1 : 0;
  },

  // ── Textures ───────────────────────────────────────────────────────────────
  glGenTexture: async (lib) => reg.texture.add(gl().createTexture()),
  glDeleteTexture: async (lib, id) => { gl().deleteTexture(reg.texture.get(id)); reg.texture.remove(id); },
  glBindTexture: async (lib, t, id) => gl().bindTexture(t, id ? reg.texture.get(id) : null),
  glActiveTexture: async (lib, t) => gl().activeTexture(t),
  glIsTexture: async (lib, id) => gl().isTexture(reg.texture.get(id) || null),
  glGenerateMipmap: async (lib, t) => gl().generateMipmap(t),
  glTexParameterf: async (lib, t, p, v) => gl().texParameterf(t, p, v),
  glTexParameteri: async (lib, t, p, v) => gl().texParameteri(t, p, v),
  glTexParameterfv: async (lib, t, p, b) => { const a = F32(b); if (a) gl().texParameterf(t, p, a[0]); },
  glTexParameteriv: async (lib, t, p, b) => { const a = I32(b); if (a) gl().texParameteri(t, p, a[0]); },
  glGetTexParameterfv: async () => {},
  glGetTexParameteriv: async () => {},
  glTexImage2D: async (lib, target, level, internal, w, h, border, format, type, pixels) => {
    const data = pixels ? asTypedArray(pixels) : null;
    gl().texImage2D(target, level, internal, w, h, border, format, type, data);
  },
  glTexSubImage2D: async (lib, target, level, x, y, w, h, format, type, pixels) => {
    const data = pixels ? asTypedArray(pixels) : null;
    gl().texSubImage2D(target, level, x, y, w, h, format, type, data);
  },
  glCompressedTexImage2D: async () => {},
  glCompressedTexSubImage2D: async () => {},
  glCopyTexImage2D: async (lib, t, l, i, x, y, w, h, b) => gl().copyTexImage2D(t, l, i, x, y, w, h, b),
  glCopyTexSubImage2D: async (lib, t, l, xo, yo, x, y, w, h) => gl().copyTexSubImage2D(t, l, xo, yo, x, y, w, h),

  // ── Buffers ────────────────────────────────────────────────────────────────
  glGenBuffer: async (lib) => reg.buffer.add(gl().createBuffer()),
  glDeleteBuffer: async (lib, id) => { gl().deleteBuffer(reg.buffer.get(id)); reg.buffer.remove(id); },
  glBindBuffer: async (lib, t, id) => gl().bindBuffer(t, id ? reg.buffer.get(id) : null),
  glIsBuffer: async (lib, id) => gl().isBuffer(reg.buffer.get(id) || null),
  glBufferData: async (lib, target, size, data, usage) => {
    if (data) gl().bufferData(target, asTypedArray(data), usage);
    else gl().bufferData(target, size, usage);
  },
  glBufferSubData: async (lib, target, offset, size, data) => {
    if (data) gl().bufferSubData(target, offset, asTypedArray(data));
  },
  glGetBufferParameteriv: async () => {},

  // ── Framebuffers / renderbuffers ───────────────────────────────────────────
  glGenFramebuffer: async (lib) => reg.framebuffer.add(gl().createFramebuffer()),
  glDeleteFramebuffer: async (lib, id) => { gl().deleteFramebuffer(reg.framebuffer.get(id)); reg.framebuffer.remove(id); },
  glBindFramebuffer: async (lib, t, id) => gl().bindFramebuffer(t, id ? reg.framebuffer.get(id) : null),
  glIsFramebuffer: async (lib, id) => gl().isFramebuffer(reg.framebuffer.get(id) || null),
  glCheckFramebufferStatus: async (lib, t) => gl().checkFramebufferStatus(t),
  glFramebufferTexture2D: async (lib, t, a, tt, tex, lvl) => gl().framebufferTexture2D(t, a, tt, reg.texture.get(tex), lvl),
  glFramebufferRenderbuffer: async (lib, t, a, rt, r) => gl().framebufferRenderbuffer(t, a, rt, reg.renderbuffer.get(r)),
  glGetFramebufferAttachmentParameteriv: async () => {},

  glGenRenderbuffer: async (lib) => reg.renderbuffer.add(gl().createRenderbuffer()),
  glDeleteRenderbuffer: async (lib, id) => { gl().deleteRenderbuffer(reg.renderbuffer.get(id)); reg.renderbuffer.remove(id); },
  glBindRenderbuffer: async (lib, t, id) => gl().bindRenderbuffer(t, id ? reg.renderbuffer.get(id) : null),
  glIsRenderbuffer: async (lib, id) => gl().isRenderbuffer(reg.renderbuffer.get(id) || null),
  glRenderbufferStorage: async (lib, t, f, w, h) => gl().renderbufferStorage(t, f, w, h),
  glRenderbufferStorageMultisample: async (lib, t, s, f, w, h) => gl().renderbufferStorageMultisample(t, s, f, w, h),
  glGetRenderbufferParameteriv: async () => {},
  glBlitFramebuffer: async (lib, sx0, sy0, sx1, sy1, dx0, dy0, dx1, dy1, mask, filter) =>
    gl().blitFramebuffer(sx0, sy0, sx1, sy1, dx0, dy0, dx1, dy1, mask, filter),

  // ── Programs and shaders ───────────────────────────────────────────────────
  glCreateProgram: async (lib) => reg.program.add(gl().createProgram()),
  glDeleteProgram: async (lib, id) => { gl().deleteProgram(reg.program.get(id)); reg.program.remove(id); },
  glIsProgram: async (lib, id) => gl().isProgram(reg.program.get(id) || null),
  glLinkProgram: async (lib, id) => gl().linkProgram(reg.program.get(id)),
  glUseProgram: async (lib, id) => gl().useProgram(id ? reg.program.get(id) : null),
  glValidateProgram: async (lib, id) => gl().validateProgram(reg.program.get(id)),
  glAttachShader: async (lib, p, s) => gl().attachShader(reg.program.get(p), reg.shader.get(s)),
  glDetachShader: async (lib, p, s) => gl().detachShader(reg.program.get(p), reg.shader.get(s)),
  glBindAttribLocation: async (lib, p, i, name) => gl().bindAttribLocation(reg.program.get(p), i, String(name)),
  glGetAttribLocation: async (lib, p, name) => gl().getAttribLocation(reg.program.get(p), String(name)),
  glGetUniformLocation: async (lib, p, name) => {
    const loc = gl().getUniformLocation(reg.program.get(p), String(name));
    return reg.uniformLoc.add(loc);
  },
  glGetProgramiv: async (lib, p, pname, out) => {
    const v = gl().getProgramParameter(reg.program.get(p), pname);
    const arr = I32(out); if (arr) arr[0] = typeof v === 'boolean' ? (v ? 1 : 0) : (v || 0);
  },
  glGetProgramInfoLog: async (lib, p) => gl().getProgramInfoLog(reg.program.get(p)) || '',
  glGetActiveAttrib: async (lib, p, i) => {
    const info = gl().getActiveAttrib(reg.program.get(p), i); return info ? info.name : '';
  },
  glGetActiveUniform: async (lib, p, i) => {
    const info = gl().getActiveUniform(reg.program.get(p), i); return info ? info.name : '';
  },

  glCreateShader: async (lib, type) => reg.shader.add(gl().createShader(type)),
  glDeleteShader: async (lib, id) => { gl().deleteShader(reg.shader.get(id)); reg.shader.remove(id); },
  glIsShader: async (lib, id) => gl().isShader(reg.shader.get(id) || null),
  glShaderSource: async (lib, id, src) => {
    // Arc ships shaders with `#version 130/140/150/330` (desktop GL) but uses
    // `in`/`out` qualifiers that require `#version 300 es` under WebGL 2's
    // GLSL ES compiler. Rewrite the version directive, force `precision`
    // qualifiers (mandatory in GLSL ES), and tag the shader stage so the
    // shader can branch on it if needed. Native drivers tolerate the
    // mismatch; WebGL is strict.
    let s = String(src);
    s = s.replace(/^\s*#version\s+\d+(\s+\w+)?\s*$/m, '#version 300 es');
    if (!/^\s*#version\s+/m.test(s)) s = '#version 300 es\n' + s;
    // Insert default precisions right after the #version line if missing.
    if (!/precision\s+(highp|mediump|lowp)\s+float/.test(s)) {
      s = s.replace(/(#version[^\n]*\n)/, '$1precision highp float;\nprecision highp int;\n');
    }
    return gl().shaderSource(reg.shader.get(id), s);
  },
  glCompileShader: async (lib, id) => gl().compileShader(reg.shader.get(id)),
  glGetShaderiv: async (lib, s, pname, out) => {
    const v = gl().getShaderParameter(reg.shader.get(s), pname);
    const arr = I32(out); if (arr) arr[0] = typeof v === 'boolean' ? (v ? 1 : 0) : (v || 0);
  },
  glGetShaderInfoLog: async (lib, s) => gl().getShaderInfoLog(reg.shader.get(s)) || '',
  glGetShaderPrecisionFormat: async () => {},
  glReleaseShaderCompiler: async () => {},

  // ── Vertex attributes ──────────────────────────────────────────────────────
  glEnableVertexAttribArray:  async (lib, i) => gl().enableVertexAttribArray(i),
  glDisableVertexAttribArray: async (lib, i) => gl().disableVertexAttribArray(i),
  glVertexAttribPointer:      async (lib, i, sz, t, n, str, ptr) => gl().vertexAttribPointer(i, sz, t, !!n, str, typeof ptr === 'number' ? ptr : 0),
  glVertexAttrib1f: async (lib, i, x) => gl().vertexAttrib1f(i, x),
  glVertexAttrib2f: async (lib, i, x, y) => gl().vertexAttrib2f(i, x, y),
  glVertexAttrib3f: async (lib, i, x, y, z) => gl().vertexAttrib3f(i, x, y, z),
  glVertexAttrib4f: async (lib, i, x, y, z, w) => gl().vertexAttrib4f(i, x, y, z, w),
  glVertexAttrib1fv: async (lib, i, b) => { const a = F32(b); if (a) gl().vertexAttrib1fv(i, a); },
  glVertexAttrib2fv: async (lib, i, b) => { const a = F32(b); if (a) gl().vertexAttrib2fv(i, a); },
  glVertexAttrib3fv: async (lib, i, b) => { const a = F32(b); if (a) gl().vertexAttrib3fv(i, a); },
  glVertexAttrib4fv: async (lib, i, b) => { const a = F32(b); if (a) gl().vertexAttrib4fv(i, a); },
  glGetVertexAttribfv: async () => {},
  glGetVertexAttribiv: async () => {},
  glVertexAttribDivisor: async (lib, i, d) => gl().vertexAttribDivisor?.(i, d),

  // ── Uniforms ───────────────────────────────────────────────────────────────
  glUniform1f: async (lib, l, x) => gl().uniform1f(reg.uniformLoc.get(l), x),
  glUniform2f: async (lib, l, x, y) => gl().uniform2f(reg.uniformLoc.get(l), x, y),
  glUniform3f: async (lib, l, x, y, z) => gl().uniform3f(reg.uniformLoc.get(l), x, y, z),
  glUniform4f: async (lib, l, x, y, z, w) => gl().uniform4f(reg.uniformLoc.get(l), x, y, z, w),
  glUniform1i: async (lib, l, x) => gl().uniform1i(reg.uniformLoc.get(l), x),
  glUniform2i: async (lib, l, x, y) => gl().uniform2i(reg.uniformLoc.get(l), x, y),
  glUniform3i: async (lib, l, x, y, z) => gl().uniform3i(reg.uniformLoc.get(l), x, y, z),
  glUniform4i: async (lib, l, x, y, z, w) => gl().uniform4i(reg.uniformLoc.get(l), x, y, z, w),
  glUniform1fv: async (lib, l, count, v, offset) => { const a = F32(v); if (a) gl().uniform1fv(reg.uniformLoc.get(l), a.subarray(offset || 0, (offset || 0) + count)); },
  glUniform2fv: async (lib, l, count, v, offset) => { const a = F32(v); if (a) gl().uniform2fv(reg.uniformLoc.get(l), a.subarray(offset || 0, (offset || 0) + count * 2)); },
  glUniform3fv: async (lib, l, count, v, offset) => { const a = F32(v); if (a) gl().uniform3fv(reg.uniformLoc.get(l), a.subarray(offset || 0, (offset || 0) + count * 3)); },
  glUniform4fv: async (lib, l, count, v, offset) => { const a = F32(v); if (a) gl().uniform4fv(reg.uniformLoc.get(l), a.subarray(offset || 0, (offset || 0) + count * 4)); },
  glUniform1iv: async (lib, l, count, v, offset) => { const a = I32(v); if (a) gl().uniform1iv(reg.uniformLoc.get(l), a.subarray(offset || 0, (offset || 0) + count)); },
  glUniform2iv: async (lib, l, count, v, offset) => { const a = I32(v); if (a) gl().uniform2iv(reg.uniformLoc.get(l), a.subarray(offset || 0, (offset || 0) + count * 2)); },
  glUniform3iv: async (lib, l, count, v, offset) => { const a = I32(v); if (a) gl().uniform3iv(reg.uniformLoc.get(l), a.subarray(offset || 0, (offset || 0) + count * 3)); },
  glUniform4iv: async (lib, l, count, v, offset) => { const a = I32(v); if (a) gl().uniform4iv(reg.uniformLoc.get(l), a.subarray(offset || 0, (offset || 0) + count * 4)); },
  glUniformMatrix2fv: async (lib, l, count, t, v, offset) => { const a = F32(v); if (a) gl().uniformMatrix2fv(reg.uniformLoc.get(l), !!t, a.subarray(offset || 0, (offset || 0) + count * 4)); },
  glUniformMatrix3fv: async (lib, l, count, t, v, offset) => { const a = F32(v); if (a) gl().uniformMatrix3fv(reg.uniformLoc.get(l), !!t, a.subarray(offset || 0, (offset || 0) + count * 9)); },
  glUniformMatrix4fv: async (lib, l, count, t, v, offset) => { const a = F32(v); if (a) gl().uniformMatrix4fv(reg.uniformLoc.get(l), !!t, a.subarray(offset || 0, (offset || 0) + count * 16)); },
  glGetUniformfv: async () => {},
  glGetUniformiv: async () => {},

  // ── Drawing ────────────────────────────────────────────────────────────────
  glDrawArrays: async (lib, m, f, c) => gl().drawArrays(m, f, c),
  glDrawElements: async (lib, mode, count, type, indices) => {
    if (typeof indices === 'number') gl().drawElements(mode, count, type, indices);
    else gl().drawElements(mode, count, type, 0);
  },
  glDrawArraysInstanced: async (lib, m, f, c, ic) => gl().drawArraysInstanced?.(m, f, c, ic),
  glDrawElementsInstanced: async (lib, m, c, t, off, ic) => gl().drawElementsInstanced?.(m, c, t, off, ic),
  glReadPixels: async (lib, x, y, w, h, fmt, type, out) => gl().readPixels(x, y, w, h, fmt, type, asTypedArray(out)),

  // ── Vertex array objects (WebGL2) ──────────────────────────────────────────
  glGenVertexArrays: async (lib, n, out) => {
    const arr = I32(out);
    for (let i = 0; i < n; i++) {
      const id = reg.vao.add(gl().createVertexArray?.());
      if (arr) arr[i] = id;
    }
  },
  glDeleteVertexArrays: async (lib, n, ids) => {
    const arr = I32(ids);
    for (let i = 0; i < n; i++) {
      const id = arr ? arr[i] : 0;
      gl().deleteVertexArray?.(reg.vao.get(id));
      reg.vao.remove(id);
    }
  },
  glBindVertexArray: async (lib, id) => gl().bindVertexArray?.(id ? reg.vao.get(id) : null),
  glIsVertexArray: async (lib, id) => !!gl().isVertexArray?.(reg.vao.get(id) || null),

  // ── Everything else: safe no-ops / sensible defaults ──────────────────────
  glIsEnabled: async (lib, c) => !!gl().isEnabled(c),
};

// Auto-stub anything we missed so calls don't crash with UnsatisfiedLinkError.
// We list all names from SDLGL.java; missing ones become warning no-ops.
const allMethodNames = [
  'init','glActiveTexture','glBindTexture','glBlendFunc','glClear','glClearColor','glClearDepthf','glClearStencil',
  'glColorMask','glCompressedTexImage2D','glCompressedTexSubImage2D','glCopyTexImage2D','glCopyTexSubImage2D',
  'glCullFace','glDeleteTexture','glDepthFunc','glDepthMask','glDepthRangef','glDisable','glDrawArrays',
  'glDrawElements','glEnable','glFinish','glFlush','glFrontFace','glGenTexture','glGetError','glGetIntegerv',
  'glGetString','glHint','glLineWidth','glPixelStorei','glPolygonOffset','glReadPixels','glScissor','glStencilFunc',
  'glStencilMask','glStencilOp','glTexImage2D','glTexParameterf','glTexSubImage2D','glViewport','glAttachShader',
  'glBindAttribLocation','glBindBuffer','glBindFramebuffer','glBindRenderbuffer','glBlendColor','glBlendEquation',
  'glBlendEquationSeparate','glBlendFuncSeparate','glBufferData','glBufferSubData','glCheckFramebufferStatus',
  'glCompileShader','glCreateProgram','glCreateShader','glDeleteBuffer','glDeleteFramebuffer','glDeleteProgram',
  'glDeleteRenderbuffer','glDeleteShader','glDetachShader','glDisableVertexAttribArray','glEnableVertexAttribArray',
  'glFramebufferRenderbuffer','glFramebufferTexture2D','glGenBuffer','glGenerateMipmap','glGenFramebuffer',
  'glGenRenderbuffer','glGetActiveAttrib','glGetActiveUniform','glGetAttribLocation','glGetBooleanv',
  'glGetBufferParameteriv','glGetFloatv','glGetFramebufferAttachmentParameteriv','glGetProgramiv',
  'glGetProgramInfoLog','glGetRenderbufferParameteriv','glGetShaderiv','glGetShaderInfoLog',
  'glGetShaderPrecisionFormat','glGetTexParameterfv','glGetTexParameteriv','glGetUniformfv','glGetUniformiv',
  'glGetUniformLocation','glGetVertexAttribfv','glGetVertexAttribiv','glIsBuffer','glIsEnabled','glIsFramebuffer',
  'glIsProgram','glIsRenderbuffer','glIsShader','glIsTexture','glLinkProgram','glReleaseShaderCompiler',
  'glRenderbufferStorage','glSampleCoverage','glShaderSource','glStencilFuncSeparate','glStencilMaskSeparate',
  'glStencilOpSeparate','glTexParameterfv','glTexParameteri','glTexParameteriv','glUniform1f','glUniform1fv',
  'glUniform1i','glUniform1iv','glUniform2f','glUniform2fv','glUniform2i','glUniform2iv','glUniform3f',
  'glUniform3fv','glUniform3i','glUniform3iv','glUniform4f','glUniform4fv','glUniform4i','glUniform4iv',
  'glUniformMatrix2fv','glUniformMatrix3fv','glUniformMatrix4fv','glUseProgram','glValidateProgram',
  'glVertexAttrib1f','glVertexAttrib1fv','glVertexAttrib2f','glVertexAttrib2fv','glVertexAttrib3f',
  'glVertexAttrib3fv','glVertexAttrib4f','glVertexAttrib4fv','glVertexAttribPointer','glReadBuffer',
  'glDrawRangeElements','glTexImage3D','glTexSubImage3D','glCopyTexSubImage3D','glGenQueries','glDeleteQueries',
  'glIsQuery','glBeginQuery','glEndQuery','glGetQueryiv','glGetQueryObjectuiv','glUnmapBuffer',
  'glGetBufferPointerv','glDrawBuffers','glUniformMatrix2x3fv','glUniformMatrix3x2fv','glUniformMatrix2x4fv',
  'glUniformMatrix4x2fv','glUniformMatrix3x4fv','glUniformMatrix4x3fv','glBlitFramebuffer',
  'glRenderbufferStorageMultisample','glFramebufferTextureLayer','glFlushMappedBufferRange','glBindVertexArray',
  'glDeleteVertexArrays','glGenVertexArrays','glIsVertexArray','glBeginTransformFeedback','glEndTransformFeedback',
  'glBindBufferRange','glBindBufferBase','glTransformFeedbackVaryings','glVertexAttribIPointer',
  'glGetVertexAttribIiv','glGetVertexAttribIuiv','glVertexAttribI4i','glVertexAttribI4ui','glGetUniformuiv',
  'glGetFragDataLocation','glUniform1uiv','glUniform3uiv','glUniform4uiv','glClearBufferiv','glClearBufferuiv',
  'glClearBufferfv','glClearBufferfi','glGetStringi','glCopyBufferSubData','glGetUniformIndices',
  'glGetActiveUniformsiv','glGetUniformBlockIndex','glGetActiveUniformBlockiv','glGetActiveUniformBlockName',
  'glUniformBlockBinding','glDrawArraysInstanced','glDrawElementsInstanced','glGetInteger64v',
  'glGetBufferParameteri64v','glGenSamplers','glDeleteSamplers','glIsSampler','glBindSampler',
  'glSamplerParameteri','glSamplerParameteriv','glSamplerParameterf','glSamplerParameterfv',
  'glGetSamplerParameteriv','glGetSamplerParameterfv','glVertexAttribDivisor','glBindTransformFeedback',
  'glDeleteTransformFeedbacks','glGenTransformFeedbacks','glIsTransformFeedback','glPauseTransformFeedback',
  'glResumeTransformFeedback','glProgramParameteri','glInvalidateFramebuffer','glInvalidateSubFramebuffer',
];

for (const name of allMethodNames) {
  if (!(name in m)) {
    m[name] = async () => { /* TODO: implement */ };
  }
}

export default mangleClass('arc.backend.sdl.jni.SDLGL', m);
