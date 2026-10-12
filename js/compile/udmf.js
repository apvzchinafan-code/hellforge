// Level -> UDMF TEXTMAP + a tiny WAD container (UZDoom builds the BSP nodes itself on load).
import { buildMap, centroid } from '../level/geom.js';

const F = v => { const s = (Math.round(v * 1000) / 1000).toString(); return s.includes('.') ? s : s + '.0'; };
const Q = s => '"' + String(s).replace(/[\\"]/g, '') + '"';

export function levelToTextmap(level, env) {
  const map = buildMap(level, env);
  const warnings = [...map.problems];
  const o = ['namespace = "zdoom";'];

  const things = [];
  let hasStart = false;
  for (const t of level.things) {
    const ed = env.edNum(t.type);
    if (!ed) { warnings.push(`"${level.name}": a placed thing no longer exists and was skipped.`); continue; }
    if (!map.areaAt(t.x, t.y)) { warnings.push(`"${level.name}": a ${env.thingName(t.type)} is outside every room and was skipped.`); continue; }
    if (ed === 1) hasStart = true;
    things.push({ ...t, ed });
  }
  if (!hasStart) {
    const a = map.areas.find(x => !x.solid && x.kind === 'room') || map.areas.find(x => !x.solid);
    if (a) {
      const c = centroid(a.pts);
      things.push({ ed: 1, x: c[0], y: c[1], angle: 90 });
      warnings.push(`"${level.name}" has no Player Start - one was added in the first room.`);
    } else warnings.push(`"${level.name}" is empty - draw at least one room.`);
  }
  for (const t of things) {
    const sk = t.skills || [true, true, true];
    let s = `thing { x = ${F(t.x)}; y = ${F(t.y)}; angle = ${Math.round(t.angle || 0)}; type = ${t.ed};`;
    if (sk[0]) s += ' skill1 = true; skill2 = true;';
    if (sk[1]) s += ' skill3 = true;';
    if (sk[2]) s += ' skill4 = true; skill5 = true;';
    s += ' single = true; dm = true; coop = true; class1 = true; class2 = true; class3 = true; class4 = true; class5 = true;';
    if (t.ambush) s += ' ambush = true;';
    const tid = t.id ? env.tidOfThing(t.id) : 0;
    if (tid) s += ` id = ${tid};`;
    o.push(s + ' }');
  }

  for (const v of map.vertices) o.push(`vertex { x = ${F(v[0])}; y = ${F(v[1])}; }`);

  const sides = [];
  for (const l of map.lines) {
    let s = `linedef { v1 = ${l.v1}; v2 = ${l.v2}; sidefront = ${sides.length};`;
    const t = l.tex;
    let sd = `sidedef { sector = ${l.front}; offsetx = ${l.offF};`;
    if (t.fm) sd += ` texturemiddle = ${Q(t.fm)};`;
    if (t.ft) sd += ` texturetop = ${Q(t.ft)};`;
    if (t.fb) sd += ` texturebottom = ${Q(t.fb)};`;
    sides.push(sd + ' }');
    if (l.back >= 0) {
      s += ` sideback = ${sides.length}; twosided = true;`;
      sd = `sidedef { sector = ${l.back}; offsetx = ${l.offB};`;
      if (t.bt) sd += ` texturetop = ${Q(t.bt)};`;
      if (t.bb) sd += ` texturebottom = ${Q(t.bb)};`;
      sides.push(sd + ' }');
    } else s += ' blocking = true;';
    if (l.flags.dontpegbottom) s += ' dontpegbottom = true;';
    const sp = l.special;
    if (sp) {
      s += ` special = ${sp.special};`;
      sp.args.forEach((a, i) => { if (a) s += ` arg${i} = ${a};`; });
      if (sp.use) s += ' playeruse = true;';
      if (sp.cross) s += ' playercross = true;';
      if (sp.monster) s += ' monsteruse = true;';
      if (sp.mcross) s += ' monstercross = true;';
      if (sp.repeat) s += ' repeatspecial = true;';
    }
    o.push(s + ' }');
  }
  o.push(...sides);

  for (const s of map.sectors) {
    let t = `sector { heightfloor = ${Math.round(s.floor)}; heightceiling = ${Math.round(s.ceil)}; texturefloor = ${Q(s.floorTex)}; textureceiling = ${Q(s.ceilTex)}; lightlevel = ${s.light};`;
    if (s.tag) t += ` id = ${s.tag};`;
    if (s.special) t += ` special = ${s.special};`;
    if (s.damage) t += ` damageamount = ${s.damage}; damageinterval = 32; leakiness = 0;`;
    o.push(t + ' }');
  }
  return { text: o.join('\n') + '\n', map, warnings };
}

export function makeWad(lumps) {
  const enc = new TextEncoder();
  const datas = lumps.map(l => typeof l.data === 'string' ? enc.encode(l.data) : l.data);
  const total = datas.reduce((n, d) => n + d.length, 0);
  const out = new Uint8Array(12 + total + lumps.length * 16);
  const dv = new DataView(out.buffer);
  out.set(enc.encode('PWAD'), 0);
  dv.setInt32(4, lumps.length, true);
  dv.setInt32(8, 12 + total, true);
  let off = 12;
  lumps.forEach((l, i) => {
    out.set(datas[i], off);
    const d = 12 + total + i * 16;
    dv.setInt32(d, off, true);
    dv.setInt32(d + 4, datas[i].length, true);
    out.set(enc.encode(l.name.toUpperCase().slice(0, 8)), d + 8);
    off += datas[i].length;
  });
  return out;
}
