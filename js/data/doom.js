// Built-in Doom content catalog + templates for custom things. Pure data (also used by the compiler in Node).

// [class, editor number, label, category, icon sprite lump, radius]
const T = (cls, ed, name, cat, spr, r = 20, extra = {}) => ({ cls, ed, name, cat, spr, r, ...extra });
export const THINGS = [
  T('Player1Start', 1, 'Player Start', 'markers', 'PLAYA1', 16, { dir: true }),
  T('TeleportDest', 14, 'Teleport Exit', 'markers', 'TFOGB0', 16, { dir: true, named: true }),
  T('MapSpot', 9001, 'Marker (for scripts)', 'markers', '', 12, { named: true, dir: true }),

  T('ZombieMan', 3004, 'Zombieman', 'monsters', 'POSSA1', 20, { dir: true }),
  T('ShotgunGuy', 9, 'Shotgun Guy', 'monsters', 'SPOSA1', 20, { dir: true }),
  T('ChaingunGuy', 65, 'Chaingunner', 'monsters', 'CPOSA1', 20, { dir: true }),
  T('DoomImp', 3001, 'Imp', 'monsters', 'TROOA1', 20, { dir: true }),
  T('Demon', 3002, 'Pinky Demon', 'monsters', 'SARGA1', 30, { dir: true }),
  T('Spectre', 58, 'Spectre', 'monsters', 'SARGA1', 30, { dir: true, ghost: true }),
  T('LostSoul', 3006, 'Lost Soul', 'monsters', 'SKULA1', 16, { dir: true }),
  T('Cacodemon', 3005, 'Cacodemon', 'monsters', 'HEADA1', 31, { dir: true }),
  T('HellKnight', 69, 'Hell Knight', 'monsters', 'BOS2A1', 24, { dir: true }),
  T('BaronOfHell', 3003, 'Baron of Hell', 'monsters', 'BOSSA1', 24, { dir: true }),
  T('Revenant', 66, 'Revenant', 'monsters', 'SKELA1', 20, { dir: true }),
  T('Fatso', 67, 'Mancubus', 'monsters', 'FATTA1', 48, { dir: true }),
  T('Arachnotron', 68, 'Arachnotron', 'monsters', 'BSPIA1', 64, { dir: true }),
  T('PainElemental', 71, 'Pain Elemental', 'monsters', 'PAINA1', 31, { dir: true }),
  T('Archvile', 64, 'Arch-Vile', 'monsters', 'VILEA1', 20, { dir: true }),
  T('Cyberdemon', 16, 'Cyberdemon', 'monsters', 'CYBRA1', 40, { dir: true }),
  T('SpiderMastermind', 7, 'Spider Mastermind', 'monsters', 'SPIDA1', 100, { dir: true }),
  T('WolfensteinSS', 84, 'Wolfenstein SS', 'monsters', 'SSWVA1', 20, { dir: true }),

  T('Chainsaw', 2005, 'Chainsaw', 'weapons', 'CSAWA0'),
  T('Shotgun', 2001, 'Shotgun', 'weapons', 'SHOTA0'),
  T('SuperShotgun', 82, 'Super Shotgun', 'weapons', 'SGN2A0'),
  T('Chaingun', 2002, 'Chaingun', 'weapons', 'MGUNA0'),
  T('RocketLauncher', 2003, 'Rocket Launcher', 'weapons', 'LAUNA0'),
  T('PlasmaRifle', 2004, 'Plasma Rifle', 'weapons', 'PLASA0'),
  T('BFG9000', 2006, 'BFG 9000', 'weapons', 'BFUGA0'),

  T('Clip', 2007, 'Bullet Clip', 'items', 'CLIPA0'),
  T('ClipBox', 2048, 'Box of Bullets', 'items', 'AMMOA0'),
  T('Shell', 2008, 'Shotgun Shells', 'items', 'SHELA0'),
  T('ShellBox', 2049, 'Box of Shells', 'items', 'SBOXA0'),
  T('RocketAmmo', 2010, 'Rocket', 'items', 'ROCKA0'),
  T('RocketBox', 2046, 'Box of Rockets', 'items', 'BROKA0'),
  T('Cell', 2047, 'Energy Cell', 'items', 'CELLA0'),
  T('CellPack', 17, 'Energy Pack', 'items', 'CELPA0'),
  T('Backpack', 8, 'Backpack', 'items', 'BPAKA0'),
  T('Stimpack', 2011, 'Stimpack (+10)', 'items', 'STIMA0'),
  T('Medikit', 2012, 'Medikit (+25)', 'items', 'MEDIA0'),
  T('HealthBonus', 2014, 'Health Bonus', 'items', 'BON1A0'),
  T('ArmorBonus', 2015, 'Armor Bonus', 'items', 'BON2A0'),
  T('GreenArmor', 2018, 'Green Armor', 'items', 'ARM1A0'),
  T('BlueArmor', 2019, 'Blue Armor', 'items', 'ARM2A0'),
  T('Soulsphere', 2013, 'Soulsphere', 'items', 'SOULA0'),
  T('Megasphere', 83, 'Megasphere', 'items', 'MEGAA0'),
  T('InvulnerabilitySphere', 2022, 'Invulnerability', 'items', 'PINVA0'),
  T('Berserk', 2023, 'Berserk Pack', 'items', 'PSTRA0'),
  T('BlurSphere', 2024, 'Invisibility', 'items', 'PINSA0'),
  T('RadSuit', 2025, 'Radiation Suit', 'items', 'SUITA0'),
  T('Allmap', 2026, 'Computer Map', 'items', 'PMAPA0'),
  T('Infrared', 2045, 'Light Goggles', 'items', 'PVISA0'),
  T('RedCard', 13, 'Red Keycard', 'items', 'RKEYA0'),
  T('BlueCard', 5, 'Blue Keycard', 'items', 'BKEYA0'),
  T('YellowCard', 6, 'Yellow Keycard', 'items', 'YKEYA0'),
  T('RedSkull', 38, 'Red Skull Key', 'items', 'RSKUA0'),
  T('BlueSkull', 40, 'Blue Skull Key', 'items', 'BSKUA0'),
  T('YellowSkull', 39, 'Yellow Skull Key', 'items', 'YSKUA0'),

  T('ExplosiveBarrel', 2035, 'Exploding Barrel', 'decor', 'BAR1A0', 10),
  T('BurningBarrel', 70, 'Burning Barrel', 'decor', 'FCANA0', 16),
  T('Column', 2028, 'Floor Lamp', 'decor', 'COLUA0', 16),
  T('TechLamp', 85, 'Tall Tech Lamp', 'decor', 'TLMPA0', 16),
  T('TechLamp2', 86, 'Short Tech Lamp', 'decor', 'TLP2A0', 16),
  T('Candlestick', 34, 'Candle', 'decor', 'CANDA0', 12),
  T('Candelabra', 35, 'Candelabra', 'decor', 'CBRAA0', 16),
  T('RedTorch', 46, 'Tall Red Torch', 'decor', 'TREDA0', 16),
  T('BlueTorch', 44, 'Tall Blue Torch', 'decor', 'TBLUA0', 16),
  T('GreenTorch', 45, 'Tall Green Torch', 'decor', 'TGRNA0', 16),
  T('ShortRedTorch', 57, 'Short Red Torch', 'decor', 'SMRTA0', 16),
  T('ShortBlueTorch', 55, 'Short Blue Torch', 'decor', 'SMBTA0', 16),
  T('ShortGreenTorch', 56, 'Short Green Torch', 'decor', 'SMGTA0', 16),
  T('TallGreenColumn', 30, 'Tall Green Pillar', 'decor', 'COL1A0', 16),
  T('ShortGreenColumn', 31, 'Short Green Pillar', 'decor', 'COL2A0', 16),
  T('TallRedColumn', 32, 'Tall Red Pillar', 'decor', 'COL3A0', 16),
  T('ShortRedColumn', 33, 'Short Red Pillar', 'decor', 'COL4A0', 16),
  T('TechPillar', 48, 'Tech Pillar', 'decor', 'ELECA0', 16),
  T('TorchTree', 43, 'Burnt Tree', 'decor', 'TRE1A0', 16),
  T('BigTree', 54, 'Big Tree', 'decor', 'TRE2A0', 32),
  T('Stalagtite', 47, 'Stalagmite', 'decor', 'SMITA0', 16),
  T('EvilEye', 41, 'Evil Eye', 'decor', 'CEYEA0', 16),
  T('FloatingSkull', 42, 'Floating Skull Rock', 'decor', 'FSKUA0', 16),
  T('HeadOnAStick', 27, 'Head on a Stick', 'decor', 'POL4A0', 16),
  T('HeadsOnAStick', 28, 'Skull Pile on a Stick', 'decor', 'POL2A0', 16),
  T('DeadMarine', 15, 'Dead Marine', 'decor', 'PLAYN0', 16),
  T('GibbedMarine', 10, 'Bloody Mess', 'decor', 'PLAYW0', 16),
  T('DeadZombieMan', 18, 'Dead Zombieman', 'decor', 'POSSL0', 16),
  T('DeadDoomImp', 20, 'Dead Imp', 'decor', 'TROOM0', 16),
  T('Gibs', 24, 'Pool of Blood', 'decor', 'POL5A0', 16),
];
export const THING_BY_CLS = Object.fromEntries(THINGS.map(t => [t.cls, t]));
export const THING_CATS = [
  ['markers', 'Player & Markers'], ['monsters', 'Monsters'], ['weapons', 'Weapons'], ['items', 'Items'], ['decor', 'Decoration'], ['custom', 'My Things'],
];

