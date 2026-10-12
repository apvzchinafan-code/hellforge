// App shell: navigation, top bar, play/export, settings.
import { h, icon, clear, $ } from './core/dom.js';
import { S, api, on, emit, commit, undo, redo, canUndo, canRedo, openProject, saveNow } from './core/store.js';
import { R, loadIwadInfo } from './core/resources.js';
import { toast, modal, field, btn, iconBtn, promptBox } from './core/widgets.js';
import { compileProject } from './compile/compile.js';
import { mapLump } from './compile/names.js';
import { HomePage } from './home.js';
import { LevelPage } from './level/level.js';
import { ThingsPage, openActor } from './things/things.js';
import { ArtPage } from './art/art.js';
import { SoundsPage } from './audio/sounds.js';
import { MusicPage } from './audio/music.js';
import { GamePage } from './game/game.js';

const PAGES = [HomePage, LevelPage, ThingsPage, ArtPage, SoundsPage, MusicPage, GamePage];
let current = null;
const rail = $('#rail'), top = $('#top'), pageEl = $('#page');

function go(id) {
  if (!S.project) id = 'home';
  const page = PAGES.find(p => p.id === id) || HomePage;
  if (current && current.unmount) current.unmount();
  current = page;
  clear(pageEl);
  page.mount(pageEl);
  renderRail(); renderTop();
  if (S.project) sessionStorage.setItem('hf.page', page.id);
}

function renderRail() {
  clear(rail);
  rail.append(h('div.logo', { onclick: () => go('home'), 'data-tip': 'HellForge', 'data-tip-pos': 'right' }, icon('fire', 24, true)));
  for (const p of PAGES) {
    const off = !S.project && p.id !== 'home';
    rail.append(h('div.rail-btn' + (current === p ? '.on' : ''), { style: off ? { opacity: 0.3, pointerEvents: 'none' } : null, onclick: () => go(p.id) }, icon(p.icon, 21), p.title));
  }
  rail.append(h('div.grow'),
    h('div.rail-btn', { onclick: openSettings }, icon('sliders', 20), 'Settings'),
    h('div.rail-btn', { onclick: openHelp }, icon('help', 20), 'Help'));
}

function renderTop() {
  clear(top);
  if (!S.project) { top.append(h('b', { style: { fontSize: '14px' } }, 'HellForge'), h('span.dim', '— make your own Doom game')); return; }
  const states = { saved: 'Saved', dirty: 'Unsaved…', saving: 'Saving…', error: 'Save failed!' };
  top.append(
    h('div.pname.ellip', { 'data-tip': 'Rename project', onclick: async () => { const n = await promptBox('Rename project', 'Project name', S.project.name); if (n) { S.project.name = n; commit(); } } }, S.project.name),
    h('span.chip', current ? current.title : ''),
    h('div.grow'),
    h('div.savestate.' + S.saveState, h('i'), states[S.saveState]),
    h('button.btn.ghost.icon', { 'data-tip': 'Undo (Ctrl+Z)', disabled: !canUndo(), onclick: undo }, icon('undo', 17)),
    h('button.btn.ghost.icon', { 'data-tip': 'Redo (Ctrl+Y)', disabled: !canRedo(), onclick: redo }, icon('redo', 17)),
    h('div.sep'),
    btn('Export', exportPk3, { icon: 'download', tip: 'Build a .pk3 file you can share' }),
    h('button.btn.play', { onclick: () => play(), 'data-tip': 'Build and run in UZDoom (F5)' }, icon('play', 15), 'Play'));
}

