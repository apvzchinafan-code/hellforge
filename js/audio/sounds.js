// Sounds: import audio files, generate retro effects, browse Doom's own sounds.
import { h, icon, clear, pickFiles, niceName } from '../core/dom.js';
import { S, commit, newId, byId, uploadAsset, assetUrl } from '../core/store.js';
import { R, playSound } from '../core/resources.js';
import { toast, modal, field, text, select, slider, btn, iconBtn, confirmBox } from '../core/widgets.js';
import { PRESETS, mutate, synth, wavBlob, playSamples, drawWave, audioCtx } from './sfxr.js';

const Z = { id: null, q: '' };
let root, listEl, mainEl;
const cur = () => byId(S.project.sounds, Z.id);

export const SoundsPage = {
  id: 'sounds', title: 'Sounds', icon: 'volume',
  mount(el) {
    root = el;
    if (!cur()) Z.id = S.project.sounds[0] ? S.project.sounds[0].id : null;
    listEl = h('div.side-b'); mainEl = h('div.aud-main');
    clear(el).append(h('div.aud', h('div.side.l', h('div.side-h', 'My sounds'), h('div.row', { style: { padding: '10px 10px 0' } }, btn('Generate', () => generator(), { icon: 'wand', kind: 'sm primary' }), btn('Import', importSounds, { icon: 'upload', kind: 'sm' })), listEl), mainEl));
    renderList(); renderMain();
  },
  unmount() { root = null; },
  refresh() { if (root) { renderList(); } },
};

function renderList() {
  clear(listEl);
  if (!S.project.sounds.length) listEl.append(h('div.hint', { style: { padding: '10px 4px' } }, 'No custom sounds yet. Generate a retro effect in one click or import WAV, OGG, MP3 or FLAC files.'));
  for (const s of S.project.sounds) {
    listEl.append(h('div.item' + (s.id === Z.id ? '.on' : ''), { onclick: () => { Z.id = s.id; renderList(); renderMain(); } },
      h('button.btn.ghost.icon.sm', { onclick: e => { e.stopPropagation(); playSound('@' + s.id); } }, icon('play', 13)), h('span.ellip.grow', s.name), h('span.chip', s.gen ? 'made' : (s.file.split('.').pop() || '').toUpperCase())));
  }
}

async function importSounds() {
  const files = await pickFiles('.wav,.ogg,.mp3,.flac,audio/*', true);
  let n = 0;
  for (const f of files) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!['wav', 'ogg', 'mp3', 'flac'].includes(ext)) { toast(`${f.name}: use WAV, OGG, MP3 or FLAC.`, 'warn'); continue; }
    if (f.size > 30 * 1024 * 1024) { toast(`${f.name} is very large - sounds should be short.`, 'warn'); continue; }
    const id = newId('n');
    try { await uploadAsset(`${id}.${ext}`, f); S.project.sounds.push({ id, name: niceName(f.name), file: `${id}.${ext}`, vol: 1 }); Z.id = id; n++; } catch (e) { toast(String(e.message || e), 'bad'); }
  }
  if (n) { commit(); renderList(); renderMain(); toast(`Imported ${n} sound${n > 1 ? 's' : ''}.`, 'good'); }
}

