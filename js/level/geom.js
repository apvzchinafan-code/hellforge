// Turns the editor's stacked "room" shapes into real Doom map geometry (vertices, lines, sides, sectors).
// Rooms are painted in order: later rooms sit on top of earlier ones. Wherever two different rooms touch,
// a two-sided line is made automatically; wherever a room touches nothing, a solid wall is made.
// Pure functions - used by the 3D preview in the browser and by the PK3 compiler.

const R3 = v => Math.round(v * 1000) / 1000;
const LOCK = { 1: 129, 2: 130, 3: 131 };

export function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}
export function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
export function centroid(pts) {
  const b = bbox(pts);
  const c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  if (pointInPoly(c[0], c[1], pts)) return c;
  // concave shape: fall back to the middle of the widest horizontal span through the center line
  const xs = [];
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > c[1]) !== (yj > c[1])) xs.push((xj - xi) * (c[1] - yi) / (yj - yi) + xi);
  }
  xs.sort((a, b2) => a - b2);
  let best = c[0], w = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > w) { w = xs[i + 1] - xs[i]; best = (xs[i] + xs[i + 1]) / 2; }
  return [best, c[1]];
}

// Rooms -> flat list of "areas" (stairs become one area per step).
export function expandAreas(level, env = {}) {
  const tagOf = env.tagOf || (() => 0);
  const out = [];
  for (const room of level.rooms) {
    if (!room.pts || room.pts.length < 3) continue;
    const base = {
      room, kind: room.kind || 'room', solid: room.kind === 'solid',
      floor: +room.floor || 0, ceil: +room.ceil || 0,
      floorTex: room.floorTex || 'FLOOR4_8', ceilTex: room.sky ? 'F_SKY1' : (room.ceilTex || 'CEIL3_5'),
      wallTex: room.wallTex || 'STARTAN3', light: room.light ?? 192, tag: tagOf(room.name || room.id), step: -1,
    };
    if (base.kind === 'stairs') {
      const [x0, y0, x1, y1] = bbox(room.pts);
      const n = Math.max(1, Math.min(64, Math.round(room.steps || 8)));
      const rise = +room.rise || 16, dir = room.dir || 0;
      for (let i = 0; i < n; i++) {
        const a = i / n, b = (i + 1) / n;
        let pts;
        if (dir === 0) pts = rectPts(x0 + (x1 - x0) * a, y0, x0 + (x1 - x0) * b, y1);
        else if (dir === 2) pts = rectPts(x1 - (x1 - x0) * b, y0, x1 - (x1 - x0) * a, y1);
        else if (dir === 1) pts = rectPts(x0, y0 + (y1 - y0) * a, x1, y0 + (y1 - y0) * b);
        else pts = rectPts(x0, y1 - (y1 - y0) * b, x1, y1 - (y1 - y0) * a);
        pts = pts.map(p => [R3(p[0]), R3(p[1])]);
        out.push({ ...base, kind: 'room', pts, bb: bbox(pts), floor: base.floor + (i + 1) * rise, step: i, tag: 0 });
      }
      continue;
    }
    const pts = room.pts.map(p => [R3(p[0]), R3(p[1])]);
    const a = { ...base, pts, bb: bbox(pts) };
    if (a.kind === 'door') { a.ceilOpen = a.ceil; a.ceil = a.floor; }
    out.push(a);
  }
  return out;
}

function borderSpecial(a, env) {
  const r = a.room;
  switch (a.kind) {
    case 'door': {
      if (r.manual === false) return null;
      const speed = r.fast ? 64 : 16;
      if (r.lock) return { special: 13, args: [a.tag, speed, r.stay ? 0 : 150, LOCK[r.lock] || 0, 0], use: true, repeat: true };
      if (r.stay) return { special: 11, args: [a.tag, speed, 0, 0, 0], use: true, repeat: true };
      return { special: 12, args: [a.tag, speed, 150, 0, 0], use: true, repeat: true, monster: true };
    }
    case 'lift': return { special: 62, args: [a.tag, 32, 105, 0, 0], use: true, cross: true, repeat: true };
    case 'exit': return { special: r.secretExit ? 244 : 243, args: [0, 0, 0, 0, 0], cross: true };
    case 'teleport': {
      const tid = env.tidOfThing ? env.tidOfThing(r.dest) : 0;
      return tid ? { special: 70, args: [tid, 0, 0, 0, 0], cross: true, mcross: true, repeat: true } : null;
    }
  }
  return null;
}

