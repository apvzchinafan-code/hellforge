// Custom things -> ZScript classes.
import { compileScripts, calls, zstr } from '../blocks/gen.js';
import { actorClass, FRAME } from './names.js';

const N = (v, d = 0) => { const n = Number(v); return isFinite(n) ? n : d; };
const I = (v, d = 0) => Math.round(N(v, d));
const TNT = [{ s: 'TNT1', f: 'A' }];

function frames(anim, env) {
  if (!anim || !anim.src || !(anim.frames || []).length) return [];
  const p = env.spr(anim.src);
  if (!p) return [];
  return anim.frames.filter(i => i >= 0 && i < 26).map(i => ({ s: p, f: FRAME(i) }));
}
// First animation (by name) that actually has frames.
function pick(a, env, ...names) {
  for (const n of names) {
    const an = a.anims[n], fr = frames(an, env);
    if (fr.length) return { fr, tics: Math.max(1, I(an.tics, 4)), at: an.at, ok: true };
  }
  return { fr: TNT, tics: 4, at: undefined, ok: false };
}
const st = (fr, tics, extra) => `\t\t${fr.s} ${fr.f} ${tics}${extra ? ' ' + extra : ''}${extra && extra.endsWith('}') ? '' : ';'}`;
const prop = (name, v) => (v === '' || v === undefined || v === null ? '' : `\t\t${name} ${v};\n`);
const sndProp = (name, ref, env) => { const s = env.snd(ref); return s ? `\t\t${name} ${zstr(s)};\n` : ''; };

function varDecls(a, weapon) {
  const vars = a.vars || [];
  if (!vars.length) return { fields: '', init: '' };
  return {
    fields: vars.map(v => `\tdouble hfv_${v.id};\n`).join(''),
    init: `\toverride void BeginPlay()\n\t{\n\t\tSuper.BeginPlay();\n${vars.map(v => `\t\thfv_${v.id} = ${N(v.init)};\n`).join('')}\t}\n`,
  };
}
function tickBody(sc, aliveCond) {
  const lines = [];
  for (const e of sc.every) lines.push(`\t\tif (${aliveCond} && ++${e.field} >= ${e.tics}) { ${e.field} = 0; ${e.fn}(); }`);
  for (const r of sc.runners) lines.push(`\t\t${r}();`);
  return lines;
}
function commonOverrides(sc, opts = {}) {
  let s = '';
  const h = sc.hooks;
  if (h.spawn) s += `\toverride void PostBeginPlay()\n\t{\n\t\tSuper.PostBeginPlay();\n${calls(h.spawn)}\n\t}\n`;
  const tick = [];
  if (h.wake) tick.push(`\t\tif (!hfAwake && target && health > 0) { hfAwake = true; ${h.wake.map(x => x.fn + '();').join(' ')} }`);
  tick.push(...tickBody(sc, opts.alive || 'health > 0'));
  if (tick.length) s += `\toverride void Tick()\n\t{\n\t\tSuper.Tick();\n\t\tif (isFrozen()) return;\n${tick.join('\n')}\n\t}\n`;
  if (h.die) s += `\toverride void Die(Actor source, Actor inflictor, int dmgflags, Name MeansOfDeath)\n\t{\n\t\tSuper.Die(source, inflictor, dmgflags, MeansOfDeath);\n${calls(h.die)}\n\t}\n`;
  if (h.hurt) s += `\toverride int DamageMobj(Actor inflictor, Actor source, int damage, Name mod, int flags, double angle)\n\t{\n\t\tint hfd = Super.DamageMobj(inflictor, source, damage, mod, flags, angle);\n\t\tif (hfd > 0 && health > 0)\n\t\t{\n${calls(h.hurt, '\t\t\t')}\n\t\t}\n\t\treturn hfd;\n\t}\n`;
  if (h.use) s += `\toverride bool Used(Actor user)\n\t{\n\t\tif (!user || !user.player) return false;\n${calls(h.use)}\n\t\treturn true;\n\t}\n`;
  if (h.touch) s += `\toverride void Touch(Actor toucher)\n\t{\n\t\tif (!toucher || !toucher.player) return;\n\t\tif (level.maptime > hfTouch + 12)\n\t\t{\n${calls(h.touch, '\t\t\t')}\n\t\t}\n\t\thfTouch = level.maptime;\n\t}\n`;
  return s;
}
const head = (a, base) => `class ${actorClass(a)} : ${base}${a.replaces ? ' replaces ' + a.replaces.replace(/[^A-Za-z0-9_]/g, '') : ''}\n{\n`;
const fieldsOf = sc => sc.fields.map(f => `\t${f}\n`).join('');

