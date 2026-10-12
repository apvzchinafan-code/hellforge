// A small ready-to-play starter level so a new project is never a blank page.
import { blankProject } from '../core/store.js';
import { rectPts } from '../level/geom.js';

export function starterProject(name, has = () => true) {
  const p = blankProject(name);
  let n = 10;
  const id = k => k + (n++).toString(36);
  const tex = (...names) => names.find(has) || names[names.length - 1];
  const wall = tex('STARTAN3', 'BROWN1'), floor = tex('FLOOR4_8', 'FLOOR0_1'), ceil = tex('CEIL3_5', 'CEIL1_1');
  const room = (nm, kind, pts, o = {}) => ({ id: id('r'), name: nm, kind, pts, rect: true, floor: 0, ceil: 128, light: 192, sky: false, floorTex: floor, ceilTex: ceil, wallTex: wall, ...o });
  const thing = (type, x, y, angle = 90, o = {}) => ({ id: id('t'), type, x, y, angle, ...o });
  const exitDest = thing('TeleportDest', 1280, 608, 270, { name: 'Courtyard Exit' });
  p.levels.push({
    id: 'l1', name: 'First Steps', sky: 'SKY1', music: 'D_E1M1', scripts: [],
    rooms: [
      room('Start Room', 'room', rectPts(0, 0, 512, 384), { ceil: 144, light: 208 }),
      room('Corridor', 'room', rectPts(512, 128, 832, 256), { ceil: 112, light: 144, floorTex: tex('FLAT5', floor), wallTex: tex('BROWN1', wall), ceilTex: tex('CEIL5_1', ceil) }),
      room('Door', 'door', rectPts(640, 128, 672, 256), { wallTex: tex('BIGDOOR2', 'DOOR1', wall), trackTex: tex('DOORTRAK', wall), ceilTex: tex('FLAT20', ceil), lock: 0 }),
      room('Courtyard', 'room', rectPts(832, -64, 1728, 704), { floor: -16, ceil: 320, sky: true, light: 224, floorTex: tex('FLOOR7_1', 'FLAT5_4', floor), wallTex: tex('STONE2', 'BROWNHUG', wall) }),
      room('Slime Pool', 'room', rectPts(1344, 64, 1600, 256), { floor: -40, ceil: 320, sky: true, light: 224, damage: 10, floorTex: tex('NUKAGE1', floor), wallTex: tex('STONE2', wall) }),
      room('Pillar', 'solid', rectPts(1056, 288, 1120, 352), { wallTex: tex('METAL', wall) }),
      room('Stairs', 'stairs', rectPts(1408, 480, 1600, 608), { floor: -16, ceil: 320, sky: true, light: 224, steps: 8, rise: 8, dir: 0, floorTex: tex('FLAT1', floor), wallTex: tex('STEP1', 'STEP4', wall) }),
      room('Ledge', 'room', rectPts(1600, 416, 1728, 704), { floor: 48, ceil: 320, sky: true, light: 224, floorTex: tex('FLAT1', floor), wallTex: tex('BROWNGRN', 'BROWN1', wall) }),
      room('Exit Pad', 'exit', rectPts(1632, 608, 1696, 672), { floor: 48, ceil: 320, sky: true, light: 255, floorTex: tex('GATE1', floor), wallTex: wall }),
    ],
    things: [
      thing('Player1Start', 128, 192, 0),
      thing('Shotgun', 320, 192),
      thing('Stimpack', 96, 64), thing('Clip', 96, 320),
      thing('ZombieMan', 760, 192, 180),
      thing('DoomImp', 1200, 520, 200), thing('DoomImp', 1500, 360, 180), thing('ZombieMan', 1100, 96, 160),
      thing('ExplosiveBarrel', 1260, 300), thing('Shell', 1664, 480), thing('Medikit', 944, 640),
      exitDest,
    ],
  });
  p.levels[0].things = p.levels[0].things.filter(t => t !== exitDest);
  p.seq = 200;
  return p;
}
