// Things: make custom monsters, weapons, projectiles, pickups and props with forms + blocks.
import { h, icon, clear } from '../core/dom.js';
import { S, commit, newId, byId, emit, on } from '../core/store.js';
import { R, frameUrl, animFrameUrls, actorThumb, iwadPrefixes, iwadFrameCount, iwadFrameLump } from '../core/resources.js';
import { toast, modal, field, num, text, select, toggle, seg, btn, iconBtn, soundPick, confirmBox, pickFromGrid } from '../core/widgets.js';
import { ACTOR_KINDS, TEMPLATES, ANIM_SLOTS, THINGS, BUILTIN_PROJECTILES, BUILTIN_AMMO, BUILTIN_ITEMS, POWERUPS } from '../data/doom.js';
import { mountBlocks } from '../blocks/editor.js';
import { genActor } from '../compile/zscript.js';
import { makeEnv } from '../compile/compile.js';
import { FRAME } from '../compile/names.js';

const T = { id: null, tab: 'form' };
let root, mainEl, listEl, timer = 0, previews = [], editor = null, skip = false;
const cur = () => byId(S.project.actors, T.id);
const upd = rerender => { skip = !rerender; commit(); };

export function openActor(id) { T.id = id; T.tab = 'form'; }

export const ThingsPage = {
  id: 'things', title: 'Things', icon: 'ghost',
  mount(el) {
    root = el;
    if (!cur() && S.project.actors.length) T.id = S.project.actors[0].id;
    listEl = h('div.side-b');
    mainEl = h('div.th-main');
    clear(el).append(h('div.th', h('div.side.l', h('div.side-h', 'My things', h('div.grow'), btn('New', newThing, { icon: 'plus', kind: 'sm primary' })), listEl), mainEl));
    clearInterval(timer);
    timer = setInterval(tick, 1000 / 35 * 2);
    renderList(); renderMain();
  },
  unmount() { clearInterval(timer); previews = []; editor = null; },
  refresh() {
    if (!root) return;
    renderList();
    if (skip) { skip = false; return; }
    if (T.tab === 'blocks' && editor && cur()) return; // block editor repaints itself
    renderMain();
  },
};

function tick() {
  for (const p of previews) {
    if (!p.urls.length || !p.el.isConnected) continue;
    p.t += 2;
    if (p.t >= p.tics) { p.t = 0; p.i = (p.i + 1) % p.urls.length; p.el.style.backgroundImage = `url("${p.urls[p.i]}")`; }
  }
}

// ---------------------------------------------------------------- list
function renderList() {
  clear(listEl);
  const p = S.project;
  if (!p.actors.length) { listEl.append(h('div.hint', { style: { padding: '10px' } }, 'Nothing here yet. Click New to invent your first monster, weapon or item.')); return; }
  for (const [kind, info] of Object.entries(ACTOR_KINDS)) {
    const list = p.actors.filter(a => a.kind === kind);
    if (!list.length) continue;
    listEl.append(h('div.hier-group', { style: { color: info.color } }, icon(info.icon, 13), info.name + 's'));
    for (const a of list) {
      listEl.append(h('div.item' + (a.id === T.id ? '.on' : ''), { onclick: () => { T.id = a.id; renderList(); renderMain(); } },
        h('div.thumb.checker', { style: { backgroundImage: `url("${actorThumb(a)}")` } }), h('span.ellip.grow', a.name),
        a.scripts.length ? h('span.chip', { title: 'Has block scripts' }, icon('blocks', 11), a.scripts.length) : null));
    }
  }
}