// ---------------------------------------------------------------- monster
function genMonster(a, env) {
  const p = a.p, sc = compileScripts(a, 'monster', env), v = varDecls(a);
  const idle = pick(a, env, 'idle', 'walk'), walk = pick(a, env, 'walk', 'idle'), pain = pick(a, env, 'pain'), death = pick(a, env, 'death');
  const melee = p.melee && p.melee.on ? pick(a, env, 'melee', 'ranged', 'walk', 'idle') : null;
  const rg = p.ranged || { type: 'none' };
  const ranged = rg.type !== 'none' ? pick(a, env, 'ranged', 'melee', 'walk', 'idle') : null;
  const snd = p.sounds || {};
  let s = head(a, 'Actor') + fieldsOf(sc) + v.fields + '\tbool hfAwake;\n\tDefault\n\t{\n';
  s += prop('Health', Math.max(1, I(p.health, 60))) + prop('Radius', N(p.radius, 20)) + prop('Height', N(p.height, 56)) + prop('Speed', N(p.speed, 8)) + prop('Mass', I(p.mass, 100));
  s += prop('PainChance', I(p.painChance, 200)) + prop('Scale', N(p.scale, 1)) + '\t\tMonster;\n\t\t+FLOORCLIP\n';
  if (p.flying) s += '\t\t+FLOAT\n\t\t+NOGRAVITY\n';
  s += sndProp('SeeSound', snd.see, env) + sndProp('AttackSound', snd.attack, env) + sndProp('PainSound', snd.pain, env) + sndProp('DeathSound', snd.death, env) + sndProp('ActiveSound', snd.active, env);
  s += prop('Obituary', zstr(`%o was killed by ${a.name}.`)) + prop('Tag', zstr(a.name));
  const drop = env.cls(p.drop);
  if (drop) s += prop('DropItem', zstr(drop));
  s += '\t}\n\tStates\n\t{\n\tSpawn:\n' + idle.fr.map(f => st(f, idle.tics, 'A_Look')).join('\n') + '\n\t\tLoop;\n';
  s += '\tSee:\n' + walk.fr.map(f => st(f, walk.tics, 'A_Chase')).join('\n') + '\n\t\tLoop;\n';
  const attack = (label, an, fn) => {
    const at = an.at === undefined || an.at < 0 || an.at >= an.fr.length ? an.fr.length - 1 : an.at;
    return `\t${label}:\n` + an.fr.map((f, i) => st(f, an.tics, i === at ? fn + '()' : 'A_FaceTarget')).join('\n') + '\n\t\tGoto See;\n';
  };
  if (melee) s += attack('Melee', melee, 'HF_Melee');
  if (ranged) s += attack('Missile', ranged, 'HF_Missile');
  if (pain.ok) s += '\tPain:\n' + st(pain.fr[0], pain.tics) + '\n' + (pain.fr.length > 1 ? pain.fr.slice(1) : pain.fr).map((f, i) => st(f, pain.tics, i === 0 ? 'A_Pain' : '')).join('\n') + '\n\t\tGoto See;\n';
  s += '\tDeath:\n';
  if (death.ok) {
    const n = death.fr.length, sIdx = Math.min(1, n - 1), bIdx = Math.min(2, n - 1);
    s += death.fr.map((f, i) => st(f, i === n - 1 ? -1 : death.tics, sIdx === bIdx && i === sIdx ? '{ A_Scream(); A_NoBlocking(); }' : i === sIdx ? 'A_Scream' : i === bIdx ? 'A_NoBlocking' : '')).join('\n') + '\n\t\tStop;\n';
  } else s += '\t\tTNT1 A 1 { A_Scream(); A_NoBlocking(); }\n\t\tStop;\n';
  s += '\t}\n';
  if (melee) s += `\tvoid HF_Melee()\n\t{\n\t\tif (target)\n\t\t{\n\t\t\tA_FaceTarget();\n${N(p.melee.dmg) > 0 ? `\t\t\tA_CustomMeleeAttack(${I(p.melee.dmg)}, ${zstr(env.snd(snd.attack))});\n` : ''}\t\t}\n${calls(sc.hooks.attackMelee)}\n\t}\n`;
  if (ranged) {
    let body = '';
    const cnt = Math.max(1, Math.min(40, I(rg.count, 1))), spread = N(rg.spread);
    if (rg.type === 'proj') {
      const pc = env.cls(rg.proj);
      if (pc) body = `\t\t\tfor (int i = 0; i < ${cnt}; i++)\n\t\t\t{\n\t\t\t\tActor m = HF.Shoot(self, ${zstr(pc)}, target);\n${spread > 0 ? `\t\t\t\tif (m) { m.angle += frandom(-${spread}, ${spread}); m.VelFromAngle(); }\n` : ''}\t\t\t}\n`;
    } else if (rg.type === 'bullets') {
      body = `\t\t\tA_StartSound(AttackSound, CHAN_WEAPON);\n\t\t\tA_CustomBulletAttack(${spread}, ${spread / 2}, ${cnt}, ${I(rg.dmg, 9)}, "BulletPuff", 0, CBAF_NORANDOM);\n`;
    }
    s += `\tvoid HF_Missile()\n\t{\n\t\tif (target)\n\t\t{\n\t\t\tA_FaceTarget();\n${body}\t\t}\n${calls(sc.hooks.attackRanged)}\n\t}\n`;
  }
  return s + v.init + commonOverrides(sc) + sc.methods.join('\n') + '\n}\n';
}

