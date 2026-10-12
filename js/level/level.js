// The level editor: draw rooms as shapes, drop things in, see it live in 3D.
import { h, icon, clear, clamp, snap } from '../core/dom.js';
import { S, commit, newId, on, byId, emit } from '../core/store.js';
import { R, texUrl, getImg, thingInfo, thingAvailable, musicOptions, texExists } from '../core/resources.js';
import { toast, menu, field, num, text, select, toggle, slider, seg, btn, iconBtn, texSwatch, promptBox, confirmBox } from '../core/widgets.js';
import { THINGS, THING_CATS, ROOM_KINDS, LOCKS } from '../data/doom.js';
import { buildMap, bbox, pointInPoly, rectPts, centroid } from './geom.js';
import { View3D } from './view3d.js';
import { openScripts } from '../blocks/editor.js';

const E = {
  levelId: null, tool: 'select', sel: [], view: { x: 256, y: 192, z: 0.8 }, grid: 32, snap: true, mode: 'split',
  placing: null, cat: 'monsters', drag: null, poly: null, mouse: [0, 0], edge: -1, brush: null, clip: null, map: null, angle: 90, space: false,
};
let root, cv, ctx, cw = 1, ch = 1, v3, pane2, pane3, hierEl, inspEl, assetsEl, barEl, hudEl, lvlSel, offs = [], skipInsp = false, raf3 = 0, rafDraw = 0;
const PREV_ENV = { tagOf: () => 1, tidOfThing: id => (id ? 1 : 0) };
const TOOLS = [
  ['select', 'cursor', 'Select & move', 'V'], ['room', 'square', 'Draw a room (drag)', 'R'], ['poly', 'poly', 'Draw a custom shape (click corners)', 'P'], null,
  ['door', 'door', 'Door', 'D'], ['stairs', 'stairs', 'Stairs', 'S'], ['lift', 'lift', 'Lift / elevator', 'L'], ['solid', 'block', 'Solid block / pillar', 'B'], ['exit', 'exit', 'Level exit pad', 'X'], ['teleport', 'teleport', 'Teleporter pad', 'T'],
];

export const L = () => (S.project ? byId(S.project.levels, E.levelId) || S.project.levels[0] || null : null);
const isSel = (k, id) => E.sel.some(s => s.k === k && s.id === id);
const selRooms = () => { const l = L(); return l ? E.sel.filter(s => s.k === 'room').map(s => byId(l.rooms, s.id)).filter(Boolean) : []; };
const selThings = () => { const l = L(); return l ? E.sel.filter(s => s.k === 'thing').map(s => byId(l.things, s.id)).filter(Boolean) : []; };
const W2S = (x, y) => [(x - E.view.x) * E.view.z + cw / 2, ch / 2 - (y - E.view.y) * E.view.z];
const S2W = (sx, sy) => [(sx - cw / 2) / E.view.z + E.view.x, (ch / 2 - sy) / E.view.z + E.view.y];
const sn = (v, alt) => (E.snap && !alt ? snap(v, E.grid) : Math.round(v));
const firstTex = (...names) => names.find(texExists) || names[names.length - 1];

export function openLevel(id) { if (E.levelId !== id) { E.cam = null; E.viewSet = false; } E.levelId = id; E.sel = []; emit('nav', 'levels'); }

export function newLevel(name) {
  const p = S.project;
  const lvl = {
    id: newId('l'), name: name || 'Level ' + (p.levels.length + 1), sky: 'SKY1', music: R.music[p.levels.length % Math.max(1, R.music.length)] || '',
    rooms: [], things: [], scripts: [],
  };
  lvl.rooms.push(makeRoom('room', rectPts(0, 0, 512, 384), true, lvl));
  lvl.things.push({ id: newId('t'), type: 'Player1Start', x: 256, y: 96, angle: 90 });
  p.levels.push(lvl);
  return lvl;
}

function makeRoom(kind, pts, rect, lvl = L()) {
  const b = E.brush || {};
  const n = lvl.rooms.filter(r => r.kind === kind).length + 1;
  const room = {
    id: newId('r'), name: ROOM_KINDS[kind].name + ' ' + n, kind, pts, rect: !!rect,
    floor: b.floor ?? 0, ceil: b.ceil ?? 128, light: b.light ?? 192, sky: !!b.sky,
    floorTex: b.floorTex || firstTex('FLOOR4_8', 'FLOOR0_1'), ceilTex: b.ceilTex || firstTex('CEIL3_5', 'CEIL1_1'), wallTex: b.wallTex || firstTex('STARTAN3', 'BROWN1'),
  };
  if (kind === 'door') Object.assign(room, { wallTex: firstTex('BIGDOOR2', 'DOOR1'), ceilTex: firstTex('FLAT20', 'CEIL3_5'), trackTex: firstTex('DOORTRAK', 'METAL'), lock: 0, sky: false });
  if (kind === 'stairs') { const bb = bbox(pts); Object.assign(room, { steps: 8, rise: 8, dir: bb[2] - bb[0] >= bb[3] - bb[1] ? 0 : 1, wallTex: firstTex('STEP1', 'STEP4', room.wallTex), rect: true }); }
  if (kind === 'lift') Object.assign(room, { floor: room.floor + 64, wallTex: firstTex('SUPPORT2', 'METAL', room.wallTex), floorTex: firstTex('FLAT20', room.floorTex) });
  if (kind === 'exit') Object.assign(room, { floorTex: firstTex('GATE1', 'FLAT22', room.floorTex), light: 255 });
  if (kind === 'teleport') Object.assign(room, { floorTex: firstTex('GATE4', 'GATE3', room.floorTex), light: 255, dest: '' });
  return room;
}

// ================================================================ page
function teardown() {
  offs.forEach(f => f()); offs = [];
  if (v3) { v3.dispose(); v3 = null; }
  cancelAnimationFrame(raf3); cancelAnimationFrame(rafDraw); raf3 = rafDraw = 0;
  cv = null;
}
export const LevelPage = {
  id: 'levels', title: 'Levels', icon: 'map',
  mount(el) {
    teardown();
    root = el;
    if (!S.project.levels.length) return renderEmpty();
    E.levelId = L().id;
    build();
  },
  unmount() { teardown(); },
  refresh() {
    if (!root) return;
    if (!S.project.levels.length) { teardown(); return renderEmpty(); }
    if (!cv) return this.mount(root);
    if (!byId(S.project.levels, E.levelId)) return this.mount(root);
    E.sel = E.sel.filter(s => byId(s.k === 'room' ? L().rooms : L().things, s.id));
    renderLevelSel(); renderHier();
    if (!skipInsp) renderInsp();
    skipInsp = false;
    renderAssets(); mark3d(); redraw();
  },
};

function renderEmpty() {
  cv = null;
  clear(root).append(h('div.empty',
    h('div.big', icon('map', 30)), h('h2', 'Build your first level'),
    h('p', 'Drag out rooms, connect them with corridors and doors, then drop in monsters and items. Watch it appear in 3D as you draw.'),
    btn('Create a level', () => { const l = newLevel(); E.levelId = l.id; commit(); LevelPage.mount(root); }, { kind: 'primary big', icon: 'plus' })));
}

