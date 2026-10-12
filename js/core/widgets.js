// Reusable UI pieces: modals, toasts, menus, form controls, texture picker.
import { h, icon, clear, add } from './dom.js';
import { S, commit } from './store.js';
import { R, texUrl, texLabel, soundOptions, playSound } from './resources.js';
import { texLump } from '../compile/names.js';

// ---------------------------------------------------------------- toast / modal / menu
let toastWrap;
export function toast(msg, kind = 'good', ms = 3200) {
  if (!toastWrap) { toastWrap = h('div.toasts'); document.body.append(toastWrap); }
  const t = h('div.toast.' + (kind || 'plain'), icon(kind === 'bad' ? 'x' : kind === 'warn' ? 'help' : 'check', 16), h('div', msg));
  toastWrap.append(t);
  setTimeout(() => t.remove(), ms);
  return t;
}

export function modal({ title, body, buttons = [], size = '', onClose }) {
  const back = h('div.modal-back');
  const close = v => { back.remove(); document.removeEventListener('keydown', key, true); if (onClose) onClose(v); };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', key, true);
  const foot = buttons.length ? h('div.modal-f', buttons.map(b => h('button.btn' + (b.kind ? '.' + b.kind : ''), { onclick: () => b.onClick ? b.onClick(close) : close() }, b.icon && icon(b.icon, 16), b.label))) : null;
  const m = h('div.modal' + (size ? '.' + size : ''),
    h('div.modal-h', h('h2', title), h('button.btn.ghost.icon', { onclick: () => close() }, icon('x'))),
    h('div.modal-b', typeof body === 'function' ? body(close) : body), foot);
  back.append(m);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  document.body.append(back);
  const first = m.querySelector('input,textarea,select');
  if (first) setTimeout(() => { first.focus(); if (first.select) first.select(); }, 30);
  return { el: m, close };
}
export const confirmBox = (title, text, ok = 'Delete', kind = 'danger') => new Promise(res => {
  let done = false;
  modal({ title, body: h('p.dim', { style: { lineHeight: 1.5 } }, text), onClose: () => { if (!done) res(false); },
    buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: ok, kind: kind === 'danger' ? 'danger' : 'primary', onClick: c => { done = true; res(true); c(); } }] });
});
export const promptBox = (title, label, value = '', ok = 'OK') => new Promise(res => {
  let done = false;
  const inp = h('input.input', { value, onkeydown: e => { if (e.key === 'Enter') { done = true; res(inp.value.trim()); m.close(); } } });
  const m = modal({ title, body: field(label, inp), onClose: () => { if (!done) res(null); },
    buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: ok, kind: 'primary', onClick: c => { done = true; res(inp.value.trim()); c(); } }] });
});

let openMenu;
export function menu(x, y, items) {
  if (openMenu) openMenu.remove();
  const el = openMenu = h('div.menu');
  const close = () => { el.remove(); document.removeEventListener('mousedown', out, true); };
  const out = e => { if (!el.contains(e.target)) close(); };
  for (const it of items) {
    if (!it) continue;
    if (it === '-') el.append(h('div.ms'));
    else if (it.header) el.append(h('div.mh', it.header));
    else el.append(h('div.mi' + (it.danger ? '.danger' : ''), { onclick: () => { close(); it.onClick(); } }, it.icon && icon(it.icon, 15), it.label, it.key && h('span.k', it.key)));
  }
  document.body.append(el);
  const r = el.getBoundingClientRect();
  el.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 6)) + 'px';
  el.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 6)) + 'px';
  setTimeout(() => document.addEventListener('mousedown', out, true));
  return close;
}

