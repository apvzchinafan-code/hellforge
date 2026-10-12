// Block catalogue: what each block looks like and what ZScript it becomes. Pure data (shared with the compiler).
//   k: hat | stmt | c (wraps blocks) | ce (if/else) | num (round value) | bool (pointy condition)
//   in: { name: [type, default, options] }  types: n number, s text, b condition, sel dropdown,
//       actor, proj, item, sound, room, spot, level, var, monster
//   ctx: which kinds of scripts may use it.  gen(a, cx): a = compiled inputs.

const ACT = ['monster', 'prop', 'projectile'];           // things with a body in the world
const BODY = ['monster', 'prop', 'projectile', 'weapon', 'pickup'];
const WORLD = ['level', 'game'];
const ALL = [...BODY, ...WORLD];
const LIVE = ['monster', 'prop', 'projectile', 'level', 'game']; // can wait / loop over time

export const CATS = [
  ['events', 'Events', '#c99700'], ['control', 'Control', '#d9822b'], ['combat', 'Combat', '#d9434a'], ['move', 'Movement', '#3f7fe8'],
  ['world', 'World', '#8a5cf0'], ['player', 'Player', '#27a567'], ['sense', 'Sensing', '#1f9bbd'], ['math', 'Math & logic', '#56a02c'], ['vars', 'Variables', '#e86a24'],
];
export const CAT_COLOR = Object.fromEntries(CATS.map(c => [c[0], c[2]]));

const AT = [['target', 'my target'], ['player', 'the player'], ['ahead', 'straight ahead']];
const FLAGS = [['0', 'invulnerable'], ['1', 'a ghost (walks through walls)'], ['2', 'flying'], ['3', 'friendly'], ['4', 'solid'], ['5', 'shootable'], ['6', 'invisible'], ['7', 'glowing'], ['8', 'frozen']];
const WHERE = [['1', 'in front of me'], ['0', 'right here'], ['2', 'above me']];

