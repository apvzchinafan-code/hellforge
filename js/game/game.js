// Game: campaign order, player setup, title screen, ending, game-wide events.
import { h, icon, clear, pickFiles, fileToDataURL, loadImage } from '../core/dom.js';
import { S, commit, emit } from '../core/store.js';
import { R, musicOptions } from '../core/resources.js';
import { toast, field, num, text, select, toggle, btn, iconBtn, confirmBox, promptBox } from '../core/widgets.js';
import { BUILTIN_ITEMS } from '../data/doom.js';
import { openLevel, newLevel } from '../level/level.js';
import { openScripts } from '../blocks/editor.js';
import { compileProject } from '../compile/compile.js';

let root;
const card = (title, ic, ...kids) => h('div.fcard', h('h3', icon(ic, 17), title), kids);

export const GamePage = {
  id: 'game', title: 'Game', icon: 'flag',
  mount(el) { root = el; render(); },
  unmount() { root = null; },
  refresh() { /* edits here re-render explicitly */ },
};

function itemOptions() {
  const mine = S.project.actors.filter(a => a.kind === 'weapon' || a.kind === 'pickup').map(a => ['@' + a.id, a.name]);
  return [...(mine.length ? [{ group: 'My things', items: mine }] : []), { group: 'Doom', items: BUILTIN_ITEMS }];
}

