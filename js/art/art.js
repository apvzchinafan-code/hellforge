// Art: pixel editor for sprites (multi-frame) and textures, with import, Doom-sprite import and recolouring.
import { h, icon, clear, clamp, loadImage, fileToDataURL, pickFiles, niceName } from '../core/dom.js';
import { S, commit, newId, byId } from '../core/store.js';
import { R, iwadPrefixes, iwadFrameLump, iwadFrameCount } from '../core/resources.js';
import { toast, modal, field, num, text, select, toggle, slider, seg, btn, iconBtn, confirmBox, pickFromGrid, menu } from '../core/widgets.js';
import { texLump } from '../compile/names.js';

const A = { tab: 'sprite', id: null, frame: 0, tool: 'pencil', color: [224, 60, 40, 255], size: 1, zoom: 8, onion: false, tile: true, tol: 40 };
const PALETTE = ['#000000', '#222034', '#45283c', '#663931', '#8f563b', '#df7126', '#d9a066', '#eec39a', '#fbf236', '#99e550', '#6abe30', '#37946e', '#4b692f', '#524b24', '#323c39', '#3f3f74',
  '#306082', '#5b6ee1', '#639bff', '#5fcde4', '#cbdbfc', '#ffffff', '#9badb7', '#847e87', '#696a6a', '#595652', '#76428a', '#ac3232', '#d95763', '#d77bba', '#8f974a', '#8a6f30',
  '#3b0000', '#6b0000', '#9b0f0f', '#c82020', '#ff3b30', '#ff7b54', '#ffb199', '#4a2f1b', '#6e4a2a', '#93693f', '#b98a58', '#1b3b0e', '#2f5f1c', '#4b8a2c', '#7dc24a', '#b7f07a',
  '#111111', '#2b2b2b', '#444444', '#5e5e5e', '#7a7a7a', '#999999', '#b8b8b8', '#dcdcdc', '#101a3a', '#1c2f66', '#2a4a9a', '#3f6fd0', '#ffd27a', '#ffaa2a', '#e07a00', '#a04a00'];
const TOOLS = [['pencil', 'pencil', 'Pencil (B)'], ['eraser', 'eraser', 'Eraser (E)'], ['fill', 'bucket', 'Fill (F)'], ['wand', 'wand', 'Magic eraser - removes a background colour (W)'], ['pick', 'pipette', 'Pick a colour (I)'], ['line', 'line', 'Line (L)'], ['rect', 'square', 'Rectangle (R)'], ['move', 'move', 'Slide the picture (M)']];
let root, listEl, stage, sctx, framesEl, sideEl, barEl, work, wctx, drag = null, onionImg = null, prevTimer = 0, skipReload = false, offs = [];

const list = () => (A.tab === 'sprite' ? S.project.sprites : S.project.textures);
const asset = () => byId(list(), A.id);
const urls = a => (A.tab === 'sprite' ? a.frames : [a.data]);
const hex = c => '#' + c.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');
const unhex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 255];
const blankUrl = (w, hh) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c.toDataURL('image/png'); };
function canvasOf(w, hh) { const c = document.createElement('canvas'); c.width = w; c.height = hh; const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false; return [c, x]; }

export function openArt(tab, id) { A.tab = tab; A.id = id; A.frame = 0; }

export const ArtPage = {
  id: 'art', title: 'Art', icon: 'image',
  mount(el) {
    root = el; offs.forEach(f => f()); offs = [];
    if (!asset()) { A.id = list()[0] ? list()[0].id : null; A.frame = 0; }
    listEl = h('div.side-b'); sideEl = h('div.side-b', { style: { padding: 0 } }); barEl = h('div.lv-bar'); framesEl = h('div.art-frames');
    stage = h('canvas'); sctx = stage.getContext('2d');
    const stageWrap = h('div.art-stage', stage);
    clear(el).append(h('div.art',
      h('div.side.l', h('div.tabs', { style: { padding: '0 8px' } }, [['sprite', 'Sprites'], ['texture', 'Textures']].map(([id, l]) => h('div.tab' + (A.tab === id ? '.on' : ''), { onclick: () => { A.tab = id; A.id = null; ArtPage.mount(root); } }, l))),
        h('div.row', { style: { padding: '10px 10px 0' } }, btn('New', newAsset, { icon: 'plus', kind: 'sm primary' }), btn('Import', importFiles, { icon: 'upload', kind: 'sm' }), A.tab === 'sprite' ? btn('From Doom', importDoom, { icon: 'ghost', kind: 'sm', tip: 'Copy a Doom sprite to edit or recolour' }) : null), listEl),
      h('div.art-mid', barEl, stageWrap, framesEl),
      h('div.side.r', h('div.side-h', 'Colour & settings'), sideEl)));
    const ro = new ResizeObserver(() => { fit(); draw(); });
    ro.observe(stageWrap);
    const kd = e => onKey(e);
    window.addEventListener('keydown', kd);
    offs.push(() => ro.disconnect(), () => window.removeEventListener('keydown', kd), () => clearInterval(prevTimer));
    bindStage();
    renderAll(); loadFrame(true);
  },
  unmount() { offs.forEach(f => f()); offs = []; root = null; },
  refresh() {
    if (!root) return;
    renderList(); renderFrames();
    if (skipReload) { skipReload = false; return; }
    renderSide(); renderBar(); loadFrame();
  },
};