function build() {
  clear(root);
  hierEl = h('div.side-b', { style: { padding: '4px 8px 20px' } });
  inspEl = h('div.side-b', { style: { padding: 0 } });
  lvlSel = h('div.lvl-pick');
  barEl = h('div.lv-bar');
  assetsEl = h('div.lv-assets');
  cv = h('canvas', { tabindex: 0 });
  hudEl = h('div.hud');
  pane2 = h('div.pane', cv, h('div.tag', 'Top view'), hudEl);
  const c3 = h('canvas');
  pane3 = h('div.pane', c3, h('div.tag', '3D preview'), h('div.hint3d', { html: 'Drag to look &nbsp;·&nbsp; <b>W A S D</b> fly &nbsp;·&nbsp; <b>Q / E</b> down / up &nbsp;·&nbsp; click to select' }));
  root.append(h('div.lv',
    h('div.side.l', lvlSel, h('div.side-h', 'Outline'), hierEl),
    h('div.lv-mid', barEl, h('div.lv-view', pane2, pane3), assetsEl),
    h('div.side.r', h('div.side-h', 'Properties'), inspEl)));
  ctx = cv.getContext('2d');
  v3 = new View3D(c3, hit => {
    if (!hit) return setSel([]);
    setSel([hit.thing ? { k: 'thing', id: hit.thing } : { k: 'room', id: hit.room }]);
  });
  v3.onMove = () => redraw();
  const ro = new ResizeObserver(() => { resize(); redraw(); if (v3) v3.invalidate(); });
  ro.observe(pane2); ro.observe(pane3);
  offs.push(() => ro.disconnect());
  offs.push(on('img', () => { redraw(); if (v3) v3.invalidate(); renderAssetsImgs(); }));
  bindCanvas();
  const kd = e => onKey(e), ku = e => { if (e.code === 'Space') E.space = false; };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  offs.push(() => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); });
  applyMode(); renderLevelSel(); renderBar(); renderHier(); renderInsp(); renderAssets(); resize();
  mark3d(true);
  if (E.cam) v3.cam = E.cam;
  setTimeout(() => { if (!cv) return; if (!E.viewSet) { fitView(); E.viewSet = true; } if (!E.cam) v3.frameAll(); E.cam = v3.cam; }, 30);
}

