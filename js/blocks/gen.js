// Blocks -> ZScript. Scripts that use "wait"/"forever" become small resumable state machines.
import { BLOCKS } from './defs.js';

export const zstr = s => '"' + String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n') + '"';
export const znum = v => { const n = Number(v); if (!isFinite(n)) return '0.0'; return Number.isInteger(n) ? n + '.0' : String(n); };

function input(spec, val, cx) {
  switch (spec[0]) {
    case 'n': return val && typeof val === 'object' ? expr(val, cx, 'num') : znum(val);
    case 'lit': return znum(val);
    case 'b': return val && typeof val === 'object' ? expr(val, cx, 'bool') : 'false';
    case 's': return zstr(val);
    case 'sel': { const v = String(val); return spec[2].some(o => o[0] === v) ? v : spec[2][0][0]; }
    case 'actor': case 'proj': case 'item': case 'monster': { const c = cx.env.cls(val); return c ? zstr(c) : 'null'; }
    case 'sound': return zstr(cx.env.snd(val));
    case 'room': return String(cx.env.tag(val) | 0);
    case 'spot': return String(cx.env.tid(val) | 0);
    case 'level': return zstr(cx.env.lump(val) || '');
    case 'var': return cx.env.varRef(val, cx);
  }
  return '0';
}
function args(b, d, cx) {
  const a = {};
  for (const [k, spec] of Object.entries(d.in || {})) a[k] = input(spec, (b.a || {})[k], cx);
  return a;
}
function expr(b, cx, want) {
  const d = BLOCKS[b.t];
  const wantBool = want === 'bool';
  if (!d || !d.gen || !d.ctx.includes(cx.kind) || (d.k === 'bool') !== wantBool) return wantBool ? 'false' : '0.0';
  return d.gen(args(b, d, cx), cx);
}
const usable = (b, cx) => { const d = b && BLOCKS[b.t]; return d && d.k !== 'hat' && d.k !== 'num' && d.k !== 'bool' && d.ctx.includes(cx.kind) ? d : null; };
const needsSM = list => (list || []).some(b => b && (b.t === 'wait' || b.t === 'forever' || b.t === 'until' || needsSM(b.b) || needsSM(b.e)));

function plain(list, cx, ind) {
  const out = [];
  for (const b of list || []) {
    const d = usable(b, cx);
    if (!d) continue;
    const a = args(b, d, cx);
    if (b.t === 'repeat') { const v = 'hfi' + cx.n++; out.push(`${ind}for (int ${v} = 0; ${v} < int(${a.n}); ${v}++)`, `${ind}{`, ...plain(b.b, cx, ind + '\t'), `${ind}}`); }
    else if (b.t === 'if') out.push(`${ind}if (${a.c})`, `${ind}{`, ...plain(b.b, cx, ind + '\t'), `${ind}}`);
    else if (b.t === 'ifelse') out.push(`${ind}if (${a.c})`, `${ind}{`, ...plain(b.b, cx, ind + '\t'), `${ind}}`, `${ind}else`, `${ind}{`, ...plain(b.e, cx, ind + '\t'), `${ind}}`);
    else if (b.t === 'stop') out.push(`${ind}return;`);
    else if (b.t === 'remove') out.push(`${ind}HF.Remove(me); return;`);
    else if (d.gen) out.push(ind + d.gen(a, cx));
  }
  return out;
}