function renderAll() { renderList(); renderBar(); renderFrames(); renderSide(); }

// ---------------------------------------------------------------- library
function renderList() {
  clear(listEl);
  const items = list();
  if (!items.length) listEl.append(h('div.hint', { style: { padding: '10px 4px' } }, A.tab === 'sprite' ? 'Sprites are the pictures for monsters, items and weapons. Draw one, import PNGs or a sprite sheet, or borrow one from Doom.' : 'Textures cover walls, floors and ceilings. Draw one or import any picture.'));
  for (const a of items) {
    listEl.append(h('div.item' + (a.id === A.id ? '.on' : ''), { onclick: () => { A.id = a.id; A.frame = 0; renderAll(); loadFrame(true); }, oncontextmenu: e => { e.preventDefault(); itemMenu(e, a); } },
      h('div.thumb.checker', { style: { backgroundImage: `url("${urls(a)[0] || ''}")` } }), h('div.col.gap4.grow', { style: { gap: 0, minWidth: 0 } }, h('span.ellip', a.name), h('span.mute', { style: { fontSize: '11px' } }, `${a.w}×${a.h}${A.tab === 'sprite' ? ` · ${a.frames.length} frame${a.frames.length === 1 ? '' : 's'}` : ''}`)),
      h('div.acts', h('button.btn.ghost.icon.sm', { onclick: e => { e.stopPropagation(); itemMenu(e, a); } }, icon('more', 14)))));
  }
}
function itemMenu(e, a) {
  menu(e.clientX, e.clientY, [
    { label: 'Duplicate', icon: 'copy', onClick: () => { const c = JSON.parse(JSON.stringify(a)); c.id = newId(A.tab === 'sprite' ? 's' : 'x'); c.name = a.name + ' copy'; list().push(c); A.id = c.id; commit(); renderAll(); loadFrame(true); } },
    { label: 'Delete', icon: 'trash', danger: true, onClick: async () => { if (!await confirmBox(`Delete "${a.name}"?`, 'Things or rooms that use it will fall back to nothing. Undo with Ctrl+Z.')) return; const l = list(); l.splice(l.indexOf(a), 1); if (A.id === a.id) A.id = l[0] ? l[0].id : null; commit(); ArtPage.mount(root); } },
  ]);
}
function addAsset(name, w, hh, frames, extra = {}) {
  const a = A.tab === 'sprite' ? { id: newId('s'), name, w, h: hh, anchor: 'feet', frames, ...extra } : { id: newId('x'), name, w, h: hh, data: frames[0] };
  list().push(a); A.id = a.id; A.frame = 0;
  commit(); renderAll(); loadFrame(true);
  return a;
}
function newAsset() {
  const sprite = A.tab === 'sprite';
  const o = { name: sprite ? 'New sprite' : 'New texture', w: 64, h: 64, anchor: 'feet' };
  const sizes = sprite ? [[32, 32], [48, 48], [64, 64], [96, 96], [128, 128]] : [[32, 32], [64, 64], [64, 128], [128, 128], [256, 128]];
  const dims = h('div.fgrid');
  const drawDims = () => { clear(dims).append(field('Width', num(o.w, v => { o.w = v; }, { min: 4, max: 512 })), field('Height', num(o.h, v => { o.h = v; }, { min: 4, max: 512 }))); };
  drawDims();
  modal({ title: sprite ? 'New sprite' : 'New texture', body: [
    field('Name', text(o.name, v => { o.name = v; }, { live: v => { o.name = v; } })),
    sprite ? field('What is it for?', seg(o.anchor, [['feet', 'Stands on the floor'], ['center', 'Floats (projectile)'], ['hud', 'Weapon in hand']], v => { o.anchor = v; if (v === 'hud') { o.w = 128; o.h = 96; drawDims(); } })) : null,
    field('Size', h('div.row.wrap', sizes.map(([w, hh]) => h('button.btn.sm', { onclick: () => { o.w = w; o.h = hh; drawDims(); } }, `${w}×${hh}`)))), dims,
    h('div.hint', sprite ? 'One pixel is one map unit. A Doom imp is about 41×57, the player 56 tall.' : 'Classic Doom walls are 64 or 128 wide and up to 128 tall; floors are 64×64.')],
  buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Create', kind: 'primary', onClick: c => { addAsset(o.name || 'Untitled', clamp(o.w | 0, 4, 512), clamp(o.h | 0, 4, 512), [blankUrl(o.w, o.h)], sprite ? { anchor: o.anchor } : {}); c(); } }] });
}

// ---------------------------------------------------------------- import
function removeBackground(x, w, hh, tol) {
  const img = x.getImageData(0, 0, w, hh), d = img.data;
  const key = [d[0], d[1], d[2], d[3]];
  if (key[3] < 10) return;
  const seen = new Uint8Array(w * hh), stack = [0, w - 1, (hh - 1) * w, hh * w - 1];
  const near = i => Math.abs(d[i * 4] - key[0]) + Math.abs(d[i * 4 + 1] - key[1]) + Math.abs(d[i * 4 + 2] - key[2]) <= tol * 3 && d[i * 4 + 3] > 10;
  while (stack.length) {
    const i = stack.pop();
    if (i < 0 || i >= w * hh || seen[i] || !near(i)) continue;
    seen[i] = 1; d[i * 4 + 3] = 0;
    const px = i % w;
    if (px > 0) stack.push(i - 1); if (px < w - 1) stack.push(i + 1);
    stack.push(i - w, i + w);
  }
  x.putImageData(img, 0, 0);
}
async function importFiles() {
  const files = await pickFiles('image/*', true);
  if (!files.length) return;
  const imgs = [];
  for (const f of files) { try { imgs.push({ img: await loadImage(await fileToDataURL(f)), name: niceName(f.name) }); } catch { toast(`Could not read ${f.name}`, 'bad'); } }
  if (!imgs.length) return;
  const sprite = A.tab === 'sprite';
  const o = { max: sprite ? 128 : 128, cols: 1, rows: 1, bg: false, add: false };
  const cur = asset();
  modal({ title: `Import ${imgs.length} image${imgs.length > 1 ? 's' : ''}`, body: [
    h('div.row', h('div.thumb.lg.checker', { style: { width: '96px', height: '96px', backgroundImage: `url("${imgs[0].img.src}")` } }), h('div.hint', `${imgs[0].img.width}×${imgs[0].img.height} pixels. Big pictures are shrunk so they fit Doom's chunky scale.`)),
    field('Shrink to fit inside', select(o.max, [[32, '32 px (tiny)'], [64, '64 px (classic)'], [128, '128 px'], [256, '256 px (detailed)'], [512, '512 px (huge)']], v => { o.max = +v; })),
    sprite ? h('div.fgrid', field('Sprite sheet columns', num(1, v => { o.cols = v; }, { min: 1, max: 32 })), field('Sprite sheet rows', num(1, v => { o.rows = v; }, { min: 1, max: 32 }))) : null,
    sprite ? h('div.hint', 'A sprite sheet is one picture with several animation frames in a grid. Leave both at 1 for a single picture.') : null,
    field('Remove the background colour', toggle(false, v => { o.bg = v; }), { inline: true }),
    sprite && cur ? field(`Add as new frames of "${cur.name}"`, toggle(false, v => { o.add = v; }), { inline: true }) : null],
  buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Import', kind: 'primary', onClick: c => {
    const frames = []; let W = 0, H = 0;
    const cells = [];
    for (const { img } of imgs) { const cwid = img.width / o.cols, chei = img.height / o.rows; for (let r = 0; r < o.rows; r++) for (let q = 0; q < o.cols; q++) cells.push({ img, sx: q * cwid, sy: r * chei, sw: cwid, sh: chei }); }
    for (const cell of cells) { const sc = Math.min(1, o.max / Math.max(cell.sw, cell.sh)); cell.w = Math.max(1, Math.round(cell.sw * sc)); cell.h = Math.max(1, Math.round(cell.sh * sc)); W = Math.max(W, cell.w); H = Math.max(H, cell.h); }
    if (o.add && cur) { W = cur.w; H = cur.h; }
    const out = sprite ? [null] : cells; // textures: one asset per picture
    const render = (cell, w, hh) => { const [cv, x] = canvasOf(w, hh); x.imageSmoothingEnabled = cell.w < cell.sw; x.imageSmoothingQuality = 'high'; const dw = Math.min(cell.w, w), dh = Math.min(cell.h, hh); x.drawImage(cell.img, cell.sx, cell.sy, cell.sw, cell.sh, Math.round((w - dw) / 2), hh - dh, dw, dh); if (o.bg) removeBackground(x, w, hh, 40); return cv.toDataURL('image/png'); };
    if (sprite) {
      for (const cell of cells.slice(0, 26)) frames.push(render(cell, W, H));
      if (o.add && cur) { cur.frames.push(...frames); cur.frames.length = Math.min(cur.frames.length, 26); commit(); renderAll(); }
      else addAsset(imgs[0].name, W, H, frames);
    } else out.forEach((cell, i) => addAsset(imgs[i] ? imgs[i].name : 'Texture', cell.w, cell.h, [render(cell, cell.w, cell.h)]));
    c(); toast('Imported!', 'good');
  } }] });
}
async function importDoom() {
  if (!R.ok) return toast('No Doom WAD is loaded (see Settings).', 'warn');
  const items = iwadPrefixes().map(pf => { const l = iwadFrameLump(pf, 0) || [...R.sprites.keys()].find(n => n.startsWith(pf)); return { id: pf, label: pf, url: l ? `/api/iwad/sprite/${l}.png` : '' }; });
  const pf = await pickFromGrid('Copy a Doom sprite into your project', items);
  if (!pf) return;
  const n = Math.min(26, iwadFrameCount(pf)), loaded = [];
  for (let i = 0; i < n; i++) { const l = iwadFrameLump(pf, i); if (!l) continue; const m = R.sprites.get(l); try { loaded.push({ img: await loadImage(`/api/iwad/sprite/${l}.png`), ox: m[2], oy: m[3] }); } catch { /* frame missing */ } }
  if (!loaded.length) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of loaded) { x0 = Math.min(x0, -f.ox); y0 = Math.min(y0, -f.oy); x1 = Math.max(x1, f.img.width - f.ox); y1 = Math.max(y1, f.img.height - f.oy); }
  const W = x1 - x0, H = y1 - y0;
  const frames = loaded.map(f => { const [cv, x] = canvasOf(W, H); x.drawImage(f.img, -f.ox - x0, -f.oy - y0); return cv.toDataURL('image/png'); });
  addAsset(pf + ' copy', W, H, frames, { anchor: 'custom', ox: -x0, oy: -y0 });
  toast(`Copied ${frames.length} frames. Try the Recolour sliders on the right!`, 'good', 4500);
}

