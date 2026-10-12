// Real-time 3D preview of a level (WebGL2). Fly camera, Doom-style lighting, billboard sprites, click-to-select.
import { triangulate } from './geom.js';
import { texUrl, texSize, getImg } from '../core/resources.js';

const VS = `#version 300 es
in vec3 aPos; in vec2 aUV; in float aLight;
uniform mat4 uMVP; uniform vec2 uTexSize;
out vec2 vUV; out float vLight; out float vDist;
void main() { gl_Position = uMVP * vec4(aPos, 1.0); vUV = aUV / uTexSize; vLight = aLight; vDist = gl_Position.w; }`;
const FS = `#version 300 es
precision mediump float;
in vec2 vUV; in float vLight; in float vDist;
uniform sampler2D uTex; uniform vec4 uTint; uniform float uFlat;
out vec4 o;
void main() {
  vec4 c = mix(texture(uTex, vUV), vec4(1.0), uFlat);
  if (c.a < 0.5) discard;
  float fog = clamp(1.0 - vDist / 4200.0, 0.3, 1.0);
  o = vec4(c.rgb * vLight * fog * uTint.rgb, uTint.a);
}`;
const SKY_VS = `#version 300 es
in vec2 aPos; out vec2 v; void main() { v = aPos; gl_Position = vec4(aPos, 0.999, 1.0); }`;
const SKY_FS = `#version 300 es
precision mediump float; in vec2 v; uniform float uPitch; out vec4 o;
void main() { float t = clamp(v.y * 0.5 + 0.5 + uPitch, 0.0, 1.0); o = vec4(mix(vec3(0.16, 0.10, 0.13), vec3(0.42, 0.22, 0.20), t), 1.0); }`;

const mul = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; };
const persp = (fov, asp, n, f) => { const t = 1 / Math.tan(fov / 2); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]); };
const lightOf = l => Math.max(0.1, Math.pow(Math.min(255, l) / 255, 1.5)) * 1.15;

