// Tiny WebAudio song player (preview only - in game the engine's own MIDI synth plays the music),
// plus an experimental "audio recording -> notes" transcriber.
import { audioCtx } from './sfxr.js';
import { PPQ } from './midi.js';

function voice(inst) {
  if (inst < 8) return { type: 'triangle', a: 0.005, d: 0.9, s: 0.0, g: 0.9 };
  if (inst < 16) return { type: 'sine', a: 0.002, d: 0.8, s: 0.0, g: 0.8 };
  if (inst < 24) return { type: 'square', a: 0.02, d: 0.1, s: 0.8, g: 0.35 };
  if (inst < 29) return { type: 'triangle', a: 0.004, d: 0.6, s: 0.1, g: 0.8 };
  if (inst < 32) return { type: 'sawtooth', a: 0.004, d: 0.3, s: 0.75, g: 0.42, dist: true };
  if (inst < 40) return { type: 'triangle', a: 0.005, d: 0.4, s: 0.6, g: 1.0 };
  if (inst < 56) return { type: 'sawtooth', a: 0.08, d: 0.2, s: 0.8, g: 0.3, lp: 2200 };
  if (inst < 64) return { type: 'sawtooth', a: 0.03, d: 0.2, s: 0.7, g: 0.35, lp: 3000 };
  if (inst < 80) return { type: 'square', a: 0.03, d: 0.1, s: 0.8, g: 0.28, lp: 3500 };
  if (inst < 88) return { type: inst % 2 ? 'sawtooth' : 'square', a: 0.005, d: 0.1, s: 0.8, g: 0.3 };
  if (inst < 96) return { type: 'triangle', a: 0.25, d: 0.3, s: 0.8, g: 0.5 };
  return { type: 'sine', a: 0.01, d: 0.3, s: 0.5, g: 0.5 };
}
let noiseBuf;
function noise(ctx) {
  if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; return s;
}
function drum(ctx, out, pitch, t, vel) {
  const g = ctx.createGain(); g.connect(out);
  const v = vel / 127;
  if (pitch === 35 || pitch === 36) { const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(1.1 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22); o.connect(g); o.start(t); o.stop(t + 0.25); return; }
  const n = noise(ctx), f = ctx.createBiquadFilter();
  let len = 0.12, freq = 5000, type = 'highpass', amp = 0.5;
  if (pitch === 38 || pitch === 40 || pitch === 37) { len = 0.16; freq = 1400; type = 'bandpass'; amp = 0.9; }
  else if (pitch === 42 || pitch === 44) { len = 0.05; freq = 7000; amp = 0.4; }
  else if (pitch === 46) { len = 0.28; freq = 6500; amp = 0.4; }
  else if (pitch === 49 || pitch === 57 || pitch === 51) { len = 0.8; freq = 5000; amp = 0.45; }
  else if (pitch >= 41 && pitch <= 50) { const o = ctx.createOscillator(); const fr = 80 + (pitch - 41) * 18; o.frequency.setValueAtTime(fr * 1.6, t); o.frequency.exponentialRampToValueAtTime(fr, t + 0.15); g.gain.setValueAtTime(0.8 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28); o.connect(g); o.start(t); o.stop(t + 0.3); return; }
  f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(amp * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
  n.connect(f); f.connect(g); n.start(t); n.stop(t + len + 0.02);
}
export function playNote(inst, pitch, secs = 0.3, vel = 100, isDrum = false, when = 0, out = null, vol = 1) {
  const ctx = audioCtx();
  const t = when || ctx.currentTime, dest = out || ctx.destination;
  if (isDrum) return drum(ctx, dest, pitch, t, vel * vol);
  const p = voice(inst), o = ctx.createOscillator(), g = ctx.createGain();
  o.type = p.type; o.frequency.value = 440 * Math.pow(2, (pitch - 69) / 12);
  const peak = p.g * (vel / 127) * 0.32 * vol, sus = Math.max(0.0001, peak * p.s);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + p.a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, p.s > 0 ? sus : 0.0001), t + p.a + p.d);
  const end = t + Math.max(secs, p.a + 0.03);
  g.gain.setValueAtTime(p.s > 0 ? sus : Math.max(0.0001, peak * Math.exp(-(end - t - p.a) / (p.d * 0.35))), end);
  g.gain.exponentialRampToValueAtTime(0.0001, end + 0.08);
  let node = o;
  if (p.dist) { const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = o.frequency.value * 1.005; const g2 = ctx.createGain(); g2.gain.value = 0.5; o2.connect(g2); g2.connect(g); o2.start(t); o2.stop(end + 0.1); }
  if (p.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = p.lp; o.connect(f); node = f; }
  node.connect(g); g.connect(dest);
  o.start(t); o.stop(end + 0.1);
}