export function buildMap(level, env = {}) {
  const areas = expandAreas(level, env);
  const problems = [];

  // 1. every polygon edge
  const edges = [];
  areas.forEach((a, ai) => {
    const n = a.pts.length;
    for (let i = 0; i < n; i++) {
      const p = a.pts[i], q = a.pts[(i + 1) % n];
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const len = Math.hypot(dx, dy);
      if (len < 0.01) continue;
      edges.push({ ax: p[0], ay: p[1], bx: q[0], by: q[1], dx, dy, len, ai, ei: a.step >= 0 ? -1 : i, cuts: [],
        x0: Math.min(p[0], q[0]) - 0.01, y0: Math.min(p[1], q[1]) - 0.01, x1: Math.max(p[0], q[0]) + 0.01, y1: Math.max(p[1], q[1]) + 0.01 });
    }
  });

  // 2. cut every edge wherever another edge crosses / touches / overlaps it
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    for (let j = i + 1; j < edges.length; j++) {
      const f = edges[j];
      if (e.x1 < f.x0 || f.x1 < e.x0 || e.y1 < f.y0 || f.y1 < e.y0) continue;
      const den = e.dx * f.dy - e.dy * f.dx;
      const wx = f.ax - e.ax, wy = f.ay - e.ay;
      const te = 0.002 / e.len, tf = 0.002 / f.len;
      if (Math.abs(den) < 1e-9 * e.len * f.len) {
        if (Math.abs(wx * e.dy - wy * e.dx) / e.len > 0.002) continue; // parallel, not collinear
        const l1 = e.len * e.len, l2 = f.len * f.len;
        let t = (wx * e.dx + wy * e.dy) / l1;
        if (t > te && t < 1 - te) e.cuts.push({ t, x: f.ax, y: f.ay });
        t = ((f.bx - e.ax) * e.dx + (f.by - e.ay) * e.dy) / l1;
        if (t > te && t < 1 - te) e.cuts.push({ t, x: f.bx, y: f.by });
        t = (-wx * f.dx - wy * f.dy) / l2;
        if (t > tf && t < 1 - tf) f.cuts.push({ t, x: e.ax, y: e.ay });
        t = ((e.bx - f.ax) * f.dx + (e.by - f.ay) * f.dy) / l2;
        if (t > tf && t < 1 - tf) f.cuts.push({ t, x: e.bx, y: e.by });
        continue;
      }
      const t = (wx * f.dy - wy * f.dx) / den;
      const u = (wx * e.dy - wy * e.dx) / den;
      if (t < -te || t > 1 + te || u < -tf || u > 1 + tf) continue;
      const tEnd = t <= te ? 0 : t >= 1 - te ? 1 : -1;
      const uEnd = u <= tf ? 0 : u >= 1 - tf ? 1 : -1;
      if (tEnd >= 0 && uEnd >= 0) continue;
      if (tEnd >= 0) f.cuts.push({ t: u, x: tEnd ? e.bx : e.ax, y: tEnd ? e.by : e.ay });
      else if (uEnd >= 0) e.cuts.push({ t, x: uEnd ? f.bx : f.ax, y: uEnd ? f.by : f.ay });
      else {
        const x = R3(e.ax + e.dx * t), y = R3(e.ay + e.dy * t);
        e.cuts.push({ t, x, y }); f.cuts.push({ t: u, x, y });
      }
    }
  }

  // 3. unique sub-segments
  const segs = new Map();
  for (const e of edges) {
    e.cuts.sort((a, b) => a.t - b.t);
    let px = e.ax, py = e.ay;
    const pieces = [...e.cuts, { x: e.bx, y: e.by }];
    for (const c of pieces) {
      if (Math.abs(c.x - px) > 0.0005 || Math.abs(c.y - py) > 0.0005) {
        const fwd = px < c.x || (px === c.x && py < c.y);
        const key = fwd ? `${px},${py},${c.x},${c.y}` : `${c.x},${c.y},${px},${py}`;
        let s = segs.get(key);
        if (!s) { s = fwd ? { x1: px, y1: py, x2: c.x, y2: c.y, src: [] } : { x1: c.x, y1: c.y, x2: px, y2: py, src: [] }; segs.set(key, s); }
        s.src.push(e);
        px = c.x; py = c.y;
      }
    }
  }

  // 4. which area is on each side?
  const rawAt = (x, y) => {
    for (let i = areas.length - 1; i >= 0; i--) {
      const a = areas[i], b = a.bb;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (pointInPoly(x, y, a.pts)) return i;
    }
    return -1;
  };
  const vertices = [], vmap = new Map();
  const vert = (x, y) => {
    const k = x + ',' + y;
    let i = vmap.get(k);
    if (i === undefined) { i = vertices.length; vertices.push([x, y]); vmap.set(k, i); }
    return i;
  };
  const sectors = [], smap = new Map();
  const sectorOf = ai => {
    let i = smap.get(ai);
    if (i === undefined) {
      const a = areas[ai], r = a.room;
      i = sectors.length;
      sectors.push({
        area: a, floor: a.floor, ceil: a.ceil, floorTex: a.floorTex, ceilTex: a.ceilTex, light: Math.max(0, Math.min(255, Math.round(a.light))),
        tag: a.tag, special: r.secret && a.kind !== 'door' ? 1024 : 0, damage: Math.max(0, Math.round(r.damage || 0)), lines: [],
      });
      smap.set(ai, i);
    }
    return i;
  };
  const override = (ai, s) => {
    const et = areas[ai].room.edgeTex;
    if (!et) return null;
    for (const e of s.src) if (e.ai === ai && e.ei >= 0 && et[e.ei]) return et[e.ei];
    return null;
  };
  const wallOf = (ai, s) => override(ai, s) || areas[ai].wallTex;

  const lines = [];
  for (const s of segs.values()) {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1, len = Math.hypot(dx, dy);
    if (len < 0.005) continue;
    const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
    const nx = dy / len * 0.03, ny = -dx / len * 0.03; // points to the right of the direction
    let rRaw = rawAt(mx + nx, my + ny), lRaw = rawAt(mx - nx, my - ny);
    let fa = rRaw >= 0 && !areas[rRaw].solid ? rRaw : -1;
    let ba = lRaw >= 0 && !areas[lRaw].solid ? lRaw : -1;
    if (fa === ba) continue;
    let x1 = s.x1, y1 = s.y1, x2 = s.x2, y2 = s.y2;
    const flip = () => { [x1, y1, x2, y2] = [x2, y2, x1, y1]; [fa, ba] = [ba, fa]; [rRaw, lRaw] = [lRaw, rRaw]; };
    if (fa < 0) flip();
    let sp = null;
    if (ba >= 0) {
      const fs = borderSpecial(areas[fa], env), bs = borderSpecial(areas[ba], env);
      if (fs && !bs) flip(); // the usable face must look into the normal room
      sp = borderSpecial(areas[ba], env) || borderSpecial(areas[fa], env);
    }
    const A = areas[fa];
    const line = {
      v1: vert(x1, y1), v2: vert(x2, y2), len, front: sectorOf(fa), back: ba >= 0 ? sectorOf(ba) : -1,
      special: sp, tex: {}, flags: {},
    };
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    line.offF = Math.round(x1 * ux + y1 * uy);
    line.offB = Math.round(-(x2 * ux + y2 * uy));
    if (ba < 0) {
      if (A.kind === 'door') { line.tex.fm = A.room.trackTex || 'DOORTRAK'; line.flags.dontpegbottom = true; }
      else line.tex.fm = lRaw >= 0 ? wallOf(lRaw, s) : wallOf(fa, s);
    } else {
      // each face shows the *other* room's material on its step / overhang
      const tb = wallOf(ba, s), tf = wallOf(fa, s);
      line.tex.ft = tb; line.tex.fb = tb;
      line.tex.bt = tf; line.tex.bb = tf;
    }
    sectors[line.front].lines.push(lines.length);
    if (line.back >= 0) sectors[line.back].lines.push(lines.length);
    lines.push(line);
  }

  const areaAt = (x, y) => { const i = rawAt(x, y); return i >= 0 && !areas[i].solid ? areas[i] : null; };
  const sectorAt = (x, y) => { const i = rawAt(x, y); return i >= 0 && !areas[i].solid && smap.has(i) ? sectors[smap.get(i)] : null; };
  let bounds = [0, 0, 0, 0];
  if (vertices.length) bounds = bbox(vertices);
  return { areas, vertices, lines, sectors, areaAt, sectorAt, bounds, problems };
}