// ---------------------------------------------------------------- prop
function genProp(a, env) {
  const p = a.p, sc = compileScripts(a, 'prop', env), v = varDecls(a);
  const idle = pick(a, env, 'idle'), death = pick(a, env, 'death');
  const breakable = I(p.health) > 0, br = p.glow ? 'Bright' : '';
  let s = head(a, 'Actor') + fieldsOf(sc) + v.fields + '\tint hfTouch;\n\tDefault\n\t{\n';
  s += prop('Radius', N(p.radius, 16)) + prop('Height', N(p.height, 48)) + prop('Scale', N(p.scale, 1)) + prop('Tag', zstr(a.name));
  if (p.solid) s += '\t\t+SOLID\n';
  if (breakable) s += prop('Health', I(p.health)) + '\t\t+SHOOTABLE\n\t\t+NOBLOOD\n' + sndProp('DeathSound', p.sounds && p.sounds.death, env);
  if (p.hang) s += '\t\t+SPAWNCEILING\n\t\t+NOGRAVITY\n';
  if (sc.hooks.touch) s += '\t\t+SPECIAL\n';
  s += '\t}\n\tStates\n\t{\n\tSpawn:\n';
  s += idle.fr.length > 1 ? idle.fr.map(f => st(f, idle.tics, br)).join('\n') + '\n\t\tLoop;\n' : st(idle.fr[0], -1, br) + '\n\t\tStop;\n';
  if (breakable) {
    const act = `{ A_Scream(); A_NoBlocking();${I(p.boom) > 0 ? ` A_Explode(${I(p.boomDmg, 100)}, ${I(p.boom)});` : ''} }`;
    s += '\tDeath:\n' + (death.ok ? death.fr.map((f, i) => st(f, death.tics, 'Bright' + (i === Math.min(1, death.fr.length - 1) ? ' ' + act : ''))).join('\n') : `\t\tTNT1 A 1 ${act}`) + '\n\t\tStop;\n';
  }
  return s + '\t}\n' + v.init + commonOverrides(sc, { alive: 'health > 0' }) + sc.methods.join('\n') + '\n}\n';
}

