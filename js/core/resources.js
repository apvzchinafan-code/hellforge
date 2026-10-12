// IWAD + project asset lookup for the editor: texture/sprite URLs, image cache, thing info.
import { S, api, emit, byId } from './store.js';
import { THING_BY_CLS, ACTOR_KINDS } from '../data/doom.js';
import { texLump, FRAME } from '../compile/names.js';

export const R = { ok: false, game: 'doom1', tex: new Map(), flats: new Set(), sprites: new Map(), sounds: [], music: [], texList: [], flatList: [] };

export async function loadIwadInfo() {
  R.ok = false; R.tex.clear(); R.flats.clear(); R.sprites.clear(); R.sounds = []; R.music = [];
  try {
    const d = await api('iwad');
    R.ok = true; R.game = d.game;
    for (const [n, w, h] of d.textures) R.tex.set(n, [w, h]);
    for (const n of d.flats) R.flats.add(n);
    for (const [n, w, h, ox, oy] of d.sprites) R.sprites.set(n, [w, h, ox, oy]);
    R.sounds = d.sounds; R.music = d.music;
    R.texList = d.textures.map(t => t[0]).filter(n => n !== 'AASTINKY' && n !== 'AASHITTY').sort();
    R.flatList = d.flats.filter(n => n !== 'F_SKY1').sort();
  } catch { /* no IWAD - editor still works with custom art */ }
  imgs.clear();
}

// ---------------------------------------------------------------- textures
export function customTex(name) { return S.project ? S.project.textures.find(t => texLump(t) === name) : null; }
export function texUrl(name) {
  if (!name || name === '-' || name === 'F_SKY1') return '';
  const c = customTex(name);
  if (c) return c.data;
  return R.ok ? `/api/iwad/tex/${encodeURIComponent(name)}.png` : '';
}
export function texSize(name) {
  const c = customTex(name);
  if (c) return [c.w, c.h];
  return R.tex.get(name) || [64, 64];
}
export const texExists = name => name === 'F_SKY1' || !!customTex(name) || R.tex.has(name) || R.flats.has(name);
export const texLabel = name => { const c = customTex(name); return c ? c.name : name; };

// ---------------------------------------------------------------- image cache
const imgs = new Map();
let pending = false;
export function getImg(url) {
  if (!url) return null;
  let i = imgs.get(url);
  if (!i) {
    i = new Image();
    i.onload = () => { i.ready = true; if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; emit('img'); }); } };
    i.onerror = () => { i.failed = true; };
    i.src = url;
    imgs.set(url, i);
    if (imgs.size > 3000) imgs.delete(imgs.keys().next().value);
  }
  return i.ready ? i : null;
}

// ---------------------------------------------------------------- sprites
// Find the IWAD lump that shows frame `idx` of sprite `prefix` from the front.
export function iwadFrameLump(prefix, idx) {
  const f = FRAME(idx);
  for (const rot of ['0', '1']) if (R.sprites.has(prefix + f + rot)) return prefix + f + rot;
  for (const n of R.sprites.keys()) if (n.startsWith(prefix) && (n[4] === f || n[6] === f)) return n;
  return null;
}
export function iwadFrameCount(prefix) {
  let max = -1;
  for (const n of R.sprites.keys()) if (n.startsWith(prefix)) { max = Math.max(max, n.charCodeAt(4) - 65, n.length > 6 ? n.charCodeAt(6) - 65 : -1); }
  return Math.min(max + 1, 29);
}
export function iwadPrefixes() {
  const set = new Set();
  for (const n of R.sprites.keys()) set.add(n.slice(0, 4));
  return [...set].sort();
}
export function frameUrl(src, idx) {
  if (!src) return '';
  if (src[0] === '@') { const s = byId(S.project.sprites, src.slice(1)); return s ? (s.frames[idx] || s.frames[0] || '') : ''; }
  const l = iwadFrameLump(src, idx);
  return l ? `/api/iwad/sprite/${l}.png` : '';
}
export function animFrameUrls(a) { return a && a.src ? (a.frames || []).map(i => frameUrl(a.src, i)).filter(Boolean) : []; }
export function actorThumb(a) {
  if (!a) return '';
  const order = ['idle', 'fly', 'pickup', 'ready', 'walk', 'fire'];
  for (const k of order) { const u = animFrameUrls(a.anims[k])[0]; if (u) return u; }
  for (const k of Object.keys(a.anims)) { const u = animFrameUrls(a.anims[k])[0]; if (u) return u; }
  return '';
}

// ---------------------------------------------------------------- things
export function thingInfo(type) {
  if (type && type[0] === '@') {
    const a = byId(S.project.actors, type.slice(1));
    if (!a) return null;
    const k = ACTOR_KINDS[a.kind];
    return { name: a.name, url: actorThumb(a), r: a.p.radius || 16, dir: a.kind === 'monster', cat: 'custom', color: k.color, custom: a, scale: a.p.scale || 1 };
  }
  const t = THING_BY_CLS[type];
  if (!t) return null;
  const colors = { markers: '#35d07f', monsters: '#ff5a36', weapons: '#ffb224', items: '#4c8dff', decor: '#9aa3b8' };
  return { name: t.name, url: t.spr && R.sprites.has(t.spr) ? `/api/iwad/sprite/${t.spr}.png` : '', r: t.r, dir: !!t.dir, cat: t.cat, color: colors[t.cat], named: t.named, builtin: t, scale: 1 };
}
export const thingAvailable = t => !t.spr || R.sprites.has(t.spr) || !R.ok;

// ---------------------------------------------------------------- sounds / music option lists
export function soundOptions() {
  const mine = S.project.sounds.map(s => ['@' + s.id, s.name]);
  return [['', '(none)'], ...(mine.length ? [{ group: 'My sounds', items: mine }] : []), { group: 'Doom sounds', items: R.sounds.map(s => [s[0], s[0]]) }];
}
export function soundUrl(ref) {
  if (!ref) return '';
  if (ref[0] === '@') { const s = byId(S.project.sounds, ref.slice(1)); return s ? `/api/projects/${S.slug}/assets/${s.file}` : ''; }
  const b = R.sounds.find(s => s[0] === ref);
  return b ? `/api/iwad/sound/${b[1]}.wav` : '';
}
let audioEl = null;
export function playSound(ref) {
  const u = typeof ref === 'string' && ref.startsWith('/') ? ref : soundUrl(ref);
  if (!u) return;
  if (audioEl) audioEl.pause();
  audioEl = new Audio(u);
  audioEl.volume = 0.7;
  audioEl.play().catch(() => {});
}
export function musicOptions() {
  const mine = S.project.music.map(m => ['@' + m.id, m.name]);
  return [['', '(no music)'], ...(mine.length ? [{ group: 'My music', items: mine }] : []), { group: 'Doom music', items: R.music.map(m => [m, m.replace(/^D_/, '')]) }];
}