// Cut one sector into triangles (horizontal slabs -> trapezoids). Returns [x,y, x,y, x,y, ...] counter-clockwise.
export function triangulate(map, si) {
  const sec = map.sectors[si];
  const es = [];
  const ys = new Set();
  for (const li of sec.lines) {
    const l = map.lines[li];
    const a = map.vertices[l.v1], b = map.vertices[l.v2];
    ys.add(a[1]); ys.add(b[1]);
    if (a[1] === b[1]) continue;
    es.push(a[1] < b[1] ? [a[0], a[1], b[0], b[1]] : [b[0], b[1], a[0], a[1]]);
  }
  const yl = [...ys].sort((a, b) => a - b);
  const out = [];
  for (let k = 0; k + 1 < yl.length; k++) {
    const ya = yl[k], yb = yl[k + 1];
    const span = [];
    for (const e of es) {
      if (e[1] <= ya && e[3] >= yb) {
        const m = (e[2] - e[0]) / (e[3] - e[1]);
        span.push([e[0] + (ya - e[1]) * m, e[0] + (yb - e[1]) * m]);
      }
    }
    span.sort((p, q) => (p[0] + p[1]) - (q[0] + q[1]));
    for (let i = 0; i + 1 < span.length; i += 2) {
      const l = span[i], r = span[i + 1];
      if (r[0] - l[0] > 1e-6 || r[1] - l[1] > 1e-6) out.push(l[0], ya, r[0], ya, r[1], yb, l[0], ya, r[1], yb, l[1], yb);
    }
  }
  return out;
}
