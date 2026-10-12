// Home: project picker (no project open) or project dashboard.
import { h, icon, clear } from './core/dom.js';
import { S, api, emit, openProject, createProject, closeProject, blankProject } from './core/store.js';
import { R, texExists } from './core/resources.js';
import { toast, modal, field, btn, confirmBox } from './core/widgets.js';
import { starterProject } from './data/starter.js';

const ago = ms => { const m = (Date.now() - ms) / 60000; return m < 1 ? 'just now' : m < 60 ? `${Math.round(m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };

function newProjectDialog() {
  let kind = 'starter';
  const name = h('input.input', { value: 'My Doom Game', maxlength: 40 });
  const opts = h('div.col');
  const draw = () => {
    clear(opts);
    for (const [id, title, text, ic] of [
      ['starter', 'Starter level', 'A small playable map with a door, stairs, monsters and an exit. Best way to learn - change it and hit Play.', 'map'],
      ['blank', 'Empty game', 'Start from nothing and build every level yourself.', 'square'],
      ['mod', 'Gameplay mod', 'No levels - make new monsters, weapons and items that change the original Doom maps.', 'ghost'],
    ]) {
      opts.append(h('div.item' + (kind === id ? '.on' : ''), { style: { padding: '10px 12px', alignItems: 'flex-start' }, onclick: () => { kind = id; draw(); } },
        h('div.cico', { style: { width: '38px', height: '38px', borderRadius: '10px', background: 'var(--panel3)', display: 'grid', placeItems: 'center', flex: 'none' } }, icon(ic, 19)),
        h('div', h('b', { style: { color: 'var(--text)' } }, title), h('div.hint', text))));
    }
  };
  draw();
  modal({
    title: 'New project', body: [field('Name', name), field('Start with', opts)],
    buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Create', kind: 'primary', icon: 'plus', onClick: async close => {
      const n = name.value.trim() || 'My Doom Game';
      const proj = kind === 'starter' ? starterProject(n, t => !R.ok || texExists(t)) : blankProject(n);
      try { await createProject(n, proj); close(); emit('nav', kind === 'mod' ? 'things' : 'levels'); toast(kind === 'starter' ? 'Project created - press Play to try your starter level!' : 'Project created.', 'good', 4500); }
      catch (e) { toast(String(e.message || e), 'bad'); }
    } }],
  });
}

function projectCards(el, projects) {
  const cards = h('div.pcards');
  cards.append(h('div.pcard.new', { onclick: newProjectDialog }, icon('plus', 26), h('b', 'New project')));
  for (const p of projects) {
    cards.append(h('div.pcard' , { onclick: async () => { try { await openProject(p.slug); emit('nav', 'home'); } catch (e) { toast(String(e.message || e), 'bad'); } } },
      h('h3.ellip', p.name),
      h('div.row.wrap', h('span.chip', icon('map', 12), `${p.levels || 0} levels`), h('span.chip', icon('ghost', 12), `${p.actors || 0} things`)),
      h('div.grow'), h('span.mute', 'Edited ' + ago(p.modified)),
      h('button.btn.ghost.icon.sm.danger.del', { 'data-tip': 'Delete project', onclick: async e => {
        e.stopPropagation();
        if (!await confirmBox('Delete project?', `"${p.name}" will be moved to the projects/.trash folder.`)) return;
        await api('projects/' + p.slug, { method: 'DELETE' });
        if (S.slug === p.slug) closeProject();
        S.server = await api('state'); HomePage.mount(el);
      } }, icon('trash', 15))));
  }
  return cards;
}

export const HomePage = {
  id: 'home', title: 'Home', icon: 'home',
  async mount(el) {
    this.el = el;
    clear(el);
    const pad = h('div.page-pad');
    el.append(pad);
    try { S.server = await api('state'); } catch { /* keep stale list */ }
    if (this.el !== el) return;
    const p = S.project;
    if (!p) {
      pad.append(
        h('div.hero', h('div.logo', icon('fire', 36, true)), h('div', h('h1', 'HellForge'), h('p', 'Build a whole Doom game - levels, monsters, weapons, art, sound and music - without writing code.'))),
        (!S.server.iwadOk || !S.server.engineOk) ? h('div.problem', { style: { marginBottom: '18px', maxWidth: '760px' } }, h('div.grow', !S.server.iwadOk ? 'No Doom WAD found yet. HellForge needs one for textures, sprites and to run your game.' : 'UZDoom was not found, so Play will not work yet.'), btn('Open Settings', () => emit('settings'), { kind: 'sm' })) : null,
        h('h4', { style: { marginBottom: '10px' } }, S.server.projects.length ? 'Your projects' : 'Start here'),
        projectCards(el, S.server.projects));
      return;
    }
    const stat = (page, ic, n, label) => h('div.card', { onclick: () => emit('nav', page) }, h('div.cico', icon(ic, 21)), h('h2', String(n)), h('span.dim', label));
    const step = (n, page, title, text) => h('div.step', { onclick: () => emit('nav', page) }, h('div.n', n), h('div', h('b', title), h('span', text)));
    pad.append(
      h('div.row', { style: { marginBottom: '22px' } },
        h('div.grow', h('h1', p.name), h('p.dim', { style: { marginTop: '4px' } }, `Building for ${R.ok ? (R.game === 'doom2' ? 'Doom II' : 'Doom / Ultimate Doom') : 'no WAD loaded'} · runs in UZDoom`)),
        btn('Switch project', () => { closeProject(); }, { icon: 'folder' }),
        h('button.btn.play.big', { onclick: () => emit('play', {}) }, icon('play', 16), 'Play game')),
      h('div.cards', { style: { gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', marginBottom: '26px' } },
        stat('levels', 'map', p.levels.length, 'Levels'), stat('things', 'ghost', p.actors.length, 'Custom things'), stat('art', 'image', p.sprites.length + p.textures.length, 'Sprites & textures'),
        stat('sounds', 'volume', p.sounds.length, 'Sounds'), stat('music', 'music', p.music.length, 'Music tracks')),
      h('h4', 'What do you want to make?'),
      h('div.steps',
        step('1', 'levels', 'Build a level', 'Drag out rooms, add doors and stairs, drop in monsters. See it in 3D instantly.'),
        step('2', 'things', 'Invent a monster or weapon', 'Start from an Imp or a shotgun, change the numbers, add block scripts.'),
        step('3', 'art', 'Draw or import art', 'Pixel editor, sprite-sheet import, and one-click recolours of Doom sprites.'),
        step('4', 'sounds', 'Make some noise', 'Import sounds or generate retro effects with one click.'),
        step('5', 'music', 'Add music', 'Import MIDI/MP3/OGG or compose with classic Doom instruments.'),
        step('6', 'game', 'Finish the game', 'Level order, starting weapons, title screen and ending text.')),
      h('h4', { style: { margin: '28px 0 10px' } }, 'All projects'),
      projectCards(el, S.server.projects));
  },
  refresh() { /* dashboard numbers update on next visit */ },
};