// ---------------------------------------------------------------- form controls
export function field(label, ctl, opts = {}) {
  if (opts.inline) return h('div.field.inline', h('label', label), h('div.ctl', ctl), null);
  return h('div.field', label && h('label', label), ctl, opts.hint && h('div.hint', opts.hint));
}
export function num(value, onChange, o = {}) {
  const i = h('input.input', { type: 'number', value: value ?? 0, min: o.min, max: o.max, step: o.step || 1 });
  i.onchange = () => {
    let v = parseFloat(i.value);
    if (isNaN(v)) v = o.def ?? 0;
    if (o.min !== undefined) v = Math.max(o.min, v);
    if (o.max !== undefined) v = Math.min(o.max, v);
    i.value = v; onChange(v);
  };
  return i;
}
export function text(value, onChange, o = {}) {
  const i = o.area ? h('textarea.input', { rows: o.rows || 3, placeholder: o.placeholder }) : h('input.input', { type: 'text', placeholder: o.placeholder, maxlength: o.max });
  i.value = value ?? '';
  i.onchange = () => onChange(i.value);
  if (o.live) i.oninput = () => o.live(i.value);
  return i;
}
export function select(value, options, onChange, o = {}) {
  const s = h('select.input', o);
  const mk = ([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l);
  let found = false;
  const scan = opts => opts.forEach(op => { if (op.group) scan(op.items); else if (String(op[0]) === String(value)) found = true; });
  scan(options);
  for (const op of options) s.append(op.group ? h('optgroup', { label: op.group }, op.items.map(mk)) : mk(op));
  if (!found && value !== undefined && value !== null && value !== '') s.prepend(h('option', { value, selected: true }, '(missing) ' + value));
  s.onchange = () => onChange(s.value);
  return s;
}
export function toggle(value, onChange) {
  const b = h('button.toggle' + (value ? '.on' : ''), { type: 'button' });
  b.onclick = () => { const v = !b.classList.contains('on'); b.classList.toggle('on', v); onChange(v); };
  return b;
}
export function slider(value, min, max, step, onChange, o = {}) {
  const out = h('span.dim', { style: { width: '34px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' } }, (o.fmt || String)(value));
  const r = h('input', { type: 'range', min, max, step, value });
  r.oninput = () => { out.textContent = (o.fmt || String)(+r.value); if (o.live) o.live(+r.value); };
  r.onchange = () => onChange(+r.value);
  return h('div.row.grow', r, out);
}
export function seg(value, options, onChange) {
  const el = h('div.seg');
  for (const [v, l, ic] of options) {
    el.append(h('button' + (v === value ? '.on' : ''), { type: 'button', onclick: () => { [...el.children].forEach(c => c.classList.remove('on')); el.children[options.findIndex(o => o[0] === v)].classList.add('on'); onChange(v); } }, ic && icon(ic, 14), l));
  }
  return el;
}
export const btn = (label, onClick, o = {}) => h('button.btn' + (o.kind ? '.' + o.kind.split(' ').join('.') : ''), { type: 'button', onclick: onClick, 'data-tip': o.tip, 'data-tip-pos': o.tipPos, disabled: o.disabled }, o.icon && icon(o.icon, o.size || 16), label);
export const iconBtn = (ic, tip, onClick, kind = 'ghost') => h('button.btn.icon.' + kind.split(' ').join('.'), { type: 'button', onclick: onClick, 'data-tip': tip }, icon(ic, 16));

// A bound control: reads obj[key], writes it back and commits.
export const bind = {
  num: (obj, key, o = {}) => num(obj[key], v => { obj[key] = v; commit(); if (o.then) o.then(v); }, o),
  text: (obj, key, o = {}) => text(obj[key], v => { obj[key] = v; commit(); if (o.then) o.then(v); }, o),
  select: (obj, key, options, o = {}) => select(obj[key], options, v => { obj[key] = o.int ? parseInt(v, 10) : v; commit(); if (o.then) o.then(v); }),
  toggle: (obj, key, o = {}) => toggle(obj[key], v => { obj[key] = v; commit(); if (o.then) o.then(v); }),
  slider: (obj, key, min, max, step, o = {}) => slider(obj[key], min, max, step, v => { obj[key] = v; commit(); if (o.then) o.then(v); }, o),
  sound: (obj, key) => soundPick(obj[key], v => { obj[key] = v; commit(); }),
  tex: (obj, key, kind) => texSwatch(obj[key], v => { obj[key] = v; commit(); }, kind),
};

export function soundPick(value, onChange) {
  let cur = value || '';
  const sel = select(cur, soundOptions(), v => { cur = v; onChange(v); if (v) playSound(v); });
  return h('div.row.grow', sel, iconBtn('play', 'Listen', () => playSound(cur), 'sm'));
}

// ---------------------------------------------------------------- textures
const recent = [];
export function texSwatch(name, onPick, kind = 'wall') {
  const i = h('i', { style: { backgroundImage: name === 'F_SKY1' ? 'linear-gradient(#5aa0ff,#bfe0ff)' : `url("${texUrl(name)}")` } });
  const lab = h('span', texLabel(name) || '(none)');
  const el = h('div.swatch', { onclick: async () => { const t = await pickTexture(name, kind); if (t) { onPick(t); i.style.backgroundImage = `url("${texUrl(t)}")`; lab.textContent = texLabel(t); name = t; } } }, i, lab);
  return el;
}
export function pickTexture(current, kind = 'wall') {
  return new Promise(res => {
    let done = false, tab = kind === 'flat' ? 'flats' : 'walls', q = '';
    if (S.project.textures.some(t => texLump(t) === current)) tab = 'mine';
    const grid = h('div.texgrid');
    const tabsEl = h('div.seg');
    const search = h('input.input', { placeholder: 'Search textures…', style: { width: '220px' }, oninput: () => { q = search.value.toUpperCase(); draw(); } });
    const choose = n => { done = true; const k = recent.indexOf(n); if (k >= 0) recent.splice(k, 1); recent.unshift(n); recent.length = Math.min(recent.length, 16); res(n); m.close(); };
    const draw = () => {
      clear(tabsEl);
      for (const [id, label] of [['walls', 'Walls'], ['flats', 'Floors & ceilings'], ['mine', 'My textures'], ['recent', 'Recent']]) {
        tabsEl.append(h('button' + (tab === id ? '.on' : ''), { onclick: () => { tab = id; draw(); } }, label));
      }
      let list = tab === 'walls' ? R.texList : tab === 'flats' ? R.flatList : tab === 'mine' ? S.project.textures.map(texLump) : recent;
      if (q) list = list.filter(n => n.includes(q) || texLabel(n).toUpperCase().includes(q));
      clear(grid);
      if (!list.length) grid.append(h('div.hint', { style: { gridColumn: '1/-1', padding: '30px', textAlign: 'center' } }, tab === 'mine' ? 'No custom textures yet. Make or import some on the Art page.' : R.ok ? 'Nothing found.' : 'No Doom WAD loaded - set one in Settings to see Doom textures.'));
      for (const n of list.slice(0, 600)) {
        grid.append(h('div.texcell' + (n === current ? '.on' : '') + (R.flats.has(n) ? '.tile' : ''), { onclick: () => choose(n), title: n },
          h('i', { style: { backgroundImage: `url("${texUrl(n)}")` } }), h('span', texLabel(n))));
      }
    };
    const m = modal({ title: 'Choose a texture', size: 'wide', onClose: () => { if (!done) res(null); },
      body: [h('div.row', tabsEl, h('div.grow'), search), h('div', { style: { minHeight: '50vh' } }, grid)] });
    draw();
  });
}

// Generic "pick one from a visual grid" dialog. items: [{id, label, url}]
export function pickFromGrid(title, items, current) {
  return new Promise(res => {
    let done = false;
    const grid = h('div.texgrid');
    const search = h('input.input', { placeholder: 'Search…', oninput: () => draw(search.value.toLowerCase()) });
    const draw = q => {
      clear(grid);
      for (const it of items.filter(i => !q || i.label.toLowerCase().includes(q)).slice(0, 500)) {
        grid.append(h('div.texcell' + (it.id === current ? '.on' : ''), { onclick: () => { done = true; res(it.id); m.close(); } },
          h('i.checker', { style: { backgroundImage: it.url ? `url("${it.url}")` : '' } }), h('span', it.label)));
      }
      if (!grid.children.length) add(grid, [h('div.hint', { style: { gridColumn: '1/-1', padding: '30px', textAlign: 'center' } }, 'Nothing here yet.')]);
    };
    const m = modal({ title, size: 'wide', onClose: () => { if (!done) res(null); }, body: [search, h('div', { style: { minHeight: '46vh' } }, grid)] });
    draw('');
  });
}
