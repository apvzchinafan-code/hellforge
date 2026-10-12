// Scratch-style block editor: drag blocks from the palette, snap them under event "hats".
import { h, icon, clear } from '../core/dom.js';
import { S, commit, newId, on, byId } from '../core/store.js';
import { soundOptions, playSound } from '../core/resources.js';
import { modal, menu, promptBox, btn, toast } from '../core/widgets.js';
import { BLOCKS, CATS, CAT_COLOR, blocksFor, newBlock, parseLabel } from './defs.js';
import { THINGS, BUILTIN_PROJECTILES, BUILTIN_ITEMS, ACTOR_KINDS } from '../data/doom.js';

const WORLD = k => k === 'level' || k === 'game';

function optionsFor(type, owner, kind) {
  const p = S.project;
  const mine = (kinds) => p.actors.filter(a => kinds.includes(a.kind)).map(a => ['@' + a.id, a.name]);
  const grp = (label, items) => (items.length ? [{ group: label, items }] : []);
  switch (type) {
    case 'proj': return [...grp('My projectiles', mine(['projectile'])), { group: 'Doom', items: BUILTIN_PROJECTILES }];
    case 'actor': return [...grp('My things', mine(['monster', 'prop', 'pickup', 'weapon'])), { group: 'Doom monsters', items: THINGS.filter(t => t.cat === 'monsters').map(t => [t.cls, t.name]) }, { group: 'Doom items', items: THINGS.filter(t => t.cat === 'items' || t.cat === 'weapons').map(t => [t.cls, t.name]) }, { group: 'Doom decoration', items: THINGS.filter(t => t.cat === 'decor').map(t => [t.cls, t.name]) }];
    case 'item': return [...grp('My items', mine(['pickup', 'weapon'])), { group: 'Doom', items: BUILTIN_ITEMS }];
    case 'monster': return [['', 'monster (any kind)'], ...grp('My monsters', mine(['monster'])), { group: 'Doom', items: THINGS.filter(t => t.cat === 'monsters').map(t => [t.cls, t.name]) }];
    case 'sound': return soundOptions().slice(1);
    case 'room': { const names = [...new Set(p.levels.flatMap(l => l.rooms.map(r => r.name)))]; return names.length ? names.map(n => [n, n]) : [['', '(no rooms yet)']]; }
    case 'spot': { const names = [...new Set(p.levels.flatMap(l => l.things.filter(t => t.name).map(t => t.name)))]; return names.length ? names.map(n => [n, n]) : [['', '(place a Marker in a level)']]; }
    case 'level': return p.levels.length ? p.levels.map((l, i) => [l.id, `${i + 1}. ${l.name}`]) : [['', '(no levels)']];
    case 'var': { const o = [...(WORLD(kind) ? [] : (owner.vars || []).map(v => ['L:' + v.id, v.name])), ...p.vars.map(v => ['G:' + v.id, '🌐 ' + v.name])]; return o.length ? o : [['', '(make a variable)']]; }
  }
  return [];
}
const firstOpt = opts => { for (const o of opts) { if (o.group) { if (o.items.length) return o.items[0][0]; } else return o[0]; } return ''; };

