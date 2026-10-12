// Project -> list of PK3 files. Runs in the browser (Play / Export) and in Node (tests).
import { levelToTextmap, makeWad } from './udmf.js';
import { genActor, genPlayer, genGlobals, genHandler } from './zscript.js';
import { HF_LIB } from './lib.js';
import { texLump, sprPrefix, actorClass, actorEd, soundName, soundLump, musicLump, mapLump, FRAME } from './names.js';
import { THING_BY_CLS } from '../data/doom.js';
import { songToMidi } from '../audio/midi.js';

// ---------------------------------------------------------------- bytes
export function b64ToBytes(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
export function bytesToB64(u) { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
const dataB64 = url => String(url || '').split(',')[1] || '';
let crcT;
function crc32(u) {
  if (!crcT) { crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < u.length; i++) c = crcT[(c ^ u[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
// Insert a grAb chunk (sprite offsets) right after the PNG header.
export function pngWithOffsets(png, ox, oy) {
  if (png.length < 33) return png;
  const c = new Uint8Array(20), dv = new DataView(c.buffer);
  dv.setUint32(0, 8); c.set([0x67, 0x72, 0x41, 0x62], 4); dv.setInt32(8, ox); dv.setInt32(12, oy);
  dv.setUint32(16, crc32(c.subarray(4, 16)));
  const out = new Uint8Array(png.length + 20);
  out.set(png.subarray(0, 33), 0); out.set(c, 33); out.set(png.subarray(33), 53);
  return out;
}
const safeName = s => /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(s || '')) ? String(s) : null;
const mq = s => '"' + String(s ?? '').replace(/\\/g, '').replace(/"/g, "'").replace(/\r?\n/g, '\\n') + '"';

export function makeEnv(project) {
  const tags = new Map(), tids = new Map();
  const actor = ref => (ref && ref[0] === '@' ? project.actors.find(a => a.id === ref.slice(1)) : null);
  const env = {
    project,
    tag(name) { if (!name) return 0; if (!tags.has(name)) tags.set(name, tags.size + 1); return tags.get(name); },
    tid(name) { if (!name) return 0; if (!tids.has(name)) tids.set(name, tids.size + 1000); return tids.get(name); },
    tagOf(name) { return env.tag(name); },
    cls(ref) { if (!ref) return null; if (ref[0] === '@') { const a = actor(ref); return a ? actorClass(a) : null; } return safeName(ref); },
    ammoCls(ref) { if (!ref) return null; if (ref[0] === '@') { const a = actor(ref); return a && a.kind === 'pickup' && a.p.effect === 'ammo' ? actorClass(a) : null; } return safeName(ref); },
    snd(ref) { if (!ref) return ''; if (ref[0] === '@') { const s = project.sounds.find(x => x.id === ref.slice(1)); return s ? soundName(s) : ''; } return /^[\w/*-]+$/.test(ref) ? ref : ''; },
    lump(id) { const i = project.levels.findIndex(l => l.id === id); return i >= 0 ? mapLump(i) : ''; },
    spr(src) { if (!src) return null; if (src[0] === '@') { const s = project.sprites.find(x => x.id === src.slice(1)); return s && s.frames.length ? sprPrefix(s) : null; } return /^[A-Z0-9]{4}$/.test(src) ? src : null; },
    varRef(ref, cx) {
      const [scope, id] = String(ref || '').split(':');
      if (scope === 'L' && (cx.owner.vars || []).some(v => v.id === id)) return (cx.kind === 'weapon' ? 'invoker.' : '') + 'hfv_' + id;
      if (scope === 'G' && (project.vars || []).some(v => v.id === id)) return `HFG.Get().v_${id}`;
      return 'HFG.Get().dummy';
    },
    edNum(type) { if (!type) return 0; if (type[0] === '@') { const a = actor(type); return a && a.kind !== 'projectile' ? actorEd(a) : 0; } return THING_BY_CLS[type] ? THING_BY_CLS[type].ed : 0; },
    thingName(type) { if (type && type[0] === '@') { const a = actor(type); return a ? a.name : 'thing'; } return THING_BY_CLS[type] ? THING_BY_CLS[type].name : 'thing'; },
    musicRef(ref) { if (!ref) return ''; if (ref[0] === '@') { const m = project.music.find(x => x.id === ref.slice(1)); return m ? musicLump(m) : ''; } return /^[A-Za-z0-9_]{1,8}$/.test(ref) ? ref : ''; },
  };
  return env;
}

// opts.game: 'doom1' | 'doom2' (which IWAD we are building against)
export function compileProject(project, opts = {}) {
  const files = [], warnings = [], env = makeEnv(project);
  const game = opts.game || 'doom1';

  // ---- ZScript
  let zs = 'version "4.10"\n\n' + HF_LIB + '\n' + genGlobals(project) + '\n' + genPlayer(project, env) + '\n';
  const hudSprites = new Set();
  for (const a of project.actors) {
    try { zs += genActor(a, env) + '\n'; } catch (e) { warnings.push(`"${a.name}" could not be built: ${e.message}`); }
    if (a.kind === 'weapon') for (const k of ['ready', 'fire', 'flash']) if (a.anims[k] && a.anims[k].src && a.anims[k].src[0] === '@') hudSprites.add(a.anims[k].src.slice(1));
  }
  const gameHandler = genHandler('HF_Game', project, 'game', env);
  zs += gameHandler;
  const levelHandlers = project.levels.map(l => { const cls = 'HF_Lv_' + l.id; const src = genHandler(cls, l, 'level', env); zs += src; return src ? cls : ''; });
  files.push({ path: 'zscript.txt', text: zs });

  // ---- maps
  project.levels.forEach((l, i) => {
    const tidById = new Map();
    for (const t of l.things) if (t.name || t.type === 'TeleportDest' || t.type === 'MapSpot') tidById.set(t.id, env.tid(t.name || t.id));
    const lenv = { ...env, tidOfThing: id => tidById.get(id) || 0 };
    const { text, warnings: w } = levelToTextmap(l, lenv);
    warnings.push(...w);
    for (const r of l.rooms) if (r.kind === 'teleport' && !tidById.get(r.dest)) warnings.push(`"${l.name}": teleporter "${r.name}" has no destination yet.`);
    const wad = makeWad([{ name: mapLump(i), data: new Uint8Array(0) }, { name: 'TEXTMAP', data: text }, { name: 'ENDMAP', data: new Uint8Array(0) }]);
    files.push({ path: `maps/${mapLump(i)}.wad`, b64: bytesToB64(wad) });
  });

  // ---- MAPINFO
  const g = project.game;
  let mi = `// Made with HellForge\nGameInfo\n{\n\tPlayerClasses = "HF_Player"\n${gameHandler ? '\tAddEventHandlers = "HF_Game"\n' : ''}`;
  const tm = env.musicRef(g.titleMusic);
  if (tm) mi += `\tTitleMusic = ${mq(tm)}\n`;
  mi += '}\n\n';
  const eds = project.actors.filter(a => a.kind !== 'projectile').map(a => `\t${actorEd(a)} = ${actorClass(a)}`);
  if (eds.length) mi += `DoomEdNums\n{\n${eds.join('\n')}\n}\n\n`;
  if (project.levels.length) {
    mi += `clearepisodes\nepisode ${mapLump(0)}\n{\n\tname = ${mq(project.name || 'My Game')}\n}\n\n`;
    mi += `cluster 1\n{\n\tflat = "FLOOR4_8"\n\tmusic = "${game === 'doom2' ? 'D_READ_M' : 'D_VICTOR'}"\n\texittext = ${String(g.endText || 'The End').split(/\r?\n/).map(mq).join(',\n\t\t')}\n}\n\n`;
    mi += `defaultmap\n{\n\tcluster = 1\n\t${g.allowJump === false ? 'nojump' : 'allowjump'}\n\t${g.allowCrouch === false ? 'nocrouch' : 'allowcrouch'}\n}\n\n`;
    const ending = game === 'doom2' ? 'EndGameC' : 'EndGame1';
    project.levels.forEach((l, i) => {
      const next = i + 1 < project.levels.length ? mapLump(i + 1) : ending;
      mi += `map ${mapLump(i)} ${mq(l.name)}\n{\n\tlevelnum = ${i + 1}\n\tnext = "${next}"\n\tsecretnext = "${next}"\n\tsky1 = ${mq(/^[A-Za-z0-9_]{1,8}$/.test(l.sky || '') ? l.sky : 'SKY1')}\n`;
      const mu = env.musicRef(l.music);
      if (mu) mi += `\tmusic = ${mq(mu)}\n`;
      if (levelHandlers[i]) mi += `\tEventHandlers = "${levelHandlers[i]}"\n`;
      mi += '}\n\n';
    });
  }
  files.push({ path: 'mapinfo.txt', text: mi });

  // ---- sounds
  if (project.sounds.length) {
    let si = '// Made with HellForge\n';
    for (const s of project.sounds) {
      const ext = (String(s.file).split('.').pop() || 'wav').toLowerCase();
      si += `${soundName(s)} "sounds/${soundLump(s)}.${ext}"\n`;
      if (s.vol !== undefined && s.vol < 1) si += `$volume ${soundName(s)} ${Math.max(0.05, Number(s.vol) || 1).toFixed(2)}\n`;
      files.push({ path: `sounds/${soundLump(s)}.${ext}`, asset: s.file });
    }
    files.push({ path: 'sndinfo.txt', text: si });
  }
  // ---- music
  for (const m of project.music) {
    if (m.type === 'song') { try { files.push({ path: `music/${musicLump(m)}.mid`, b64: bytesToB64(songToMidi(m.song)) }); } catch (e) { warnings.push(`Song "${m.name}" could not be exported.`); } }
    else if (m.file) files.push({ path: `music/${musicLump(m)}.${(m.file.split('.').pop() || 'mid').toLowerCase()}`, asset: m.file });
  }
  // ---- art
  for (const t of project.textures) if (t.data) files.push({ path: `textures/${texLump(t)}.png`, b64: dataB64(t.data) });
  for (const s of project.sprites) {
    const hud = hudSprites.has(s.id) || s.anchor === 'hud';
    s.frames.slice(0, 26).forEach((f, i) => {
      const png = b64ToBytes(dataB64(f));
      const w = s.w || 64, h = s.h || 64;
      const [ox, oy] = s.anchor === 'custom' && s.ox !== undefined ? [s.ox, s.oy] : hud ? [-(160 - Math.round(w / 2)), -(172 - h)] : s.anchor === 'center' ? [Math.round(w / 2), Math.round(h / 2)] : [Math.round(w / 2), h];
      files.push({ path: `sprites/${sprPrefix(s)}${FRAME(i)}0.png`, b64: bytesToB64(pngWithOffsets(png, ox, oy)) });
    });
  }
  if (g.titlePic) files.push({ path: 'graphics/TITLEPIC.png', b64: dataB64(g.titlePic) });

  if (!project.levels.length && !project.actors.length) warnings.push('This project is empty - add a level or a custom thing first.');
  return { files, warnings, zscript: zs, mapinfo: mi, firstMap: project.levels.length ? mapLump(0) : (game === 'doom2' ? 'MAP01' : 'E1M1') };
}