// ---------------------------------------------------------------- projectile
function genProjectile(a, env) {
  const p = a.p, sc = compileScripts(a, 'projectile', env), v = varDecls(a);
  const fly = pick(a, env, 'fly', 'hit'), hit = pick(a, env, 'hit');
  const br = p.glow ? 'Bright' : '', snd = p.sounds || {};
  let s = head(a, 'Actor') + fieldsOf(sc) + v.fields + '\tDefault\n\t{\n';
  s += prop('Radius', N(p.radius, 6)) + prop('Height', N(p.height, 8)) + prop('Speed', N(p.speed, 15)) + `\t\tDamageFunction (${I(p.dmg, 10)});\n` + prop('Scale', N(p.scale, 1));
  s += '\t\tProjectile;\n\t\t+RANDOMIZE\n';
  if (p.glow) s += '\t\tRenderStyle "Add";\n';
  if (p.gravity) s += '\t\t-NOGRAVITY\n\t\tGravity 0.35;\n';
  if (p.bounce) s += '\t\tBounceType "Doom";\n\t\tBounceCount 4;\n\t\tBounceFactor 0.65;\n';
  if (p.homing) s += '\t\t+SEEKERMISSILE\n';
  s += sndProp('SeeSound', snd.see, env) + sndProp('DeathSound', snd.death, env);
  s += '\t}\n\tStates\n\t{\n\tSpawn:\n' + fly.fr.map(f => st(f, fly.tics, (br + (p.homing ? ' A_SeekerMissile(8, 16)' : '')).trim())).join('\n') + '\n\t\tLoop;\n';
  const needHit = I(p.boom) > 0 || sc.hooks.hit;
  s += '\tDeath:\n' + (hit.ok ? hit.fr.map((f, i) => st(f, hit.tics, (br + (i === 0 && needHit ? ' HF_Hit()' : '')).trim())).join('\n') : `\t\tTNT1 A 1${needHit ? ' HF_Hit()' : ''};`) + '\n\t\tStop;\n\t}\n';
  if (needHit) s += `\tvoid HF_Hit()\n\t{\n${I(p.boom) > 0 ? `\t\tA_Explode(${I(p.boomDmg, 64)}, ${I(p.boom)});\n` : ''}${calls(sc.hooks.hit)}\n\t}\n`;
  return s + v.init + commonOverrides(sc, { alive: 'true' }) + sc.methods.join('\n') + '\n}\n';
}

// ---------------------------------------------------------------- weapon
function genWeapon(a, env) {
  const p = a.p, sc = compileScripts(a, 'weapon', env), v = varDecls(a, true);
  const ready = pick(a, env, 'ready', 'fire'), fire = pick(a, env, 'fire', 'ready'), flash = pick(a, env, 'flash'), pk = pick(a, env, 'pickup', 'ready', 'fire');
  const atk = p.attack || { type: 'bullets' };
  const ammo = env.ammoCls(p.ammo);
  let s = head(a, 'Weapon') + fieldsOf(sc) + v.fields + '\tDefault\n\t{\n';
  s += prop('Weapon.SlotNumber', Math.max(0, Math.min(9, I(p.slot, 2)))) + prop('Weapon.SelectionOrder', 3000 - I(p.slot, 2) * 250) + prop('Weapon.Kickback', 100);
  if (ammo) s += prop('Weapon.AmmoType', zstr(ammo)) + prop('Weapon.AmmoUse', Math.max(0, I(p.ammoUse, 1))) + prop('Weapon.AmmoGive', Math.max(0, I(p.ammoGive, 10)));
  if (atk.type === 'melee') s += '\t\t+WEAPON.MELEEWEAPON\n';
  s += prop('Inventory.PickupMessage', zstr(p.msg || `You got the ${a.name}!`)) + prop('Tag', zstr(a.name)) + prop('Obituary', zstr(`%o was killed by %k's ${a.name}.`));
  s += '\t}\n\tStates\n\t{\n\tSpawn:\n' + st(pk.fr[0], -1) + '\n\t\tStop;\n';
  s += '\tReady:\n' + ready.fr.map(f => `\t\t${f.s} ${f.f.repeat(Math.min(35, ready.tics))} 1 A_WeaponReady;`).join('\n') + '\n\t\tLoop;\n';
  s += '\tDeselect:\n' + st(ready.fr[0], 1, 'A_Lower') + '\n\t\tLoop;\n';
  s += '\tSelect:\n' + (sc.hooks.equip ? st(ready.fr[0], 0, 'HF_Equip()') + '\n\tSelectLoop:\n' : '') + st(ready.fr[0], 1, 'A_Raise') + '\n\t\tLoop;\n';
  const fireStates = (label, fn) => {
    const at = fire.at === undefined || fire.at >= fire.fr.length ? 0 : fire.at;
    return `\t${label}:\n` + fire.fr.map((f, i) => st(f, fire.tics, at < 0 || i === at ? fn + '()' : '')).join('\n') + '\n' + st(fire.fr[fire.fr.length - 1], 0, 'A_ReFire') + '\n\t\tGoto Ready;\n';
  };
  s += fireStates('Fire', 'HF_Fire');
  if (sc.hooks.altfire) s += fireStates('AltFire', 'HF_AltFire');
  s += '\tFlash:\n' + (flash.ok ? flash.fr.map(f => st(f, flash.tics, 'Bright A_Light1')).join('\n') : '\t\tTNT1 A 3 A_Light1;') + '\n\t\tGoto LightDone;\n\t}\n';
  let body = '';
  const cnt = Math.max(1, Math.min(60, I(atk.count, 1))), spread = N(atk.spread);
  if (atk.type === 'bullets') body = `\t\tA_FireBullets(${spread}, ${spread}, ${cnt}, ${I(atk.dmg, 10)}, "BulletPuff", FBF_NORANDOM);\n`;
  else if (atk.type === 'proj') { const pc = env.cls(atk.proj); if (pc) body = `\t\tfor (int i = 0; i < ${cnt}; i++) A_FireProjectile(${zstr(pc)}, ${spread > 0 ? `frandom(-${spread}, ${spread})` : '0'}, false);\n`; }
  else if (atk.type === 'melee') body = `\t\tA_CustomPunch(${I(atk.dmg, 10)}, true, 0, "BulletPuff");\n`;
  const fs = env.snd(p.sound);
  s += `\taction void HF_Fire()\n\t{\n\t\tif (!invoker.DepleteAmmo(invoker.bAltFire, true)) return;\n\t\tA_GunFlash();\n${fs ? `\t\tA_StartSound(${zstr(fs)}, CHAN_WEAPON);\n` : ''}${body}${calls(sc.hooks.fire)}\n\t}\n`;
  if (sc.hooks.altfire) s += `\taction void HF_AltFire()\n\t{\n${calls(sc.hooks.altfire)}\n\t}\n`;
  if (sc.hooks.equip) s += `\taction void HF_Equip()\n\t{\n${calls(sc.hooks.equip)}\n\t}\n`;
  return s + v.init + sc.methods.join('\n') + '\n}\n';
}