function machine(list, cx, PC, W, fields, pre) {
  const B = [];
  const nb = () => { B.push([]); return B.length; };
  let cur = nb();
  const put = s => B[cur - 1].push(s);
  const jump = l => put(`${PC} = ${l}; break;`);
  const walk = items => {
    for (const b of items || []) {
      const d = usable(b, cx);
      if (!d) continue;
      const a = args(b, d, cx);
      switch (b.t) {
        case 'wait': { const n = nb(); put(`${W} = HF.Tics(${a.n}); ${PC} = ${n}; return;`); cur = n; break; }
        case 'if': case 'ifelse': {
          const t = nb(), e = b.t === 'ifelse' ? nb() : 0, end = nb();
          put(`if (${a.c}) ${PC} = ${t}; else ${PC} = ${e || end}; break;`);
          cur = t; walk(b.b); jump(end);
          if (e) { cur = e; walk(b.e); jump(end); }
          cur = end; break;
        }
        case 'repeat': {
          const c = `${PC}c${cx.n++}`; fields.push(`int ${c};`);
          const head = nb(), body = nb(), end = nb();
          put(`${pre}${c} = int(${a.n}); ${PC} = ${head}; break;`);
          cur = head; put(`if (${pre}${c} > 0) { ${pre}${c}--; ${PC} = ${body}; } else ${PC} = ${end}; break;`);
          cur = body; walk(b.b); jump(head);
          cur = end; break;
        }
        case 'forever': { const head = nb(); jump(head); cur = head; walk(b.b); put(`${W} = 1; ${PC} = ${head}; return;`); cur = nb(); break; }
        case 'until': {
          const head = nb(), body = nb(), end = nb();
          jump(head); cur = head; put(`if (${a.c}) ${PC} = ${end}; else ${PC} = ${body}; break;`);
          cur = body; walk(b.b); put(`${W} = 1; ${PC} = ${head}; return;`);
          cur = end; break;
        }
        case 'stop': put(`${PC} = 0; return;`); cur = nb(); break;
        case 'remove': put(`${PC} = 0; HF.Remove(me); return;`); cur = nb(); break;
        default: if (d.gen) put(d.gen(a, cx));
      }
    }
  };
  walk(list);
  put(`${PC} = 0; return;`);
  const out = [];
  B.forEach((lines, i) => {
    const last = lines[lines.length - 1] || '';
    if (!/(break;|return;)$/.test(last)) lines.push(`${PC} = 0; return;`);
    out.push(`\t\t\tcase ${i + 1}:`, '\t\t\t{', ...lines.map(l => '\t\t\t\t' + l), '\t\t\t}');
  });
  return out;
}

// kind: monster | prop | projectile | weapon | pickup | level | game
export function compileScripts(owner, kind, env) {
  const out = { fields: [], methods: [], hooks: {}, runners: [], every: [] };
  const world = kind === 'level' || kind === 'game';
  const preamble = kind === 'weapon' ? 'Actor me = self; Actor plr = self;'
    : kind === 'pickup' ? 'Actor me = self; Actor plr = hfUser ? hfUser : HF.Plr(self);'
      : world ? 'Actor plr = HF.Plr(null); Actor me = plr;' : 'Actor me = self; Actor plr = HF.Plr(self);';
  const qual = kind === 'weapon' ? 'action ' : '';
  (owner.scripts || []).forEach((s, i) => {
    const d = BLOCKS[s.t];
    if (!d || d.k !== 'hat' || !d.ctx.includes(kind)) return;
    const cx = { kind, env, owner, n: 0 };
    const fn = `HF_E${i}`;
    if (needsSM(s.b) && kind !== 'weapon' && kind !== 'pickup') {
      const PC = `hfpc${i}`, W = `hfw${i}`;
      out.fields.push(`int ${PC};`, `int ${W};`);
      const body = machine(s.b, cx, PC, W, out.fields, '');
      out.methods.push([
        `\tvoid ${fn}() { ${PC} = 1; ${W} = 0; HF_R${i}(); }`,
        `\tvoid HF_R${i}()`, '\t{',
        `\t\tif (${PC} <= 0) return;`,
        `\t\tif (${W} > 0) { ${W}--; return; }`,
        `\t\t${preamble}`,
        '\t\tfor (int hfguard = 0; hfguard < 3000; hfguard++)', '\t\t{',
        `\t\t\tswitch (${PC})`, '\t\t\t{', ...body, `\t\t\tdefault: ${PC} = 0; return;`, '\t\t\t}', '\t\t}', '\t}',
      ].join('\n'));
      out.runners.push(`HF_R${i}`);
    } else {
      out.methods.push([`\t${qual}void ${fn}()`, '\t{', `\t\t${preamble}`, ...plain(s.b, cx, '\t\t'), '\t}'].join('\n'));
    }
    const hook = { fn, a: s.a || {} };
    if (s.t === 'every') {
      const f = `hft${i}`;
      out.fields.push(`int ${f};`);
      out.every.push({ fn, field: f, tics: Math.max(1, Math.round((Number(s.a && s.a.n) || 1) * 35)) });
    } else (out.hooks[s.t] ||= []).push(hook);
  });
  return out;
}
export const calls = (list, ind = '\t\t') => (list || []).map(h => `${ind}${h.fn}();`).join('\n');