// ---------------------------------------------------------------- frame io
async function loadFrame(refit) {
  const a = asset();
  work = null; onionImg = null;
  if (!a) { draw(); return; }
  A.frame = clamp(A.frame, 0, urls(a).length - 1);
  const id = a.id, fr = A.frame;
  const [cv, x] = canvasOf(a.w, a.h);
  try { const img = await loadImage(urls(a)[fr]); if (asset() !== a && A.id !== id) return; x.drawImage(img, 0, 0); } catch { /* blank frame */ }
  if (A.id !== id || A.frame !== fr) return;
  work = cv; wctx = x;
  if (A.onion && fr > 0) { try { onionImg = await loadImage(urls(a)[fr - 1]); } catch { onionImg = null; } }
  if (refit) fit();
  draw();
}
function saveFrame() {
  const a = asset();
  if (!a || !work) return;
  const url = work.toDataURL('image/png');
  if (A.tab === 'sprite') a.frames[A.frame] = url; else a.data = url;
  skipReload = true; commit();
}
function fit() {
  const a = asset();
  if (!a || !stage.parentElement) return;
  const w = stage.parentElement.clientWidth, hh = stage.parentElement.clientHeight;
  A.zoom = clamp(Math.floor(Math.min(w / a.w, hh / a.h) * 0.82), 1, 40);
}