export class SongPlayer {
  constructor() { this.timer = 0; this.playing = false; }
  play(song, fromTick = 0, onTick, loopEnd) {
    this.stop();
    const ctx = audioCtx();
    ctx.resume();
    this.master = ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(ctx.destination);
    const spt = 60 / (Math.max(20, song.bpm || 120) * PPQ);
    const events = [];
    for (const tr of song.tracks) { if (tr.mute) continue; for (const n of tr.notes) if (n[0] >= fromTick) events.push([n[0], n[1], n[2], n[3] || 100, tr.inst | 0, !!tr.drum, (tr.vol ?? 100) / 100]); }
    events.sort((a, b) => a[0] - b[0]);
    const end = loopEnd || events.reduce((m, e) => Math.max(m, e[0] + e[1]), fromTick);
    const t0 = ctx.currentTime + 0.06;
    let i = 0;
    this.playing = true;
    const step = () => {
      const now = ctx.currentTime, horizon = fromTick + (now - t0 + 0.25) / spt;
      while (i < events.length && events[i][0] <= horizon) { const e = events[i++]; playNote(e[4], e[2], e[1] * spt, e[3], e[5], t0 + (e[0] - fromTick) * spt, this.master, e[6]); }
      const tick = fromTick + (now - t0) / spt;
      if (onTick) onTick(Math.max(fromTick, tick));
      if (tick > end + PPQ) this.stop(true);
    };
    this.timer = setInterval(step, 40);
    this.onStop = () => { if (onTick) onTick(-1); };
    step();
  }
  stop(natural) {
    if (!this.playing) return;
    clearInterval(this.timer); this.playing = false;
    if (this.master) { const m = this.master, ctx = audioCtx(); m.gain.setTargetAtTime(0, ctx.currentTime, natural ? 0.2 : 0.02); setTimeout(() => m.disconnect(), natural ? 900 : 200); }
    if (this.onStop) this.onStop();
  }
}

// ---------------------------------------------------------------- experimental: recording -> notes
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
// Listens to an audio buffer and writes down the loudest notes it hears. Works best on simple tunes.
export function audioToSong(buffer, opts = {}) {
  const poly = opts.poly || 3, bpm = opts.bpm || 120, lead = opts.lead ?? 30, bass = opts.bass ?? 34;
  const sr = buffer.sampleRate, dec = Math.max(1, Math.round(sr / 11025)), rate = sr / dec;
  const total = Math.min(buffer.length, sr * 240);
  const mono = new Float32Array(Math.floor(total / dec));
  const chans = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));
  for (let i = 0; i < mono.length; i++) { let s = 0; for (let k = 0; k < dec; k++) for (const ch of chans) s += ch[i * dec + k] || 0; mono[i] = s / (dec * chans.length); }
  const N = 2048, hop = 512, LO = 36, HI = 96;
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  const frames = [];
  let gmax = 0;
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let pos = 0; pos + N <= mono.length; pos += hop) {
    for (let i = 0; i < N; i++) { re[i] = mono[pos + i] * win[i]; im[i] = 0; }
    fft(re, im);
    const e = new Float32Array(HI - LO + 1);
    for (let n = LO; n <= HI; n++) {
      const f = 440 * Math.pow(2, (n - 69) / 12), b0 = Math.max(1, Math.floor(f * 0.972 * N / rate)), b1 = Math.ceil(f * 1.029 * N / rate);
      let m = 0;
      for (let b = b0; b <= b1 && b < N / 2; b++) { const mag = Math.hypot(re[b], im[b]); if (mag > m) m = mag; }
      e[n - LO] = m;
    }
    for (let n = 0; n < e.length; n++) { const v = e[n]; if (n + 12 < e.length) e[n + 12] = Math.max(0, e[n + 12] - v * 0.55); if (n + 19 < e.length) e[n + 19] = Math.max(0, e[n + 19] - v * 0.35); if (n + 24 < e.length) e[n + 24] = Math.max(0, e[n + 24] - v * 0.25); }
    for (const v of e) if (v > gmax) gmax = v;
    frames.push(e);
  }
  const tpf = hop / rate * (PPQ * bpm / 60); // ticks per frame
  const active = new Map(), notes = [];
  frames.forEach((e, fi) => {
    let fmax = 0; for (const v of e) if (v > fmax) fmax = v;
    const thr = Math.max(fmax * 0.4, gmax * 0.07);
    const cand = [];
    for (let n = 0; n < e.length; n++) if (e[n] > thr && e[n] >= (e[n - 1] || 0) && e[n] >= (e[n + 1] || 0)) cand.push([e[n], n + LO]);
    cand.sort((a, b) => b[0] - a[0]);
    const on = new Set(cand.slice(0, poly).map(c => c[1]));
    for (const p of on) { const a = active.get(p); if (a) { a.last = fi; a.peak = Math.max(a.peak, e[p - LO]); } else active.set(p, { start: fi, last: fi, peak: e[p - LO] }); }
    for (const [p, a] of active) if (fi - a.last >= 2) { active.delete(p); if (a.last - a.start >= 1) notes.push([Math.round(a.start * tpf), Math.max(12, Math.round((a.last - a.start + 1) * tpf)), p, Math.round(Math.min(127, 60 + 67 * Math.sqrt(a.peak / gmax)))]); }
  });
  for (const [p, a] of active) if (a.last - a.start >= 1) notes.push([Math.round(a.start * tpf), Math.max(12, Math.round((a.last - a.start + 1) * tpf)), p, 100]);
  const q = PPQ / 4;
  for (const n of notes) { n[0] = Math.round(n[0] / q) * q; n[1] = Math.max(q, Math.round(n[1] / q) * q); }
  notes.sort((a, b) => a[0] - b[0]);
  const first = notes.length ? Math.floor(notes[0][0] / (PPQ * 4)) * PPQ * 4 : 0;
  for (const n of notes) n[0] -= first;
  return { bpm, tracks: [
    { name: 'Melody', inst: lead, drum: false, vol: 100, notes: notes.filter(n => n[2] >= 52) },
    { name: 'Bass', inst: bass, drum: false, vol: 110, notes: notes.filter(n => n[2] < 52) },
  ].filter(t => t.notes.length) };
}
