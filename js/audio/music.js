// Music: import MIDI / audio, compose in a piano roll with General MIDI (Doom) instruments, translate audio to notes.
import { h, icon, clear, clamp, pickFiles, niceName } from '../core/dom.js';
import { S, commit, newId, byId, uploadAsset, assetUrl } from '../core/store.js';
import { toast, modal, field, num, text, select, toggle, slider, btn, iconBtn, confirmBox } from '../core/widgets.js';
import { GM_INSTRUMENTS, DOOM_INSTRUMENTS } from '../data/doom.js';
import { PPQ, midiToSong, doomInstrument, songLength } from './midi.js';
import { SongPlayer, playNote, audioToSong } from './synth.js';
import { audioCtx } from './sfxr.js';

const M = { id: null, track: 0, snap: 24, zx: 0.6, rowH: 13, sx: 0, top: 84, len: 48, sel: null, head: -1, start: 0 };
const COLORS = ['#ff5a36', '#4c8dff', '#35d07f', '#ffb224', '#9b7bff', '#ff5ad1', '#2ad4d4', '#c8d058'];
const DRUMS = { 35: 'Kick 2', 36: 'Kick', 37: 'Rim', 38: 'Snare', 40: 'Snare 2', 41: 'Tom lo', 42: 'Hat', 43: 'Tom', 44: 'Hat ped', 45: 'Tom mid', 46: 'Hat open', 47: 'Tom', 48: 'Tom hi', 49: 'Crash', 51: 'Ride', 57: 'Crash 2' };
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const GUT = 52, RUL = 22;
let root, listEl, mainEl, cv, ctx, cw = 1, ch = 1, drag = null, offs = [], fileSongCache = null;
const player = new SongPlayer();
const cur = () => byId(S.project.music, M.id);
const instOptions = () => [{ group: 'Doom favourites', items: DOOM_INSTRUMENTS.map(i => [i, GM_INSTRUMENTS[i]]) }, { group: 'All instruments', items: GM_INSTRUMENTS.map((n, i) => [i, n]) }];

function demoSong() {
  const bar = PPQ * 4, e = PPQ / 2, bass = [], drums = [], lead = [];
  const riff = [40, 40, 52, 40, 40, 50, 40, 40, 48, 40, 40, 46, 47, 48, 40, 40];
  for (let b = 0; b < 2; b++) {
    riff.forEach((p, i) => bass.push([b * bar * 2 + i * e, e - 6, p, 105]));
    for (let i = 0; i < 16; i++) { const t = b * bar * 2 + i * e; drums.push([t, 12, 42, 80]); if (i % 4 === 0) drums.push([t, 12, 36, 120]); if (i % 4 === 2) drums.push([t, 12, 38, 110]); }
  }
  [[0, 64], [3, 67], [6, 69], [8, 67], [11, 64], [14, 62]].forEach(([i, p]) => lead.push([bar * 2 + i * e, e * 2, p, 100]));
  return { bpm: 140, tracks: [{ name: 'Lead guitar', inst: 30, drum: false, vol: 95, notes: lead }, { name: 'Bass', inst: 34, drum: false, vol: 110, notes: bass }, { name: 'Drums', inst: 0, drum: true, vol: 100, notes: drums }] };
}