// ---------------------------------------------------------------- build / play
function build() {
  const res = compileProject(S.project, { game: R.game });
  return res;
}
async function play(levelId) {
  if (!S.project) return;
  if (!S.server.engineOk || !R.ok) { toast('Set up UZDoom and your Doom WAD first.', 'warn'); return openSettings(); }
  let res;
  try { res = build(); } catch (e) { console.error(e); return toast('Could not build the project: ' + e.message, 'bad', 7000); }
  const li = levelId ? S.project.levels.findIndex(l => l.id === levelId) : -1;
  const map = li >= 0 ? mapLump(li) : res.firstMap;
  const t = toast('Building your game…', 'plain', 60000);
  try {
    await saveNow();
    const r = await api(`projects/${S.slug}/build`, { body: { files: res.files, play: true, map, skill: 3 } });
    t.remove();
    if (!r.ok) return toast(r.error || 'Build failed', 'bad', 7000);
    toast(`Launching UZDoom${S.project.levels.length ? ' · ' + (S.project.levels[Math.max(li, 0)] || {}).name : ''}`, 'good');
    if (res.warnings.length) showProblems(res.warnings, []);
    setTimeout(() => checkLog(res.warnings), 6000);
  } catch (e) { t.remove(); toast(String(e.message || e), 'bad', 7000); }
}
async function checkLog(warnings) {
  try {
    const r = await api(`projects/${S.slug}/log`);
    if (r.problems && r.problems.length) showProblems(warnings, r.problems);
  } catch { /* log not available */ }
}
let problemsModal = null;
function showProblems(warnings, errors) {
  if (problemsModal) problemsModal.close();
  problemsModal = modal({
    title: errors.length ? 'UZDoom reported a problem' : 'Heads up', size: errors.length ? 'wide' : '', onClose: () => { problemsModal = null; },
    body: h('div.problems', warnings.map(w => h('div.problem', w)), errors.map(e => h('div.problem.bad', e)),
      errors.length ? h('div.hint', 'These messages come straight from the game engine. If it mentions a thing you made, open it and check its settings.') : null),
    buttons: [{ label: 'OK', kind: 'primary' }],
  });
}
async function exportPk3() {
  let res;
  try { res = build(); } catch (e) { return toast('Could not build the project: ' + e.message, 'bad', 7000); }
  try {
    await saveNow();
    const r = await api(`projects/${S.slug}/build`, { body: { files: res.files, play: false } });
    if (!r.ok) return toast(r.error || 'Build failed', 'bad');
    modal({
      title: 'Your game is ready', body: [
        h('p.dim', { style: { lineHeight: 1.5 } }, `Built ${S.slug}.pk3 (${(r.size / 1024).toFixed(0)} KB). Anyone with UZDoom or GZDoom and the same Doom WAD can play it by dragging the file onto the game.`),
        h('div.problem', { style: { borderLeftColor: 'var(--good)' } }, r.pk3),
        res.warnings.length ? h('div.problems', res.warnings.map(w => h('div.problem', w))) : null,
      ],
      buttons: [{ label: 'Show in folder', icon: 'folder', onClick: () => api(`projects/${S.slug}/reveal`, { method: 'POST' }) },
        { label: 'Download', icon: 'download', onClick: () => { location.href = `/api/projects/${S.slug}/download`; } }, { label: 'Done', kind: 'primary' }],
    });
  } catch (e) { toast(String(e.message || e), 'bad', 7000); }
}