// Classes offered in dropdowns (always available in the engine, even if the IWAD lacks sprites for some).
export const BUILTIN_PROJECTILES = [
  ['DoomImpBall', 'Imp fireball'], ['CacodemonBall', 'Cacodemon ball'], ['BaronBall', 'Baron slime ball'], ['Rocket', 'Rocket'],
  ['PlasmaBall', 'Plasma bolt'], ['BFGBall', 'BFG ball'], ['ArachnotronPlasma', 'Arachnotron plasma'], ['RevenantTracer', 'Homing missile'], ['FatShot', 'Mancubus fireball'],
];
export const BUILTIN_AMMO = [['Clip', 'Bullets'], ['Shell', 'Shells'], ['RocketAmmo', 'Rockets'], ['Cell', 'Energy cells']];
export const BUILTIN_WEAPONS = [['Fist', 'Fist'], ['Chainsaw', 'Chainsaw'], ['Pistol', 'Pistol'], ['Shotgun', 'Shotgun'], ['SuperShotgun', 'Super Shotgun'], ['Chaingun', 'Chaingun'], ['RocketLauncher', 'Rocket Launcher'], ['PlasmaRifle', 'Plasma Rifle'], ['BFG9000', 'BFG 9000']];
export const BUILTIN_ITEMS = [
  ...BUILTIN_WEAPONS, ...BUILTIN_AMMO,
  ['RedCard', 'Red keycard'], ['BlueCard', 'Blue keycard'], ['YellowCard', 'Yellow keycard'], ['RedSkull', 'Red skull key'], ['BlueSkull', 'Blue skull key'], ['YellowSkull', 'Yellow skull key'],
  ['Backpack', 'Backpack'], ['HealthBonus', 'Health bonus'], ['ArmorBonus', 'Armor bonus'], ['GreenArmor', 'Green armor'], ['BlueArmor', 'Blue armor'],
  ['Berserk', 'Berserk'], ['InvulnerabilitySphere', 'Invulnerability'], ['BlurSphere', 'Invisibility'], ['RadSuit', 'Radiation suit'], ['Infrared', 'Light goggles'],
];
export const LOCKS = [[0, 'No lock'], [2, 'Blue key'], [1, 'Red key'], [3, 'Yellow key']];