export const MusicPage = {
  id: 'music', title: 'Music', icon: 'music',
  mount(el) {
    root = el; offs.forEach(f => f()); offs = [];
    if (!cur()) M.id = S.project.music[0] ? S.project.music[0].id : null;
    listEl = h('div.side-b'); mainEl = h('div.aud-main');
    clear(el).append(h('div.aud', h('div.side.l', h('div.side-h', 'My music'),
      h('div.row', { style: { padding: '10px 10px 0' } }, btn('Compose', () => { const m = { id: newId('m'), name: 'New song', type: 'song', song: demoSong() }; S.project.music.push(m); M.id = m.id; M.track = 0; commit(); MusicPage.mount(root); }, { icon: 'piano', kind: 'sm primary' }), btn('Import', importMusic, { icon: 'upload', kind: 'sm' })), listEl), mainEl));
    const kd = e => { if (!root || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || document.querySelector('.modal-back')) return; const m = cur(); if (!m || m.type !== 'song') return; if (e.code === 'Space') { e.preventDefault(); togglePlay(); } else if ((e.key === 'Delete' || e.key === 'Backspace') && M.sel) { const t = m.song.tracks[M.track]; t.notes = t.notes.filter(n => n !== M.sel); M.sel = null; commit(); } };
    window.addEventListener('keydown', kd);
    offs.push(() => window.removeEventListener('keydown', kd), () => player.stop());
    renderList(); renderMain();
  },
  unmount() { offs.forEach(f => f()); offs = []; root = null; cv = null; },
  refresh() { if (!root) return; renderList(); if (cv) drawRoll(); },
};

function renderList() {
  clear(listEl);
  if (!S.project.music.length) listEl.append(h('div.hint', { style: { padding: '10px 4px' } }, 'Import a MIDI, MP3 or OGG - or compose your own with the same instruments the original Doom soundtrack used.'));
  for (const m of S.project.music) {
    const used = S.project.levels.filter(l => l.music === '@' + m.id).length;
    listEl.append(h('div.item' + (m.id === M.id ? '.on' : ''), { onclick: () => { player.stop(); M.id = m.id; M.track = 0; M.sel = null; M.sx = 0; MusicPage.mount(root); } },
      icon(m.type === 'song' ? 'piano' : 'music', 15), h('span.ellip.grow', m.name), used ? h('span.chip', { title: 'Levels using it' }, icon('map', 11), used) : null, h('span.chip', m.type === 'song' ? 'SONG' : (m.file.split('.').pop() || '').toUpperCase())));
  }
}

async function importMusic() {
  const files = await pickFiles('.mid,.midi,.mus,.ogg,.mp3,.wav,.flac,.mod,.xm,.it,.s3m,audio/*', true);
  let n = 0;
  for (const f of files) {
    let ext = (f.name.split('.').pop() || '').toLowerCase();
    if (ext === 'midi') ext = 'mid';
    if (!['mid', 'mus', 'ogg', 'mp3', 'wav', 'flac', 'mod', 'xm', 'it', 's3m'].includes(ext)) { toast(`${f.name}: that format is not supported.`, 'warn'); continue; }
    const id = newId('m');
    try { await uploadAsset(`${id}.${ext}`, f); S.project.music.push({ id, name: niceName(f.name), type: 'file', file: `${id}.${ext}` }); M.id = id; n++; } catch (e) { toast(String(e.message || e), 'bad'); }
  }
  if (n) { commit(); MusicPage.mount(root); toast(`Imported ${n} track${n > 1 ? 's' : ''}. Assign it to a level below.`, 'good', 4000); }
}

const usedIn = m => h('div.row.wrap', h('span.mute', 'Play in:'),
  S.project.levels.map(l => h('button.btn.sm' + (l.music === '@' + m.id ? '.on' : ''), { onclick: e => { l.music = l.music === '@' + m.id ? '' : '@' + m.id; e.currentTarget.classList.toggle('on'); commit(); } }, l.name)),
  h('button.btn.sm' + (S.project.game.titleMusic === '@' + m.id ? '.on' : ''), { onclick: e => { const g = S.project.game; g.titleMusic = g.titleMusic === '@' + m.id ? '' : '@' + m.id; e.currentTarget.classList.toggle('on'); commit(); } }, 'Title screen'),
  !S.project.levels.length ? h('span.hint', '(make a level first)') : null);

