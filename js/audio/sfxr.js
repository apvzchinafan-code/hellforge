// Retro sound-effect synthesizer (after DrPetter's sfxr). params -> Float32Array samples at 22050 Hz, and WAV encoding.
const rnd = (a = 1) => Math.random() * a;
const base = () => ({ wave: 0, attack: 0, sustain: 0.3, punch: 0, decay: 0.4, freq: 0.3, freqLimit: 0, slide: 0, dslide: 0, vibDepth: 0, vibSpeed: 0, arpMod: 0, arpSpeed: 0, duty: 0, dutySweep: 0, repeat: 0, phaser: 0, phaserSweep: 0, lpf: 1, lpfSweep: 0, lpfRes: 0, hpf: 0, hpfSweep: 0, vol: 0.6 });

export const PRESETS = {
  'Pickup': () => { const p = base(); p.freq = 0.4 + rnd(0.5); p.sustain = rnd(0.1); p.decay = 0.1 + rnd(0.4); p.punch = 0.3 + rnd(0.3); if (rnd() < 0.5) { p.arpSpeed = 0.5 + rnd(0.2); p.arpMod = 0.2 + rnd(0.4); } return p; },
  'Laser / shot': () => { const p = base(); p.wave = Math.floor(rnd(3)); if (p.wave === 2 && rnd() < 0.5) p.wave = Math.floor(rnd(2)); p.freq = 0.5 + rnd(0.5); p.freqLimit = Math.max(0.2, p.freq - 0.2 - rnd(0.6)); p.slide = -0.15 - rnd(0.2); if (rnd() < 0.33) { p.freq = 0.3 + rnd(0.6); p.freqLimit = rnd(0.1); p.slide = -0.35 - rnd(0.3); } if (rnd() < 0.5) { p.duty = rnd(0.5); p.dutySweep = rnd(0.2); } else { p.duty = 0.4 + rnd(0.5); p.dutySweep = -rnd(0.7); } p.sustain = 0.1 + rnd(0.2); p.decay = rnd(0.4); if (rnd() < 0.5) p.punch = rnd(0.3); if (rnd() < 0.33) { p.phaser = rnd(0.2); p.phaserSweep = -rnd(0.2); } if (rnd() < 0.5) p.hpf = rnd(0.3); return p; },
  'Gunshot': () => { const p = base(); p.wave = 3; p.freq = 0.25 + rnd(0.25); p.slide = -0.2 - rnd(0.2); p.sustain = 0.05 + rnd(0.08); p.decay = 0.18 + rnd(0.2); p.punch = 0.5 + rnd(0.4); p.lpf = 0.6 + rnd(0.4); p.hpf = rnd(0.1); return p; },
  'Explosion': () => { const p = base(); p.wave = 3; if (rnd() < 0.5) { p.freq = 0.1 + rnd(0.4); p.slide = -0.1 + rnd(0.4); } else { p.freq = 0.2 + rnd(0.7); p.slide = -0.2 - rnd(0.2); } p.freq *= p.freq; if (rnd() < 0.2) p.slide = 0; if (rnd() < 0.33) p.repeat = 0.3 + rnd(0.5); p.sustain = 0.1 + rnd(0.3); p.decay = 0.3 + rnd(0.5); if (rnd() < 0.5) { p.phaser = -0.3 + rnd(0.9); p.phaserSweep = -rnd(0.3); } p.punch = 0.2 + rnd(0.6); if (rnd() < 0.5) { p.vibDepth = rnd(0.7); p.vibSpeed = rnd(0.6); } if (rnd() < 0.33) { p.arpSpeed = 0.6 + rnd(0.3); p.arpMod = 0.8 - rnd(1.6); } return p; },
  'Power-up': () => { const p = base(); if (rnd() < 0.5) p.wave = 1; else p.duty = rnd(0.6); if (rnd() < 0.5) { p.freq = 0.2 + rnd(0.3); p.slide = 0.1 + rnd(0.4); p.repeat = 0.4 + rnd(0.4); } else { p.freq = 0.2 + rnd(0.3); p.slide = 0.05 + rnd(0.2); if (rnd() < 0.5) { p.vibDepth = rnd(0.7); p.vibSpeed = rnd(0.6); } } p.sustain = rnd(0.4); p.decay = 0.1 + rnd(0.4); return p; },
  'Hit / hurt': () => { const p = base(); p.wave = Math.floor(rnd(3)); if (p.wave === 2) p.wave = 3; if (p.wave === 0) p.duty = rnd(0.6); p.freq = 0.2 + rnd(0.6); p.slide = -0.3 - rnd(0.4); p.sustain = rnd(0.1); p.decay = 0.1 + rnd(0.2); if (rnd() < 0.5) p.hpf = rnd(0.3); return p; },
  'Monster growl': () => { const p = base(); p.wave = 1; p.freq = 0.08 + rnd(0.12); p.slide = -0.05 - rnd(0.1); p.vibDepth = 0.3 + rnd(0.5); p.vibSpeed = 0.3 + rnd(0.4); p.attack = 0.1 + rnd(0.2); p.sustain = 0.3 + rnd(0.3); p.decay = 0.3 + rnd(0.3); p.lpf = 0.3 + rnd(0.3); p.lpfRes = rnd(0.5); return p; },
  'Jump': () => { const p = base(); p.duty = rnd(0.6); p.freq = 0.3 + rnd(0.3); p.slide = 0.1 + rnd(0.2); p.sustain = 0.1 + rnd(0.3); p.decay = 0.1 + rnd(0.2); if (rnd() < 0.5) p.hpf = rnd(0.3); if (rnd() < 0.5) p.lpf = 1 - rnd(0.6); return p; },
  'Blip / switch': () => { const p = base(); p.wave = Math.floor(rnd(2)); if (p.wave === 0) p.duty = rnd(0.6); p.freq = 0.2 + rnd(0.4); p.sustain = 0.1 + rnd(0.1); p.decay = rnd(0.2); p.hpf = 0.1; return p; },
  'Teleport': () => { const p = base(); p.wave = 2; p.freq = 0.2 + rnd(0.2); p.slide = 0.15 + rnd(0.15); p.vibDepth = 0.4 + rnd(0.4); p.vibSpeed = 0.5 + rnd(0.3); p.sustain = 0.3 + rnd(0.2); p.decay = 0.4 + rnd(0.3); p.phaser = 0.2 + rnd(0.3); p.phaserSweep = -0.1; return p; },
  'Door / machine': () => { const p = base(); p.wave = 3; p.freq = 0.05 + rnd(0.08); p.slide = 0.02 + rnd(0.05); p.attack = 0.15; p.sustain = 0.5 + rnd(0.3); p.decay = 0.3; p.lpf = 0.15 + rnd(0.15); p.lpfRes = 0.4 + rnd(0.4); return p; },
};
export function mutate(q) {
  const p = { ...q };
  for (const k of ['freq', 'slide', 'dslide', 'duty', 'dutySweep', 'vibDepth', 'vibSpeed', 'attack', 'sustain', 'decay', 'punch', 'lpf', 'lpfSweep', 'lpfRes', 'hpf', 'phaser', 'phaserSweep', 'repeat', 'arpSpeed', 'arpMod']) if (rnd() < 0.5) p[k] = (p[k] || 0) + rnd(0.1) - 0.05;
  return p;
}

