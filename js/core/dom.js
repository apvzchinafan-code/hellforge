// Tiny DOM toolkit: element builder, icons, misc helpers.

export function h(spec, props, ...kids) {
  const [tag, ...cls] = spec.split('.');
  const el = document.createElement(tag || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (props && (props instanceof Node || typeof props !== 'object' || Array.isArray(props))) { kids.unshift(props); props = null; }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'data') Object.assign(el.dataset, v);
      else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  add(el, kids);
  return el;
}
export function add(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
// The whole app builds its UI with el.append(a, cond && b, [list]). Native append() would print "null"/"false"
// and stringify arrays, so make it skip empty values and flatten lists, exactly like h() does.
const nativeAppend = Element.prototype.append;
Element.prototype.append = function (...kids) {
  return nativeAppend.apply(this, kids.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false));
};
export const clear = el => { while (el.firstChild) el.firstChild.remove(); return el; };
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const snap = (v, g) => Math.round(v / g) * g;
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

const P = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  ghost: 'M5 21V10a7 7 0 0 1 14 0v11l-3-2-2 2-2-2-2 2-2-2-3 2zM9 10h.01M15 10h.01',
  image: 'M3 5h18v14H3zM3 16l5-5 5 5 3-3 5 5M8 9h.01',
  volume: 'M4 9v6h4l5 4V5L8 9H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  flag: 'M6 3v18M6 4h11l-2 4 2 4H6',
  sliders: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h9M17 18h3M15 4v4M9 10v4M15 16v4',
  play: 'M7 4l13 8-13 8z',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  undo: 'M4 9h10a6 6 0 0 1 0 12H9M4 9l4-4M4 9l4 4',
  redo: 'M20 9H10a6 6 0 0 0 0 12h5M20 9l-4-4M20 9l-4 4',
  save: 'M5 3h11l4 4v14H5zM8 3v6h7V3M8 21v-7h8v7',
  cursor: 'M5 3l14 7-6 2-2 6z',
  square: 'M4 4h16v16H4z',
  poly: 'M12 3l9 6-3 11H6L3 9z',
  door: 'M6 21V4h12v17M3 21h18M14 12h.01',
  stairs: 'M3 20h5v-5h5v-5h5V5h3',
  lift: 'M5 3h14v18H5zM9 10l3-3 3 3M9 14l3 3 3-3',
  block: 'M4 4h16v16H4zM4 4l16 16M20 4L4 20',
  exit: 'M10 4H5v16h5M14 8l4 4-4 4M18 12H9',
  teleport: 'M12 2v5M12 17v5M2 12h5M17 12h5M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  grid: 'M4 4h16v16H4zM4 10h16M4 15h16M10 4v16M15 4v16',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  upload: 'M12 16V5M7 9l5-5 5 5M5 20h14',
  folder: 'M3 6h6l2 2h10v11H3z',
  pencil: 'M4 20l1-4L16 5l3 3L8 19zM14 7l3 3',
  eraser: 'M4 16l9-9 6 6-6 6H8zM10 19h10',
  bucket: 'M5 11l7-7 7 7-7 7zM19 15s2 2 2 3.5a2 2 0 0 1-4 0C17 17 19 15 19 15z',
  pipette: 'M4 20l2-5 8-8 3 3-8 8zM15 5l2-2 4 4-2 2',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  down: 'M6 9l6 6 6-6',
  right: 'M9 6l6 6-6 6',
  left: 'M15 6l-6 6 6 6',
  zap: 'M13 2L4 14h7l-1 8 9-12h-7z',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  blocks: 'M4 4h7v4a2 2 0 1 0 4 0V4h5v7h-4a2 2 0 1 0 0 4h4v5H4z',
  up: 'M12 19V5M6 11l6-6 6 6',
  dn: 'M12 5v14M6 13l6 6 6-6',
  stop: 'M6 6h12v12H6z',
  line: 'M5 19L19 5',
  flip: 'M12 3v18M8 7l-5 5 5 5zM16 7l5 5-5 5z',
  wand: 'M4 20L15 9M14 3v3M20 9h-3M18.5 4.5l-2 2M8 3v2M20 14v2',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
  move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  piano: 'M3 5h18v14H3zM8 5v8M13 5v8M18 5v8M8 13v6M13 13v6',
  wave: 'M3 12h2l2-6 3 12 3-9 2 5 2-2h4',
  gun: 'M3 8h15v4h-6l-1 3H8l-1 5H4l1-5V8zM18 9h3',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  fire: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z',
  lamp: 'M9 21h6M12 21v-7M8 14h8l-2-10h-4z',
  star: 'M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.3 6.4 20.3l1.2-6.3L3 9.6l6.3-.8z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  split: 'M3 4h18v16H3zM12 4v16',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  pin: 'M12 21s-6-6.5-6-11a6 6 0 0 1 12 0c0 4.5-6 11-6 11zM12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  box: 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  rotate: 'M20 12a8 8 0 1 1-3-6.2M20 4v5h-5',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  bug: 'M9 8a3 3 0 0 1 6 0v1H9zM7 9h10v6a5 5 0 0 1-10 0zM3 12h4M17 12h4M4 6l3 3M20 6l-3 3M4 19l3-3M20 19l-3-3',
};
export function icon(name, size = 18, fill = false) {
  const d = P[name] || P.help;
  const filled = fill || name === 'play' || name === 'stop';
  const el = document.createElement('span');
  el.className = 'ico';
  el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="${filled ? 1 : 1.9}" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  return el;
}

export function fileToDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}
export function loadImage(url) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not load image')); i.src = url; });
}
export function pickFiles(accept, multiple = false) {
  return new Promise(res => {
    const i = h('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    i.onchange = () => { res([...i.files]); i.remove(); };
    i.addEventListener('cancel', () => { res([]); i.remove(); });
    document.body.append(i);
    i.click();
  });
}
export const niceName = file => file.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Untitled';