export const ROOM_KINDS = {
  room: { name: 'Room', icon: 'square', color: '#4c8dff' },
  door: { name: 'Door', icon: 'door', color: '#ffb020' },
  lift: { name: 'Lift', icon: 'lift', color: '#37d67a' },
  stairs: { name: 'Stairs', icon: 'stairs', color: '#b48cff' },
  solid: { name: 'Solid Block', icon: 'block', color: '#6b7389' },
  exit: { name: 'Exit Pad', icon: 'exit', color: '#ff4d5e' },
  teleport: { name: 'Teleporter', icon: 'teleport', color: '#ff5ad1' },
};

export const ACTOR_KINDS = {
  monster: { name: 'Monster', icon: 'ghost', color: '#ff5a36', blurb: 'An enemy that hunts the player' },
  weapon: { name: 'Weapon', icon: 'gun', color: '#ffb020', blurb: 'Something the player holds and fires' },
  projectile: { name: 'Projectile', icon: 'fire', color: '#ff5ad1', blurb: 'A fireball, rocket or bullet that flies' },
  pickup: { name: 'Pickup', icon: 'heart', color: '#37d67a', blurb: 'Health, ammo, armor, keys, collectibles' },
  prop: { name: 'Prop / Object', icon: 'lamp', color: '#4c8dff', blurb: 'Decoration, switch, NPC, trap, barrel...' },
};