// ---------------------------------------------------------------- stage
function geom() {
  const a = asset(), dpr = window.devicePixelRatio || 1;
  const w = stage.parentElement.clientWidth, hh = stage.parentElement.clientHeight;
  if (stage.width !== Math.round(w * dpr) || stage.height !== Math.round(hh * dpr)) { stage.width = Math.round(w * dpr); stage.height = Math.round(hh * dpr); }
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const z = A.zoom;
  return { w, hh, z, x0: a ? Math.round((w - a.w * z) / 2) : 0, y0: a ? Math.round((hh - a.h * z) / 2) : 0 };
}
function draw() {
  if (!stage || !stage.parentElement) return;
  const a = asset(), g = geom();
  sctx.fillStyle = '#0a0c10'; sctx.fillRect(0, 0, g.w, g.hh);
  if (!a) { sctx.fillStyle = '#6c7489'; sctx.font = '600 14px system-ui'; sctx.textAlign = 'center'; sctx.fillText(A.tab === 'sprite' ? 'Create or import a sprite to start drawing' : 'Create or import a texture to start drawing', g.w / 2, g.hh / 2); return; }
  const W = a.w * g.z, H = a.h * g.z;
  sctx.imageSmoothingEnabled = false;
  if (A.tab === 'texture' && A.tile && work) { sctx.globalAlpha = 0.35; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (i || j) sctx.drawImage(work, g.x0 + i * W, g.y0 + j * H, W, H); sctx.globalAlpha = 1; }
  const cs = Math.max(4, g.z);
  for (let y = 0; y < H; y += cs) for (let x = 0; x < W; x += cs) { sctx.fillStyle = ((x / cs + y / cs) & 1) ? '#1f2431' : '#272d3d'; sctx.fillRect(g.x0 + x, g.y0 + y, Math.min(cs, W - x), Math.min(cs, H - y)); }
  if (onionImg && A.onion) { sctx.globalAlpha = 0.28; sctx.drawImage(onionImg, g.x0, g.y0, W, H); sctx.globalAlpha = 1; }
  if (work) sctx.drawImage(work, g.x0, g.y0, W, H);
  if (g.z >= 10) { sctx.strokeStyle = 'rgba(255,255,255,.06)'; sctx.lineWidth = 1; sctx.beginPath(); for (let x = 1; x < a.w; x++) { sctx.moveTo(g.x0 + x * g.z + 0.5, g.y0); sctx.lineTo(g.x0 + x * g.z + 0.5, g.y0 + H); } for (let y = 1; y < a.h; y++) { sctx.moveTo(g.x0, g.y0 + y * g.z + 0.5); sctx.lineTo(g.x0 + W, g.y0 + y * g.z + 0.5); } sctx.stroke(); }
  sctx.strokeStyle = '#4a5472'; sctx.lineWidth = 1; sctx.strokeRect(g.x0 - 0.5, g.y0 - 0.5, W + 1, H + 1);
  if (A.tab === 'sprite') { // anchor guide
    sctx.strokeStyle = 'rgba(255,90,54,.8)'; sctx.setLineDash([4, 4]); sctx.beginPath();
    if (a.anchor === 'feet' || a.anchor === 'hud') { sctx.moveTo(g.x0 - 14, g.y0 + H + 0.5); sctx.lineTo(g.x0 + W + 14, g.y0 + H + 0.5); }
    else if (a.anchor === 'center') { sctx.moveTo(g.x0 + W / 2, g.y0 - 10); sctx.lineTo(g.x0 + W / 2, g.y0 + H + 10); sctx.moveTo(g.x0 - 10, g.y0 + H / 2); sctx.lineTo(g.x0 + W + 10, g.y0 + H / 2); }
    else if (a.ox !== undefined) { sctx.moveTo(g.x0 + a.ox * g.z, g.y0 - 10); sctx.lineTo(g.x0 + a.ox * g.z, g.y0 + H + 10); sctx.moveTo(g.x0 - 10, g.y0 + a.oy * g.z); sctx.lineTo(g.x0 + W + 10, g.y0 + a.oy * g.z); }
    sctx.stroke(); sctx.setLineDash([]);
  }
}
function setPx(d, w, hh, x, y, c) { if (x < 0 || y < 0 || x >= w || y >= hh) return; const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3]; }
function stamp(d, w, hh, x, y, c) { const s = A.size, o = Math.floor((s - 1) / 2); for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) setPx(d, w, hh, x - o + i, y - o + j, c); }
function lineTo(d, w, hh, x0, y0, x1, y1, c) { const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy; for (;;) { stamp(d, w, hh, x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } }
function flood(d, w, hh, x, y, c, tol) {
  if (x < 0 || y < 0 || x >= w || y >= hh) return;
  const k = (y * w + x) * 4, key = [d[k], d[k + 1], d[k + 2], d[k + 3]];
  if (tol === 0 && key.every((v, i) => v === c[i])) return;
  const seen = new Uint8Array(w * hh), stack = [y * w + x];
  const match = i => (key[3] < 10 ? d[i * 4 + 3] < 10 : d[i * 4 + 3] >= 10 && Math.abs(d[i * 4] - key[0]) + Math.abs(d[i * 4 + 1] - key[1]) + Math.abs(d[i * 4 + 2] - key[2]) <= tol * 3);
  while (stack.length) {
    const i = stack.pop();
    if (i < 0 || i >= w * hh || seen[i] || !match(i)) continue;
    seen[i] = 1; d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = c[3];
    const px = i % w;
    if (px > 0) stack.push(i - 1); if (px < w - 1) stack.push(i + 1);
    stack.push(i - w, i + w);
  }
}
function bindStage() {
  const at = e => { const r = stage.getBoundingClientRect(), g = geom(); return [Math.floor((e.clientX - r.left - g.x0) / g.z), Math.floor((e.clientY - r.top - g.y0) / g.z)]; };
  stage.addEventListener('contextmenu', e => e.preventDefault());
  stage.addEventListener('wheel', e => { e.preventDefault(); A.zoom = clamp(A.zoom + (e.deltaY < 0 ? 1 : -1) * Math.max(1, Math.round(A.zoom / 6)), 1, 48); draw(); }, { passive: false });
  stage.addEventListener('pointerdown', e => {
    const a = asset();
    if (!a || !work) return;
    stage.setPointerCapture(e.pointerId);
    const [x, y] = at(e), img = wctx.getImageData(0, 0, a.w, a.h), d = img.data;
    const erase = e.button === 2 || A.tool === 'eraser', col = erase ? [0, 0, 0, 0] : A.color;
    if (A.tool === 'pick') { const i = (y * a.w + x) * 4; if (x >= 0 && y >= 0 && x < a.w && y < a.h && d[i + 3] > 0) { A.color = [d[i], d[i + 1], d[i + 2], 255]; renderSide(); } return; }
    if (A.tool === 'fill' || A.tool === 'wand') { flood(d, a.w, a.h, x, y, A.tool === 'wand' ? [0, 0, 0, 0] : col, A.tool === 'wand' ? A.tol : 0); wctx.putImageData(img, 0, 0); draw(); return saveFrame(); }
    drag = { x, y, sx: x, sy: y, col, img, base: new Uint8ClampedArray(d), tool: e.button === 2 ? 'pencil' : A.tool };
    if (drag.tool === 'pencil' || drag.tool === 'eraser') { stamp(d, a.w, a.h, x, y, col); wctx.putImageData(img, 0, 0); draw(); }
  });
  stage.addEventListener('pointermove', e => {
    const a = asset();
    if (!drag || !a) return;
    const [x, y] = at(e), d = drag.img.data;
    if (drag.tool === 'pencil' || drag.tool === 'eraser') { lineTo(d, a.w, a.h, drag.x, drag.y, x, y, drag.col); drag.x = x; drag.y = y; }
    else {
      d.set(drag.base);
      if (drag.tool === 'line') lineTo(d, a.w, a.h, drag.sx, drag.sy, x, y, drag.col);
      else if (drag.tool === 'rect') { const x0 = Math.min(drag.sx, x), x1 = Math.max(drag.sx, x), y0 = Math.min(drag.sy, y), y1 = Math.max(drag.sy, y); if (e.shiftKey) { for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) setPx(d, a.w, a.h, i, j, drag.col); } else { lineTo(d, a.w, a.h, x0, y0, x1, y0, drag.col); lineTo(d, a.w, a.h, x1, y0, x1, y1, drag.col); lineTo(d, a.w, a.h, x1, y1, x0, y1, drag.col); lineTo(d, a.w, a.h, x0, y1, x0, y0, drag.col); } }
      else if (drag.tool === 'move') { d.fill(0); const dx = x - drag.sx, dy = y - drag.sy; for (let j = 0; j < a.h; j++) for (let i = 0; i < a.w; i++) { const si = (j * a.w + i) * 4; if (!drag.base[si + 3]) continue; const nx = i + dx, ny = j + dy; if (nx < 0 || ny < 0 || nx >= a.w || ny >= a.h) continue; const di = (ny * a.w + nx) * 4; d[di] = drag.base[si]; d[di + 1] = drag.base[si + 1]; d[di + 2] = drag.base[si + 2]; d[di + 3] = drag.base[si + 3]; } }
    }
    wctx.putImageData(drag.img, 0, 0); draw();
  });
  stage.addEventListener('pointerup', () => { if (!drag) return; drag = null; saveFrame(); });
}
function onKey(e) {
  if (!root || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.ctrlKey || e.metaKey || document.querySelector('.modal-back')) return;
  const map = { b: 'pencil', e: 'eraser', f: 'fill', w: 'wand', i: 'pick', l: 'line', r: 'rect', m: 'move' };
  const k = e.key.toLowerCase();
  if (map[k]) { A.tool = map[k]; renderBar(); }
  else if (k === '[' || k === ',') { A.frame = Math.max(0, A.frame - 1); renderFrames(); loadFrame(); }
  else if (k === ']' || k === '.') { const a = asset(); if (a) { A.frame = Math.min(urls(a).length - 1, A.frame + 1); renderFrames(); loadFrame(); } }
}

