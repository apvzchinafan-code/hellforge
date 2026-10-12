// Standard MIDI file writer + reader for HellForge songs. Pure functions (used by the compiler too).
// Song: { bpm, tracks: [{ name, inst, drum, vol, notes: [[tick, length, pitch, velocity], ...] }] }, 96 ticks per beat.
export const PPQ = 96;

const vlq = n => { const b = [n & 0x7f]; while ((n >>= 7) > 0) b.unshift((n & 0x7f) | 0x80); return b; };
const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const chunk = (id, data) => [...id].map(c => c.charCodeAt(0)).concat(u32(data.length), data);

export function songToMidi(song) {
  const bpm = Math.max(20, Math.min(400, Number(song.bpm) || 120));
  const us = Math.round(60000000 / bpm);
  const tracks = [[0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255, 0, 0xff, 0x58, 4, 4, 2, 24, 8, 0, 0xff, 0x2f, 0]];
  let next = 0;
  for (const t of song.tracks || []) {
    let ch;
    if (t.drum) ch = 9; else { ch = next % 15; if (ch >= 9) ch++; next++; }
    const ev = [];
    for (const [tick, len, pitch, vel] of t.notes || []) {
      const p = Math.max(0, Math.min(127, pitch | 0)), a = Math.max(0, tick | 0);
      ev.push([a, 1, 0x90 | ch, p, Math.max(1, Math.min(127, vel || 100))], [a + Math.max(1, len | 0), 0, 0x80 | ch, p, 0]);
    }
    ev.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const d = [0, 0xc0 | ch, Math.max(0, Math.min(127, t.inst | 0)), 0, 0xb0 | ch, 7, Math.max(0, Math.min(127, t.vol ?? 100))];
    let last = 0;
    for (const e of ev) { d.push(...vlq(e[0] - last), e[2], e[3], e[4]); last = e[0]; }
    d.push(0, 0xff, 0x2f, 0);
    tracks.push(d);
  }
  const out = chunk('MThd', [0, 1, (tracks.length >> 8) & 255, tracks.length & 255, (PPQ >> 8) & 255, PPQ & 255]);
  for (const t of tracks) out.push(...chunk('MTrk', t));
  return new Uint8Array(out);
}

export function midiToSong(bytes) {
  const d = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const str = (o, n) => String.fromCharCode(...d.subarray(o, o + n));
  const r32 = o => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
  if (str(0, 4) !== 'MThd') throw new Error('This is not a MIDI file.');
  const ntrk = (d[10] << 8) | d[11];
  let div = (d[12] << 8) | d[13];
  if (div & 0x8000) div = 480;
  let pos = 8 + r32(4), bpm = 0;
  const groups = new Map(); // "track:channel" -> { inst, notes, name }
  const scale = PPQ / div;
  for (let ti = 0; ti < ntrk && pos + 8 <= d.length; ti++) {
    const len = r32(pos + 4), end = pos + 8 + len;
    if (str(pos, 4) !== 'MTrk') { pos = end; continue; }
    let p = pos + 8, tick = 0, status = 0, name = '';
    const open = new Map();
    const grp = ch => { const k = ti + ':' + ch; if (!groups.has(k)) groups.set(k, { inst: 0, notes: [], ch, name }); return groups.get(k); };
    while (p < end) {
      let dt = 0, b;
      do { b = d[p++]; dt = (dt << 7) | (b & 0x7f); } while (b & 0x80 && p < end);
      tick += dt;
      let st = d[p];
      if (st & 0x80) { p++; if (st < 0xf0) status = st; } else st = status;
      if (st === 0xff) {
        const type = d[p++]; let l = 0;
        do { b = d[p++]; l = (l << 7) | (b & 0x7f); } while (b & 0x80);
        if (type === 0x51 && !bpm) bpm = Math.round(60000000 / ((d[p] << 16) | (d[p + 1] << 8) | d[p + 2]));
        if (type === 0x03) name = str(p, Math.min(l, 40)).replace(/[^\x20-\x7e]/g, '').trim();
        p += l;
      } else if (st === 0xf0 || st === 0xf7) {
        let l = 0;
        do { b = d[p++]; l = (l << 7) | (b & 0x7f); } while (b & 0x80);
        p += l;
      } else {
        const hi = st & 0xf0, ch = st & 15;
        if (hi === 0xc0) { grp(ch).inst = d[p++]; }
        else if (hi === 0xd0) p++;
        else {
          const a = d[p++], v = d[p++];
          if (hi === 0x90 && v > 0) open.set(ch * 128 + a, [tick, v]);
          else if (hi === 0x80 || hi === 0x90) {
            const o = open.get(ch * 128 + a);
            if (o) { open.delete(ch * 128 + a); grp(ch).notes.push([Math.round(o[0] * scale), Math.max(1, Math.round((tick - o[0]) * scale)), a, o[1]]); }
          }
        }
      }
    }
    for (const g of groups.values()) if (!g.name) g.name = name;
    pos = end;
  }
  const tracks = [...groups.values()].filter(g => g.notes.length).map((g, i) => ({
    name: g.name || (g.ch === 9 ? 'Drums' : 'Track ' + (i + 1)), inst: g.inst, drum: g.ch === 9, vol: 100, notes: g.notes.sort((a, b) => a[0] - b[0]),
  })).slice(0, 16);
  return { bpm: bpm || 120, tracks };
}

// Swap every instrument for its closest "classic Doom soundtrack" voice.
export function doomInstrument(p) {
  if (p < 8) return 29;            // pianos -> overdriven guitar
  if (p < 16) return 14;           // bells & mallets -> tubular bells
  if (p < 24) return 18;           // organs -> rock organ
  if (p < 32) return 30;           // guitars -> distortion guitar
  if (p < 40) return p >= 38 ? 38 : 34; // basses -> picked bass / synth bass
  if (p === 47) return 47;         // timpani stays
  if (p < 48) return 48;           // solo strings -> string ensemble
  if (p < 56) return p >= 52 ? 52 : 48; // ensembles -> strings / choir
  if (p < 64) return 61;           // brass -> brass section
  if (p < 72) return 81;           // reeds -> saw lead
  if (p < 80) return 80;           // pipes -> square lead
  if (p < 88) return p % 2 ? 81 : 80;
  if (p < 96) return 48;           // pads -> strings
  return 81;
}
export function songLength(song) {
  let end = 0;
  for (const t of song.tracks || []) for (const n of t.notes) end = Math.max(end, n[0] + n[1]);
  return end;
}