const anim = (src, frames, tics, at) => ({ src, frames: [...frames].map(c => c.charCodeAt(0) - 65), tics, ...(at !== undefined ? { at } : {}) });
const snd = (see, attack, pain, death, active) => ({ see, attack, pain, death, active });

// Templates: a full, editable starting point for a new custom thing. `needs` = IWAD sprite that must exist.
export const TEMPLATES = {
  monster: [
    { name: 'Blank monster', blank: true, p: { health: 60, speed: 8, radius: 20, height: 56, mass: 100, painChance: 200, scale: 1, flying: false, melee: { on: true, dmg: 10 }, ranged: { type: 'none', proj: 'DoomImpBall', count: 1, dmg: 9, spread: 10 }, sounds: snd('', '', '', '', ''), drop: '' }, anims: {} },
    { name: 'Imp', needs: 'TROOA1', p: { health: 60, speed: 8, radius: 20, height: 56, mass: 100, painChance: 200, scale: 1, flying: false, melee: { on: true, dmg: 13 }, ranged: { type: 'proj', proj: 'DoomImpBall', count: 1, dmg: 9, spread: 0 }, sounds: snd('imp/sight', 'imp/melee', 'imp/pain', 'imp/death', 'imp/active'), drop: '' },
      anims: { idle: anim('TROO', 'AB', 10), walk: anim('TROO', 'AABBCCDD', 3), melee: anim('TROO', 'EFG', 7), ranged: anim('TROO', 'EFG', 7), pain: anim('TROO', 'H', 2), death: anim('TROO', 'IJKLM', 7) } },
    { name: 'Zombieman', needs: 'POSSA1', p: { health: 20, speed: 8, radius: 20, height: 56, mass: 100, painChance: 200, scale: 1, flying: false, melee: { on: false, dmg: 10 }, ranged: { type: 'bullets', proj: 'DoomImpBall', count: 1, dmg: 9, spread: 22 }, sounds: snd('grunt/sight', 'grunt/attack', 'grunt/pain', 'grunt/death', 'grunt/active'), drop: 'Clip' },
      anims: { idle: anim('POSS', 'AB', 10), walk: anim('POSS', 'AABBCCDD', 4), ranged: anim('POSS', 'EFE', 9, 1), pain: anim('POSS', 'G', 3), death: anim('POSS', 'HIJKL', 5) } },
    { name: 'Shotgun Guy', needs: 'SPOSA1', p: { health: 30, speed: 8, radius: 20, height: 56, mass: 100, painChance: 170, scale: 1, flying: false, melee: { on: false, dmg: 10 }, ranged: { type: 'bullets', proj: 'DoomImpBall', count: 3, dmg: 9, spread: 22 }, sounds: snd('shotguy/sight', 'shotguy/attack', 'shotguy/pain', 'shotguy/death', 'shotguy/active'), drop: 'Shotgun' },
      anims: { idle: anim('SPOS', 'AB', 10), walk: anim('SPOS', 'AABBCCDD', 3), ranged: anim('SPOS', 'EFE', 10, 1), pain: anim('SPOS', 'G', 3), death: anim('SPOS', 'HIJKL', 5) } },
    { name: 'Pinky Demon', needs: 'SARGA1', p: { health: 150, speed: 10, radius: 30, height: 56, mass: 400, painChance: 180, scale: 1, flying: false, melee: { on: true, dmg: 22 }, ranged: { type: 'none', proj: 'DoomImpBall', count: 1, dmg: 9, spread: 0 }, sounds: snd('demon/sight', 'demon/melee', 'demon/pain', 'demon/death', 'demon/active'), drop: '' },
      anims: { idle: anim('SARG', 'AB', 10), walk: anim('SARG', 'AABBCCDD', 2), melee: anim('SARG', 'EFG', 8), pain: anim('SARG', 'H', 2), death: anim('SARG', 'IJKLMN', 6) } },
    { name: 'Cacodemon', needs: 'HEADA1', p: { health: 400, speed: 8, radius: 31, height: 56, mass: 400, painChance: 128, scale: 1, flying: true, melee: { on: true, dmg: 35 }, ranged: { type: 'proj', proj: 'CacodemonBall', count: 1, dmg: 9, spread: 0 }, sounds: snd('caco/sight', '', 'caco/pain', 'caco/death', 'caco/active'), drop: '' },
      anims: { idle: anim('HEAD', 'A', 10), walk: anim('HEAD', 'A', 3), melee: anim('HEAD', 'BCD', 5), ranged: anim('HEAD', 'BCD', 5), pain: anim('HEAD', 'EEF', 4), death: anim('HEAD', 'GHIJKL', 8) } },
    { name: 'Baron of Hell', needs: 'BOSSA1', p: { health: 1000, speed: 8, radius: 24, height: 64, mass: 1000, painChance: 50, scale: 1, flying: false, melee: { on: true, dmg: 45 }, ranged: { type: 'proj', proj: 'BaronBall', count: 1, dmg: 9, spread: 0 }, sounds: snd('baron/sight', 'baron/melee', 'baron/pain', 'baron/death', 'baron/active'), drop: '' },
      anims: { idle: anim('BOSS', 'AB', 10), walk: anim('BOSS', 'AABBCCDD', 3), melee: anim('BOSS', 'EFG', 8), ranged: anim('BOSS', 'EFG', 8), pain: anim('BOSS', 'H', 2), death: anim('BOSS', 'IJKLMNO', 8) } },
  ],
  weapon: [
    { name: 'Blank weapon', blank: true, p: { slot: 2, ammo: 'Clip', ammoUse: 1, ammoGive: 20, attack: { type: 'bullets', count: 1, dmg: 10, spread: 4, proj: 'Rocket' }, sound: 'weapons/pistol', auto: true, msg: 'You got a new weapon!' }, anims: {} },
    { name: 'Pistol', needs: 'PISGA0', p: { slot: 2, ammo: 'Clip', ammoUse: 1, ammoGive: 20, attack: { type: 'bullets', count: 1, dmg: 10, spread: 4, proj: 'Rocket' }, sound: 'weapons/pistol', auto: true, msg: 'You got the pistol!' },
      anims: { pickup: anim('PIST', 'A', 10), ready: anim('PISG', 'A', 1), fire: anim('PISG', 'ABCB', 5, 1), flash: anim('PISF', 'A', 7) } },
    { name: 'Shotgun', needs: 'SHTGA0', p: { slot: 3, ammo: 'Shell', ammoUse: 1, ammoGive: 8, attack: { type: 'bullets', count: 7, dmg: 10, spread: 5.6, proj: 'Rocket' }, sound: 'weapons/shotgf', auto: true, msg: 'You got the shotgun!' },
      anims: { pickup: anim('SHOT', 'A', 10), ready: anim('SHTG', 'A', 1), fire: anim('SHTG', 'AABCDCBA', 5, 1), flash: anim('SHTF', 'AB', 4) } },
    { name: 'Chaingun', needs: 'CHGGA0', p: { slot: 4, ammo: 'Clip', ammoUse: 1, ammoGive: 20, attack: { type: 'bullets', count: 1, dmg: 10, spread: 5.6, proj: 'Rocket' }, sound: 'weapons/chngun', auto: true, msg: 'You got the chaingun!' },
      anims: { pickup: anim('MGUN', 'A', 10), ready: anim('CHGG', 'A', 1), fire: anim('CHGG', 'AB', 4, -1), flash: anim('CHGF', 'AB', 4) } },
    { name: 'Rocket Launcher', needs: 'MISGA0', p: { slot: 5, ammo: 'RocketAmmo', ammoUse: 1, ammoGive: 2, attack: { type: 'proj', count: 1, dmg: 10, spread: 0, proj: 'Rocket' }, sound: '', auto: true, msg: 'You got the rocket launcher!' },
      anims: { pickup: anim('LAUN', 'A', 10), ready: anim('MISG', 'A', 1), fire: anim('MISG', 'BB', 10, 1), flash: anim('MISF', 'ABCD', 3) } },
    { name: 'Plasma Rifle', needs: 'PLSGA0', p: { slot: 6, ammo: 'Cell', ammoUse: 1, ammoGive: 40, attack: { type: 'proj', count: 1, dmg: 10, spread: 0, proj: 'PlasmaBall' }, sound: '', auto: true, msg: 'You got the plasma gun!' },
      anims: { pickup: anim('PLAS', 'A', 10), ready: anim('PLSG', 'A', 1), fire: anim('PLSG', 'A', 3, 0), flash: anim('PLSF', 'A', 4) } },
    { name: 'Fist', needs: 'PUNGA0', p: { slot: 1, ammo: '', ammoUse: 0, ammoGive: 0, attack: { type: 'melee', count: 1, dmg: 12, spread: 0, proj: 'Rocket' }, sound: '', auto: true, msg: 'Fists ready!' },
      anims: { ready: anim('PUNG', 'A', 1), fire: anim('PUNG', 'BCDCB', 4, 1) } },
  ],
  projectile: [
    { name: 'Blank projectile', blank: true, p: { speed: 15, dmg: 14, radius: 6, height: 8, scale: 1, gravity: false, bounce: false, homing: false, glow: true, boom: 0, boomDmg: 0, sounds: { see: '', death: '' } }, anims: {} },
    { name: 'Fireball', needs: 'BAL1A0', p: { speed: 10, dmg: 14, radius: 6, height: 8, scale: 1, gravity: false, bounce: false, homing: false, glow: true, boom: 0, boomDmg: 0, sounds: { see: 'imp/attack', death: 'imp/shotx' } },
      anims: { fly: anim('BAL1', 'AB', 4), hit: anim('BAL1', 'CDE', 6) } },
    { name: 'Rocket', needs: 'MISLA1', p: { speed: 20, dmg: 90, radius: 11, height: 8, scale: 1, gravity: false, bounce: false, homing: false, glow: true, boom: 128, boomDmg: 128, sounds: { see: 'weapons/rocklf', death: 'weapons/rocklx' } },
      anims: { fly: anim('MISL', 'A', 1), hit: anim('MISL', 'BCD', 6) } },
    { name: 'Plasma bolt', needs: 'PLSSA0', p: { speed: 25, dmg: 22, radius: 13, height: 8, scale: 1, gravity: false, bounce: false, homing: false, glow: true, boom: 0, boomDmg: 0, sounds: { see: 'weapons/plasmaf', death: 'weapons/plasmax' } },
      anims: { fly: anim('PLSS', 'AB', 6), hit: anim('PLSE', 'ABCDE', 4) } },
    { name: 'Green slime ball', needs: 'BAL7A1', p: { speed: 15, dmg: 36, radius: 6, height: 16, scale: 1, gravity: false, bounce: false, homing: false, glow: true, boom: 0, boomDmg: 0, sounds: { see: 'baron/attack', death: 'baron/shotx' } },
      anims: { fly: anim('BAL7', 'AB', 4), hit: anim('BAL7', 'CDE', 6) } },
  ],
  pickup: [
    { name: 'Blank pickup', blank: true, p: { effect: 'item', amount: 1, max: 100, power: 'PowerInvulnerable', secs: 30, msg: 'Picked up an item.', sound: 'misc/i_pkup', scale: 1, glow: false, float: false }, anims: {} },
    { name: 'Health pack', needs: 'MEDIA0', p: { effect: 'health', amount: 25, max: 100, power: 'PowerInvulnerable', secs: 30, msg: 'Picked up a health pack.', sound: 'misc/i_pkup', scale: 1, glow: false, float: false }, anims: { idle: anim('MEDI', 'A', 10) } },
    { name: 'Health bonus', needs: 'BON1A0', p: { effect: 'health', amount: 1, max: 200, power: 'PowerInvulnerable', secs: 30, msg: 'Picked up a health bonus.', sound: 'misc/i_pkup', scale: 1, glow: false, float: false }, anims: { idle: anim('BON1', 'ABCDCB', 6) } },
    { name: 'Armor', needs: 'ARM1A0', p: { effect: 'armor', amount: 100, max: 100, power: 'PowerInvulnerable', secs: 30, msg: 'Picked up the armor.', sound: 'misc/armor_pkup', scale: 1, glow: false, float: false }, anims: { idle: anim('ARM1', 'AB', 6) } },
    { name: 'Ammo box', needs: 'AMMOA0', p: { effect: 'ammo', amount: 20, max: 200, power: 'PowerInvulnerable', secs: 30, msg: 'Picked up some ammo.', sound: 'misc/ammo_pkup', scale: 1, glow: false, float: false }, anims: { idle: anim('AMMO', 'A', 10) } },
    { name: 'Power-up sphere', needs: 'SOULA0', p: { effect: 'power', amount: 1, max: 1, power: 'PowerInvulnerable', secs: 30, msg: 'Power up!', sound: 'misc/p_pkup', scale: 1, glow: true, float: false }, anims: { idle: anim('SOUL', 'ABCDCB', 6) } },
    { name: 'Collectible / key item', needs: 'BON2A0', p: { effect: 'item', amount: 1, max: 999, power: 'PowerInvulnerable', secs: 30, msg: 'Picked up a collectible.', sound: 'misc/i_pkup', scale: 1, glow: false, float: false }, anims: { idle: anim('BON2', 'ABCDCB', 6) } },
  ],
  prop: [
    { name: 'Blank object', blank: true, p: { solid: true, radius: 16, height: 48, health: 0, scale: 1, glow: false, hang: false, boom: 0, boomDmg: 0, sounds: { death: '' } }, anims: {} },
    { name: 'Exploding barrel', needs: 'BAR1A0', p: { solid: true, radius: 10, height: 34, health: 20, scale: 1, glow: false, hang: false, boom: 128, boomDmg: 128, sounds: { death: 'world/barrelx' } }, anims: { idle: anim('BAR1', 'AB', 6), death: anim('BEXP', 'ABCDE', 6) } },
    { name: 'Lamp', needs: 'COLUA0', p: { solid: true, radius: 16, height: 48, health: 0, scale: 1, glow: true, hang: false, boom: 0, boomDmg: 0, sounds: { death: '' } }, anims: { idle: anim('COLU', 'A', 10) } },
    { name: 'Torch', needs: 'TREDA0', p: { solid: true, radius: 16, height: 68, health: 0, scale: 1, glow: true, hang: false, boom: 0, boomDmg: 0, sounds: { death: '' } }, anims: { idle: anim('TRED', 'ABCD', 4) } },
    { name: 'Tree', needs: 'TRE2A0', p: { solid: true, radius: 32, height: 108, health: 0, scale: 1, glow: false, hang: false, boom: 0, boomDmg: 0, sounds: { death: '' } }, anims: { idle: anim('TRE2', 'A', 10) } },
    { name: 'Corpse (no collision)', needs: 'PLAYN0', p: { solid: false, radius: 16, height: 16, health: 0, scale: 1, glow: false, hang: false, boom: 0, boomDmg: 0, sounds: { death: '' } }, anims: { idle: anim('PLAY', 'N', 10) } },
  ],
};