export function synth(p) {
  const RATE = 44100;
  let fperiod, period, fmaxperiod, fslide, fdslide, duty, dutySlide, arpMod, arpTime, arpLimit;
  const reset = () => {
    fperiod = 100 / (p.freq * p.freq + 0.001); period = Math.floor(fperiod); fmaxperiod = 100 / (p.freqLimit * p.freqLimit + 0.001);
    fslide = 1 - Math.pow(p.slide, 3) * 0.01; fdslide = -Math.pow(p.dslide, 3) * 0.000001;
    duty = 0.5 - p.duty * 0.5; dutySlide = -p.dutySweep * 0.00005;
    arpMod = p.arpMod >= 0 ? 1 - p.arpMod * p.arpMod * 0.9 : 1 + p.arpMod * p.arpMod * 10;
    arpTime = 0; arpLimit = p.arpSpeed === 1 ? 0 : Math.floor(Math.pow(1 - p.arpSpeed, 2) * 20000 + 32);
  };
  reset();
  let fltp = 0, fltdp = 0, fltw = Math.pow(p.lpf, 3) * 0.1, fltphp = 0, flthp = p.hpf * p.hpf * 0.1;
  const fltwd = 1 + p.lpfSweep * 0.0001, flthpd = 1 + p.hpfSweep * 0.0003;
  let fltdmp = 5 / (1 + p.lpfRes * p.lpfRes * 20) * (0.01 + fltw); if (fltdmp > 0.8) fltdmp = 0.8;
  let vibPhase = 0; const vibSpeed = p.vibSpeed * p.vibSpeed * 0.01, vibAmp = p.vibDepth * 0.5;
  const env = [Math.floor(p.attack * p.attack * 100000), Math.floor(p.sustain * p.sustain * 100000), Math.floor(p.decay * p.decay * 100000)];
  let stage = 0, envTime = 0, envVol = 0;
  let fphase = p.phaser * p.phaser * 1020 * (p.phaser < 0 ? -1 : 1); const fdphase = p.phaserSweep * p.phaserSweep * (p.phaserSweep < 0 ? -1 : 1);
  const pbuf = new Float32Array(1024), nbuf = new Float32Array(32).map(() => Math.random() * 2 - 1);
  let ipp = 0, phase = 0, repTime = 0; const repLimit = p.repeat === 0 ? 0 : Math.floor(Math.pow(1 - p.repeat, 2) * 20000 + 32);
  const out = [];
  const max = RATE * 4;
  for (let n = 0; n < max; n++) {
    if (repLimit && ++repTime >= repLimit) { repTime = 0; reset(); }
    if (arpLimit && ++arpTime >= arpLimit) { arpLimit = 0; fperiod *= arpMod; }
    fslide += fdslide; fperiod *= fslide;
    if (fperiod > fmaxperiod) { fperiod = fmaxperiod; if (p.freqLimit > 0) break; }
    let rf = fperiod;
    if (vibAmp > 0) { vibPhase += vibSpeed; rf = fperiod * (1 + Math.sin(vibPhase) * vibAmp); }
    period = Math.max(8, Math.floor(rf));
    duty = Math.min(0.5, Math.max(0, duty + dutySlide));
    if (++envTime > env[stage]) { envTime = 0; if (++stage === 3) break; }
    if (stage === 0) envVol = envTime / Math.max(1, env[0]);
    else if (stage === 1) envVol = 1 + (1 - envTime / Math.max(1, env[1])) * 2 * p.punch;
    else envVol = 1 - envTime / Math.max(1, env[2]);
    fphase += fdphase;
    const iphase = Math.min(1023, Math.abs(Math.floor(fphase)));
    if (flthpd !== 0) flthp = Math.min(0.1, Math.max(0.00001, flthp * flthpd));
    let ss = 0;
    for (let si = 0; si < 8; si++) {
      if (++phase >= period) { phase %= period; if (p.wave === 3) for (let i = 0; i < 32; i++) nbuf[i] = Math.random() * 2 - 1; }
      const fp = phase / period;
      let s = p.wave === 0 ? (fp < duty ? 0.5 : -0.5) : p.wave === 1 ? 1 - fp * 2 : p.wave === 2 ? Math.sin(fp * 6.28318531) : nbuf[Math.floor(phase * 32 / period)];
      const pp = fltp;
      fltw = Math.min(0.1, Math.max(0, fltw * fltwd));
      if (p.lpf < 1) { fltdp += (s - fltp) * fltw; fltdp -= fltdp * fltdmp; } else { fltp = s; fltdp = 0; }
      fltp += fltdp;
      fltphp += fltp - pp; fltphp -= fltphp * flthp; s = fltphp;
      pbuf[ipp & 1023] = s; s += pbuf[(ipp - iphase + 1024) & 1023]; ipp = (ipp + 1) & 1023;
      ss += s * envVol;
    }
    out.push(Math.max(-1, Math.min(1, ss / 8 * 2 * (p.vol ?? 0.6))));
  }
  const half = new Float32Array(Math.ceil(out.length / 2));
  for (let i = 0; i < half.length; i++) half[i] = (out[i * 2] + (out[i * 2 + 1] ?? out[i * 2])) / 2;
  return half;
}