// ---------------------------------------------------------------- pickup
function genPickup(a, env) {
  const p = a.p, sc = compileScripts(a, 'pickup', env), v = varDecls(a);
  const idle = pick(a, env, 'idle'), br = p.glow ? 'Bright' : '';
  const amount = Math.max(1, I(p.amount, 1)), max = Math.max(amount, I(p.max, 100));
  const base = { health: 'Health', armor: 'BasicArmorBonus', ammo: 'Ammo', power: 'PowerupGiver', item: 'Inventory' }[p.effect] || 'Inventory';
  let s = head(a, base) + fieldsOf(sc) + v.fields + '\tActor hfUser;\n\tDefault\n\t{\n';
  if (p.effect === 'armor') s += '\t\tArmor.SavePercent 33.335;\n' + prop('Armor.SaveAmount', amount) + prop('Armor.MaxSaveAmount', max);
  else if (p.effect === 'power') s += prop('Powerup.Type', zstr(String(p.power || 'PowerInvulnerable').replace(/[^A-Za-z0-9_]/g, ''))) + prop('Powerup.Duration', -Math.max(1, I(p.secs, 30))) + '\t\tInventory.MaxAmount 0;\n\t\t+INVENTORY.AUTOACTIVATE\n\t\t+INVENTORY.ALWAYSPICKUP\n\t\t+COUNTITEM\n';
  else {
    s += prop('Inventory.Amount', amount) + prop('Inventory.MaxAmount', max);
    if (p.effect === 'ammo') s += prop('Ammo.BackpackAmount', amount) + prop('Ammo.BackpackMaxAmount', max * 2);
    if (p.effect === 'item') s += '\t\t+COUNTITEM\n';
  }
  s += prop('Inventory.PickupMessage', zstr(p.msg || `Picked up ${a.name}.`)) + sndProp('Inventory.PickupSound', p.sound, env) + prop('Scale', N(p.scale, 1)) + prop('Tag', zstr(a.name));
  if (p.float) s += '\t\t+FLOATBOB\n\t\t+NOGRAVITY\n';
  s += '\t}\n\tStates\n\t{\n\tSpawn:\n';
  s += idle.fr.length > 1 ? idle.fr.map(f => st(f, idle.tics, br)).join('\n') + '\n\t\tLoop;\n' : st(idle.fr[0], -1, br) + '\n\t\tStop;\n';
  s += '\t}\n';
  if (sc.hooks.pickup) s += `\toverride void DoPickupSpecial(Actor toucher)\n\t{\n\t\tSuper.DoPickupSpecial(toucher);\n\t\thfUser = toucher;\n${calls(sc.hooks.pickup)}\n\t}\n`;
  return s + v.init + sc.methods.join('\n') + '\n}\n';
}