// Which animations each kind of thing has (shown in the Look tab).
export const ANIM_SLOTS = {
  monster: [['idle', 'Standing still'], ['walk', 'Walking / chasing'], ['melee', 'Close-up attack'], ['ranged', 'Ranged attack'], ['pain', 'Getting hurt'], ['death', 'Dying']],
  weapon: [['ready', 'Held (on screen)'], ['fire', 'Firing (on screen)'], ['flash', 'Muzzle flash (optional)'], ['pickup', 'Lying on the floor']],
  projectile: [['fly', 'Flying'], ['hit', 'Impact / explosion']],
  pickup: [['idle', 'On the floor']],
  prop: [['idle', 'Normal'], ['death', 'Destroyed (if breakable)']],
};

export const POWERUPS = [['PowerInvulnerable', 'Invulnerable'], ['PowerStrength', 'Berserk strength'], ['PowerInvisibility', 'Partial invisibility'], ['PowerIronFeet', 'Hazard protection'], ['PowerLightAmp', 'See in the dark'], ['PowerSpeed', 'Speed boost'], ['PowerFlight', 'Flight'], ['PowerDoubleDamage', 'Double damage'], ['PowerInfiniteAmmo', 'Infinite ammo']];

export const GM_INSTRUMENTS = ['Acoustic Grand Piano', 'Bright Piano', 'Electric Grand', 'Honky-tonk Piano', 'Electric Piano 1', 'Electric Piano 2', 'Harpsichord', 'Clavinet', 'Celesta', 'Glockenspiel', 'Music Box', 'Vibraphone', 'Marimba', 'Xylophone', 'Tubular Bells', 'Dulcimer', 'Drawbar Organ', 'Percussive Organ', 'Rock Organ', 'Church Organ', 'Reed Organ', 'Accordion', 'Harmonica', 'Tango Accordion', 'Nylon Guitar', 'Steel Guitar', 'Jazz Guitar', 'Clean Guitar', 'Muted Guitar', 'Overdriven Guitar', 'Distortion Guitar', 'Guitar Harmonics', 'Acoustic Bass', 'Finger Bass', 'Pick Bass', 'Fretless Bass', 'Slap Bass 1', 'Slap Bass 2', 'Synth Bass 1', 'Synth Bass 2', 'Violin', 'Viola', 'Cello', 'Contrabass', 'Tremolo Strings', 'Pizzicato Strings', 'Harp', 'Timpani', 'String Ensemble 1', 'String Ensemble 2', 'Synth Strings 1', 'Synth Strings 2', 'Choir Aahs', 'Voice Oohs', 'Synth Voice', 'Orchestra Hit', 'Trumpet', 'Trombone', 'Tuba', 'Muted Trumpet', 'French Horn', 'Brass Section', 'Synth Brass 1', 'Synth Brass 2', 'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax', 'Oboe', 'English Horn', 'Bassoon', 'Clarinet', 'Piccolo', 'Flute', 'Recorder', 'Pan Flute', 'Blown Bottle', 'Shakuhachi', 'Whistle', 'Ocarina', 'Square Lead', 'Saw Lead', 'Calliope Lead', 'Chiff Lead', 'Charang Lead', 'Voice Lead', 'Fifths Lead', 'Bass + Lead', 'New Age Pad', 'Warm Pad', 'Polysynth Pad', 'Choir Pad', 'Bowed Pad', 'Metallic Pad', 'Halo Pad', 'Sweep Pad', 'Rain FX', 'Soundtrack FX', 'Crystal FX', 'Atmosphere FX', 'Brightness FX', 'Goblins FX', 'Echoes FX', 'Sci-fi FX', 'Sitar', 'Banjo', 'Shamisen', 'Koto', 'Kalimba', 'Bagpipe', 'Fiddle', 'Shanai', 'Tinkle Bell', 'Agogo', 'Steel Drums', 'Woodblock', 'Taiko Drum', 'Melodic Tom', 'Synth Drum', 'Reverse Cymbal', 'Guitar Fret Noise', 'Breath Noise', 'Seashore', 'Bird Tweet', 'Telephone Ring', 'Helicopter', 'Applause', 'Gunshot'];
// The instruments that give classic Doom music its sound.
export const DOOM_INSTRUMENTS = [30, 29, 34, 33, 38, 81, 80, 18, 48, 52, 62, 61, 0, 4, 11, 47, 89, 95];