export class View3D {
  constructor(canvas, onPick) {
    this.canvas = canvas; this.onPick = onPick;
    const gl = this.gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    this.cam = { x: 0, y: 0, z: 96, yaw: 90, pitch: -12 };
    this.keys = new Set(); this.hover = false; this.batches = []; this.sprites = []; this.textures = new Map();
    this.map = null; this.raf = 0; this.last = 0; this.needsRebuild = false;
    if (!gl) return;
    this.prog = this._program(VS, FS);
    this.skyProg = this._program(SKY_VS, SKY_FS);
    this.skyBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    this.white = this._solidTex([255, 255, 255, 255]);
    this.missing = this._checkerTex();
    this.dyn = gl.createBuffer();

    canvas.tabIndex = 0;
    let drag = null;
    canvas.addEventListener('pointerdown', e => { canvas.focus(); canvas.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, moved: 0, btn: e.button }; });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      this.cam.yaw -= dx * 0.25; this.cam.pitch = Math.max(-88, Math.min(88, this.cam.pitch - dy * 0.25));
      this.invalidate();
    });
    canvas.addEventListener('pointerup', e => {
      if (drag && drag.moved < 5 && drag.btn === 0 && this.onPick) { const r = canvas.getBoundingClientRect(); this.onPick(this.pick(e.clientX - r.left, e.clientY - r.top), e); }
      drag = null;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { e.preventDefault(); this._move(-Math.sign(e.deltaY) * 96, 0, 0); this.invalidate(); }, { passive: false });
    canvas.addEventListener('pointerenter', () => { this.hover = true; });
    canvas.addEventListener('pointerleave', () => { this.hover = false; this.keys.clear(); });
    this._kd = e => { if (!this.hover || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.ctrlKey || e.metaKey) return; const k = e.code; if (/^(Key[WASDQEC]|Space|ShiftLeft|Arrow\w+)$/.test(k)) { this.keys.add(k); e.preventDefault(); e.stopImmediatePropagation(); this.invalidate(); } };
    this._ku = e => { this.keys.delete(e.code); };
    window.addEventListener('keydown', this._kd, true);
    window.addEventListener('keyup', this._ku, true);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this._kd, true);
    window.removeEventListener('keyup', this._ku, true);
  }

  _program(vs, fs) {
    const gl = this.gl, p = gl.createProgram();
    for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    return p;
  }
  _solidTex(rgba) { const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba)); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); return t; }
  _checkerTex() {
    const gl = this.gl, t = gl.createTexture(), d = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const on = ((x >> 4) + (y >> 4)) & 1, i = (y * 64 + x) * 4; d[i] = on ? 150 : 60; d[i + 1] = on ? 60 : 40; d[i + 2] = on ? 150 : 70; d[i + 3] = 255; }
    gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 64, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return t;
  }
  _tex(url, clampEdge) {
    if (!url) return null;
    let t = this.textures.get(url);
    if (t) return t;
    const img = getImg(url);
    if (!img) return null;
    const gl = this.gl;
    t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, clampEdge ? gl.NEAREST : gl.NEAREST_MIPMAP_LINEAR);
    if (clampEdge) { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
    t.w = img.width; t.h = img.height;
    this.textures.set(url, t);
    return t;
  }
  forgetTextures() { this.textures.clear(); }

  // map: result of buildMap(); things: [{id, x, y, url, scale, sel, hang}]; selRooms: Set of room ids
  setScene(map, things, selRooms) {
    this.map = map; this.things = things; this.selRooms = selRooms || new Set();
    const gl = this.gl;
    if (!gl) return;
    for (const b of this.batches) gl.deleteBuffer(b.buf);
    const by = new Map();
    const get = tex => { let a = by.get(tex); if (!a) by.set(tex, a = []); return a; };
    const sel = [];
    map.sectors.forEach((s, si) => {
      const tris = triangulate(map, si);
      const l = lightOf(s.light);
      const f = get(s.floorTex);
      for (let i = 0; i < tris.length; i += 2) f.push(tris[i], s.floor, -tris[i + 1], tris[i], -tris[i + 1], l);
      if (this.selRooms.has(s.area.room.id)) for (let i = 0; i < tris.length; i += 2) sel.push(tris[i], s.floor + 0.6, -tris[i + 1], 0, 0, 1);
      if (s.ceilTex !== 'F_SKY1') {
        const c = get(s.ceilTex);
        for (let i = tris.length - 2; i >= 0; i -= 2) c.push(tris[i], s.ceil, -tris[i + 1], tris[i], -tris[i + 1], l * 0.92);
      }
    });
    const quad = (tex, ax, ay, bx, by2, zb, zt, u0, len, vref, l) => {
      if (zt - zb < 0.01 || !tex || tex === '-') return;
      const a = get(tex), u1 = u0 + len;
      a.push(ax, zb, -ay, u0, vref - zb, l, bx, zb, -by2, u1, vref - zb, l, bx, zt, -by2, u1, vref - zt, l,
        ax, zb, -ay, u0, vref - zb, l, bx, zt, -by2, u1, vref - zt, l, ax, zt, -ay, u0, vref - zt, l);
    };
    for (const ln of map.lines) {
      const [x1, y1] = map.vertices[ln.v1], [x2, y2] = map.vertices[ln.v2];
      const F = map.sectors[ln.front], B = ln.back >= 0 ? map.sectors[ln.back] : null;
      const contrast = Math.abs(x2 - x1) > Math.abs(y2 - y1) ? 0.9 : 1.06;
      const lf = lightOf(F.light) * contrast;
      if (!B) { quad(ln.tex.fm, x1, y1, x2, y2, F.floor, F.ceil, ln.offF, ln.len, F.ceil, lf); continue; }
      const lb = lightOf(B.light) * contrast;
      if (B.floor > F.floor) quad(ln.tex.fb, x1, y1, x2, y2, F.floor, B.floor, ln.offF, ln.len, B.floor, lf);
      if (B.floor < F.floor) quad(ln.tex.bb, x2, y2, x1, y1, B.floor, F.floor, ln.offB, ln.len, F.floor, lb);
      const bothSky = F.ceilTex === 'F_SKY1' && B.ceilTex === 'F_SKY1';
      if (!bothSky) {
        if (B.ceil < F.ceil) quad(ln.tex.ft, x1, y1, x2, y2, Math.max(B.ceil, F.floor), F.ceil, ln.offF, ln.len, B.ceil, lf);
        if (B.ceil > F.ceil) quad(ln.tex.bt, x2, y2, x1, y1, Math.max(F.ceil, B.floor), B.ceil, ln.offB, ln.len, F.ceil, lb);
      }
    }
    this.batches = [];
    for (const [tex, arr] of by) {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
      this.batches.push({ tex, buf, count: arr.length / 6 });
    }
    if (sel.length) {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sel), gl.STATIC_DRAW);
      this.batches.push({ sel: true, buf, count: sel.length / 6 });
    }
    this.invalidate();
  }

  frameAll() {
    if (!this.map || !this.map.vertices.length) return;
    const b = this.map.bounds;
    this.cam.x = (b[0] + b[2]) / 2; this.cam.y = b[1] - (b[3] - b[1]) * 0.25 - 200;
    this.cam.z = Math.max(300, (b[2] - b[0]) * 0.45); this.cam.yaw = 90; this.cam.pitch = -38;
    this.invalidate();
  }

  _move(fwd, right, up) {
    const c = this.cam, ya = c.yaw * Math.PI / 180, pa = c.pitch * Math.PI / 180;
    c.x += Math.cos(ya) * Math.cos(pa) * fwd + Math.sin(ya) * right;
    c.y += Math.sin(ya) * Math.cos(pa) * fwd - Math.cos(ya) * right;
    c.z += Math.sin(pa) * fwd + up;
  }

  invalidate() { if (!this.raf) this.raf = requestAnimationFrame(t => this._frame(t)); }

  _frame(t) {
    this.raf = 0;
    const dt = Math.min(0.05, (t - (this.last || t)) / 1000);
    this.last = t;
    const k = this.keys;
    if (k.size) {
      const sp = (k.has('ShiftLeft') ? 1400 : 520) * (dt || 0.016);
      const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const r = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const u = (k.has('KeyE') || k.has('Space') ? 1 : 0) - (k.has('KeyQ') || k.has('KeyC') ? 1 : 0);
      this._move(f * sp, r * sp, u * sp);
      this.invalidate();
    } else this.last = 0;
    this.render();
    if (this.onMove) this.onMove();
  }

  _mvp() {
    const c = this.cam, cv = this.canvas;
    const ya = c.yaw * Math.PI / 180, pa = c.pitch * Math.PI / 180;
    const f = [Math.cos(ya) * Math.cos(pa), Math.sin(pa), -Math.sin(ya) * Math.cos(pa)];
    const r = [Math.sin(ya), 0, Math.cos(ya)];
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    const e = [c.x, c.z, -c.y];
    const view = new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0,
      -(r[0] * e[0] + r[1] * e[1] + r[2] * e[2]), -(u[0] * e[0] + u[1] * e[1] + u[2] * e[2]), f[0] * e[0] + f[1] * e[1] + f[2] * e[2], 1]);
    return mul(persp(70 * Math.PI / 180, cv.width / Math.max(1, cv.height), 4, 30000), view);
  }

  render() {
    const gl = this.gl, cv = this.canvas;
    if (!gl) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (!w || !h) return;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.05, 0.06, 0.08, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.useProgram(this.skyProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
    const sp = gl.getAttribLocation(this.skyProg, 'aPos');
    gl.enableVertexAttribArray(sp); gl.vertexAttribPointer(sp, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(gl.getUniformLocation(this.skyProg, 'uPitch'), this.cam.pitch / 120);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (!this.map) return;

    const p = this.prog;
    gl.useProgram(p);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uMVP'), false, this._mvp());
    const aPos = gl.getAttribLocation(p, 'aPos'), aUV = gl.getAttribLocation(p, 'aUV'), aL = gl.getAttribLocation(p, 'aLight');
    const uTS = gl.getUniformLocation(p, 'uTexSize'), uTint = gl.getUniformLocation(p, 'uTint'), uFlat = gl.getUniformLocation(p, 'uFlat');
    const bind = buf => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(aUV); gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 24, 12);
      gl.enableVertexAttribArray(aL); gl.vertexAttribPointer(aL, 1, gl.FLOAT, false, 24, 20);
    };
    gl.uniform4f(uTint, 1, 1, 1, 1); gl.uniform1f(uFlat, 0);
    gl.activeTexture(gl.TEXTURE0);
    for (const b of this.batches) {
      if (b.sel) continue;
      const t = this._tex(texUrl(b.tex));
      const size = t ? texSize(b.tex) : [64, 64];
      gl.bindTexture(gl.TEXTURE_2D, t || this.missing);
      gl.uniform2f(uTS, t ? t.w || size[0] : 64, t ? t.h || size[1] : 64);
      bind(b.buf);
      gl.drawArrays(gl.TRIANGLES, 0, b.count);
    }
    // selection glow
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
    for (const b of this.batches) {
      if (!b.sel) continue;
      gl.bindTexture(gl.TEXTURE_2D, this.white);
      gl.uniform2f(uTS, 1, 1); gl.uniform1f(uFlat, 1); gl.uniform4f(uTint, 1, 0.45, 0.2, 0.3);
      bind(b.buf); gl.drawArrays(gl.TRIANGLES, 0, b.count);
    }
    gl.depthMask(true); gl.disable(gl.BLEND);

    // sprites (billboards)
    gl.disable(gl.CULL_FACE);
    gl.uniform1f(uFlat, 0);
    const ya = this.cam.yaw * Math.PI / 180, rx = Math.sin(ya), ry = -Math.cos(ya);
    this.boards = [];
    for (const th of this.things || []) {
      const sec = this.map.sectorAt(th.x, th.y);
      if (!sec) continue;
      const t = this._tex(th.url, true);
      const sc = th.scale || 1;
      const sw = (t ? t.w : 28) * sc, sh = (t ? t.h : 40) * sc;
      const z0 = th.hang ? sec.ceil - sh : sec.floor;
      const ax = th.x - rx * sw / 2, ay = th.y - ry * sw / 2, bx = th.x + rx * sw / 2, by = th.y + ry * sw / 2;
      const l = th.sel ? 1.6 : Math.max(0.45, lightOf(sec.light));
      const v = new Float32Array([ax, z0, -ay, 0, 1, l, bx, z0, -by, 1, 1, l, bx, z0 + sh, -by, 1, 0, l, ax, z0, -ay, 0, 1, l, bx, z0 + sh, -by, 1, 0, l, ax, z0 + sh, -ay, 0, 0, l]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn);
      gl.bufferData(gl.ARRAY_BUFFER, v, gl.DYNAMIC_DRAW);
      bind(this.dyn);
      gl.bindTexture(gl.TEXTURE_2D, t || this.white);
      gl.uniform2f(uTS, 1, 1);
      gl.uniform1f(uFlat, t ? 0 : 1);
      gl.uniform4f(uTint, th.sel ? 1.25 : 1, th.sel ? 1.05 : 1, th.sel ? 0.8 : 1, 1);
      if (!t) gl.uniform4f(uTint, 0.3, 0.85, 0.5, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      this.boards.push({ id: th.id, x: th.x, y: th.y, z0, z1: z0 + sh, hw: sw / 2 });
    }
  }

  // Ray-cast from a canvas pixel: returns {thing:id} | {room:id} | null
  pick(px, py) {
    if (!this.map) return null;
    const cv = this.canvas, c = this.cam;
    const nx = (px / cv.clientWidth) * 2 - 1, ny = 1 - (py / cv.clientHeight) * 2;
    const tanF = Math.tan(35 * Math.PI / 180), asp = cv.clientWidth / cv.clientHeight;
    const ya = c.yaw * Math.PI / 180, pa = c.pitch * Math.PI / 180;
    const f = [Math.cos(ya) * Math.cos(pa), Math.sin(ya) * Math.cos(pa), Math.sin(pa)];
    const r = [Math.sin(ya), -Math.cos(ya), 0];
    const u = [-Math.cos(ya) * Math.sin(pa), -Math.sin(ya) * Math.sin(pa), Math.cos(pa)];
    const d = [0, 1, 2].map(i => f[i] + r[i] * nx * tanF * asp + u[i] * ny * tanF);
    const len = Math.hypot(...d); d[0] /= len; d[1] /= len; d[2] /= len;
    let roomHit = null, roomDist = Infinity, last = null;
    for (let t = 4; t < 9000; t += 6) {
      const x = c.x + d[0] * t, y = c.y + d[1] * t, z = c.z + d[2] * t;
      const s = this.map.sectorAt(x, y);
      if (s && s.ceilTex === 'F_SKY1' && z > s.ceil) { last = null; continue; }
      if (s && z > s.floor && z < s.ceil) { last = s; continue; }
      if (s) { roomHit = s; roomDist = t; break; }
      if (last) { roomHit = last; roomDist = t; break; }
    }
    let best = null, bd = roomDist;
    for (const b of this.boards || []) {
      const vx = b.x - c.x, vy = b.y - c.y;
      const t = (vx * Math.cos(ya) + vy * Math.sin(ya)) / (d[0] * Math.cos(ya) + d[1] * Math.sin(ya) || 1e-6);
      if (t < 4 || t > bd) continue;
      const hx = c.x + d[0] * t - b.x, hy = c.y + d[1] * t - b.y, hz = c.z + d[2] * t;
      if (Math.hypot(hx, hy) <= b.hw + 2 && hz >= b.z0 && hz <= b.z1) { best = b; bd = t; }
    }
    if (best) return { thing: best.id };
    return roomHit ? { room: roomHit.area.room.id } : null;
  }
}