function render() {
  if (!root) return;
  const p = S.project, g = p.game, pl = g.player;
  const re = () => { commit(); render(); };
  const levels = h('div.col');
  p.levels.forEach((l, i) => {
    levels.append(h('div.maprow', h('div.num', i + 1),
      h('div.col.grow', { style: { gap: '2px', minWidth: 0 } }, h('b.ellip', l.name), h('span.mute', { style: { fontSize: '11.5px' } }, `${l.rooms.length} rooms · ${l.things.length} things${i === p.levels.length - 1 ? ' · last level, then the ending' : ''}`)),
      h('div', { style: { width: '170px' } }, select(l.music, musicOptions(), v => { l.music = v; commit(); })),
      iconBtn('up', 'Earlier', () => { if (i > 0) { p.levels.splice(i - 1, 0, p.levels.splice(i, 1)[0]); re(); } }),
      iconBtn('dn', 'Later', () => { if (i < p.levels.length - 1) { p.levels.splice(i + 1, 0, p.levels.splice(i, 1)[0]); re(); } }),
      iconBtn('pencil', 'Rename', async () => { const n = await promptBox('Rename level', 'Level name', l.name); if (n) { l.name = n; re(); } }),
      btn('Edit', () => openLevel(l.id), { kind: 'sm', icon: 'map' }), btn('Play', () => emit('play', { level: l.id }), { kind: 'sm', icon: 'play' }),
      iconBtn('trash', 'Delete', async () => { if (await confirmBox('Delete level?', `"${l.name}" will be removed. Undo with Ctrl+Z.`)) { p.levels.splice(i, 1); re(); } }, 'ghost danger')));
  });
  if (!p.levels.length) levels.append(h('div.hint', 'No levels - this project is a gameplay mod. Press Play and your custom things take over the original Doom maps (anything with "Replaces" set).'));

  const items = h('div.col', { style: { gap: '6px' } });
  pl.items ||= [];
  pl.items.forEach((it, i) => {
    items.append(h('div.row', h('div.grow', select(it.cls, itemOptions(), v => { it.cls = v; commit(); })), h('span.mute', '×'), h('div', { style: { width: '70px' } }, num(it.n || 1, v => { it.n = v; commit(); }, { min: 1, max: 999 })),
      iconBtn('up', 'Move up', () => { if (i > 0) { pl.items.splice(i - 1, 0, pl.items.splice(i, 1)[0]); re(); } }, 'ghost sm'), iconBtn('x', 'Remove', () => { pl.items.splice(i, 1); re(); }, 'ghost sm')));
  });

  const pic = h('div.titlepic', { style: { backgroundImage: g.titlePic ? `url("${g.titlePic}")` : '' }, onclick: async () => {
    const [f] = await pickFiles('image/*');
    if (!f) return;
    try {
      const img = await loadImage(await fileToDataURL(f));
      const c = document.createElement('canvas'); c.width = 320; c.height = 200;
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
      const s = Math.max(320 / img.width, 200 / img.height);
      x.drawImage(img, (320 - img.width * s) / 2, (200 - img.height * s) / 2, img.width * s, img.height * s);
      g.titlePic = c.toDataURL('image/png'); re();
    } catch { toast('Could not read that picture.', 'bad'); }
  } }, g.titlePic ? null : h('div.col.center', icon('upload', 24), 'Click to choose a title picture'));

  const problems = h('div.problems');
  const check = () => {
    clear(problems);
    try { const r = compileProject(p, { game: R.game }); if (!r.warnings.length) problems.append(h('div.problem', { style: { borderLeftColor: 'var(--good)' } }, 'No problems found. Ready to play!')); for (const w of r.warnings) problems.append(h('div.problem', w)); }
    catch (e) { problems.append(h('div.problem.bad', String(e.message || e))); }
  };

  clear(root).append(h('div', { style: { height: '100%', overflow: 'auto' } }, h('div.form-cols', { style: { gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', maxWidth: '1500px' } },
    h('div.fcard', { style: { gridColumn: '1 / -1' } }, h('div.row', h('h3.grow', icon('map', 17), 'Levels, in the order they are played'), btn('New level', async () => { const n = await promptBox('New level', 'Level name', 'Level ' + (p.levels.length + 1), 'Create'); if (n === null) return; const l = newLevel(n || undefined); commit(); openLevel(l.id); }, { icon: 'plus', kind: 'sm primary' })), levels),
    card('Your game', 'flag',
      field('Title (shown in the New Game menu)', text(p.name, v => { p.name = v || p.name; commit(); })), field('Made by', text(p.author, v => { p.author = v; commit(); })),
      field('Ending text (after the last level)', text(g.endText, v => { g.endText = v; commit(); }, { area: true, rows: 4 })),
      field('Player can jump', toggle(g.allowJump !== false, v => { g.allowJump = v; commit(); }), { inline: true }),
      field('Player can crouch', toggle(g.allowCrouch !== false, v => { g.allowCrouch = v; commit(); }), { inline: true })),
    card('The player', 'user',
      h('div.fgrid3', field('Health', num(pl.health, v => { pl.health = v; commit(); }, { min: 1, max: 10000 })), field('Speed ×', num(pl.speed, v => { pl.speed = v; commit(); }, { min: 0.2, max: 3, step: 0.1 })), field('Jump power', num(pl.jump, v => { pl.jump = v; commit(); }, { min: 0, max: 40 }))),
      h('h4', 'Starts with'), items,
      btn('Add item', () => { pl.items.push({ cls: 'Shotgun', n: 1 }); re(); }, { icon: 'plus', kind: 'sm' }),
      h('div.hint', 'The first weapon in the list is the one in your hands when the game starts. Remember to add ammo for it.')),
    card('Title screen', 'image', pic,
      h('div.row', g.titlePic ? btn('Remove picture', () => { g.titlePic = null; re(); }, { kind: 'sm', icon: 'x' }) : null, h('span.hint', 'Any picture works - it is fitted to 320×200 like classic Doom.')),
      field('Title music', select(g.titleMusic, musicOptions(), v => { g.titleMusic = v; commit(); }))),
    card('Game-wide events', 'blocks',
      h('div.hint', 'Blocks here run on every level: a score counter, a "kill 10 imps" quest, a secret that follows the player through the whole game. (Events for one level live in that level\'s menu.)'),
      h('div.row', btn(`Edit events${p.scripts.length ? ' (' + p.scripts.length + ')' : ''}`, () => openScripts(p, 'game', 'Game-wide events'), { icon: 'blocks' }), p.vars.length ? h('span.chip', `${p.vars.length} shared variable${p.vars.length > 1 ? 's' : ''}`) : null)),
    card('Ready to ship?', 'check',
      h('div.row', h('button.btn.play', { onclick: () => emit('play', {}) }, icon('play', 15), 'Play from the start'), btn('Check for problems', check, { icon: 'bug' })), problems,
      h('div.hint', 'Export (top right) writes a single .pk3 file. Players need UZDoom or GZDoom plus the same Doom WAD you built against.')))));
}
