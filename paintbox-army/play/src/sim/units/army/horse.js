// horse (OG "Horse", type 22, spawned only): the mount a dismount leaves behind. Wanders and drinks, shies from
// everyone but Knights, panics and tramples anyone when burning or startled, waits for a Knight to take it back.
// OG def = Cavalry def spread with overrides (game.js:12994-13045); drink helper game.js:13046-13075.
import { registerUnit } from '../../defs.js';
import {
  DT, S, FACTION, LOCO, INTEL, CAVALRY_FLOCK, CAVALRY_MORALE, TRAMPLE, ALL_BUT_PROPS, setState, flee, wetAt, anyWater,
  trample, startled, nearestWet, hashRoll, signed, range, hyp, ratSnakeScare,
} from './_shared.js';

const SHY = 70; // walks away from any unit except Props and Knights within 70 px (OG game.js:13028)
const WANDER = Object.freeze({
  speed: 30, // wander at 30 px/s (OG game.js:13041)
  turn: 1.5, // wander angle += 1.5·signed·dt·3 (OG game.js:13040)
  turnMul: 3, // OG game.js:13040
});
const DRINK = Object.freeze({
  seek: 7, // subState: heading to water (OG game.js:13046 J = 7)
  drink: 8, // subState: drinking (OG game.js:13047 Q = 8)
  every: 60, // a roll every 60 ticks ... (OG game.js:13048 $ = 60)
  chance: 0.15, // ... with a hash < 0.15 (OG game.js:13049 tt = 0.15)
  search: 300, // nearest water within 300 px (OG game.js:13050 et = 300)
  time: 4, // drinks 4·range(0.8, 1.2) s (OG game.js:13051 nt = 4)
  timeLo: 0.8, // OG game.js:13063
  timeHi: 1.2, // OG game.js:13063
  pace: 0.6, // walks to water at 0.6·walkSpeed = 45 px/s (OG game.js:13068)
});
const _w = new Float32Array(2);

function drink(world, u) { // OG `at` (game.js:13056-13070)
  const b = u.b;
  if (!anyWater(world)) { b.subState = 0; return false; }
  if (b.subState === DRINK.drink) { if (world.time < b.timer) return true; b.subState = 0; return false; }
  if (b.subState !== DRINK.seek) {
    if ((world.tick + u.index) % DRINK.every !== 0 || hashRoll(u.index, world.tick) >= (DRINK.chance * DRINK.every) / 60) return false;
    b.subState = DRINK.seek;
  }
  if (wetAt(world, u)) { b.subState = DRINK.drink; b.timer = world.time + DRINK.time * range(world, DRINK.timeLo, DRINK.timeHi); b.drinkAt = world.time; return true; }
  if (!nearestWet(world, u.x, u.y, DRINK.search, _w)) { b.subState = 0; return false; }
  const ax = _w[0] - u.x, ay = _w[1] - u.y, r = hyp(ax, ay) || 1;
  u.goalX = (ax / r) * D.walkSpeed * DRINK.pace; u.goalY = (ay / r) * D.walkSpeed * DRINK.pace;
  return true;
}
function panicTrample(world, u) { // OG game.js:13020-13022, 13024-13025
  const sp = hyp(u.vx, u.vy);
  if (sp >= TRAMPLE.minSpeed && !wetAt(world, u)) trample(world, u, sp, TRAMPLE, ALL_BUT_PROPS);
}
let _near = null, _nd = Infinity, _me = null;
function shyOne(o) { // any unit except itself, Props and Knights (mask V & ~Knights, OG game.js:13028)
  if (o === _me || o.faction === FACTION.Props || o.faction === FACTION.Knights) return;
  const d = hyp(o.x - _me.x, o.y - _me.y);
  if (d < _nd) { _nd = d; _near = o; }
}

