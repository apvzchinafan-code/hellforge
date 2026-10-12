// Project state, undo/redo, autosave and server API.
import { debounce } from './dom.js';

export const S = {
  project: null,      // the open project (plain JSON)
  slug: null,
  server: null,       // /api/state result
  saveState: 'saved', // saved | dirty | saving | error
};

const listeners = {};
export const on = (evt, fn) => { (listeners[evt] ||= []).push(fn); return () => { listeners[evt] = listeners[evt].filter(f => f !== fn); }; };
export const emit = (evt, data) => { for (const f of listeners[evt] || []) f(data); };

// ---------------------------------------------------------------- API
export async function api(path, opts = {}) {
  const headers = { 'X-HellForge': '1', ...(opts.headers || {}) };
  let body = opts.body;
  if (body && !(body instanceof Blob) && !(body instanceof ArrayBuffer) && typeof body !== 'string') { body = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const r = await fetch('/api/' + path, { method: opts.method || (body ? 'POST' : 'GET'), headers, body });
  if (opts.raw) return r;
  const j = await r.json().catch(() => ({ ok: false, error: 'Bad server response' }));
  if (!r.ok && j.error) throw new Error(j.error);
  return j;
}
export const assetUrl = file => `/api/projects/${S.slug}/assets/${file}`;
export async function uploadAsset(file, blob) {
  await api(`projects/${S.slug}/assets/${file}`, { method: 'PUT', body: blob });
  return file;
}

// ---------------------------------------------------------------- ids
export function newId(prefix) {
  const p = S.project;
  p.seq = (p.seq || 1) + 1;
  return prefix + p.seq.toString(36);
}

// ---------------------------------------------------------------- undo / save
let hist = [], hi = -1;
const saveLater = debounce(() => saveNow(), 900);

export function commit() {
  const json = JSON.stringify(S.project);
  if (json === hist[hi]) return;
  hist.splice(hi + 1);
  hist.push(json);
  if (hist.length > 60) hist.shift();
  hi = hist.length - 1;
  S.saveState = 'dirty';
  emit('change');
  emit('save');
  saveLater();
}
export const canUndo = () => hi > 0;
export const canRedo = () => hi < hist.length - 1;
function restore() {
  S.project = JSON.parse(hist[hi]);
  S.saveState = 'dirty';
  emit('project');
  emit('change');
  emit('save');
  saveLater();
}
export function undo() { if (canUndo()) { hi--; restore(); } }
export function redo() { if (canRedo()) { hi++; restore(); } }

export async function saveNow() {
  if (!S.project || !S.slug) return;
  S.saveState = 'saving'; emit('save');
  try {
    await api('projects/' + S.slug, { method: 'PUT', body: JSON.stringify(S.project) });
    if (S.saveState === 'saving') S.saveState = 'saved';
  } catch (e) {
    S.saveState = 'error';
    console.error(e);
  }
  emit('save');
}

export async function openProject(slug) {
  const p = await api('projects/' + slug);
  S.project = migrate(p);
  S.slug = slug;
  hist = [JSON.stringify(S.project)]; hi = 0;
  S.saveState = 'saved';
  localStorage.setItem('hf.last', slug);
  emit('project'); emit('change'); emit('save');
}
export async function createProject(name, project) {
  const { slug } = await api('projects', { body: { name } });
  project.name = name;
  await api('projects/' + slug, { method: 'PUT', body: JSON.stringify(project) });
  await openProject(slug);
}
export function closeProject() {
  saveLater.flush();
  S.project = null; S.slug = null;
  localStorage.removeItem('hf.last');
  emit('project');
}

export function blankProject(name = 'My Doom Game') {
  return {
    format: 1, name, author: '', seq: 100,
    game: {
      endText: 'You made it out alive.\n\nThanks for playing!', titlePic: null, titleMusic: '',
      allowJump: true, allowCrouch: true, startMap: '',
      player: { health: 100, speed: 1, jump: 8, items: [{ cls: 'Pistol', n: 1 }, { cls: 'Fist', n: 1 }, { cls: 'Clip', n: 50 }] },
    },
    levels: [], actors: [], sprites: [], textures: [], sounds: [], music: [], vars: [], scripts: [],
  };
}

function migrate(p) {
  const b = blankProject(p.name);
  for (const k of Object.keys(b)) if (p[k] === undefined) p[k] = b[k];
  p.game = { ...b.game, ...p.game, player: { ...b.game.player, ...(p.game && p.game.player) } };
  for (const l of p.levels) { l.rooms ||= []; l.things ||= []; l.scripts ||= []; }
  for (const a of p.actors) { a.scripts ||= []; a.vars ||= []; a.anims ||= {}; a.p ||= {}; }
  return p;
}

// ---------------------------------------------------------------- lookups
export const byId = (list, id) => list.find(x => x.id === id);
export const P = () => S.project;