function generator(edit) {
  let p = edit ? { ...edit.gen } : PRESETS['Laser / shot'](), samples = synth(p), name = edit ? edit.name : 'New sound';
  const wave = h('canvas.wavebox');
  const sliders = h('div.fgrid');
  const play = () => { samples = synth(p); playSamples(samples); requestAnimationFrame(() => drawWave(wave, samples)); };
  const drawSliders = () => {
    clear(sliders);
    const sl = (label, key, min, max) => field(label, slider(Math.round((p[key] || 0) * 100), min * 100, max * 100, 1, v => { p[key] = v / 100; play(); }));
    sliders.append(field('Wave', select(p.wave, [[0, 'Square (beepy)'], [1, 'Sawtooth (buzzy)'], [2, 'Sine (smooth)'], [3, 'Noise (hiss / boom)']], v => { p.wave = +v; play(); })),
      sl('Pitch', 'freq', 0.02, 1), sl('Pitch slide', 'slide', -0.8, 0.8), sl('Length', 'sustain', 0, 1), sl('Fade out', 'decay', 0, 1), sl('Punch', 'punch', 0, 1),
      sl('Wobble depth', 'vibDepth', 0, 1), sl('Wobble speed', 'vibSpeed', 0, 1), sl('Muffle (low-pass)', 'lpf', 0.05, 1), sl('Thin (high-pass)', 'hpf', 0, 0.8), sl('Echo / phaser', 'phaser', -1, 1), sl('Volume', 'vol', 0.1, 1));
  };
  const nameIn = text(name, v => { name = v; }, { live: v => { name = v; } });
  modal({ title: edit ? `Edit "${edit.name}"` : 'Sound maker', size: 'wide', body: [
    h('div.hint', 'Click a button until you hear something you like. Each click rolls a new variation. Fine-tune with the sliders.'),
    h('div.sfx-grid', Object.keys(PRESETS).map(k => h('button.btn', { onclick: () => { p = PRESETS[k](); if (!edit && (name === 'New sound' || Object.keys(PRESETS).includes(name))) { name = k; nameIn.value = k; } drawSliders(); play(); } }, k))),
    wave,
    h('div.row', btn('Play', play, { icon: 'play', kind: 'primary' }), btn('Mutate', () => { p = mutate(p); drawSliders(); play(); }, { icon: 'wand', tip: 'Change it a little' }), h('div.grow'), h('div', { style: { width: '240px' } }, nameIn)),
    sliders],
  buttons: [{ label: 'Cancel', kind: 'ghost' }, { label: edit ? 'Save changes' : 'Add to my sounds', kind: 'primary', icon: 'check', onClick: async c => {
    samples = synth(p);
    const id = edit ? edit.id : newId('n'), file = `${id}.wav`;
    try {
      await uploadAsset(file, wavBlob(samples));
      if (edit) { edit.gen = p; edit.name = name || edit.name; edit.rev = (edit.rev || 0) + 1; }
      else { S.project.sounds.push({ id, name: name || 'Sound', file, gen: p, vol: 1 }); Z.id = id; }
      commit(); renderList(); renderMain(); c(); toast('Sound saved.', 'good');
    } catch (e) { toast(String(e.message || e), 'bad'); }
  } }] });
  drawSliders();
  setTimeout(() => drawWave(wave, samples), 60);
}

function renderMain() {
  clear(mainEl);
  const s = cur();
  const pad = h('div.page-pad', { style: { padding: '22px 26px' } });
  mainEl.append(pad);
  if (s) {
    const wave = h('canvas.wavebox');
    pad.append(h('div.fcard', { style: { maxWidth: '820px', marginBottom: '22px' } },
      h('div.row', h('h3.grow', icon('volume', 17), ' ', s.name), s.gen ? btn('Edit in sound maker', () => generator(s), { icon: 'wand', kind: 'sm' }) : null,
        iconBtn('trash', 'Delete', async () => { if (!await confirmBox(`Delete "${s.name}"?`, 'Things that use this sound will become silent.')) return; S.project.sounds = S.project.sounds.filter(x => x !== s); Z.id = null; commit(); SoundsPage.mount(root); }, 'ghost danger')),
      wave,
      h('div.fgrid', field('Name', text(s.name, v => { s.name = v || s.name; commit(); renderMain(); })), field('Volume in game', slider(Math.round((s.vol ?? 1) * 100), 10, 100, 5, v => { s.vol = v / 100; commit(); }, { fmt: v => v + '%' }))),
      h('div.row', btn('Play', () => playSound('@' + s.id), { icon: 'play', kind: 'primary' }), h('span.hint', 'Use it from any sound drop-down: monsters, weapons, pickups and the "play sound" block.'))));
    fetch(assetUrl(s.file) + '?r=' + (s.rev || 0)).then(r => r.arrayBuffer()).then(b => audioCtx().decodeAudioData(b)).then(buf => { if (wave.isConnected) drawWave(wave, buf.getChannelData(0)); }).catch(() => {});
  } else {
    pad.append(h('div.fcard', { style: { maxWidth: '820px', marginBottom: '22px', alignItems: 'flex-start' } }, h('h3', icon('wand', 17), 'Make your first sound'),
      h('p.dim', 'The sound maker rolls retro laser zaps, explosions, pickups and monster growls. Or import your own recordings.'),
      h('div.row', btn('Open sound maker', () => generator(), { icon: 'wand', kind: 'primary' }), btn('Import files', importSounds, { icon: 'upload' }))));
  }
  // Doom library
  const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '6px' } });
  const draw = () => {
    clear(grid);
    const q = Z.q.toLowerCase();
    for (const [name] of R.sounds.filter(x => !q || x[0].includes(q))) grid.append(h('div.item', { style: { background: 'var(--panel)', border: '1px solid var(--line)' }, onclick: () => playSound(name) }, icon('play', 12), h('span.ellip', { style: { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '11.5px' } }, name)));
    if (!R.sounds.length) grid.append(h('div.hint', 'Load a Doom WAD in Settings to hear the original sounds.'));
  };
  pad.append(h('div.row', { style: { marginBottom: '10px' } }, h('h4.grow', 'Doom sound library - click to listen'), h('input.input', { placeholder: 'Search…', value: Z.q, style: { width: '220px' }, oninput: e => { Z.q = e.target.value; draw(); } })), grid);
  draw();
}