// ---------------------------------------------------------------- toolbar / frames / side
async function transformAll(fn, allFrames) {
  const a = asset();
  if (!a) return;
  const idx = allFrames ? urls(a).map((_, i) => i) : [A.frame];
  for (const i of idx) {
    const [cv, x] = canvasOf(a.w, a.h);
    try { x.drawImage(await loadImage(urls(a)[i]), 0, 0); } catch { continue; }
    const out = fn(cv, x) || cv;
    const url = out.toDataURL('image/png');
    if (A.tab === 'sprite') a.frames[i] = url; else a.data = url;
  }
  commit(); loadFrame();
}
function renderBar() {
  clear(barEl);
  for (const [id, ic, tip] of TOOLS) barEl.append(h('div.tool' + (A.tool === id ? '.on' : ''), { 'data-tip': tip, onclick: () => { A.tool = id; renderBar(); } }, icon(ic, 18)));
  barEl.append(h('div.sep'), h('span.dim', 'Brush'), select(A.size, [[1, '1 px'], [2, '2 px'], [3, '3 px'], [4, '4 px'], [6, '6 px'], [8, '8 px']], v => { A.size = +v; }, { style: 'width:72px' }),
    h('div.sep'),
    iconBtn('flip', 'Flip left-right', () => transformAll((cv, x) => { const [o, ox] = canvasOf(cv.width, cv.height); ox.translate(cv.width, 0); ox.scale(-1, 1); ox.drawImage(cv, 0, 0); return o; }, false)),
    iconBtn('trash', 'Clear this frame', () => transformAll((cv, x) => { x.clearRect(0, 0, cv.width, cv.height); }, false)),
    h('div.grow'),
    A.tab === 'sprite' ? h('div.row.gap4', { 'data-tip': 'See the previous frame faintly' }, toggle(A.onion, v => { A.onion = v; loadFrame(); }), h('span.dim', 'Onion skin')) : h('div.row.gap4', toggle(A.tile, v => { A.tile = v; draw(); }), h('span.dim', 'Show tiling')),
    iconBtn('target', 'Zoom to fit', () => { fit(); draw(); }));
}
function renderFrames() {
  clear(framesEl);
  const a = asset();
  if (!a) return;
  if (A.tab === 'texture') { framesEl.append(h('div.hint', { html: `In levels this texture is called <b>${a.name}</b> (file name ${texLump(a)}). Pick it from "My textures" in any texture chooser.` })); return; }
  a.frames.forEach((f, i) => {
    framesEl.append(h('div.aframe.checker' + (i === A.frame ? '.on' : ''), { style: { backgroundImage: `url("${f}")` }, onclick: () => { A.frame = i; renderFrames(); loadFrame(); },
      oncontextmenu: e => { e.preventDefault(); menu(e.clientX, e.clientY, [
        { label: 'Duplicate frame', icon: 'copy', onClick: () => { a.frames.splice(i + 1, 0, f); A.frame = i + 1; commit(); loadFrame(); } },
        i > 0 && { label: 'Move left', icon: 'left', onClick: () => { a.frames.splice(i - 1, 0, a.frames.splice(i, 1)[0]); A.frame = i - 1; commit(); loadFrame(); } },
        i < a.frames.length - 1 && { label: 'Move right', icon: 'right', onClick: () => { a.frames.splice(i + 1, 0, a.frames.splice(i, 1)[0]); A.frame = i + 1; commit(); loadFrame(); } },
        a.frames.length > 1 && { label: 'Delete frame', icon: 'trash', danger: true, onClick: () => { a.frames.splice(i, 1); A.frame = Math.min(A.frame, a.frames.length - 1); commit(); loadFrame(); } },
      ]); } }, h('b', String.fromCharCode(65 + i))));
  });
  if (a.frames.length < 26) framesEl.append(
    h('div.aframe.add', { 'data-tip': 'Add a blank frame', 'data-tip-pos': 'up', onclick: () => { a.frames.push(blankUrl(a.w, a.h)); A.frame = a.frames.length - 1; commit(); loadFrame(); } }, icon('plus', 22)),
    h('div.aframe.add', { 'data-tip': 'Copy this frame', 'data-tip-pos': 'up', onclick: () => { a.frames.splice(A.frame + 1, 0, a.frames[A.frame]); A.frame++; commit(); loadFrame(); } }, icon('copy', 20)));
  const prev = h('div.aframe.checker', { style: { marginLeft: 'auto', borderColor: 'var(--line2)' }, title: 'Animation preview' });
  framesEl.append(prev);
  clearInterval(prevTimer);
  let i = 0;
  prevTimer = setInterval(() => { const cur = asset(); if (!cur || !prev.isConnected) return clearInterval(prevTimer); i = (i + 1) % cur.frames.length; prev.style.backgroundImage = `url("${cur.frames[i]}")`; }, 160);
}
function renderSide() {
  clear(sideEl);
  const a = asset();
  const pal = h('div.pal', PALETTE.map(c => h('i' + (hex(A.color) === c ? '.on' : ''), { style: { background: c }, onclick: () => { A.color = unhex(c); if (A.tool === 'eraser' || A.tool === 'wand' || A.tool === 'pick') { A.tool = 'pencil'; renderBar(); } renderSide(); } })));
  const ci = h('input', { type: 'color', value: hex(A.color), style: { width: '100%', height: '36px' } });
  ci.oninput = () => { A.color = unhex(ci.value); };
  ci.onchange = () => renderSide();
  sideEl.append(h('div.sect', h('h4', icon('pipette', 14), 'Colour'), ci, pal, h('div.hint', 'Right-click on the picture erases. Magic eraser removes a whole background colour.'),
    A.tool === 'wand' ? field('Magic eraser tolerance', slider(A.tol, 0, 120, 5, v => { A.tol = v; })) : null));
  if (!a) return;
  const adj = { hue: 0, sat: 0, lig: 0 };
  const apply = all => transformAll((cv, x) => {
    const img = x.getImageData(0, 0, cv.width, cv.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let hh = 0, s = 0, l = (mx + mn) / 2;
      if (mx !== mn) { const dd = mx - mn; s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn); hh = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; hh /= 6; }
      hh = (hh + adj.hue / 360 + 1) % 1; s = clamp(s * (1 + adj.sat / 100), 0, 1); l = clamp(l * (1 + adj.lig / 100), 0, 1);
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
      if (s === 0) r = g = b = l; else { r = f(hh + 1 / 3); g = f(hh); b = f(hh - 1 / 3); }
      d[i] = Math.round(r * 255); d[i + 1] = Math.round(g * 255); d[i + 2] = Math.round(b * 255);
    }
    x.putImageData(img, 0, 0);
  }, all);
  sideEl.append(h('div.sect', h('h4', icon('wand', 14), 'Recolour'),
    field('Hue shift', slider(0, -180, 180, 5, v => { adj.hue = v; }, { live: v => { adj.hue = v; } })),
    field('Saturation', slider(0, -100, 100, 5, v => { adj.sat = v; }, { live: v => { adj.sat = v; } })),
    field('Brightness', slider(0, -80, 80, 5, v => { adj.lig = v; }, { live: v => { adj.lig = v; } })),
    h('div.row', btn(A.tab === 'sprite' ? 'Apply to all frames' : 'Apply', () => apply(true), { kind: 'sm primary' }), A.tab === 'sprite' ? btn('This frame', () => apply(false), { kind: 'sm' }) : null),
    h('div.hint', 'Turn a brown Imp blue in two clicks: slide Hue, then Apply.')));
  const resize = (w, hh, scale) => {
    w = clamp(Math.round(w), 4, 512); hh = clamp(Math.round(hh), 4, 512);
    const ow = a.w, oh = a.h;
    transformAll((cv) => { const [o, ox] = canvasOf(w, hh); if (scale) ox.drawImage(cv, 0, 0, ow, oh, 0, 0, w, hh); else ox.drawImage(cv, Math.round((w - ow) / 2), hh - oh); return o; }, true).then(() => { fit(); draw(); renderList(); });
    if (a.ox !== undefined) { if (scale) { a.ox = Math.round(a.ox * w / ow); a.oy = Math.round(a.oy * hh / oh); } else { a.ox += Math.round((w - ow) / 2); a.oy += hh - oh; } }
    a.w = w; a.h = hh;
  };
  sideEl.append(h('div.sect', h('h4', icon('sliders', 14), A.tab === 'sprite' ? 'Sprite' : 'Texture'),
    field('Name', text(a.name, v => { a.name = v || a.name; skipReload = true; commit(); })),
    A.tab === 'sprite' ? field('Where is its anchor?', select(a.anchor || 'feet', [['feet', 'Bottom - stands on the floor'], ['center', 'Middle - floats / projectile'], ['hud', 'Weapon held on screen'], ...(a.ox !== undefined ? [['custom', 'Copied from Doom (exact)']] : [])], v => { a.anchor = v; skipReload = true; commit(); draw(); }), { hint: 'The dashed orange line shows where the floor (or centre) is.' }) : null,
    h('div.fgrid', field('Canvas width', num(a.w, v => resize(v, a.h, false), { min: 4, max: 512 })), field('Canvas height', num(a.h, v => resize(a.w, v, false), { min: 4, max: 512 }))),
    h('div.row', btn('Double size', () => resize(a.w * 2, a.h * 2, true), { kind: 'sm' }), btn('Half size', () => resize(a.w / 2, a.h / 2, true), { kind: 'sm' }))));
}