function newThing() {
  let kind = null;
  const body = h('div.col');
  const draw = () => {
    clear(body);
    if (!kind) {
      body.append(h('div.cards', Object.entries(ACTOR_KINDS).map(([k, info]) => h('div.card', { onclick: () => { kind = k; draw(); } },
        h('div.cico', { style: { color: info.color } }, icon(info.icon, 22)), h('h3', info.name), h('span.dim', info.blurb)))));
      return;
    }
    const info = ACTOR_KINDS[kind];
    body.append(h('div.row', btn('Back', () => { kind = null; draw(); }, { icon: 'left', kind: 'ghost sm' }), h('span.dim', `Pick a starting point for your ${info.name.toLowerCase()} - you can change everything afterwards.`)));
    const grid = h('div.texgrid', { style: { gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' } });
    for (const t of TEMPLATES[kind]) {
      if (t.needs && R.ok && !R.sprites.has(t.needs)) continue;
      const first = Object.values(t.anims)[0];
      const url = first ? frameUrl(first.src, first.frames[0]) : '';
      grid.append(h('div.texcell', { onclick: () => { create(kind, t); m.close(); } }, h('i.checker', { style: { backgroundImage: url ? `url("${url}")` : '' } }, !url ? h('div', { style: { display: 'grid', placeItems: 'center', height: '100%', color: 'var(--mute)' } }, icon('plus', 26)) : null), h('span', { style: { fontFamily: 'inherit', fontSize: '11.5px' } }, t.name)));
    }
    body.append(grid);
  };
  const m = modal({ title: 'New thing', size: 'wide', body });
  draw();
}
function create(kind, t) {
  const names = new Set(S.project.actors.map(a => a.name));
  let name = t.blank ? 'My ' + ACTOR_KINDS[kind].name : 'My ' + t.name, i = 2;
  while (names.has(name)) name = (t.blank ? 'My ' + ACTOR_KINDS[kind].name : 'My ' + t.name) + ' ' + i++;
  const a = { id: newId('a'), name, kind, replaces: '', p: JSON.parse(JSON.stringify(t.p)), anims: JSON.parse(JSON.stringify(t.anims)), vars: [], scripts: [] };
  S.project.actors.push(a);
  T.id = a.id; T.tab = 'form';
  commit();
  toast(`${name} created. Place it in a level from the "My Things" shelf.`, 'good', 4000);
}

// ---------------------------------------------------------------- main panel
function renderMain() {
  previews = []; editor = null;
  clear(mainEl);
  const a = cur();
  if (!a) {
    mainEl.append(h('div.empty', h('div.big', icon('ghost', 30)), h('h2', 'Invent something'),
      h('p', 'Custom monsters, weapons, fireballs, pickups and props. Start from a Doom original, then change how it looks, how tough it is, and what it does.'),
      btn('New thing', newThing, { kind: 'primary big', icon: 'plus' })));
    return;
  }
  const info = ACTOR_KINDS[a.kind];
  const nameIn = h('input.name', { value: a.name, maxlength: 40 });
  nameIn.onchange = () => { a.name = nameIn.value.trim() || a.name; upd(); renderList(); };
  mainEl.append(
    h('div.th-head', h('div.thumb.lg.checker', { style: { backgroundImage: `url("${actorThumb(a)}")` } }), nameIn,
      h('span.chip', { style: { color: info.color } }, icon(info.icon, 12), info.name), h('div.grow'),
      a.kind !== 'projectile' && btn('Place in level', () => emit('nav', 'levels'), { icon: 'map', kind: 'sm', tip: 'Find it on the "My Things" shelf in the level editor' }),
      iconBtn('copy', 'Duplicate', () => { const c = JSON.parse(JSON.stringify(a)); c.id = newId('a'); c.name = a.name + ' copy'; S.project.actors.push(c); T.id = c.id; commit(); }),
      iconBtn('trash', 'Delete', async () => {
        if (!await confirmBox('Delete thing?', `"${a.name}" will be removed from the project and from every level it was placed in.`)) return;
        S.project.actors = S.project.actors.filter(x => x !== a);
        for (const l of S.project.levels) l.things = l.things.filter(t => t.type !== '@' + a.id);
        T.id = null; commit(); ThingsPage.mount(root);
      }, 'ghost danger')),
    h('div.tabs', [['form', 'Look & stats', 'sliders'], ['blocks', `Behaviour${a.scripts.length ? ' (' + a.scripts.length + ')' : ''}`, 'blocks'], ['code', 'Code', 'code']].map(([id, label, ic]) =>
      h('div.tab' + (T.tab === id ? '.on' : ''), { onclick: () => { T.tab = id; renderMain(); } }, icon(ic, 15), label))));
  const body = h('div.th-body');
  mainEl.append(body);
  if (T.tab === 'blocks') { body.style.overflow = 'hidden'; editor = mountBlocks(body, () => cur(), a.kind); }
  else if (T.tab === 'code') {
    let src = '';
    try { src = genActor(a, makeEnv(S.project)); } catch (e) { src = '// ' + e.message; }
    body.append(h('div.hint', { style: { padding: '14px 18px 0' } }, 'This is the real ZScript that HellForge writes for you. It is rebuilt every time you press Play - a great way to learn how Doom modding works.'), h('pre.code', src));
  } else body.append(form(a));
}

// ---------------------------------------------------------------- forms
const card = (title, ic, ...kids) => h('div.fcard', h('h3', icon(ic, 17), title), kids);
const N = (o, k, opt = {}) => num(o[k], v => { o[k] = v; upd(opt.re); }, opt);
const Tg = (o, k, re) => toggle(!!o[k], v => { o[k] = v; upd(re); });
const Sel = (o, k, options, re) => select(o[k], options, v => { o[k] = v; upd(re); });
const Snd = (o, k) => soundPick(o[k], v => { o[k] = v; upd(); });
const inl = (label, ctl) => field(label, ctl, { inline: true });

function projOptions() { return [...(S.project.actors.some(a => a.kind === 'projectile') ? [{ group: 'My projectiles', items: S.project.actors.filter(a => a.kind === 'projectile').map(a => ['@' + a.id, a.name]) }] : []), { group: 'Doom', items: BUILTIN_PROJECTILES }]; }
function itemOptions() { const mine = S.project.actors.filter(a => a.kind === 'pickup' || a.kind === 'weapon').map(a => ['@' + a.id, a.name]); return [['', '(nothing)'], ...(mine.length ? [{ group: 'My items', items: mine }] : []), { group: 'Doom', items: BUILTIN_ITEMS }]; }
function replaceOptions(kind) {
  const cat = { monster: ['monsters'], weapon: ['weapons'], pickup: ['items'], prop: ['decor'], projectile: [] }[kind];
  const builtin = kind === 'projectile' ? BUILTIN_PROJECTILES : [...(kind === 'weapon' ? [['Pistol', 'Pistol'], ['Fist', 'Fist']] : []), ...THINGS.filter(t => cat.includes(t.cat)).map(t => [t.cls, t.name])];
  return [['', '(nothing - it is brand new)'], ...builtin];
}

function form(a) {
  const p = a.p, cols = h('div.form-cols');
  const replaces = card('Use in existing Doom maps', 'rotate',
    field('Replaces everywhere', select(a.replaces || '', replaceOptions(a.kind), v => { a.replaces = v; upd(); }), { hint: 'Pick a Doom original and every one of them - in your levels and in the original game - becomes this instead. Perfect for gameplay mods.' }));

  if (a.kind === 'monster') {
    p.melee ||= { on: false, dmg: 10 }; p.ranged ||= { type: 'none', proj: 'DoomImpBall', count: 1, dmg: 9, spread: 0 }; p.sounds ||= {};
    cols.append(
      card('Body', 'heart',
        h('div.fgrid', field('Health', N(p, 'health', { min: 1, max: 100000 })), field('Speed', N(p, 'speed', { min: 0, max: 60 })), field('Width (radius)', N(p, 'radius', { min: 4, max: 256 })), field('Height', N(p, 'height', { min: 4, max: 512 })),
          field('Size %', num(Math.round((p.scale || 1) * 100), v => { p.scale = v / 100; upd(); }, { min: 10, max: 800, step: 10 })), field('Flinch chance %', num(Math.round((p.painChance || 0) / 2.56), v => { p.painChance = Math.round(v * 2.56); upd(); }, { min: 0, max: 100, step: 5 }))),
        inl('Flies', Tg(p, 'flying')),
        h('div.hint', 'For reference: Zombieman 20 health, Imp 60, Pinky 150, Baron 1000. The player moves at about speed 16 and is 56 tall.')),
      card('Attacks', 'zap',
        inl('Close-up attack', Tg(p.melee, 'on', true)),
        p.melee.on && inl('Damage', N(p.melee, 'dmg', { min: 0, max: 10000 })),
        h('div.hr'),
        field('Ranged attack', seg(p.ranged.type, [['none', 'None'], ['proj', 'Projectile'], ['bullets', 'Bullets']], v => { p.ranged.type = v; upd(true); })),
        p.ranged.type === 'proj' && field('Shoots', Sel(p.ranged, 'proj', projOptions())),
        p.ranged.type !== 'none' && h('div.fgrid3', field(p.ranged.type === 'proj' ? 'How many' : 'Bullets', N(p.ranged, 'count', { min: 1, max: 40 })), p.ranged.type === 'bullets' ? field('Damage each', N(p.ranged, 'dmg', { min: 1, max: 1000 })) : null, field('Spread °', N(p.ranged, 'spread', { min: 0, max: 90 }))),
        h('div.hint', 'Want something fancier? Open Behaviour and use "when I attack" blocks - they run on top of these.')),
      card('Sounds', 'volume', field('Spots the player', Snd(p.sounds, 'see')), field('Attacks', Snd(p.sounds, 'attack')), field('Hurt', Snd(p.sounds, 'pain')), field('Dies', Snd(p.sounds, 'death')), field('Idle growl', Snd(p.sounds, 'active'))),
      card('Loot', 'box', field('Drops when killed', Sel(p, 'drop', itemOptions()))), replaces);
  } else if (a.kind === 'weapon') {
    p.attack ||= { type: 'bullets', count: 1, dmg: 10, spread: 4, proj: 'Rocket' };
    const ammoOpts = [['', 'No ammo needed'], { group: 'Doom', items: BUILTIN_AMMO }, ...(S.project.actors.some(x => x.kind === 'pickup' && x.p.effect === 'ammo') ? [{ group: 'My ammo', items: S.project.actors.filter(x => x.kind === 'pickup' && x.p.effect === 'ammo').map(x => ['@' + x.id, x.name]) }] : [])];
    cols.append(
      card('Attack', 'zap',
        field('Type', seg(p.attack.type, [['bullets', 'Bullets'], ['proj', 'Projectile'], ['melee', 'Melee']], v => { p.attack.type = v; upd(true); })),
        p.attack.type === 'proj' && field('Fires', Sel(p.attack, 'proj', projOptions())),
        h('div.fgrid3', p.attack.type !== 'melee' ? field(p.attack.type === 'proj' ? 'Per shot' : 'Pellets', N(p.attack, 'count', { min: 1, max: 60 })) : null, p.attack.type !== 'proj' ? field('Damage each', N(p.attack, 'dmg', { min: 1, max: 100000 })) : null, p.attack.type !== 'melee' ? field('Spread °', N(p.attack, 'spread', { min: 0, max: 45, step: 0.5 })) : null),
        field('Fire sound', Snd(p, 'sound')),
        h('div.hint', 'Fire rate comes from the Firing animation: fewer frames or a lower speed number = faster.')),
      card('Ammo', 'box', field('Uses', Sel(p, 'ammo', ammoOpts, true)), p.ammo ? h('div.fgrid', field('Per shot', N(p, 'ammoUse', { min: 0, max: 100 })), field('Comes with', N(p, 'ammoGive', { min: 0, max: 999 }))) : null,
        h('div.hint', 'To make a new kind of ammo, create a Pickup with the effect "Ammo" and it will show up here.')),
      card('Basics', 'sliders', h('div.fgrid', field('Weapon slot (key 1-9)', N(p, 'slot', { min: 1, max: 9 })), null), field('Pickup message', text(p.msg, v => { p.msg = v; upd(); }))), replaces);
  } else if (a.kind === 'projectile') {
    p.sounds ||= {};
    cols.append(
      card('Flight', 'fire', h('div.fgrid', field('Speed', N(p, 'speed', { min: 1, max: 200 })), field('Damage on hit', N(p, 'dmg', { min: 0, max: 100000 })), field('Width (radius)', N(p, 'radius', { min: 1, max: 64 })), field('Height', N(p, 'height', { min: 1, max: 64 })),
        field('Size %', num(Math.round((p.scale || 1) * 100), v => { p.scale = v / 100; upd(); }, { min: 10, max: 800, step: 10 }))),
        inl('Glows', Tg(p, 'glow')), inl('Falls with gravity (grenade)', Tg(p, 'gravity')), inl('Bounces', Tg(p, 'bounce')), inl('Homes in on its target', Tg(p, 'homing'))),
      card('Explosion', 'zap', h('div.fgrid', field('Blast radius (0 = none)', N(p, 'boom', { min: 0, max: 1024, step: 16 })), field('Blast damage', N(p, 'boomDmg', { min: 0, max: 10000 }))), h('div.hint', 'A rocket is 128 / 128.')),
      card('Sounds', 'volume', field('Launch', Snd(p.sounds, 'see')), field('Impact', Snd(p.sounds, 'death'))), replaces);
  } else if (a.kind === 'pickup') {
    const fx = p.effect || 'item';
    cols.append(
      card('What it does', 'heart',
        field('Effect', select(fx, [['health', 'Heals the player'], ['armor', 'Gives armor'], ['ammo', 'Ammo (for a weapon)'], ['power', 'Timed power-up'], ['item', 'Collectible / key item (count it with blocks)']], v => { p.effect = v; upd(true); })),
        fx === 'power' ? [field('Power', Sel(p, 'power', POWERUPS)), field('Lasts (seconds)', N(p, 'secs', { min: 1, max: 600 }))]
          : h('div.fgrid', field(fx === 'item' ? 'Gives' : 'Amount', N(p, 'amount', { min: 1, max: 9999 })), field(fx === 'health' ? 'Heals up to' : 'Player can hold', N(p, 'max', { min: 1, max: 99999 }))),
        fx === 'item' && h('div.hint', 'Collectibles do nothing on their own. Use blocks like "if the player has ⟨this⟩" to build keys, coins, quest items…')),
      card('Feel', 'star', field('Message', text(p.msg, v => { p.msg = v; upd(); })), field('Sound', Snd(p, 'sound')),
        h('div.fgrid', field('Size %', num(Math.round((p.scale || 1) * 100), v => { p.scale = v / 100; upd(); }, { min: 10, max: 800, step: 10 })), null), inl('Glows', Tg(p, 'glow')), inl('Floats and bobs', Tg(p, 'float'))), replaces);
  } else {
    p.sounds ||= {};
    cols.append(
      card('Body', 'lamp', h('div.fgrid', field('Width (radius)', N(p, 'radius', { min: 1, max: 256 })), field('Height', N(p, 'height', { min: 1, max: 512 })), field('Size %', num(Math.round((p.scale || 1) * 100), v => { p.scale = v / 100; upd(); }, { min: 10, max: 800, step: 10 }))),
        inl('Blocks movement (solid)', Tg(p, 'solid')), inl('Glows in the dark', Tg(p, 'glow')), inl('Hangs from the ceiling', Tg(p, 'hang'))),
      card('Breakable', 'zap', field('Health (0 = cannot be destroyed)', N(p, 'health', { min: 0, max: 100000, re: true })),
        p.health > 0 ? [h('div.fgrid', field('Blast radius', N(p, 'boom', { min: 0, max: 1024, step: 16 })), field('Blast damage', N(p, 'boomDmg', { min: 0, max: 10000 }))), field('Break sound', Snd(p.sounds, 'death'))] : null,
        h('div.hint', 'Props shine with blocks: "when the player presses USE on me" makes switches, shopkeepers, talking signs and secret levers.')), replaces);
  }
  cols.append(card('Animations', 'image', ANIM_SLOTS[a.kind].map(([key, label]) => animRow(a, key, label)),
    h('div.hint', 'Speed is in "tics" - 35 tics make one second. Draw your own frames on the Art page or borrow Doom\'s.')));
  return cols;
}

// ---------------------------------------------------------------- animation rows
function frameCount(src) {
  if (!src) return 0;
  if (src[0] === '@') { const s = byId(S.project.sprites, src.slice(1)); return s ? Math.min(26, s.frames.length) : 0; }
  return Math.min(26, iwadFrameCount(src));
}
async function chooseSprite(current) {
  const mine = S.project.sprites.map(s => ({ id: '@' + s.id, label: '★ ' + s.name, url: s.frames[0] }));
  const doom = iwadPrefixes().map(pf => { const l = iwadFrameLump(pf, 0) || [...R.sprites.keys()].find(n => n.startsWith(pf)); return { id: pf, label: pf, url: l ? `/api/iwad/sprite/${l}.png` : '' }; });
  return pickFromGrid('Choose a sprite (★ = yours)', [...mine, ...doom], current);
}
function animRow(a, key, label) {
  const an = a.anims[key] || (a.anims[key] = { src: '', frames: [], tics: 4 });
  const urls = animFrameUrls(an);
  const prev = h('div.animprev.checker', { style: { backgroundImage: urls[0] ? `url("${urls[0]}")` : '' }, title: 'Click to change the sprite' });
  previews.push({ el: prev, urls, tics: Math.max(1, an.tics || 4), t: 0, i: 0 });
  const pickSrc = async () => { const s = await chooseSprite(an.src); if (!s) return; an.src = s; const n = frameCount(s); an.frames = Array.from({ length: n }, (_, i) => i); delete an.at; upd(true); };
  prev.onclick = pickSrc;
  const n = frameCount(an.src);
  const seq = h('div.frames');
  an.frames.forEach((f, i) => seq.append(h('div.frame.on', { title: 'Click to remove from the sequence', style: { backgroundImage: `url("${frameUrl(an.src, f)}")` }, onclick: () => { an.frames.splice(i, 1); upd(true); } }, h('b', FRAME(f)))));
  const pool = h('div.frames');
  for (let i = 0; i < n; i++) pool.append(h('div.frame', { title: 'Add this frame', style: { backgroundImage: `url("${frameUrl(an.src, i)}")`, width: '30px', height: '30px' }, onclick: () => { an.frames.push(i); upd(true); } }, h('b', FRAME(i))));
  const attackish = (a.kind === 'monster' && (key === 'melee' || key === 'ranged')) || (a.kind === 'weapon' && key === 'fire');
  return h('div.animrow', { style: { alignItems: 'flex-start' } }, prev,
    h('div.col.grow', { style: { gap: '6px' } },
      h('div.row', h('b.grow', label), an.src ? h('span.chip', an.src[0] === '@' ? (byId(S.project.sprites, an.src.slice(1)) || { name: 'deleted' }).name : an.src) : null, btn(an.src ? 'Change' : 'Choose sprite', pickSrc, { kind: 'sm' }),
        an.src ? iconBtn('x', 'Clear', () => { an.src = ''; an.frames = []; upd(true); }, 'ghost sm') : null),
      an.src ? [seq.children.length ? seq : h('div.hint', 'No frames in the sequence - add some below.'),
        h('div.row.wrap', h('span.mute', 'Add:'), pool),
        h('div.row.wrap', h('span.mute', 'Speed'), h('div', { style: { width: '64px' } }, num(an.tics || 4, v => { an.tics = v; upd(true); }, { min: 1, max: 70 })), h('span.mute', 'tics per frame'),
          attackish ? [h('span.mute', { style: { marginLeft: '8px' } }, a.kind === 'weapon' ? 'Shoots on frame' : 'Hits on frame'),
            h('div', { style: { width: '120px' } }, select(an.at === undefined ? 'd' : an.at, [['d', a.kind === 'weapon' ? 'first' : 'last'], ...(a.kind === 'weapon' ? [[-1, 'every frame']] : []), ...an.frames.map((f, i) => [i, `#${i + 1} (${FRAME(f)})`])], v => { if (v === 'd') delete an.at; else an.at = +v; upd(); }))] : null)] : h('div.hint', 'Not set.')));
}

on('img', () => { /* thumbnails are CSS backgrounds and refresh themselves */ });