export function wavBlob(samples, rate = 22050) {
  const b = new ArrayBuffer(44 + samples.length * 2), v = new DataView(b);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return new Blob([b], { type: 'audio/wav' });
}
let actx;
export const audioCtx = () => (actx ||= new (window.AudioContext || window.webkitAudioContext)());
export function playSamples(samples, rate = 22050) {
  const ctx = audioCtx(), buf = ctx.createBuffer(1, samples.length, rate);
  buf.getChannelData(0).set(samples);
  const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start();
  return src;
}
export function drawWave(canvas, samples) {
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, hh = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = hh * dpr;
  const c = canvas.getContext('2d'); c.scale(dpr, dpr); c.clearRect(0, 0, w, hh);
  c.strokeStyle = '#ff9040'; c.lineWidth = 1; c.beginPath();
  const step = Math.max(1, samples.length / w);
  for (let x = 0; x < w; x++) { let mn = 1, mx = -1; for (let i = Math.floor(x * step); i < Math.min(samples.length, Math.floor((x + 1) * step) + 1); i++) { const s = samples[i]; if (s < mn) mn = s; if (s > mx) mx = s; } c.moveTo(x + 0.5, hh / 2 - mx * hh * 0.46); c.lineTo(x + 0.5, hh / 2 - mn * hh * 0.46 + 1); }
  c.stroke();
}