// ---------------------------------------------------------------- settings / help
export function openSettings() {
  const st = S.server.settings;
  const iw = h('input.input', { value: st.iwad, placeholder: 'C:\\path\\to\\DOOM.WAD' }), en = h('input.input', { value: st.engine, placeholder: 'C:\\path\\to\\uzdoom.exe' });
  modal({
    title: 'Settings', size: 'wide',
    body: [
      field('Doom WAD (the original game data: DOOM.WAD, DOOM2.WAD, Freedoom…)', iw, { hint: S.server.iwadOk ? `Loaded: ${R.game === 'doom2' ? 'Doom II' : 'Doom / Ultimate Doom'} — textures, sprites and sounds come from this file.` : 'Not loaded: ' + (S.server.iwadError || '') }),
      S.server.iwadCandidates.length ? h('div.row.wrap', h('span.hint', 'Found on this PC:'), S.server.iwadCandidates.map(c => h('button.btn.sm', { onclick: () => { iw.value = c; } }, c.split(/[\\/]/).slice(-2).join('/')))) : null,
      field('UZDoom / GZDoom program', en, { hint: S.server.engineOk ? 'Found.' : 'Not found - paste the full path to uzdoom.exe.' }),
    ],
    buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Save', kind: 'primary', onClick: async close => {
      const r = await api('settings', { body: { iwad: iw.value, engine: en.value } });
      S.server = await api('state');
      await loadIwadInfo();
      close();
      toast(r.iwadOk ? 'Settings saved.' : 'Could not read that WAD: ' + r.iwadError, r.iwadOk ? 'good' : 'bad', 5000);
      go(current.id);
    } }],
  });
}
function openHelp() {
  const k = (keys, what) => h('div.row', { style: { justifyContent: 'space-between', padding: '3px 0' } }, h('span.dim', what), h('span.row.gap4', keys.split(' ').map(x => h('span.kbd', x))));
  modal({
    title: 'How HellForge works', size: 'wide',
    body: h('div.fgrid', { style: { gap: '22px' } },
      h('div.col', h('h3', 'The five-minute tour'),
        h('div.hint', { style: { fontSize: '12.5px' }, html: '<b>1. Levels</b> — drag out rooms, connect them, drop in monsters. The 3D view updates live.<br><br><b>2. Things</b> — make your own monsters, weapons, pickups and props. Start from a Doom template, then tweak numbers or snap <b>blocks</b> together for custom behaviour.<br><br><b>3. Art</b> — draw or import sprites and textures. Import from the Doom WAD and recolour to make variants in seconds.<br><br><b>4. Sounds & Music</b> — import files, generate retro sound effects, compose with Doom instruments or import a MIDI.<br><br><b>5. Game</b> — order your levels, set the starting gear, title screen and ending.<br><br>Hit <b>Play</b> any time. <b>Export</b> gives you a .pk3 to share.' })),
      h('div.col', h('h3', 'Level editor keys'),
        k('V R P', 'Select / Room / Custom shape'), k('D S L B X T', 'Door, Stairs, Lift, Block, Exit, Teleporter'), k('Del', 'Delete selection'), k('Ctrl+D', 'Duplicate'), k('Ctrl+C Ctrl+V', 'Copy / paste'),
        k('G', 'Snap on / off'), k('[ ]', 'Smaller / bigger grid'), k('Alt', 'Hold to ignore snapping'), k('Q E', 'Rotate selected thing'), k('PgUp PgDn', 'Room order (which is on top)'), k('F', 'Zoom to fit'), k('Tab', 'Top / Split / 3D'),
        k('Space+drag', 'Pan (or right-drag)'), k('W A S D', 'Fly in the 3D view'), k('F5', 'Play'), k('Ctrl+Z Ctrl+Y', 'Undo / redo'))),
    buttons: [{ label: 'Got it', kind: 'primary' }],
  });
}

// ---------------------------------------------------------------- wiring
on('save', renderTop);
on('change', () => { if (current && current.refresh) current.refresh(); });
on('project', () => { if (!S.project) return go('home'); if (current && current !== HomePage) go(current.id); else go(current ? current.id : 'home'); });
on('nav', t => { if (typeof t === 'string') return go(t); if (t.actor) openActor(t.actor); go(t.page); });
on('play', o => play(o && o.level));
on('settings', openSettings);
window.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
  if (e.key === 'F5') { e.preventDefault(); play(current === LevelPage && S.project && S.project.levels.length ? undefined : undefined); return; }
  if ((e.ctrlKey || e.metaKey) && !typing) {
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    else if (k === 's') { e.preventDefault(); saveNow().then(() => toast('Saved', 'good', 1200)); }
  }
});
window.addEventListener('beforeunload', () => { if (S.saveState === 'dirty') saveNow(); });

(async function boot() {
  try {
    S.server = await api('state');
    await loadIwadInfo();
  } catch (e) {
    document.body.innerHTML = '<div class="empty"><h2>HellForge server is not running</h2><p>Start it with HellForge.bat and reload this page.</p></div>';
    return;
  }
  const last = localStorage.getItem('hf.last');
  if (last && S.server.projects.some(p => p.slug === last)) {
    try { await openProject(last); return go(sessionStorage.getItem('hf.page') || 'home'); } catch { /* fall through to the project picker */ }
  }
  go('home');
  if (!S.server.iwadOk || !S.server.engineOk) toast('Tip: open Settings to point HellForge at your Doom WAD and UZDoom.', 'warn', 6000);
})();