const D = registerUnit({
  type: 'horse',
  og: 'Horse', // OG game.js:12998
  key: 'horse', // OG game.js:12997
  category: 'army',
  mines: false, // OG game.js:12999
  faction: FACTION.Strays, // OG game.js:13000
  unpaintable: true, // OG game.js:13001
  infectable: false, // OG game.js:13002
  turnsWhenKilled: false, // OG game.js:13003
  melee: false, // OG game.js:13004
  strength: 0, // OG game.js:13005
  sightRange: 0, // OG game.js:13006
  alertSightRange: 0, // OG game.js:13007
  huntRange: 0, // OG game.js:13008
  maxHp: 160, // OG game.js:13009
  flock: Object.freeze({ ...CAVALRY_FLOCK, // OG game.js:13010 (Cavalry flock with overrides)
    alignment: 0, // OG game.js:13010
    cohesion: 0, // OG game.js:13010
    formation: 0, // OG game.js:13010
    formationByState: [0, 0, 0, 0, 0, 0], // OG game.js:13010
  }),
  // The rest is the Cavalry def as is (`...H`, game.js:12995):
  skittish: true, // OG game.js:12662
  radius: 13.5, // OG game.js:12663 (a dismounted horse copies its rider's cavalry radius, game.js:12864)
  radiusJitter: 0.06, // OG game.js:12664
  mass: 4.5, // OG game.js:12665
  iceGrip: 0.05, // OG game.js:12666
  density: 2, // OG game.js:12667
  conductivity: 2, // OG game.js:12668
  locomotion: LOCO.Vehicle, // OG game.js:12672
  walkSpeed: 75, // OG game.js:12673
  runSpeed: 150, // OG game.js:12674
  maxSpeed: 300, // OG game.js:12675
  accel: 340, // OG game.js:12676
  decel: 340, // OG game.js:12677
  turnRate: 3, // OG game.js:12678
  turnSpeedFalloff: 70, // OG game.js:12679
  stickyTarget: true, // OG game.js:12682
  reactionTime: 0.25, // OG game.js:12683
  minDistance: 0, // OG game.js:12685
  drilled: false, // OG game.js:12686
  intelligence: INTEL.Animal, // OG game.js:12687
  flammability: 0.4, // OG game.js:12691
  brushSpacing: 34, // OG game.js:12692
  morale: CAVALRY_MORALE, // OG game.js:12704 (= Cavalry `I`)
  look: {
    attack: { time: 0.35 }, // OG game.js:12711 (Cavalry look spread, game.js:13011)
  },
  init(world, u) { u.wander = u.heading; u.b.subState = 0; u.b.timer = 0; u.b.role = 0; }, // OG game.js:13012-13014
  // Possessed (OURS, Part 2 step 3): a horse has no weapon and no enemies; its attack is the trample it does when it
  // panics, at the same speeds (OG game.js:13020-13025): gallop into them.
  possessFire(world, u) { panicTrample(world, u); },
  brain(world, u, dt = DT) { // OG game.js:13015-13043
    u.goalX = 0; u.goalY = 0; u.face = NaN;
    if (u.stun > 0) return;
    if (u.burning > 0) { setState(u, S.FLEE); flee(world, u, null, D.runSpeed); panicTrample(world, u); return; } // OG game.js:13018-13022
    if (startled(world, u, D.runSpeed)) { panicTrample(world, u); return; } // OG game.js:13023-13026
    if (ratSnakeScare(world, u, D.runSpeed)) return; // OG game.js:13027
    _near = null; _nd = SHY; _me = u;
    world.query(u.x, u.y, SHY, shyOne);
    const e = _near; _me = null; _near = null;
    if (e) { // OG game.js:13029-13038
      const ax = u.x - e.x, ay = u.y - e.y, o = hyp(ax, ay) || 1;
      setState(u, S.ADVANCE); u.goalX = (ax / o) * D.walkSpeed; u.goalY = (ay / o) * D.walkSpeed; return;
    }
    setState(u, S.IDLE);
    if (drink(world, u)) return; // OG game.js:13039
    u.wander += WANDER.turn * signed(world) * dt * WANDER.turnMul; // OG game.js:13040
    u.goalX = WANDER.speed * Math.cos(u.wander); u.goalY = WANDER.speed * Math.sin(u.wander); // OG game.js:13041-13042
  },
});