// ownerRef: the object holding .scripts/.vars, or a function returning it (so undo/redo can swap the project underneath).
export function mountBlocks(root, ownerRef, kind) {
  const getOwner = typeof ownerRef === 'function' ? ownerRef : () => ownerRef;
  let owner = getOwner();
  const pal = h('div.bk-pal'), ws = h('div.bk-ws');
  const wrap = h('div.bk', pal, ws);
  clear(root).append(wrap);
  owner.scripts ||= [];
  let drag = null;

  // ------------------------------------------------------------ rendering
  function slotEl(b, key, spec, live) {
    const type = spec[0], val = b.a[key];
    const s = h('span.slot');
    s._owner = b; s._key = key; s._spec = spec;
    const set = v => { b.a[key] = v; commit(); };
    if (type === 'n' || type === 'b') {
      s.dataset.accept = type === 'n' ? 'num' : 'bool';
      if (val && typeof val === 'object') { const inner = blockEl(val, live); inner._slot = s; s.append(inner); s.dataset.full = '1'; return s; }
      if (type === 'b') { s.classList.add('bool-empty'); return s; }
    }
    if (type === 'n' || type === 'lit') {
      const i = h('input', { type: 'text', inputmode: 'decimal', value: val ?? spec[1] ?? 0, disabled: !live });
      const fit = () => { i.style.width = Math.max(3, String(i.value).length + 2) + 'ch'; };
      fit(); i.oninput = fit;
      i.onchange = () => { const n = parseFloat(i.value); set(isNaN(n) ? 0 : n); };
      s.append(i);
    } else if (type === 's') {
      const i = h('input.txt', { type: 'text', value: val ?? '', disabled: !live });
      const fit = () => { i.style.width = Math.min(46, Math.max(8, String(i.value).length + 2)) + 'ch'; };
      fit(); i.oninput = fit;
      i.onchange = () => set(i.value);
      s.append(i);
    } else {
      const opts = type === 'sel' ? spec[2] : optionsFor(type, owner, kind);
      let cur = val;
      if (live && (cur === undefined || cur === null || (cur === '' && type !== 'monster'))) { cur = type === 'sel' ? spec[1] : firstOpt(opts); if (cur !== val) b.a[key] = cur; }
      const sel = h('select', { disabled: !live });
      const mk = ([v, l]) => h('option', { value: v, selected: String(v) === String(cur) }, l);
      let found = false;
      for (const o of opts) { if (o.group) { sel.append(h('optgroup', { label: o.group }, o.items.map(mk))); if (o.items.some(x => String(x[0]) === String(cur))) found = true; } else { sel.append(mk(o)); if (String(o[0]) === String(cur)) found = true; } }
      if (!found && live && cur) sel.prepend(h('option', { value: cur, selected: true }, '(deleted)'));
      sel.onchange = () => { set(sel.value); if (type === 'sound') playSound(sel.value); };
      s.append(sel);
    }
    return s;
  }
  function rowEl(b, d, live, extra) {
    const row = h('div.blk-row');
    for (const part of parseLabel(d.label)) row.append(part.slot ? slotEl(b, part.slot, d.in[part.slot], live) : h('span', part.text));
    if (extra) row.append(extra);
    return row;
  }
  function listEl(arr, live) {
    const l = h('div.blk-list');
    l._arr = arr;
    for (const c of arr) { const e = blockEl(c, live); e._list = arr; l.append(e); }
    return l;
  }
  function blockEl(b, live) {
    const d = BLOCKS[b.t];
    if (!d) { const e = h('div.blk', { style: { '--c': '#555' } }, h('div.blk-row', '(unknown block)')); e._blk = b; return e; }
    b.a ||= {};
    const el = h('div.blk.' + (d.k === 'num' ? 'rep' : d.k === 'ce' ? 'c' : d.k), { style: { '--c': CAT_COLOR[d.cat] } });
    el._blk = b; el._def = d;
    if (d.k === 'c' || d.k === 'ce') {
      b.b ||= [];
      el.append(rowEl(b, d, live), listEl(b.b, live));
      if (d.k === 'ce') { b.e ||= []; el.append(h('div.blk-row.mid', h('span', 'else')), listEl(b.e, live)); }
      el.append(h('div.blk-foot'));
    } else if (d.k === 'hat') {
      el.append(rowEl(b, d, live, live ? h('span.hx', { title: 'Delete this script', onclick: e => { e.stopPropagation(); owner.scripts = owner.scripts.filter(s => s !== b); commit(); render(); } }, icon('x', 14)) : null));
    } else el.append(rowEl(b, d, live));
    return el;
  }

  function renderPalette() {
    clear(pal);
    const defs = blocksFor(kind);
    for (const [cat, name, color] of CATS) {
      const list = defs.filter(d => d.cat === cat);
      if (!list.length) continue;
      pal.append(h('h4', h('i', { style: { background: color } }), name));
      if (cat === 'vars') {
        pal.append(btn('Make a variable', makeVar, { icon: 'plus', kind: 'sm' }));
        const vars = [...(WORLD(kind) ? [] : (owner.vars || []).map(v => [v, owner.vars, false])), ...S.project.vars.map(v => [v, S.project.vars, true])];
        for (const [v, arr, global] of vars) {
          pal.append(h('div.row.gap4', { style: { margin: '6px 0' } }, h('span.ellip.grow', { title: global ? 'Shared by the whole game' : 'Belongs to this thing' }, (global ? '🌐 ' : '') + v.name),
            h('span.mute', 'starts at'), h('input.input', { type: 'number', value: v.init, style: { width: '62px', height: '24px' }, onchange: e => { v.init = parseFloat(e.target.value) || 0; commit(); } }),
            h('button.btn.ghost.icon.sm', { onclick: () => { arr.splice(arr.indexOf(v), 1); commit(); render(); } }, icon('x', 13))));
        }
        if (!vars.length) { pal.append(h('div.hint', { style: { margin: '6px 2px' } }, 'Variables remember numbers - a score, a countdown, how angry a boss is.')); continue; }
        pal.append(h('div', { style: { height: '6px' } }));
      }
      for (const d of list) { const e = blockEl(newBlock(d.id), false); e._pal = d.id; pal.append(e); }
    }
    pal.append(h('div.bk-trash', icon('trash', 18), 'Drop here to delete'));
  }
  async function makeVar() {
    const name = await promptBox('New variable', 'Name', 'score', 'Create');
    if (!name) return;
    const v = { id: newId('v'), name: name.slice(0, 24), init: 0 };
    if (WORLD(kind)) S.project.vars.push(v);
    else {
      const global = await new Promise(res => { let d = false; modal({ title: `Who can use "${v.name}"?`, onClose: () => { if (!d) res(null); },
        body: h('p.dim', 'A private variable belongs to each copy of this thing (every monster has its own). A shared variable is one number for the whole game, like a score.'),
        buttons: [{ label: 'Only this thing', onClick: c => { d = true; res(false); c(); } }, { label: 'Whole game (shared)', kind: 'primary', onClick: c => { d = true; res(true); c(); } }] }); });
      if (global === null) return;
      if (global) S.project.vars.push(v); else (owner.vars ||= []).push(v);
    }
    commit(); render();
  }
  function renderWs() {
    clear(ws);
    for (const s of owner.scripts) {
      const hat = blockEl(s, true);
      hat._hat = true;
      s.b ||= [];
      ws.append(h('div.script', hat, listEl(s.b, true)));
    }
    if (!owner.scripts.length) {
      ws.append(h('div.empty.ws-empty', h('div.big', icon('blocks', 28)), h('h2', 'Snap blocks together to add behaviour'),
        h('p', { html: 'Drag a yellow <b>Events</b> block from the left onto this board - like <i>"when I die"</i> - then stack action blocks underneath it. No typing needed.' })));
    }
  }
  function render() { renderPalette(); renderWs(); }

  // ------------------------------------------------------------ drag & drop
  const clone = o => JSON.parse(JSON.stringify(o));
  function detach(src) {
    if (src._list) { const i = src._list.indexOf(src._blk); if (i >= 0) src._list.splice(i, 1); }
    else if (src._slot) { const sl = src._slot; sl._owner.a[sl._key] = sl._spec[0] === 'b' ? null : (sl._spec[1] ?? 0); }
  }
  function target(x, y) {
    const d = drag;
    wrap.querySelectorAll('.drop-line').forEach(e => e.remove());
    wrap.querySelectorAll('.hot').forEach(e => e.classList.remove('hot'));
    const pr = pal.getBoundingClientRect();
    const overPal = x >= pr.left && x <= pr.right && y >= pr.top && y <= pr.bottom;
    pal.classList.toggle('trash', overPal && !d.pal);
    if (overPal) return d.pal ? null : { trash: true };
    const wr = ws.getBoundingClientRect();
    if (x < wr.left || x > wr.right || y < wr.top || y > wr.bottom) return null;
    if (d.kind === 'hat') return { hat: true };
    if (d.kind === 'num' || d.kind === 'bool') {
      for (const el of document.elementsFromPoint(x, y)) {
        const sl = el.closest ? el.closest('.slot') : null;
        if (sl && ws.contains(sl) && sl.dataset.accept === d.kind && !sl.dataset.full && !(d.el && d.el.contains(sl))) { sl.classList.add('hot'); return { slot: sl }; }
      }
      return null;
    }
    let best = null, bestArea = Infinity;
    for (const l of ws.querySelectorAll('.blk-list')) {
      if (d.el && d.el.contains(l)) continue;
      const r = l.getBoundingClientRect();
      if (x >= r.left - 30 && x <= r.right + 220 && y >= r.top - 26 && y <= r.bottom + 34) { const a = r.width * r.height; if (a < bestArea) { bestArea = a; best = l; } }
    }
    if (!best) return null;
    const kids = [...best.children].filter(c => c.classList.contains('blk') && c !== d.el);
    let idx = kids.length;
    for (let i = 0; i < kids.length; i++) { const r = kids[i].getBoundingClientRect(); if (y < r.top + Math.min(r.height / 2, 18)) { idx = i; break; } }
    const line = h('div.drop-line');
    if (idx < kids.length) best.insertBefore(line, kids[idx]); else best.append(line);
    return { list: best._arr, idx, before: kids[idx] ? kids[idx]._blk : null };
  }
  wrap.addEventListener('pointerdown', e => {
    if (e.button !== 0 || /INPUT|SELECT|OPTION|BUTTON/.test(e.target.tagName) || e.target.closest('.hx')) return;
    const el = e.target.closest('.blk');
    if (!el || !wrap.contains(el)) return;
    const d = el._def;
    if (!d) return;
    if (el._hat) return; // hats stay put; delete them with their ✕
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    const r = el.getBoundingClientRect();
    const move = ev => {
      if (!drag) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
        const ghost = el.cloneNode(true);
        ghost.classList.add('drag-ghost');
        document.body.append(ghost);
        drag = { el: el._pal ? null : el, src: el, pal: el._pal, kind: d.k === 'ce' || d.k === 'c' ? 'stmt' : d.k, ghost, ox: start.x - r.left, oy: start.y - r.top, t: null };
        if (!el._pal) el.classList.add('dragging');
      }
      drag.ghost.style.left = ev.clientX - drag.ox + 'px';
      drag.ghost.style.top = ev.clientY - drag.oy + 'px';
      drag.t = target(ev.clientX, ev.clientY);
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      const dg = drag; drag = null;
      if (!dg) return;
      dg.ghost.remove(); pal.classList.remove('trash');
      const t = dg.t;
      if (t) {
        const blk = dg.pal ? newBlock(dg.pal) : dg.src._blk;
        if (t.trash) detach(dg.src);
        else if (t.hat) { blk.id = newId('k'); owner.scripts.push(blk); }
        else if (t.slot) { if (!dg.pal) detach(dg.src); t.slot._owner.a[t.slot._key] = blk; }
        else if (t.list) { if (!dg.pal) detach(dg.src); const i = t.before ? t.list.indexOf(t.before) : -1; t.list.splice(i >= 0 ? i : t.list.length, 0, blk); }
        commit();
      }
      render();
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });
  wrap.addEventListener('contextmenu', e => {
    const el = e.target.closest('.blk');
    if (!el || !ws.contains(el) || !el._blk) return;
    e.preventDefault();
    const b = el._blk;
    menu(e.clientX, e.clientY, el._hat ? [
      { label: 'Duplicate script', icon: 'copy', onClick: () => { const c = clone(b); c.id = newId('k'); owner.scripts.push(c); commit(); render(); } },
      { label: 'Delete script', icon: 'trash', danger: true, onClick: () => { owner.scripts = owner.scripts.filter(s => s !== b); commit(); render(); } },
    ] : [
      el._list && { label: 'Duplicate', icon: 'copy', onClick: () => { el._list.splice(el._list.indexOf(b) + 1, 0, clone(b)); commit(); render(); } },
      { label: 'Delete', icon: 'trash', danger: true, onClick: () => { detach(el); commit(); render(); } },
    ]);
  });
  render();
  return { render, refresh() { const o = getOwner(); if (!o) return; owner = o; owner.scripts ||= []; render(); } };
}

export function openScripts(owner, kind, title) {
  const host = h('div', { style: { flex: 1, minHeight: 0, margin: '0 -20px -16px', borderTop: '1px solid var(--line)' } });
  const id = owner.id;
  const get = kind === 'game' ? () => S.project : kind === 'level' ? () => byId(S.project.levels, id) : () => byId(S.project.actors, id);
  let off = () => {};
  const m = modal({ title, size: 'xl', body: host, onClose: () => off() });
  host.parentElement.style.overflow = 'hidden';
  const ed = mountBlocks(host, get, kind);
  off = on('project', () => { if (get()) ed.refresh(); else m.close(); });
  if (!S.project.levels.some(l => l.rooms.length) && kind === 'level') toast('Tip: name your rooms and doors in the level editor - blocks find them by name.', 'plain', 5000);
}
export const kindLabel = k => (ACTOR_KINDS[k] ? ACTOR_KINDS[k].name : k);