function renderMain() {
  clear(mainEl); cv = null; fileSongCache = null;
  const m = cur();
  if (!m) {
    mainEl.append(h('div.empty', h('div.big', icon('music', 30)), h('h2', 'Give your game a soundtrack'),
      h('p', 'Import any MIDI, MP3, OGG, WAV or tracker file. Or compose in the piano roll with real Doom instruments - distortion guitar, picked bass, drums.'),
      h('div.row', btn('Compose a song', () => listEl.parentElement.querySelector('.btn.primary').click(), { kind: 'primary big', icon: 'piano' }), btn('Import files', importMusic, { kind: 'big', icon: 'upload' }))));
    return;
  }
  if (m.type === 'song') return renderSong(m);
  const ext = m.file.split('.').pop(), isMidi = ext === 'mid', audio = ['ogg', 'mp3', 'wav', 'flac'].includes(ext);
  const pad = h('div.page-pad', { style: { padding: '22px 26px' } });
  const del = iconBtn('trash', 'Delete', async () => { if (!await confirmBox(`Delete "${m.name}"?`, 'Levels using it will fall silent.')) return; S.project.music = S.project.music.filter(x => x !== m); M.id = null; commit(); MusicPage.mount(root); }, 'ghost danger');
  const toSong = async doom => {
    try {
      const song = midiToSong(await (await fetch(assetUrl(m.file))).arrayBuffer());
      if (!song.tracks.length) return toast('No notes found in that MIDI.', 'warn');
      if (doom) for (const t of song.tracks) if (!t.drum) t.inst = doomInstrument(t.inst);
      const nm = { id: newId('m'), name: m.name + (doom ? ' (Doom style)' : ' (editable)'), type: 'song', song };
      S.project.music.push(nm); M.id = nm.id; M.track = 0; commit(); MusicPage.mount(root);
    } catch (e) { toast(String(e.message || e), 'bad'); }
  };
  const card = h('div.fcard', { style: { maxWidth: '820px' } }, h('div.row', h('h3.grow', icon('music', 17), ' ', m.name), h('span.chip', ext.toUpperCase()), del),
    field('Name', text(m.name, v => { m.name = v || m.name; commit(); })), usedIn(m));
  if (audio) {
    card.append(h('audio', { controls: true, src: assetUrl(m.file), style: { width: '100%' } }),
      h('div.hr'), h('h4', icon('wand', 14), 'Translate to Doom instruments (experimental)'),
      h('div.hint', 'HellForge listens to the recording, writes down the notes it can hear and plays them back with Doom-style MIDI instruments. Simple melodies (a hummed tune, a solo instrument, chiptunes) work best; a full band becomes a rough sketch that you can then clean up in the piano roll. The original file stays untouched.'),
      h('div.row', btn('Translate to notes', async e => {
        const b = e.currentTarget; b.disabled = true; b.lastChild.textContent = 'Listening…';
        try {
          const buf = await audioCtx().decodeAudioData(await (await fetch(assetUrl(m.file))).arrayBuffer());
          await new Promise(r => setTimeout(r, 30));
          const song = audioToSong(buf, { poly: 3, bpm: 120 });
          if (!song.tracks.length) { toast('Could not hear any clear notes in that recording.', 'warn'); b.disabled = false; return; }
          const nm = { id: newId('m'), name: m.name + ' (Doom MIDI)', type: 'song', song };
          S.project.music.push(nm); M.id = nm.id; M.track = 0; commit(); MusicPage.mount(root);
          toast('Done! Press Play to hear it, then tidy up the notes.', 'good', 5000);
        } catch (err) { toast('Could not decode that audio file.', 'bad'); b.disabled = false; }
      }, { icon: 'wand', kind: 'primary' })));
  } else if (isMidi) {
    card.append(h('div.row', btn('Preview', async e => {
      if (player.playing) { player.stop(); return; }
      try { fileSongCache ||= midiToSong(await (await fetch(assetUrl(m.file))).arrayBuffer()); player.play(fileSongCache, 0); } catch (err) { toast(String(err.message || err), 'bad'); }
    }, { icon: 'play', kind: 'primary' }), btn('Stop', () => player.stop(), { icon: 'stop' }), h('span.hint', 'Preview uses simple browser synths - in game it sounds like real Doom music.')),
      h('div.hr'), h('h4', icon('piano', 14), 'Edit it'),
      h('div.row.wrap', btn('Open as an editable song', () => toSong(false), { icon: 'piano' }), btn('Translate to Doom instruments', () => toSong(true), { icon: 'wand', tip: 'Swaps every instrument for its Doom-soundtrack equivalent' })),
      h('div.hint', 'The original file plays exactly as it is. Opening it as a song lets you change notes and instruments (tempo changes inside the file are flattened).'));
  } else card.append(h('div.hint', 'This format plays in the game but cannot be previewed here.'));
  pad.append(card);
  mainEl.append(pad);
}