export const BLOCKS = {
  // ------------------------------------------------------------ events
  spawn: { k: 'hat', cat: 'events', label: 'when I appear', ctx: ACT },
  wake: { k: 'hat', cat: 'events', label: 'when I notice an enemy', ctx: ['monster'] },
  every: { k: 'hat', cat: 'events', label: 'every {n} seconds', in: { n: ['lit', 2] }, ctx: LIVE },
  attackMelee: { k: 'hat', cat: 'events', label: 'when I attack up close', ctx: ['monster'] },
  attackRanged: { k: 'hat', cat: 'events', label: 'when I attack from afar', ctx: ['monster'] },
  hurt: { k: 'hat', cat: 'events', label: 'when I get hurt', ctx: ['monster', 'prop'] },
  die: { k: 'hat', cat: 'events', label: 'when I die / break', ctx: ['monster', 'prop'] },
  use: { k: 'hat', cat: 'events', label: 'when the player presses USE on me', ctx: ['monster', 'prop'] },
  touch: { k: 'hat', cat: 'events', label: 'when the player touches me', ctx: ['prop'] },
  hit: { k: 'hat', cat: 'events', label: 'when I hit something', ctx: ['projectile'] },
  fire: { k: 'hat', cat: 'events', label: 'when fired', ctx: ['weapon'] },
  altfire: { k: 'hat', cat: 'events', label: 'when alt-fired (right mouse)', ctx: ['weapon'] },
  equip: { k: 'hat', cat: 'events', label: 'when taken out', ctx: ['weapon'] },
  pickup: { k: 'hat', cat: 'events', label: 'when picked up', ctx: ['pickup'] },
  start: { k: 'hat', cat: 'events', label: 'when the level starts', ctx: WORLD },
  enter: { k: 'hat', cat: 'events', label: 'when the player enters {room}', in: { room: ['room'] }, ctx: WORLD },
  kill: { k: 'hat', cat: 'events', label: 'when a {monster} dies', in: { monster: ['monster', ''] }, ctx: WORLD },
  allDead: { k: 'hat', cat: 'events', label: 'when every monster is dead', ctx: WORLD },
  playerDies: { k: 'hat', cat: 'events', label: 'when the player dies', ctx: WORLD },

  // ------------------------------------------------------------ control
  wait: { k: 'stmt', cat: 'control', label: 'wait {n} seconds', in: { n: ['n', 1] }, ctx: LIVE },
  repeat: { k: 'c', cat: 'control', label: 'repeat {n} times', in: { n: ['n', 3] }, ctx: ALL },
  forever: { k: 'c', cat: 'control', label: 'forever', ctx: LIVE },
  if: { k: 'c', cat: 'control', label: 'if {c} then', in: { c: ['b'] }, ctx: ALL },
  ifelse: { k: 'ce', cat: 'control', label: 'if {c} then', in: { c: ['b'] }, ctx: ALL },
  until: { k: 'c', cat: 'control', label: 'repeat until {c}', in: { c: ['b'] }, ctx: LIVE },
  stop: { k: 'stmt', cat: 'control', label: 'stop this script', ctx: ALL },

  // ------------------------------------------------------------ combat
  shoot: { k: 'stmt', cat: 'combat', label: 'shoot {proj} at {at}', in: { proj: ['proj'], at: ['sel', 'target', AT] }, ctx: ACT,
    gen: a => `HF.Shoot(me, ${a.proj}, ${a.at === 'target' ? 'HF.Tgt(me, plr)' : a.at === 'player' ? 'plr' : 'null'});` },
  wshoot: { k: 'stmt', cat: 'combat', label: 'fire {proj} · spread {s}°', in: { proj: ['proj'], s: ['n', 0] }, ctx: ['weapon'],
    gen: a => `A_FireProjectile(${a.proj}, frandom(-(${a.s}), ${a.s}), false);` },
  bullets: { k: 'stmt', cat: 'combat', label: 'fire {n} bullets · damage {dmg} · spread {s}°', in: { n: ['n', 1], dmg: ['n', 10], s: ['n', 4] }, ctx: ['monster', 'prop', 'weapon'],
    gen: (a, cx) => cx.kind === 'weapon' ? `A_FireBullets(${a.s}, ${a.s}, int(${a.n}), int(${a.dmg}), "BulletPuff", FBF_NORANDOM);` : `HF.Bullets(me, plr, ${a.n}, ${a.dmg}, ${a.s});` },
  melee: { k: 'stmt', cat: 'combat', label: 'hit what is in front of me · damage {dmg}', in: { dmg: ['n', 15] }, ctx: ['monster', 'weapon'],
    gen: (a, cx) => cx.kind === 'weapon' ? `A_CustomPunch(int(${a.dmg}), true, 0);` : `HF.Melee(me, ${a.dmg});` },
  explode: { k: 'stmt', cat: 'combat', label: 'explode · damage {dmg} · radius {r}', in: { dmg: ['n', 60], r: ['n', 128] }, ctx: BODY,
    gen: a => `HF.Boom(me, ${a.dmg}, ${a.r});` },
  hurtPlayer: { k: 'stmt', cat: 'combat', label: 'hurt the player by {n}', in: { n: ['n', 10] }, ctx: ALL, gen: a => `HF.Hurt(plr, me, ${a.n});` },
  healMe: { k: 'stmt', cat: 'combat', label: 'heal me by {n}', in: { n: ['n', 20] }, ctx: ['monster', 'prop'], gen: a => `HF.Heal(me, ${a.n});` },
  setHealth: { k: 'stmt', cat: 'combat', label: 'set my health to {n}', in: { n: ['n', 100] }, ctx: ['monster', 'prop'], gen: a => `HF.SetHealth(me, ${a.n});` },
  flag: { k: 'stmt', cat: 'combat', label: 'make me {f} : {on}', in: { f: ['sel', '0', FLAGS], on: ['sel', 'true', [['true', 'yes'], ['false', 'no']]] }, ctx: ACT,
    gen: a => `HF.Flag(me, ${a.f}, ${a.on});` },
  killMe: { k: 'stmt', cat: 'combat', label: 'kill me', ctx: ['monster', 'prop'], gen: () => 'HF.Kill(me);' },
  remove: { k: 'stmt', cat: 'combat', label: 'make me vanish', ctx: ACT },
  useAmmo: { k: 'stmt', cat: 'combat', label: 'use {n} extra ammo', in: { n: ['n', 1] }, ctx: ['weapon'], gen: a => `invoker.DepleteAmmo(invoker.bAltFire, false, int(${a.n}));` },
  recoil: { k: 'stmt', cat: 'combat', label: 'kick me back with force {n}', in: { n: ['n', 4] }, ctx: ['weapon', 'monster'], gen: a => `if (me) me.A_Recoil(${a.n});` },

  // ------------------------------------------------------------ movement
  jump: { k: 'stmt', cat: 'move', label: 'jump with force {n}', in: { n: ['n', 10] }, ctx: ['monster', 'prop', 'weapon'], gen: a => `HF.Jump(me, ${a.n});` },
  dash: { k: 'stmt', cat: 'move', label: 'dash forward with force {n}', in: { n: ['n', 15] }, ctx: ['monster', 'prop', 'weapon', 'projectile'], gen: a => `HF.Dash(me, ${a.n});` },
  face: { k: 'stmt', cat: 'move', label: 'face the player', ctx: ACT, gen: () => 'HF.Face(me, plr);' },
  turn: { k: 'stmt', cat: 'move', label: 'turn {n} degrees', in: { n: ['n', 45] }, ctx: ACT, gen: a => `HF.Turn(me, ${a.n});` },
  setSpeed: { k: 'stmt', cat: 'move', label: 'set my speed to {n}', in: { n: ['n', 12] }, ctx: ['monster', 'projectile'], gen: a => `HF.SetSpeed(me, ${a.n});` },
  teleport: { k: 'stmt', cat: 'move', label: 'teleport me to marker {spot}', in: { spot: ['spot'] }, ctx: ['monster', 'prop'], gen: a => `HF.Tele(me, ${a.spot});` },
  tpPlayer: { k: 'stmt', cat: 'move', label: 'teleport the player to marker {spot}', in: { spot: ['spot'] }, ctx: ALL, gen: a => `HF.Tele(plr, ${a.spot});` },
  pushPlayer: { k: 'stmt', cat: 'move', label: 'push the player away with force {n}', in: { n: ['n', 20] }, ctx: ALL, gen: a => `HF.Push(plr, me, ${a.n});` },
  size: { k: 'stmt', cat: 'move', label: 'set my size to {n} %', in: { n: ['n', 150] }, ctx: ACT, gen: a => `HF.Size(me, ${a.n});` },
  fade: { k: 'stmt', cat: 'move', label: 'set my visibility to {n} %', in: { n: ['n', 50] }, ctx: ACT, gen: a => `HF.Fade(me, ${a.n});` },

  // ------------------------------------------------------------ world
  say: { k: 'stmt', cat: 'world', label: 'show message {text}', in: { text: ['s', 'Hello!'] }, ctx: ALL, gen: a => `HF.Say(${a.text});` },
  log: { k: 'stmt', cat: 'world', label: 'show small message {text}', in: { text: ['s', 'Something happened.'] }, ctx: ALL, gen: a => `Console.Printf("%s", ${a.text});` },
  sound: { k: 'stmt', cat: 'world', label: 'play sound {sound}', in: { sound: ['sound'] }, ctx: ALL, gen: a => `HF.Snd(me, ${a.sound});` },
  spawn1: { k: 'stmt', cat: 'world', label: 'spawn {actor} {where}', in: { actor: ['actor'], where: ['sel', '1', WHERE] }, ctx: BODY, gen: a => `HF.Spawn(me, ${a.actor}, ${a.where});` },
  spawnAt: { k: 'stmt', cat: 'world', label: 'spawn {actor} at marker {spot}', in: { actor: ['actor'], spot: ['spot'] }, ctx: ALL, gen: a => `HF.SpawnAtSpot(${a.actor}, ${a.spot});` },
  quake: { k: 'stmt', cat: 'world', label: 'shake the screen · strength {n} · {s} seconds', in: { n: ['n', 3], s: ['n', 1] }, ctx: ALL, gen: a => `HF.Quake(plr, ${a.n}, ${a.s});` },
  open: { k: 'stmt', cat: 'world', label: 'open door {room}', in: { room: ['room'] }, ctx: ALL, gen: a => `HF.Special(plr, 11, ${a.room}, 16);` },
  close: { k: 'stmt', cat: 'world', label: 'close door {room}', in: { room: ['room'] }, ctx: ALL, gen: a => `HF.Special(plr, 10, ${a.room}, 16);` },
  lowerFloor: { k: 'stmt', cat: 'world', label: 'lower the floor of {room} by {n}', in: { room: ['room'], n: ['n', 64] }, ctx: ALL, gen: a => `HF.Special(plr, 20, ${a.room}, 16, int(${a.n}));` },
  raiseFloor: { k: 'stmt', cat: 'world', label: 'raise the floor of {room} by {n}', in: { room: ['room'], n: ['n', 64] }, ctx: ALL, gen: a => `HF.Special(plr, 23, ${a.room}, 16, int(${a.n}));` },
  light: { k: 'stmt', cat: 'world', label: 'set brightness of {room} to {n}', in: { room: ['room'], n: ['n', 96] }, ctx: ALL, gen: a => `HF.Special(plr, 112, ${a.room}, int(${a.n}));` },
  exit: { k: 'stmt', cat: 'world', label: 'finish the level', ctx: ALL, gen: () => 'HF.Special(plr, 243, 0);' },
  goto: { k: 'stmt', cat: 'world', label: 'go to level {level}', in: { level: ['level'] }, ctx: ALL, gen: a => `level.ChangeLevel(${a.level}, 0, 0, -1);` },

  // ------------------------------------------------------------ player
  give: { k: 'stmt', cat: 'player', label: 'give the player {n} × {item}', in: { n: ['n', 1], item: ['item'] }, ctx: ALL, gen: a => `HF.Give(plr, ${a.item}, ${a.n});` },
  take: { k: 'stmt', cat: 'player', label: 'take {n} × {item} from the player', in: { n: ['n', 1], item: ['item'] }, ctx: ALL, gen: a => `HF.Take(plr, ${a.item}, ${a.n});` },
  healPlayer: { k: 'stmt', cat: 'player', label: 'heal the player by {n}', in: { n: ['n', 25] }, ctx: ALL, gen: a => `HF.Heal(plr, ${a.n});` },
  armor: { k: 'stmt', cat: 'player', label: 'give the player {n} armor', in: { n: ['n', 25] }, ctx: ALL, gen: a => `HF.Give(plr, "ArmorBonus", ${a.n});` },

  // ------------------------------------------------------------ sensing
  health: { k: 'num', cat: 'sense', label: 'my health', ctx: ['monster', 'prop'], gen: () => 'HF.Hp(me)' },
  phealth: { k: 'num', cat: 'sense', label: 'player health', ctx: ALL, gen: () => 'HF.Hp(plr)' },
  dist: { k: 'num', cat: 'sense', label: 'distance to the player', ctx: ACT, gen: () => 'HF.Dist(me, plr)' },
  count: { k: 'num', cat: 'sense', label: 'how many {item} the player has', in: { item: ['item'] }, ctx: ALL, gen: a => `HF.Count(plr, ${a.item})` },
  monsters: { k: 'num', cat: 'sense', label: 'monsters left alive', ctx: ALL, gen: () => 'double(level.total_monsters - level.killed_monsters)' },
  sees: { k: 'bool', cat: 'sense', label: 'I can see the player', ctx: ACT, gen: () => 'HF.Sees(me, plr)' },
  near: { k: 'bool', cat: 'sense', label: 'the player is closer than {n}', in: { n: ['n', 200] }, ctx: ACT, gen: a => `(HF.Dist(me, plr) < ${a.n})` },
  has: { k: 'bool', cat: 'sense', label: 'the player has {item}', in: { item: ['item'] }, ctx: ALL, gen: a => `(HF.Count(plr, ${a.item}) > 0)` },
  alive: { k: 'bool', cat: 'sense', label: 'I am alive', ctx: ['monster', 'prop'], gen: () => 'HF.Alive(me)' },
  chance: { k: 'bool', cat: 'sense', label: '{n} % chance', in: { n: ['n', 50] }, ctx: ALL, gen: a => `(frandom(0, 100) < ${a.n})` },

  // ------------------------------------------------------------ math & logic
  random: { k: 'num', cat: 'math', label: 'random {a} to {b}', in: { a: ['n', 1], b: ['n', 10] }, ctx: ALL, gen: a => `HF.Rnd(${a.a}, ${a.b})` },
  op: { k: 'num', cat: 'math', label: '{a} {o} {b}', in: { a: ['n', 1], o: ['sel', '+', [['+', '+'], ['-', '−'], ['*', '×'], ['/', '÷']]], b: ['n', 1] }, ctx: ALL,
    gen: a => a.o === '/' ? `HF.Div(${a.a}, ${a.b})` : `(${a.a} ${a.o} ${a.b})` },
  cmp: { k: 'bool', cat: 'math', label: '{a} {o} {b}', in: { a: ['n', 0], o: ['sel', '<', [['<', '<'], ['>', '>'], ['==', '='], ['!=', '≠'], ['<=', '≤'], ['>=', '≥']]], b: ['n', 50] }, ctx: ALL,
    gen: a => `(${a.a} ${a.o} ${a.b})` },
  and: { k: 'bool', cat: 'math', label: '{x} and {y}', in: { x: ['b'], y: ['b'] }, ctx: ALL, gen: a => `(${a.x} && ${a.y})` },
  or: { k: 'bool', cat: 'math', label: '{x} or {y}', in: { x: ['b'], y: ['b'] }, ctx: ALL, gen: a => `(${a.x} || ${a.y})` },
  not: { k: 'bool', cat: 'math', label: 'not {x}', in: { x: ['b'] }, ctx: ALL, gen: a => `(!${a.x})` },

  // ------------------------------------------------------------ variables
  set: { k: 'stmt', cat: 'vars', label: 'set {v} to {n}', in: { v: ['var'], n: ['n', 0] }, ctx: ALL, gen: a => `${a.v} = ${a.n};` },
  change: { k: 'stmt', cat: 'vars', label: 'change {v} by {n}', in: { v: ['var'], n: ['n', 1] }, ctx: ALL, gen: a => `${a.v} += ${a.n};` },
  get: { k: 'num', cat: 'vars', label: '{v}', in: { v: ['var'] }, ctx: ALL, gen: a => a.v },
};

export const blocksFor = kind => Object.entries(BLOCKS).filter(([, d]) => d.ctx.includes(kind)).map(([id, d]) => ({ id, ...d }));

export function newBlock(id) {
  const d = BLOCKS[id], b = { t: id, a: {} };
  for (const [k, spec] of Object.entries(d.in || {})) b.a[k] = spec[1] ?? (spec[0] === 'b' ? null : '');
  if (d.k === 'c' || d.k === 'ce' || d.k === 'hat') b.b = [];
  if (d.k === 'ce') b.e = [];
  return b;
}
export const parseLabel = label => label.split(/(\{\w+\})/).filter(Boolean).map(p => (p[0] === '{' ? { slot: p.slice(1, -1) } : { text: p.trim() })).filter(p => p.slot || p.text);