export function genActor(a, env) {
  switch (a.kind) {
    case 'monster': return genMonster(a, env);
    case 'prop': return genProp(a, env);
    case 'projectile': return genProjectile(a, env);
    case 'weapon': return genWeapon(a, env);
    case 'pickup': return genPickup(a, env);
  }
  return '';
}

// ---------------------------------------------------------------- player, globals, event handlers
export function genPlayer(project, env) {
  const pl = project.game.player || {};
  const sp = Math.max(0.2, Math.min(3, N(pl.speed, 1)));
  let s = 'class HF_Player : DoomPlayer\n{\n\tDefault\n\t{\n';
  s += prop('Health', Math.max(1, I(pl.health, 100))) + prop('Player.MaxHealth', Math.max(1, I(pl.health, 100))) + prop('Player.JumpZ', N(pl.jump, 8));
  s += `\t\tPlayer.ForwardMove ${sp}, ${sp};\n\t\tPlayer.SideMove ${sp}, ${sp};\n\t\tPlayer.DisplayName "Marine";\n`;
  const items = (pl.items || []).map(it => ({ c: env.cls(it.cls), n: Math.max(1, I(it.n, 1)) })).filter(it => it.c);
  if (!items.length) items.push({ c: 'Fist', n: 1 });
  for (const it of items) s += `\t\tPlayer.StartItem ${zstr(it.c)}${it.n > 1 ? ', ' + it.n : ''};\n`;
  return s + '\t}\n}\n';
}

export function genGlobals(project) {
  const vars = project.vars || [];
  return `class HFG : Thinker
{
${vars.map(v => `\tdouble v_${v.id};\n`).join('')}\tdouble dummy;
	static HFG Get()
	{
		ThinkerIterator it = ThinkerIterator.Create("HFG", STAT_STATIC);
		HFG g = HFG(it.Next());
		if (!g)
		{
			g = new("HFG");
			g.ChangeStatNum(STAT_STATIC);
${vars.map(v => `\t\t\tg.v_${v.id} = ${N(v.init)};\n`).join('')}		}
		return g;
	}
}
`;
}

// owner.scripts with kind 'level' | 'game'
export function genHandler(cls, owner, kind, env) {
  const sc = compileScripts(owner, kind, env), h = sc.hooks;
  if (!sc.methods.length) return '';
  let s = `class ${cls} : EventHandler\n{\n` + fieldsOf(sc) + '\tbool hfStarted;\n\tbool hfAllDead;\n\tSector hfSec;\n';
  s += '\toverride void WorldTick()\n\t{\n\t\tActor pm = HF.Plr(null);\n';
  if (h.start) s += `\t\tif (!hfStarted)\n\t\t{\n\t\t\thfStarted = true;\n${calls(h.start, '\t\t\t')}\n\t\t}\n`;
  if (h.enter) s += `\t\tif (pm && pm.CurSector != hfSec)\n\t\t{\n\t\t\thfSec = pm.CurSector;\n${h.enter.map(x => `\t\t\tif (HF.InTag(pm, ${env.tag(x.a.room) | 0})) ${x.fn}();`).join('\n')}\n\t\t}\n`;
  if (h.allDead) s += `\t\tif (!hfAllDead && level.total_monsters > 0 && level.killed_monsters >= level.total_monsters)\n\t\t{\n\t\t\thfAllDead = true;\n${calls(h.allDead, '\t\t\t')}\n\t\t}\n`;
  s += tickBody(sc, 'true').join('\n') + '\n\t}\n';
  if (h.kill || h.playerDies) {
    s += '\toverride void WorldThingDied(WorldEvent e)\n\t{\n\t\tif (!e.Thing) return;\n';
    s += `\t\tif (e.Thing.player)\n\t\t{\n${calls(h.playerDies, '\t\t\t')}\n\t\t\treturn;\n\t\t}\n`;
    for (const x of h.kill || []) { const c = env.cls(x.a.monster); s += c ? `\t\tif (e.Thing is ${zstr(c)}) ${x.fn}();\n` : `\t\tif (e.Thing.bIsMonster) ${x.fn}();\n`; }
    s += '\t}\n';
  }
  return s + sc.methods.join('\n') + '\n}\n';
}