// ---------------------------------------------------------------- piano roll
function togglePlay() {
  const m = cur();
  if (!m || m.type !== 'song') return;
  if (player.playing) return player.stop();
  player.play(m.song, M.start, t => { M.head = t; if (t >= 0 && cv) { const x = GUT + (t - M.sx) * M.zx; if (x > cw - 40) M.sx = t - 40 / M.zx; } drawRoll(); const b = mainEl.querySelector('.playbtn'); if (b) b.classList.toggle('on', t >= 0); });
}
function renderSong(m) {
  const song = m.song;
  M.track = clamp(M.track, 0, Math.max(0, song.tracks.length - 1));
  const tracksEl = h('div.col', { style: { gap: '6px' } });
  const drawTracks = () => {
    clear(tracksEl);
    song.tracks.forEach((t, i) => {
      tracksEl.append(h('div.trk' + (i === M.track ? '.on' : ''), { onclick: e => { if (/SELECT|INPUT|BUTTON/.test(e.target.tagName) || e.target.closest('button')) return; M.track = i; M.sel = null; if (t.drum) M.top = Math.min(M.top, 60); drawTracks(); drawRoll(); } },
        h('span.dot', { style: { background: COLORS[i % COLORS.length] } }),
        h('div.col.grow', { style: { gap: '4px', minWidth: 0 } },
          h('input.input', { value: t.name, style: { height: '24px' }, onchange: e => { t.name = e.target.value || t.name; commit(); } }),
          t.drum ? h('span.mute', { style: { fontSize: '11px' } }, 'Drum kit') : select(t.inst, instOptions(), v => { t.inst = +v; commit(); playNote(t.inst, 60, 0.4); }, { style: 'height:24px' })),
        h('button.btn.ghost.icon.sm' + (t.mute ? '.on' : ''), { 'data-tip': 'Mute', onclick: () => { t.mute = !t.mute; commit(); drawTracks(); } }, icon('volume', 13)),
        h('button.btn.ghost.icon.sm.danger', { 'data-tip': 'Delete track', onclick: () => { song.tracks.splice(i, 1); M.track = 0; commit(); drawTracks(); drawRoll(); } }, icon('x', 13))));
    });
    tracksEl.append(h('div.row', btn('Track', () => { song.tracks.push({ name: 'Track ' + (song.tracks.length + 1), inst: 30, drum: false, vol: 100, notes: [] }); M.track = song.tracks.length - 1; commit(); drawTracks(); drawRoll(); }, { icon: 'plus', kind: 'sm' }),
      btn('Drums', () => { song.tracks.push({ name: 'Drums', inst: 0, drum: true, vol: 100, notes: [] }); M.track = song.tracks.length - 1; M.top = 58; commit(); drawTracks(); drawRoll(); }, { icon: 'plus', kind: 'sm' })));
  };
  cv = h('canvas', { tabindex: 0 });
  ctx = cv.getContext('2d');
  const wrap = h('div.roll-wrap', cv);
  const bar = h('div.lv-bar', { style: { height: '46px', flex: 'none' } },
    h('button.btn.primary.playbtn', { onclick: togglePlay }, icon('play', 14), 'Play'), iconBtn('stop', 'Stop & rewind', () => { player.stop(); M.start = 0; M.sx = 0; drawRoll(); }),
    h('div.sep'), h('span.dim', 'Tempo'), h('div', { style: { width: '70px' } }, num(song.bpm, v => { song.bpm = v; commit(); }, { min: 40, max: 300 })),
    h('span.dim', 'Snap'), select(M.snap, [[96, '1/4 note'], [48, '1/8'], [24, '1/16'], [12, '1/32'], [1, 'Off']], v => { M.snap = +v; drawRoll(); }, { style: 'width:96px' }),
    h('div.sep'),
    btn('Doom-ify', () => { for (const t of song.tracks) if (!t.drum) t.inst = doomInstrument(t.inst); commit(); drawTracks(); toast('Every instrument swapped for its Doom-soundtrack cousin.', 'good'); }, { icon: 'wand', kind: 'sm', tip: 'Translate all instruments to classic Doom ones' }),
    h('div.grow'), iconBtn('search', 'Zoom out', () => { M.zx = Math.max(0.08, M.zx / 1.4); drawRoll(); }), iconBtn('plus', 'Zoom in', () => { M.zx = Math.min(4, M.zx * 1.4); drawRoll(); }),
    iconBtn('trash', 'Delete song', async () => { if (!await confirmBox(`Delete "${m.name}"?`, 'Levels using it will fall silent.')) return; player.stop(); S.project.music = S.project.music.filter(x => x !== m); M.id = null; commit(); MusicPage.mount(root); }, 'ghost danger'));
  mainEl.append(bar, h('div', { style: { display: 'grid', gridTemplateColumns: '250px 1fr', flex: 1, minHeight: 0 } },
    h('div.side.l', h('div.side-b', h('div.col', field('Song name', text(m.name, v => { m.name = v || m.name; commit(); })), usedIn(m), h('div.hr'), h('h4', 'Tracks'), tracksEl,
      h('div.hint', { html: '<b>Click</b> the grid to add a note, <b>drag</b> to move or stretch, <b>right-click</b> to erase. Click the ruler to choose where Play starts. <b>Space</b> plays.' })))),
    wrap));
  drawTracks();
  const ro = new ResizeObserver(() => drawRoll());
  ro.observe(wrap);
  offs.push(() => ro.disconnect());
  bindRoll(m);
  requestAnimationFrame(drawRoll);
}
const tickAt = x => (x - GUT) / M.zx + M.sx;
const pitchAt = y => M.top - Math.floor((y - RUL) / M.rowH);
const sn = t => (M.snap > 1 ? Math.round(t / M.snap) * M.snap : Math.round(t));
function noteAt(track, x, y) {
  const t = tickAt(x), p = pitchAt(y);
  for (let i = track.notes.length - 1; i >= 0; i--) { const n = track.notes[i]; if (n[2] === p && t >= n[0] && t <= n[0] + n[1]) return n; }
  return null;
}
function bindRoll(m) {
  const song = m.song;
  const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey) { const [x] = pos(e), t = tickAt(x); M.zx = clamp(M.zx * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 0.08, 4); M.sx = Math.max(0, t - (x - GUT) / M.zx); }
    else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) M.sx = Math.max(0, M.sx + (e.deltaX || e.deltaY) / M.zx);
    else M.top = clamp(M.top - Math.sign(e.deltaY) * 3, 20, 127);
    drawRoll();
  }, { passive: false });
  cv.addEventListener('pointerdown', e => {
    const tr = song.tracks[M.track];
    if (!tr) return;
    cv.focus(); cv.setPointerCapture(e.pointerId);
    const [x, y] = pos(e);
    if (y < RUL) { M.start = Math.max(0, sn(tickAt(x))); return drawRoll(); }
    const p = pitchAt(y);
    if (x < GUT) { playNote(tr.inst, p, 0.3, 100, tr.drum); return; }
    const hit = noteAt(tr, x, y);
    if (e.button === 2) { if (hit) { tr.notes.splice(tr.notes.indexOf(hit), 1); M.sel = null; commit(); } drag = { erase: true }; return drawRoll(); }
    if (hit) {
      M.sel = hit;
      const edge = GUT + (hit[0] + hit[1] - M.sx) * M.zx - x < 7 && !tr.drum;
      drag = { n: hit, mode: edge ? 'size' : 'move', t0: tickAt(x), p0: p, o: [...hit] };
      playNote(tr.inst, hit[2], 0.2, hit[3], tr.drum);
    } else {
      const n = [Math.max(0, Math.floor(tickAt(x) / Math.max(1, M.snap)) * Math.max(1, M.snap)), tr.drum ? 12 : M.len, p, 100];
      tr.notes.push(n); M.sel = n;
      drag = { n, mode: tr.drum ? 'move' : 'size', t0: tickAt(x), p0: p, o: [...n], fresh: true };
      playNote(tr.inst, p, 0.2, 100, tr.drum);
    }
    drawRoll();
  });
  cv.addEventListener('pointermove', e => {
    const tr = song.tracks[M.track];
    if (!tr) return;
    const [x, y] = pos(e);
    if (!drag) { const hit = y > RUL && x > GUT ? noteAt(tr, x, y) : null; cv.style.cursor = hit ? (GUT + (hit[0] + hit[1] - M.sx) * M.zx - x < 7 && !tr.drum ? 'ew-resize' : 'grab') : y < RUL ? 'pointer' : 'crosshair'; return; }
    if (drag.erase) { const hit = noteAt(tr, x, y); if (hit) { tr.notes.splice(tr.notes.indexOf(hit), 1); drawRoll(); } return; }
    const n = drag.n, dt = tickAt(x) - drag.t0;
    if (drag.mode === 'size') { n[1] = Math.max(M.snap > 1 ? M.snap : 6, sn(drag.o[1] + dt)); M.len = n[1]; }
    else { n[0] = Math.max(0, sn(drag.o[0] + dt)); const np = clamp(drag.o[2] + (pitchAt(y) - drag.p0), 0, 127); if (np !== n[2]) { n[2] = np; playNote(tr.inst, np, 0.15, 100, tr.drum); } }
    drawRoll();
  });
  cv.addEventListener('pointerup', () => { if (!drag) return; drag = null; cur().song.tracks[M.track].notes.sort((a, b) => a[0] - b[0]); commit(); });
}
function drawRoll() {
  const m = cur();
  if (!cv || !m || m.type !== 'song' || !cv.parentElement) return;
  const dpr = window.devicePixelRatio || 1;
  cw = cv.parentElement.clientWidth; ch = cv.parentElement.clientHeight;
  if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const song = m.song, tr = song.tracks[M.track], rows = Math.ceil((ch - RUL) / M.rowH);
  ctx.fillStyle = '#0d0f14'; ctx.fillRect(0, 0, cw, ch);
  for (let r = 0; r < rows; r++) {
    const p = M.top - r, y = RUL + r * M.rowH, black = [1, 3, 6, 8, 10].includes(((p % 12) + 12) % 12);
    ctx.fillStyle = tr && tr.drum ? (r % 2 ? '#10131a' : '#131722') : black ? '#0f1219' : '#151925';
    ctx.fillRect(GUT, y, cw - GUT, M.rowH - 1);
    if (p % 12 === 0 && !(tr && tr.drum)) { ctx.fillStyle = '#232a3b'; ctx.fillRect(GUT, y + M.rowH - 1, cw - GUT, 1); }
  }
  const beat = PPQ, bar = PPQ * 4;
  const step = M.snap > 1 && M.snap * M.zx >= 7 ? M.snap : beat * M.zx >= 7 ? beat : bar;
  for (let t = Math.floor(M.sx / step) * step; (t - M.sx) * M.zx < cw; t += step) {
    const x = Math.round(GUT + (t - M.sx) * M.zx) + 0.5;
    if (x < GUT) continue;
    ctx.strokeStyle = t % bar === 0 ? '#39415a' : t % beat === 0 ? '#232a3b' : '#191d29';
    ctx.beginPath(); ctx.moveTo(x, RUL); ctx.lineTo(x, ch); ctx.stroke();
  }
  song.tracks.forEach((t, i) => {
    if (i === M.track) return;
    ctx.fillStyle = 'rgba(160,168,188,.22)';
    for (const n of t.notes) { const x = GUT + (n[0] - M.sx) * M.zx; if (x > cw || x + n[1] * M.zx < GUT) continue; ctx.fillRect(Math.max(GUT, x), RUL + (M.top - n[2]) * M.rowH + 2, Math.max(2, n[1] * M.zx - 1), M.rowH - 5); }
  });
  if (tr) {
    const col = COLORS[M.track % COLORS.length];
    for (const n of tr.notes) {
      const x = GUT + (n[0] - M.sx) * M.zx, w = Math.max(3, n[1] * M.zx - 1), y = RUL + (M.top - n[2]) * M.rowH;
      if (x > cw || x + w < GUT || y < RUL - M.rowH || y > ch) continue;
      ctx.fillStyle = col; ctx.globalAlpha = 0.55 + 0.45 * (n[3] || 100) / 127;
      ctx.beginPath(); ctx.roundRect(Math.max(GUT, x), y + 0.5, w - Math.max(0, GUT - x), M.rowH - 2, 3); ctx.fill(); ctx.globalAlpha = 1;
      if (n === M.sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1; }
    }
  }
  // ruler
  ctx.fillStyle = '#12151c'; ctx.fillRect(0, 0, cw, RUL);
  ctx.fillStyle = '#6c7489'; ctx.font = '600 10px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (let t = Math.floor(M.sx / bar) * bar; (t - M.sx) * M.zx < cw; t += bar) { const x = GUT + (t - M.sx) * M.zx; if (x >= GUT - 2) ctx.fillText(String(t / bar + 1), x + 4, RUL / 2); }
  const sxp = GUT + (M.start - M.sx) * M.zx;
  if (sxp >= GUT) { ctx.fillStyle = '#35d07f'; ctx.beginPath(); ctx.moveTo(sxp - 5, 3); ctx.lineTo(sxp + 5, 3); ctx.lineTo(sxp, RUL - 3); ctx.closePath(); ctx.fill(); }
  if (M.head >= 0) { const x = GUT + (M.head - M.sx) * M.zx; if (x >= GUT) { ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, ch); ctx.stroke(); } }
  // keys
  ctx.fillStyle = '#12151c'; ctx.fillRect(0, RUL, GUT, ch - RUL);
  ctx.font = '600 9.5px system-ui'; ctx.textAlign = 'right';
  for (let r = 0; r < rows; r++) {
    const p = M.top - r, y = RUL + r * M.rowH, k = ((p % 12) + 12) % 12, black = [1, 3, 6, 8, 10].includes(k);
    if (tr && tr.drum) { ctx.fillStyle = DRUMS[p] ? '#1e2330' : '#12151c'; ctx.fillRect(0, y, GUT - 1, M.rowH - 1); if (DRUMS[p]) { ctx.fillStyle = '#c8cfdf'; ctx.fillText(DRUMS[p], GUT - 5, y + M.rowH / 2); } continue; }
    ctx.fillStyle = black ? '#1b1f2b' : '#cfd5e2'; ctx.fillRect(0, y, black ? GUT * 0.62 : GUT - 1, M.rowH - 1);
    if (k === 0) { ctx.fillStyle = '#39415a'; ctx.fillText(NOTE[k] + (Math.floor(p / 12) - 1), GUT - 5, y + M.rowH / 2); }
  }
  ctx.fillStyle = '#12151c'; ctx.fillRect(0, 0, GUT, RUL);
  ctx.fillStyle = '#6c7489'; ctx.textAlign = 'center'; ctx.fillText(`${Math.round(songLength(song) / bar) || 0} bars`, GUT / 2, RUL / 2);
}