function applyMode() {
  pane2.classList.toggle('hidden', E.mode === '3d');
  pane3.classList.toggle('hidden', E.mode === '2d');
  requestAnimationFrame(() => { resize(); redraw(); mark3d(); });
}
function resize() {
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  cw = pane2.clientWidth || 1; ch = pane2.clientHeight || 1;
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function fitView() {
  const l = L();
  if (!l || !l.rooms.length || !cv) return;
  const b = bbox(l.rooms.flatMap(r => r.pts));
  E.view.x = (b[0] + b[2]) / 2; E.view.y = (b[1] + b[3]) / 2;
  E.view.z = clamp(Math.min(cw / (b[2] - b[0] + 200), ch / (b[3] - b[1] + 200)), 0.05, 3);
  redraw();
}

// ---------------------------------------------------------------- 3D sync
function mark3d(now) {
  if (raf3 && !now) return;
  const run = () => {
    raf3 = 0;
    const l = L();
    if (!l || !cv) return;
    E.map = buildMap(l, PREV_ENV);
    if (v3 && E.mode !== '2d') {
      v3.setScene(E.map, l.things.map(t => { const i = thingInfo(t.type); return i ? { id: t.id, x: t.x, y: t.y, url: i.url, scale: i.scale, sel: isSel('thing', t.id), hang: i.custom && i.custom.p.hang } : null; }).filter(Boolean),
        new Set(selRooms().map(r => r.id)));
    }
    redraw();
  };
  if (now) run(); else raf3 = requestAnimationFrame(run);
}

// ---------------------------------------------------------------- selection & edits
function setSel(list) {
  E.sel = list; E.edge = -1;
  const r = selRooms()[0];
  if (r && r.kind === 'room') E.brush = { floor: r.floor, ceil: r.ceil, light: r.light, sky: r.sky, floorTex: r.floorTex, ceilTex: r.ceilTex, wallTex: r.wallTex };
  renderHier(); renderInsp(); mark3d(); redraw();
}
const done = rerender => { skipInsp = !rerender; commit(); };

function deleteSel() {
  const l = L();
  if (!E.sel.length) return;
  const ids = new Set(E.sel.map(s => s.id));
  l.rooms = l.rooms.filter(r => !ids.has(r.id));
  l.things = l.things.filter(t => !ids.has(t.id));
  E.sel = []; commit();
}
function cloneSel(dx, dy) {
  const l = L(), out = [];
  for (const r of selRooms()) { const c = JSON.parse(JSON.stringify(r)); c.id = newId('r'); c.name = r.name + ' copy'; c.pts = c.pts.map(p => [p[0] + dx, p[1] + dy]); l.rooms.push(c); out.push({ k: 'room', id: c.id }); }
  for (const t of selThings()) { const c = { ...t, id: newId('t'), x: t.x + dx, y: t.y + dy }; l.things.push(c); out.push({ k: 'thing', id: c.id }); }
  if (out.length) { E.sel = out; commit(); }
}
function reorder(dir) {
  const l = L();
  for (const r of selRooms()) {
    const i = l.rooms.indexOf(r), j = dir === 'top' ? l.rooms.length - 1 : dir === 'bottom' ? 0 : clamp(i + dir, 0, l.rooms.length - 1);
    l.rooms.splice(i, 1); l.rooms.splice(j, 0, r);
  }
  commit();
}
function placeThing(type, x, y) {
  const l = L(), info = thingInfo(type);
  if (!info) return;
  const t = { id: newId('t'), type, x: E.snap ? snap(x, 8) : Math.round(x), y: E.snap ? snap(y, 8) : Math.round(y), angle: E.angle };
  if (info.named) t.name = info.name + ' ' + (l.things.filter(q => q.type === type).length + 1);
  if (type === 'Player1Start') l.things = l.things.filter(q => q.type !== 'Player1Start');
  l.things.push(t);
  E.sel = [{ k: 'thing', id: t.id }];
  commit();
  return t;
}

// ---------------------------------------------------------------- picking
function pickAt(wx, wy) {
  const l = L();
  for (let i = l.things.length - 1; i >= 0; i--) {
    const t = l.things[i], info = thingInfo(t.type);
    if (Math.hypot(t.x - wx, t.y - wy) <= Math.max(info ? info.r : 16, 9 / E.view.z)) return { k: 'thing', id: t.id };
  }
  for (let i = l.rooms.length - 1; i >= 0; i--) if (pointInPoly(wx, wy, l.rooms[i].pts)) return { k: 'room', id: l.rooms[i].id };
  return null;
}
function handlesOf(room) {
  const hs = [];
  if (room.rect || room.kind === 'stairs') {
    const [x0, y0, x1, y1] = bbox(room.pts), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    for (const [hx, hy] of [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]) hs.push({ t: 'rect', hx, hy, x: hx < 0 ? x0 : hx > 0 ? x1 : mx, y: hy < 0 ? y0 : hy > 0 ? y1 : my });
  } else {
    room.pts.forEach((p, i) => {
      const q = room.pts[(i + 1) % room.pts.length];
      hs.push({ t: 'vertex', i, x: p[0], y: p[1] }, { t: 'mid', i, x: (p[0] + q[0]) / 2, y: (p[1] + q[1]) / 2 });
    });
  }
  return hs;
}
function hitHandle(sx, sy) {
  if (E.sel.length !== 1) return null;
  const r = selRooms()[0];
  if (r) {
    let best = null, bd = 9;
    for (const hd of handlesOf(r)) { const [x, y] = W2S(hd.x, hd.y), d = Math.hypot(x - sx, y - sy) + (hd.t === 'mid' ? 2 : 0); if (d < bd) { bd = d; best = hd; } }
    return best ? { ...best, room: r } : null;
  }
  const t = selThings()[0], info = t && thingInfo(t.type);
  if (t && info && info.dir) {
    const a = (t.angle || 0) * Math.PI / 180, rr = Math.max(info.r, 14 / E.view.z) + 14 / E.view.z;
    const [x, y] = W2S(t.x + Math.cos(a) * rr, t.y + Math.sin(a) * rr);
    if (Math.hypot(x - sx, y - sy) < 9) return { t: 'rot', thing: t };
  }
  return null;
}
function hitEdge(room, sx, sy) {
  let best = -1, bd = 6;
  room.pts.forEach((p, i) => {
    const q = room.pts[(i + 1) % room.pts.length];
    const [ax, ay] = W2S(p[0], p[1]), [bx, by] = W2S(q[0], q[1]);
    const dx = bx - ax, dy = by - ay, t = clamp(((sx - ax) * dx + (sy - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    const d = Math.hypot(ax + dx * t - sx, ay + dy * t - sy);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

// ---------------------------------------------------------------- canvas input
function bindCanvas() {
  const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const [sx, sy] = pos(e), [wx, wy] = S2W(sx, sy);
    E.view.z = clamp(E.view.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.04, 8);
    const [nx, ny] = S2W(sx, sy);
    E.view.x += wx - nx; E.view.y += wy - ny;
    redraw();
  }, { passive: false });

  cv.addEventListener('pointerdown', e => {
    cv.focus(); cv.setPointerCapture(e.pointerId);
    const [sx, sy] = pos(e), [wx, wy] = S2W(sx, sy), l = L();
    if (e.button === 1 || e.button === 2 || E.space) { E.drag = { t: 'pan', sx, sy, vx: E.view.x, vy: E.view.y, moved: 0, btn: e.button, wx, wy }; return; }
    if (e.button !== 0) return;
    if (E.placing) { placeThing(E.placing, wx, wy); return; }
    if (E.tool === 'poly') {
      const p = [sn(wx, e.altKey), sn(wy, e.altKey)];
      if (!E.poly) E.poly = [];
      if (E.poly.length >= 3) { const [fx, fy] = W2S(E.poly[0][0], E.poly[0][1]); if (Math.hypot(fx - sx, fy - sy) < 12) return finishPoly(); }
      const last = E.poly[E.poly.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) E.poly.push(p);
      return redraw();
    }
    if (E.tool !== 'select') { const x = sn(wx, e.altKey), y = sn(wy, e.altKey); E.drag = { t: 'draw', kind: E.tool, x0: x, y0: y, x1: x, y1: y, keep: e.shiftKey }; return; }

    const hd = hitHandle(sx, sy);
    if (hd) {
      if (hd.t === 'rot') { E.drag = { t: 'rot', thing: hd.thing }; return; }
      if (hd.t === 'vertex' && e.altKey && hd.room.pts.length > 3) { hd.room.pts.splice(hd.i, 1); return commit(); }
      if (hd.t === 'mid') { hd.room.pts.splice(hd.i + 1, 0, [sn(wx, e.altKey), sn(wy, e.altKey)]); hd.room.rect = false; E.drag = { t: 'vertex', room: hd.room, i: hd.i + 1 }; return redraw(); }
      if (hd.t === 'vertex') { E.drag = { t: 'vertex', room: hd.room, i: hd.i }; return; }
      E.drag = { t: 'rect', room: hd.room, hx: hd.hx, hy: hd.hy, bb: bbox(hd.room.pts) }; return;
    }
    const hit = pickAt(wx, wy);
    if (hit) {
      if (e.shiftKey) { setSel(isSel(hit.k, hit.id) ? E.sel.filter(s => s.id !== hit.id) : [...E.sel, hit]); return; }
      const was = isSel(hit.k, hit.id);
      if (!was) setSel([hit]);
      const orig = new Map();
      for (const r of selRooms()) orig.set(r.id, r.pts.map(p => [...p]));
      for (const t of selThings()) orig.set(t.id, [t.x, t.y]);
      E.drag = { t: 'move', wx, wy, orig, moved: false, was, sx, sy, alt: e.ctrlKey };
      return;
    }
    if (!e.shiftKey) setSel([]);
    E.drag = { t: 'marquee', x0: wx, y0: wy, x1: wx, y1: wy };
  });

  cv.addEventListener('pointermove', e => {
    const [sx, sy] = pos(e), [wx, wy] = S2W(sx, sy), d = E.drag;
    E.mouse = [wx, wy];
    if (!d) { cv.style.cursor = E.space ? 'grab' : E.placing || E.tool !== 'select' ? 'crosshair' : hitHandle(sx, sy) ? 'pointer' : 'default'; return redraw(); }
    if (d.t === 'pan') { d.moved += Math.abs(sx - d.sx) + Math.abs(sy - d.sy); E.view.x = d.vx - (sx - d.sx) / E.view.z; E.view.y = d.vy + (sy - d.sy) / E.view.z; d.vx = E.view.x; d.vy = E.view.y; d.sx = sx; d.sy = sy; cv.style.cursor = 'grabbing'; }
    else if (d.t === 'draw') { d.x1 = sn(wx, e.altKey); d.y1 = sn(wy, e.altKey); }
    else if (d.t === 'marquee') { d.x1 = wx; d.y1 = wy; }
    else if (d.t === 'move') {
      const dx = sn(wx - d.wx, e.altKey), dy = sn(wy - d.wy, e.altKey);
      if (dx || dy) d.moved = true;
      for (const r of selRooms()) r.pts = d.orig.get(r.id).map(p => [p[0] + dx, p[1] + dy]);
      for (const t of selThings()) { const o = d.orig.get(t.id); t.x = o[0] + (E.snap && !e.altKey ? snap(wx - d.wx, 8) : Math.round(wx - d.wx)); t.y = o[1] + (E.snap && !e.altKey ? snap(wy - d.wy, 8) : Math.round(wy - d.wy)); if (t.x !== o[0] || t.y !== o[1]) d.moved = true; }
      mark3d();
    } else if (d.t === 'vertex') { d.room.pts[d.i] = [sn(wx, e.altKey), sn(wy, e.altKey)]; d.room.rect = false; mark3d(); }
    else if (d.t === 'rect') {
      let [x0, y0, x1, y1] = d.bb;
      const mx = sn(wx, e.altKey), my = sn(wy, e.altKey), min = E.snap ? Math.min(E.grid, 16) : 4;
      if (d.hx < 0) x0 = Math.min(mx, x1 - min); if (d.hx > 0) x1 = Math.max(mx, x0 + min);
      if (d.hy < 0) y0 = Math.min(my, y1 - min); if (d.hy > 0) y1 = Math.max(my, y0 + min);
      d.room.pts = rectPts(x0, y0, x1, y1); mark3d();
    } else if (d.t === 'rot') {
      let a = Math.atan2(wy - d.thing.y, wx - d.thing.x) * 180 / Math.PI;
      a = ((e.altKey ? Math.round(a) : snap(a, 45)) + 360) % 360;
      d.thing.angle = a; E.angle = a; mark3d();
    }
    redraw();
  });

  cv.addEventListener('pointerup', e => {
    const d = E.drag; E.drag = null;
    const [sx, sy] = pos(e), [wx, wy] = S2W(sx, sy);
    if (!d) return;
    if (d.t === 'pan') { cv.style.cursor = 'default'; if (d.moved < 4 && d.btn === 2) contextMenu(e.clientX, e.clientY, wx, wy); return; }
    if (d.t === 'draw') {
      const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
      if (x1 - x0 >= 8 && y1 - y0 >= 8) {
        const room = makeRoom(d.kind, rectPts(x0, y0, x1, y1), true);
        L().rooms.push(room);
        E.sel = [{ k: 'room', id: room.id }];
        if (!d.keep) { E.tool = 'select'; renderBar(); }
        commit();
        if (d.kind === 'teleport') toast('Teleporter placed. Now drop a "Teleport Exit" marker where it should lead, then pick it in Properties.', 'plain', 5000);
      }
      return redraw();
    }
    if (d.t === 'marquee') {
      const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1), l = L();
      if (x1 - x0 > 3 / E.view.z || y1 - y0 > 3 / E.view.z) {
        const list = [...E.sel];
        for (const r of l.rooms) { const b = bbox(r.pts); if (b[0] >= x0 && b[2] <= x1 && b[1] >= y0 && b[3] <= y1 && !isSel('room', r.id)) list.push({ k: 'room', id: r.id }); }
        for (const t of l.things) if (t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1 && !isSel('thing', t.id)) list.push({ k: 'thing', id: t.id });
        setSel(list);
      }
      return redraw();
    }
    if (d.t === 'move') {
      if (d.moved) return commit();
      const r = selRooms()[0];
      if (d.was && E.sel.length === 1 && r && r.kind !== 'stairs') { const ei = hitEdge(r, sx, sy); E.edge = ei === E.edge ? -1 : ei; renderInsp(); }
      return redraw();
    }
    commit();
  });
  cv.addEventListener('dblclick', () => { if (E.tool === 'poly') finishPoly(); });
}

function finishPoly() {
  const pts = E.poly; E.poly = null;
  if (!pts || pts.length < 3) return redraw();
  const room = makeRoom('room', pts, false);
  L().rooms.push(room);
  E.sel = [{ k: 'room', id: room.id }]; E.tool = 'select'; renderBar();
  commit();
}

function contextMenu(cx, cy, wx, wy) {
  const hit = pickAt(wx, wy);
  if (hit && !isSel(hit.k, hit.id)) setSel([hit]);
  const has = E.sel.length > 0;
  menu(cx, cy, [
    has && { label: 'Duplicate', icon: 'copy', key: 'Ctrl+D', onClick: () => cloneSel(E.grid, -E.grid) },
    has && { label: 'Copy', icon: 'copy', key: 'Ctrl+C', onClick: copySel },
    E.clip && { label: 'Paste here', icon: 'download', key: 'Ctrl+V', onClick: () => pasteAt(wx, wy) },
    selRooms().length && '-',
    selRooms().length && { label: 'Bring to front', icon: 'up', key: 'PgUp', onClick: () => reorder('top') },
    selRooms().length && { label: 'Send to back', icon: 'dn', key: 'PgDn', onClick: () => reorder('bottom') },
    '-',
    { label: 'Put Player Start here', icon: 'user', onClick: () => placeThing('Player1Start', wx, wy) },
    { label: 'Move 3D camera here', icon: 'eye', onClick: () => { if (v3) { const s = E.map && E.map.sectorAt(wx, wy); v3.cam.x = wx; v3.cam.y = wy; v3.cam.z = (s ? s.floor : 0) + 48; v3.cam.pitch = 0; v3.invalidate(); } } },
    has && '-',
    has && { label: 'Delete', icon: 'trash', key: 'Del', danger: true, onClick: deleteSel },
  ]);
}
function copySel() { E.clip = { rooms: JSON.parse(JSON.stringify(selRooms())), things: JSON.parse(JSON.stringify(selThings())) }; toast('Copied', 'plain', 1200); }
function pasteAt(wx, wy) {
  if (!E.clip) return;
  const l = L(), all = [...E.clip.rooms.flatMap(r => r.pts), ...E.clip.things.map(t => [t.x, t.y])];
  if (!all.length) return;
  const b = bbox(all), dx = sn(wx - (b[0] + b[2]) / 2), dy = sn(wy - (b[1] + b[3]) / 2), out = [];
  for (const r of E.clip.rooms) { const c = JSON.parse(JSON.stringify(r)); c.id = newId('r'); c.pts = c.pts.map(p => [p[0] + dx, p[1] + dy]); l.rooms.push(c); out.push({ k: 'room', id: c.id }); }
  for (const t of E.clip.things) { const c = { ...t, id: newId('t'), x: t.x + dx, y: t.y + dy }; l.things.push(c); out.push({ k: 'thing', id: c.id }); }
  E.sel = out; commit();
}

function onKey(e) {
  if (!cv || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || document.querySelector('.modal-back')) return;
  if (v3 && v3.hover && !e.ctrlKey) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space') { E.space = true; e.preventDefault(); return; }
  if (e.ctrlKey || e.metaKey) {
    if (k === 'd') { e.preventDefault(); cloneSel(E.grid, -E.grid); }
    else if (k === 'c') copySel();
    else if (k === 'v') pasteAt(E.mouse[0], E.mouse[1]);
    else if (k === 'a') { e.preventDefault(); const l = L(); setSel([...l.rooms.map(r => ({ k: 'room', id: r.id })), ...l.things.map(t => ({ k: 'thing', id: t.id }))]); }
    return;
  }
  const toolKey = TOOLS.find(t => t && t[3].toLowerCase() === k);
  if (toolKey) { setTool(toolKey[0]); return; }
  if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSel(); }
  else if (k === 'escape') { if (E.placing || E.poly || E.tool !== 'select') { E.placing = null; E.poly = null; setTool('select'); renderAssets(); } else setSel([]); }
  else if (k === 'enter') finishPoly();
  else if (k === 'g') { E.snap = !E.snap; renderBar(); redraw(); }
  else if (k === '[') { E.grid = Math.max(8, E.grid / 2); renderBar(); redraw(); }
  else if (k === ']') { E.grid = Math.min(256, E.grid * 2); renderBar(); redraw(); }
  else if (k === 'f') { fitView(); if (v3) v3.frameAll(); }
  else if (k === 'tab') { e.preventDefault(); E.mode = { '2d': 'split', split: '3d', '3d': '2d' }[E.mode]; renderBar(); applyMode(); }
  else if (k === 'pageup') { e.preventDefault(); reorder(1); }
  else if (k === 'pagedown') { e.preventDefault(); reorder(-1); }
  else if (k === 'q' || k === 'e') { const ts = selThings(); if (ts.length) { ts.forEach(t => { t.angle = ((t.angle || 0) + (k === 'q' ? 45 : -45) + 360) % 360; E.angle = t.angle; }); commit(); } }
  else if (k.startsWith('arrow') && E.sel.length) {
    e.preventDefault();
    const dx = k === 'arrowleft' ? -E.grid : k === 'arrowright' ? E.grid : 0, dy = k === 'arrowup' ? E.grid : k === 'arrowdown' ? -E.grid : 0;
    for (const r of selRooms()) r.pts = r.pts.map(p => [p[0] + dx, p[1] + dy]);
    for (const t of selThings()) { t.x += dx; t.y += dy; }
    commit();
  }
}
function setTool(t) { E.tool = t; E.placing = null; E.poly = null; renderBar(); renderAssets(); redraw(); }

// ---------------------------------------------------------------- 2D drawing
const pats = new WeakMap();
function redraw() { if (!rafDraw) rafDraw = requestAnimationFrame(() => { rafDraw = 0; draw(); }); }
function pathOf(pts) { ctx.beginPath(); pts.forEach((p, i) => { const [x, y] = W2S(p[0], p[1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); }

function draw() {
  const l = L();
  if (!cv || !l || E.mode === '3d') return;
  const z = E.view.z;
  ctx.fillStyle = '#0a0c10'; ctx.fillRect(0, 0, cw, ch);
  // grid
  let g = E.grid; while (g * z < 9) g *= 2;
  const [wx0, wy1] = S2W(0, 0), [wx1, wy0] = S2W(cw, ch);
  ctx.lineWidth = 1;
  for (let x = Math.floor(wx0 / g) * g; x <= wx1; x += g) { const sx = Math.round(W2S(x, 0)[0]) + 0.5; ctx.strokeStyle = x === 0 ? '#3a4460' : x % (g * 4) === 0 ? '#1d2230' : '#141822'; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, ch); ctx.stroke(); }
  for (let y = Math.floor(wy0 / g) * g; y <= wy1; y += g) { const sy = Math.round(W2S(0, y)[1]) + 0.5; ctx.strokeStyle = y === 0 ? '#3a4460' : y % (g * 4) === 0 ? '#1d2230' : '#141822'; ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(cw, sy); ctx.stroke(); }

  // rooms, painted bottom to top exactly like the map is built
  const [ox, oy] = W2S(0, 0);
  for (const r of l.rooms) {
    pathOf(r.pts);
    const kind = ROOM_KINDS[r.kind] || ROOM_KINDS.room;
    if (r.kind === 'solid') { ctx.fillStyle = '#0a0c10'; ctx.fill(); ctx.save(); ctx.clip(); ctx.strokeStyle = '#2a3042'; ctx.beginPath(); const b = bbox(r.pts), [ax, ay] = W2S(b[0], b[3]), [bx, by] = W2S(b[2], b[1]); for (let d = -(by - ay); d < bx - ax; d += 9) { ctx.moveTo(ax + d, ay); ctx.lineTo(ax + d + (by - ay), by); } ctx.stroke(); ctx.restore(); continue; }
    const img = getImg(texUrl(r.floorTex));
    if (img) {
      let p = pats.get(img); if (!p) { p = ctx.createPattern(img, 'repeat'); pats.set(img, p); }
      p.setTransform(new DOMMatrix([z, 0, 0, z, ox, oy]));
      ctx.fillStyle = p;
    } else ctx.fillStyle = '#2b3040';
    ctx.fill();
    ctx.fillStyle = `rgba(6,8,12,${clamp(0.86 - (r.light ?? 192) / 255 * 0.86, 0, 0.8)})`; ctx.fill();
    if (r.kind !== 'room') { ctx.fillStyle = kind.color + '55'; ctx.fill(); }
    if (r.damage > 0) { ctx.fillStyle = 'rgba(120,255,60,.13)'; ctx.fill(); }
    if (r.kind === 'stairs') drawStairs(r);
  }
  // real walls from the generated map
  if (E.map) {
    const V = E.map.vertices;
    for (const pass of [0, 1]) {
      ctx.beginPath();
      for (const ln of E.map.lines) {
        if ((ln.back < 0) !== !!pass) continue;
        const [ax, ay] = W2S(V[ln.v1][0], V[ln.v1][1]), [bx, by] = W2S(V[ln.v2][0], V[ln.v2][1]);
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      }
      ctx.strokeStyle = pass ? '#e6e9f2' : 'rgba(230,233,242,.28)'; ctx.lineWidth = pass ? 2 : 1; ctx.stroke();
    }
  }
  // labels
  if (z > 0.3) {
    ctx.font = '600 11px "Segoe UI", system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const r of l.rooms) {
      const b = bbox(r.pts); if ((b[2] - b[0]) * z < 60) continue;
      const c = centroid(r.pts), [x, y] = W2S(c[0], c[1]), kind = ROOM_KINDS[r.kind] || ROOM_KINDS.room;
      const label = r.name + (r.kind === 'door' && r.lock ? ' 🔒' : '');
      ctx.fillStyle = 'rgba(8,10,14,.6)'; const tw = ctx.measureText(label).width; ctx.fillRect(x - tw / 2 - 5, y - 8, tw + 10, 16);
      ctx.fillStyle = r.kind === 'room' ? '#aab3c8' : kind.color; ctx.fillText(label, x, y);
    }
  }
  // selection outlines + handles
  const rs = selRooms();
  for (const r of rs) { pathOf(r.pts); ctx.strokeStyle = '#ff5a36'; ctx.lineWidth = 2; ctx.setLineDash([]); ctx.stroke(); ctx.fillStyle = 'rgba(255,90,54,.12)'; ctx.fill(); }
  if (rs.length === 1 && E.sel.length === 1) {
    const r = rs[0];
    if (E.edge >= 0 && r.pts[E.edge]) { const p = r.pts[E.edge], q = r.pts[(E.edge + 1) % r.pts.length], [ax, ay] = W2S(p[0], p[1]), [bx, by] = W2S(q[0], q[1]); ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
    for (const hd of handlesOf(r)) {
      const [x, y] = W2S(hd.x, hd.y);
      if (hd.t === 'mid') { ctx.fillStyle = '#12151c'; ctx.strokeStyle = '#ff9040'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); ctx.stroke(); }
      else { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ff5a36'; ctx.lineWidth = 2; ctx.beginPath(); ctx.rect(x - 4.5, y - 4.5, 9, 9); ctx.fill(); ctx.stroke(); }
    }
  }
  // things
  for (const t of l.things) drawThing(t, isSel('thing', t.id));
  // tool previews
  const d = E.drag;
  if (d && d.t === 'draw') {
    const [ax, ay] = W2S(Math.min(d.x0, d.x1), Math.max(d.y0, d.y1)), [bx, by] = W2S(Math.max(d.x0, d.x1), Math.min(d.y0, d.y1));
    ctx.fillStyle = ROOM_KINDS[d.kind].color + '44'; ctx.strokeStyle = ROOM_KINDS[d.kind].color; ctx.lineWidth = 2; ctx.fillRect(ax, ay, bx - ax, by - ay); ctx.strokeRect(ax, ay, bx - ax, by - ay);
    ctx.fillStyle = '#fff'; ctx.font = '600 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`${Math.abs(d.x1 - d.x0)} × ${Math.abs(d.y1 - d.y0)}`, (ax + bx) / 2, (ay + by) / 2);
  }
  if (d && d.t === 'marquee') { const [ax, ay] = W2S(d.x0, d.y0), [bx, by] = W2S(d.x1, d.y1); ctx.fillStyle = 'rgba(76,141,255,.12)'; ctx.strokeStyle = '#4c8dff'; ctx.lineWidth = 1; ctx.fillRect(ax, ay, bx - ax, by - ay); ctx.strokeRect(ax + 0.5, ay + 0.5, bx - ax, by - ay); }
  if (E.tool === 'poly') {
    const pts = E.poly || [], m = [sn(E.mouse[0]), sn(E.mouse[1])];
    ctx.strokeStyle = '#4c8dff'; ctx.lineWidth = 2; ctx.beginPath();
    [...pts, m].forEach((p, i) => { const [x, y] = W2S(p[0], p[1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
    for (const p of pts) { const [x, y] = W2S(p[0], p[1]); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); }
    const [mx, my] = W2S(m[0], m[1]); ctx.fillStyle = '#4c8dff'; ctx.beginPath(); ctx.arc(mx, my, 4, 0, 7); ctx.fill();
  } else if (E.tool !== 'select' && !d) { const [mx, my] = W2S(sn(E.mouse[0]), sn(E.mouse[1])); ctx.strokeStyle = ROOM_KINDS[E.tool].color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(mx - 7, my); ctx.lineTo(mx + 7, my); ctx.moveTo(mx, my - 7); ctx.lineTo(mx, my + 7); ctx.stroke(); }
  if (E.placing) { ctx.globalAlpha = 0.65; drawThing({ type: E.placing, x: E.snap ? snap(E.mouse[0], 8) : E.mouse[0], y: E.snap ? snap(E.mouse[1], 8) : E.mouse[1], angle: E.angle }, false); ctx.globalAlpha = 1; }
  // 3D camera marker
  if (v3 && E.mode === 'split') {
    const c = v3.cam, [x, y] = W2S(c.x, c.y), a = -c.yaw * Math.PI / 180;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = 'rgba(76,141,255,.16)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 60, -0.6, 0.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4c8dff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, 6); ctx.lineTo(-6, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  const tip = E.placing ? 'Click to place · Esc to stop' : E.tool === 'poly' ? 'Click corners · click the first point or press Enter to finish' : E.tool !== 'select' ? 'Drag to draw · Shift keeps the tool' : 'Drag to move · Right-drag to pan · Wheel to zoom · Alt = no snapping';
  hudEl.textContent = `${Math.round(E.mouse[0])}, ${Math.round(E.mouse[1])}   ·   grid ${E.grid}   ·   ${tip}`;
}

function drawStairs(r) {
  const [x0, y0, x1, y1] = bbox(r.pts), n = Math.max(1, Math.round(r.steps || 8)), dir = r.dir || 0;
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 1; i < n; i++) {
    const f = i / n;
    if (dir % 2 === 0) { const [sx, sy] = W2S(x0 + (x1 - x0) * f, y0), [, ey] = W2S(0, y1); ctx.moveTo(sx, sy); ctx.lineTo(sx, ey); }
    else { const [sx, sy] = W2S(x0, y0 + (y1 - y0) * f), [ex] = W2S(x1, 0); ctx.moveTo(sx, sy); ctx.lineTo(ex, sy); }
  }
  ctx.stroke();
  const c = W2S((x0 + x1) / 2, (y0 + y1) / 2), a = -dir * Math.PI / 2;
  ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(a); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.moveTo(5, -6); ctx.lineTo(12, 0); ctx.lineTo(5, 6); ctx.stroke(); ctx.restore();
}

function drawThing(t, sel) {
  const info = thingInfo(t.type), z = E.view.z, [x, y] = W2S(t.x, t.y);
  const r = Math.max((info ? info.r : 16) * z, 5);
  const col = info ? info.color : '#ff4d5e';
  if (sel) { ctx.fillStyle = 'rgba(255,90,54,.25)'; ctx.strokeStyle = '#ff5a36'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, 7); ctx.fill(); ctx.stroke(); }
  const img = info && getImg(info.url);
  if (img && img.width * z * info.scale > 9) {
    const w = img.width * z * info.scale, hh = img.height * z * info.scale;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, 7); ctx.fill();
    ctx.drawImage(img, x - w / 2, y - hh / 2, w, hh);
  } else {
    ctx.fillStyle = col; ctx.strokeStyle = '#0a0c10'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, Math.max(r * 0.7, 5), 0, 7); ctx.fill(); ctx.stroke();
    if (!info) { ctx.fillStyle = '#fff'; ctx.font = '700 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', x, y); }
  }
  if (info && info.dir) {
    const a = (t.angle || 0) * Math.PI / 180, rr = r + (sel ? 14 : 6);
    const ex = x + Math.cos(a) * rr, ey = y - Math.sin(a) * rr;
    ctx.strokeStyle = sel ? '#fff' : col; ctx.lineWidth = sel ? 2 : 1.5; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.5, y - Math.sin(a) * r * 0.5); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = sel ? '#fff' : col; ctx.beginPath(); ctx.arc(ex, ey, sel ? 4.5 : 2.5, 0, 7); ctx.fill();
  }
  if (t.name && z > 0.5) { ctx.font = '600 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#cfd5e4'; ctx.fillText(t.name, x, y + r + 4); }
}

// ---------------------------------------------------------------- toolbar
function renderBar() {
  clear(barEl);
  for (const t of TOOLS) {
    if (!t) { barEl.append(h('div.sep')); continue; }
    barEl.append(h('div.tool' + (E.tool === t[0] && !E.placing ? '.on' : ''), { 'data-tip': `${t[2]} (${t[3]})`, onclick: () => setTool(t[0]) }, icon(t[1], 19)));
  }
  barEl.append(h('div.sep'),
    h('div.row.gap4', { 'data-tip': 'Snap to grid (G)' }, toggle(E.snap, v => { E.snap = v; redraw(); }), h('span.dim', 'Snap')),
    select(E.grid, [8, 16, 32, 64, 128].map(g => [g, 'Grid ' + g]), v => { E.grid = +v; redraw(); }, { style: 'width:92px' }),
    iconBtn('target', 'Zoom to fit (F)', () => { fitView(); if (v3) v3.frameAll(); }),
    h('div.grow'),
    seg(E.mode, [['2d', 'Top', 'grid'], ['split', 'Split', 'split'], ['3d', '3D', 'cube']], v => { E.mode = v; applyMode(); }),
    btn('Play level', () => emit('play', { level: L().id }), { kind: 'sm', icon: 'play', tip: 'Test this level in UZDoom' }));
}

function renderLevelSel() {
  const p = S.project, l = L();
  clear(lvlSel).append(
    select(l.id, p.levels.map((x, i) => [x.id, `${i + 1}. ${x.name}`]), v => { E.levelId = v; E.sel = []; E.cam = null; E.viewSet = false; LevelPage.mount(root); }),
    iconBtn('plus', 'New level', async () => { const n = await promptBox('New level', 'Level name', 'Level ' + (p.levels.length + 1), 'Create'); if (n === null) return; const nl = newLevel(n || undefined); E.levelId = nl.id; E.sel = []; E.cam = null; E.viewSet = false; commit(); LevelPage.mount(root); }, 'sm'),
    iconBtn('more', 'More', e => menu(e.clientX, e.clientY, [
      { label: 'Rename level', icon: 'pencil', onClick: async () => { const n = await promptBox('Rename level', 'Level name', l.name); if (n) { l.name = n; commit(); } } },
      { label: 'Duplicate level', icon: 'copy', onClick: () => { const c = JSON.parse(JSON.stringify(l)); c.id = newId('l'); c.name = l.name + ' copy'; c.rooms.forEach(r => { r.id = newId('r'); }); c.things.forEach(t => { t.id = newId('t'); }); p.levels.push(c); E.levelId = c.id; E.cam = null; E.viewSet = false; commit(); LevelPage.mount(root); } },
      { label: 'Level events (blocks)', icon: 'blocks', onClick: () => openScripts(l, 'level', `Events in "${l.name}"`) },
      '-',
      { label: 'Delete level', icon: 'trash', danger: true, onClick: async () => { if (await confirmBox('Delete level?', `"${l.name}" and everything in it will be removed. You can undo this with Ctrl+Z.`)) { p.levels = p.levels.filter(x => x !== l); E.levelId = null; E.sel = []; E.cam = null; E.viewSet = false; commit(); LevelPage.mount(root); } } },
    ]), 'sm'));
}

// ---------------------------------------------------------------- outline
function renderHier() {
  const l = L();
  if (!l || !hierEl) return;
  clear(hierEl);
  hierEl.append(h('div.hier-group', 'Rooms', h('span.chip', l.rooms.length)));
  for (const r of [...l.rooms].reverse()) {
    const k = ROOM_KINDS[r.kind] || ROOM_KINDS.room;
    hierEl.append(h('div.item' + (isSel('room', r.id) ? '.on' : ''), { onclick: e => setSel(e.shiftKey ? [...E.sel.filter(s => s.id !== r.id), { k: 'room', id: r.id }] : [{ k: 'room', id: r.id }]), ondblclick: () => { const c = centroid(r.pts); E.view.x = c[0]; E.view.y = c[1]; redraw(); } },
      h('span', { style: { color: k.color, display: 'flex' } }, icon(k.icon, 15)), h('span.ellip.grow', r.name)));
  }
  const groups = new Map();
  for (const t of l.things) { if (!groups.has(t.type)) groups.set(t.type, []); groups.get(t.type).push(t); }
  hierEl.append(h('div.hier-group', 'Things', h('span.chip', l.things.length)));
  for (const [type, list] of groups) {
    const info = thingInfo(type), all = list.every(t => isSel('thing', t.id));
    hierEl.append(h('div.item' + (all ? '.on' : ''), { onclick: () => setSel(list.map(t => ({ k: 'thing', id: t.id }))) },
      h('span.dot', { style: { background: info ? info.color : '#ff4d5e', borderRadius: '50%' } }), h('span.ellip.grow', info ? info.name : 'Missing thing'), list.length > 1 && h('span.mute', '×' + list.length)));
  }
  if (!l.things.length) hierEl.append(h('div.hint', { style: { padding: '4px 8px' } }, 'Drag monsters and items from the shelf below onto the map.'));
}

// ---------------------------------------------------------------- properties
function renderInsp() {
  const l = L();
  if (!l || !inspEl) return;
  clear(inspEl);
  const rooms = selRooms(), things = selThings();
  if (rooms.length && !things.length) return inspRooms(rooms);
  if (things.length && !rooms.length) return inspThings(things);
  if (rooms.length + things.length > 1) {
    inspEl.append(h('div.sect', h('h3', `${rooms.length + things.length} items selected`), h('div.row', btn('Duplicate', () => cloneSel(E.grid, -E.grid), { icon: 'copy' }), btn('Delete', deleteSel, { icon: 'trash', kind: 'danger' }))));
    return;
  }
  // nothing selected: level settings
  inspEl.append(
    h('div.sect', h('h4', icon('map', 14), 'This level'),
      field('Name', text(l.name, v => { l.name = v || 'Level'; done(); })),
      field('Music', select(l.music, musicOptions(), v => { l.music = v; done(); })),
      field('Sky', texSwatch(l.sky || 'SKY1', v => { l.sky = v; done(); }, 'wall'), { hint: 'Shown wherever a room has "Open sky" turned on.' })),
    h('div.sect', h('h4', icon('blocks', 14), 'Events'),
      h('div.hint', 'Make things happen: "when the player enters a room, open a door and spawn monsters".'),
      btn(`Level events${l.scripts.length ? ' (' + l.scripts.length + ')' : ''}`, () => openScripts(l, 'level', `Events in "${l.name}"`), { icon: 'blocks' })),
    h('div.sect', h('h4', icon('help', 14), 'How it works'),
      h('div.hint', { html: '<b>Rooms are shapes.</b> Where two shapes touch or overlap they connect by themselves. Shapes higher in the Outline sit on top.<br><br><b>Leave a gap</b> between rooms to get a wall, then bridge it with a corridor or a <b>Door</b>.<br><br>Change a room\'s floor and ceiling height to make platforms, pits and windows. Draw a <b>Solid block</b> on top of a room for a pillar.' })));
}

function inspRooms(rooms) {
  const r = rooms[0], many = rooms.length > 1, k = r.kind;
  const all = fn => rooms.forEach(fn);
  const kindSel = select(k, Object.entries(ROOM_KINDS).map(([id, v]) => [id, v.name]), v => {
    all(x => { const tmp = makeRoom(v, x.pts, x.rect); const keep = { id: x.id, name: x.name.startsWith(ROOM_KINDS[x.kind].name) ? tmp.name : x.name, pts: x.pts, rect: v === 'stairs' ? true : x.rect, floor: x.floor, ceil: x.ceil, light: x.light }; for (const key of Object.keys(x)) delete x[key]; Object.assign(x, tmp, keep); if (v === 'stairs') x.pts = rectPts(...bbox(x.pts)); });
    done(true);
  });
  inspEl.append(h('div.sect',
    h('h4', { style: { color: ROOM_KINDS[k].color } }, icon(ROOM_KINDS[k].icon, 14), many ? `${rooms.length} rooms` : ROOM_KINDS[k].name),
    !many && field('Name', text(r.name, v => { r.name = v || r.name; done(); })),
    field('Type', kindSel)));

  if (k !== 'solid') {
    const hrow = h('div.fgrid',
      field(k === 'lift' ? 'Top height' : k === 'stairs' ? 'Bottom height' : 'Floor height', num(r.floor, v => { all(x => { x.floor = v; if (x.kind !== 'door' && x.ceil < v + 8) x.ceil = v + 8; }); done(); }, { step: 8 })),
      k !== 'door' && field('Ceiling height', num(r.ceil, v => { all(x => { x.ceil = Math.max(v, x.floor + 8); }); done(); }, { step: 8 })));
    inspEl.append(h('div.sect', h('h4', icon('layers', 14), 'Height & light'), hrow,
      k === 'door' && h('div.hint', 'A door opens up to the ceiling of the rooms it touches.'),
      k !== 'door' && h('div.hint', `Room is ${r.ceil - r.floor} tall. The player is 56 tall and can step up 24.`),
      k !== 'door' && field('Open sky (outdoors)', toggle(r.sky, v => { all(x => { x.sky = v; }); done(true); }), { inline: true }),
      field('Brightness', slider(r.light ?? 192, 0, 255, 8, v => { all(x => { x.light = v; }); done(); }, { live: v => { all(x => { x.light = v; }); mark3d(); } }))));
  }

  const tex = h('div.sect', h('h4', icon('image', 14), 'Textures'));
  if (k !== 'solid') tex.append(field('Floor', texSwatch(r.floorTex, v => { all(x => { x.floorTex = v; }); done(); }, 'flat')));
  if (k !== 'solid' && k !== 'door' && !r.sky) tex.append(field('Ceiling', texSwatch(r.ceilTex, v => { all(x => { x.ceilTex = v; }); done(); }, 'flat')));
  tex.append(field(k === 'door' ? 'Door face' : k === 'stairs' ? 'Step fronts' : k === 'lift' ? 'Lift sides' : 'Walls', texSwatch(r.wallTex, v => { all(x => { x.wallTex = v; }); done(); }, 'wall')));
  if (k === 'door') tex.append(field('Door frame (sides)', texSwatch(r.trackTex || 'DOORTRAK', v => { all(x => { x.trackTex = v; }); done(); }, 'wall')));
  if (!many && E.edge >= 0 && k !== 'stairs') {
    const cur = (r.edgeTex && r.edgeTex[E.edge]) || r.wallTex;
    tex.append(h('div.hr'), field('Selected wall only', h('div.row', h('div.grow', texSwatch(cur, v => { (r.edgeTex ||= {})[E.edge] = v; done(true); }, 'wall')),
      r.edgeTex && r.edgeTex[E.edge] && iconBtn('x', 'Use the room texture again', () => { delete r.edgeTex[E.edge]; done(true); }, 'sm'))));
  } else if (!many && k !== 'stairs') tex.append(h('div.hint', 'Tip: click one wall of the selected room to give just that wall its own texture.'));
  inspEl.append(tex);

  if (k === 'door') {
    inspEl.append(h('div.sect', h('h4', icon('door', 14), 'Door'),
      field('Needs a key', select(r.lock || 0, LOCKS, v => { all(x => { x.lock = +v; }); done(); })),
      field('Player can open it', toggle(r.manual !== false, v => { all(x => { x.manual = v; }); done(); }), { inline: true }),
      r.manual === false && h('div.hint', 'This door only opens from a block script ("open door") - great for traps and locked-in arenas.'),
      field('Stays open', toggle(!!r.stay, v => { all(x => { x.stay = v; }); done(); }), { inline: true }),
      field('Fast', toggle(!!r.fast, v => { all(x => { x.fast = v; }); done(); }), { inline: true })));
  }
  if (k === 'stairs') {
    inspEl.append(h('div.sect', h('h4', icon('stairs', 14), 'Stairs'),
      field('Climbs toward', seg(r.dir || 0, [[0, 'East →'], [1, 'North ↑'], [2, 'West ←'], [3, 'South ↓']], v => { all(x => { x.dir = v; }); done(); })),
      h('div.fgrid', field('Steps', num(r.steps || 8, v => { all(x => { x.steps = v; }); done(true); }, { min: 1, max: 64 })), field('Step height', num(r.rise || 8, v => { all(x => { x.rise = v; }); done(true); }, { min: -24, max: 24 }))),
      h('div.hint', `Top step ends at height ${r.floor + (r.steps || 8) * (r.rise || 8)}. Steps taller than 24 can't be climbed.`)));
  }
  if (k === 'lift') inspEl.append(h('div.sect', h('h4', icon('lift', 14), 'Lift'), h('div.hint', 'Rests at its top height. Press USE on it, or step onto it, and it rides down to the lowest floor it touches, waits, then comes back up.')));
  if (k === 'exit') inspEl.append(h('div.sect', h('h4', icon('exit', 14), 'Exit'), h('div.hint', 'Walking onto this pad ends the level and loads the next one.'), field('Secret exit', toggle(!!r.secretExit, v => { r.secretExit = v; done(); }), { inline: true })));
  if (k === 'teleport') {
    const dests = L().things.filter(t => t.type === 'TeleportDest');
    inspEl.append(h('div.sect', h('h4', icon('teleport', 14), 'Teleporter'),
      dests.length ? field('Sends you to', select(r.dest || '', [['', '(choose an exit)'], ...dests.map(t => [t.id, t.name || 'Teleport Exit'])], v => { r.dest = v; done(); }))
        : h('div.hint', 'First place a "Teleport Exit" marker (shelf below → Player & Markers) where this teleporter should lead.'),
      btn('Place a Teleport Exit…', () => { E.placing = 'TeleportDest'; E.cat = 'markers'; renderAssets(); renderBar(); }, { icon: 'pin', kind: 'sm' })));
  }
  if (k === 'room' || k === 'lift') {
    inspEl.append(h('div.sect', h('h4', icon('zap', 14), 'Gameplay'),
      field('Floor hurts (damage / sec)', num(r.damage || 0, v => { all(x => { x.damage = v; }); done(); }, { min: 0, max: 200, step: 5 }), { inline: true }),
      field('Secret area', toggle(!!r.secret, v => { all(x => { x.secret = v; }); done(); }), { inline: true })));
  }
  inspEl.append(h('div.sect',
    h('div.row.wrap', btn('Forward', () => reorder(1), { icon: 'up', kind: 'sm', tip: 'Draw on top of other rooms (PgUp)', tipPos: 'up' }), btn('Back', () => reorder(-1), { icon: 'dn', kind: 'sm', tip: 'Draw underneath (PgDn)', tipPos: 'up' }),
      !many && r.rect && k !== 'stairs' && btn('Edit corners', () => { r.rect = false; done(true); redraw(); }, { icon: 'poly', kind: 'sm', tip: 'Turn into a free shape', tipPos: 'up' })),
    h('div.row', btn('Duplicate', () => cloneSel(E.grid, -E.grid), { icon: 'copy', kind: 'sm' }), btn('Delete', deleteSel, { icon: 'trash', kind: 'sm danger' }))));
}

function inspThings(things) {
  const t = things[0], info = thingInfo(t.type), many = things.length > 1;
  const all = fn => things.forEach(fn);
  inspEl.append(h('div.sect',
    h('div.row', h('div.thumb.lg.checker', { style: { backgroundImage: info && info.url ? `url("${info.url}")` : '' } }),
      h('div.col.gap4.grow', h('b', many ? `${things.length} things` : info ? info.name : 'Missing thing'), h('span.mute', info ? (THING_CATS.find(c => c[0] === info.cat) || [0, ''])[1] : 'Its definition was deleted')))));
  if (info && info.dir) {
    inspEl.append(h('div.sect', h('h4', icon('rotate', 14), 'Facing'),
      h('div.row.wrap.gap4', [[135, '↖'], [90, '↑'], [45, '↗'], [180, '←'], [0, '→'], [225, '↙'], [270, '↓'], [315, '↘']].map(([a, s]) => h('button.btn.sm.icon' + ((t.angle || 0) === a ? '.on' : ''), { onclick: () => { all(x => { x.angle = a; }); E.angle = a; done(true); } }, s))),
      h('div.hint', 'Or drag the little handle on the map. Q / E rotate.')));
  }
  if (info && (info.cat !== 'markers')) {
    const sk = t.skills || [true, true, true];
    inspEl.append(h('div.sect', h('h4', icon('sliders', 14), 'Appears on difficulty'),
      h('div.row', ['Easy', 'Medium', 'Hard'].map((n, i) => h('button.btn.sm' + (sk[i] ? '.on' : ''), { onclick: () => { all(x => { x.skills = [...(x.skills || [true, true, true])]; x.skills[i] = !sk[i]; }); done(true); } }, n))),
      info.dir && field('Ambush (waits until it sees you)', toggle(!!t.ambush, v => { all(x => { x.ambush = v; }); done(); }), { inline: true })));
  }
  if (info && info.named && !many) inspEl.append(h('div.sect', field('Marker name', text(t.name || '', v => { t.name = v; done(); }), { hint: 'Block scripts and teleporters find this marker by its name.' })));
  inspEl.append(h('div.sect',
    info && info.custom && btn('Edit this thing…', () => emit('nav', { page: 'things', actor: info.custom.id }), { icon: 'pencil', kind: 'sm' }),
    h('div.row', btn('Duplicate', () => cloneSel(32, -32), { icon: 'copy', kind: 'sm' }), btn('Delete', deleteSel, { icon: 'trash', kind: 'sm danger' }))));
}

// ---------------------------------------------------------------- content shelf
function renderAssets() {
  if (!assetsEl) return;
  clear(assetsEl);
  const cats = h('div.cats', THING_CATS.map(([id, name]) => h('div.cat' + (E.cat === id ? '.on' : ''), { onclick: () => { E.cat = id; renderAssets(); } }, name)),
    h('div.grow'), h('span.hint', 'Drag onto the map, or click then click the map'));
  const list = h('div.assets');
  let items;
  if (E.cat === 'custom') items = S.project.actors.filter(a => a.kind !== 'projectile').map(a => '@' + a.id);
  else items = THINGS.filter(t => t.cat === E.cat && thingAvailable(t)).map(t => t.cls);
  for (const type of items) {
    const info = thingInfo(type);
    const el = h('div.asset' + (E.placing === type ? '.on' : ''), { title: info.name }, h('i', { data: { url: info.url }, style: { backgroundImage: info.url ? `url("${info.url}")` : '' } }), h('span', info.name));
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      E.placing = type; E.tool = 'select'; renderBar();
      [...list.children].forEach(c => c.classList.toggle('on', c === el));
      const up = ev => {
        window.removeEventListener('pointerup', up);
        const r = cv.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom && E.mode !== '3d') {
          const [wx, wy] = S2W(ev.clientX - r.left, ev.clientY - r.top);
          placeThing(type, wx, wy); E.placing = null; renderAssets();
        }
      };
      const mv = ev => { const r = cv.getBoundingClientRect(); E.mouse = S2W(ev.clientX - r.left, ev.clientY - r.top); redraw(); if (!ev.buttons) window.removeEventListener('pointermove', mv); };
      window.addEventListener('pointerup', up); window.addEventListener('pointermove', mv);
    });
    list.append(el);
  }
  if (E.cat === 'custom') list.append(h('div.asset', { onclick: () => emit('nav', 'things'), style: { justifyContent: 'center', color: 'var(--dim)' } }, icon('plus', 26), h('span', 'Make a new thing')));
  assetsEl.append(cats, list);
}
function renderAssetsImgs() { /* background images load on their own; nothing to do */ }
