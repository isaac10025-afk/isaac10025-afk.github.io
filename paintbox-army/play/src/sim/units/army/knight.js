// knight (OG "Knight", type 19, spawned only): the rider a Cavalry leaves behind. Shielded swordsman (55% frontal
// block) who runs back to any loose Horse within 220 px and remounts it when not in a close fight.
// OG def + brain game.js:12883-12992.
import { registerUnit } from '../../defs.js';
import {
  S, FACTION, LOCO, INTEL, SOLDIER_FLOCK, CAVALRY_MORALE, setState, targetOf, hasLos, flee, advance, followContact,
  circle, oddsPush, strike, setAttack, angDiff, hyp, emit, snapshot, applyStatus, replaceUnit, leaveGroup, signed,
} from './_shared.js';

const SWORD = Object.freeze({
  reachGap: 6, // reach r + r + 6 (OG game.js:12970)
  runUnder: 90, // out of reach: run under 90 px, else walk (OG game.js:12973-12974)
  facing: 0.6, // strike within 0.6 rad (OG game.js:12982)
  damage: 30, // 30 + 5·signed() (OG game.js:12986)
  damageJitter: 5, // OG game.js:12986
  push: 80, // 80·m (OG game.js:12987)
  stun: 0.15, // 0.15·m (OG game.js:12987)
  cooldown: 0.85, // 0.85 + 0.25·next() (OG game.js:12990)
  cooldownJitter: 0.25, // OG game.js:12990
  initCooldown: 0.85, // init 0.85·next() (OG game.js:12929)
  circle: 1, // circling ×1 with back-step (OG game.js:12980)
});
const MOUNT = Object.freeze({
  busyRange: 120, // looks for a horse with no target or the target > 120 px away (OG game.js:12937)
  search: 220, // nearest non-burning Horse within 220 px (OG game.js:12938)
  touch: 4, // remounts within r + r_horse + 4 (OG game.js:12943)
  contactMemory: 5, // OG game.js:12964
});

function findHorse(world, u) { // OG 508.y (game.js:11068-11080)
  let best = null, bd = Infinity;
  world.query(u.x, u.y, MOUNT.search, (o) => {
    if (o.type !== 'horse' || !(o.hp > 0) || o.burning > 0) return;
    const d = hyp(o.x - u.x, o.y - u.y);
    if (d < bd) { bd = d; best = o; }
  });
  return best;
}
// Remount (OG game.js:12944-12961): the Knight is freed, the Horse becomes a Cavalry in the Knight's group and team,
// keeping the horse's status but the knight's hat; hp = 200 × the horse's hp fraction.
function remount(world, u, horse) {
  const g = u.group, frac = horse.hp / horse.maxHp, st = { ...snapshot(horse), hatless: u.hatless || 0 }, team = u.team;
  leaveGroup(world, u); // OG game.js:12950
  world.remove(u); // freed, no corpse (OG game.js:12951)
  const c = replaceUnit(world, horse, 'cavalry', g, team); // OG game.js:12952
  if (!c) return;
  world.handOver(u, c); world.handOver(horse, c); // OURS (possess): the rider or the horse becomes the cavalry
  applyStatus(world, c, st); c.hp = c.maxHp * frac; // OG game.js:12954-12955
  emit(world, 'dust', { x: c.x, y: c.y, v: 1.2, type: c.type }); // OG game.js:12956
}

const D = registerUnit({
  type: 'knight',
  og: 'Knight', // OG game.js:12886
  key: 'knight', // OG game.js:12885
  category: 'army',
  waterPace: 0.5, // OG game.js:12887
  faction: FACTION.Knights, // OG game.js:12888
  unpaintable: true, // OG game.js:12889
  radius: 8.63, // OG game.js:12890
  radiusJitter: 0.05, // OG game.js:12891
  mass: 1.3, // OG game.js:12892
  conductivity: 2, // OG game.js:12893
  maxHp: 120, // OG game.js:12894
  melee: true, // OG game.js:12895
  strength: 0.9, // OG game.js:12896
  locomotion: LOCO.Holonomic, // OG game.js:12897
  walkSpeed: 58, // OG game.js:12898
  runSpeed: 110, // OG game.js:12899
  maxSpeed: 135, // OG game.js:12900
  accel: 380, // OG game.js:12901
  decel: 380, // OG game.js:12902
  turnRate: 5, // OG game.js:12903
  turnSpeedFalloff: Infinity, // OG game.js:12904
  sightRange: 300, // OG game.js:12905
  alertSightRange: 300, // OG game.js:12906
  stickyTarget: true, // OG game.js:12907
  reactionTime: 0.25, // OG game.js:12908
  huntRange: Infinity, // OG game.js:12909
  minDistance: 0, // OG game.js:12910
  drilled: false, // OG game.js:12911
  intelligence: INTEL.Trained, // OG game.js:12912
  shield: { arc: 0.5, block: 0.55, brace: 0 }, // OG game.js:12913
  infectable: true, // OG game.js:12914
  flammability: 0.25, // OG game.js:12915
  brushSpacing: 21, // OG game.js:12916
  flock: SOLDIER_FLOCK, // OG game.js:12917 (= Soldier flock)
  morale: CAVALRY_MORALE, // OG game.js:12918 (= Cavalry `I`)
  look: {
    hat: true, // OG game.js:12921
    attack: { time: 0.3 }, // OG game.js:12926
  },
  weapon: SWORD, // ours: the sword numbers, for readers
  init(world, u) { u.cooldown = SWORD.initCooldown * world.rng(); }, // OG game.js:12928-12930
  brain(world, u) { // OG game.js:12931-12991
    u.goalX = 0; u.goalY = 0; u.face = NaN;
    if (u.stun > 0) { u.face = u.heading; return; }
    const t = targetOf(world, u);
    if (u.state === S.FLEE) { flee(world, u, t, D.runSpeed); return; }
    if (!t || hyp(t.x - u.x, t.y - u.y) > MOUNT.busyRange) { // OG game.js:12937-12962
      const h = findHorse(world, u);
      if (h) {
        const ax = h.x - u.x, ay = h.y - u.y, r = hyp(ax, ay) || 0.001;
        if (r <= u.radius + h.radius + MOUNT.touch) { remount(world, u, h); return; }
        setState(u, S.ADVANCE); u.goalX = (ax / r) * D.runSpeed; u.goalY = (ay / r) * D.runSpeed; return;
      }
    }
    if (!t) { if (followContact(world, u, D.walkSpeed, MOUNT.contactMemory)) return; setState(u, S.IDLE); return; } // OG game.js:12963-12966
    const dx = t.x - u.x, dy = t.y - u.y, d = hyp(dx, dy) || 0.001, reach = u.radius + t.radius + SWORD.reachGap;
    if (d > reach) { // OG game.js:12971-12975 (state ends Advance: the advance helper overrides the Charge it set)
      setState(u, d < SWORD.runUnder ? S.CHARGE : S.ADVANCE);
      advance(world, u, t, dx, dy, hasLos(world, u), d < SWORD.runUnder ? D.runSpeed : D.walkSpeed);
      return;
    }
    setState(u, S.ENGAGE);
    const a = Math.atan2(dy, dx);
    u.face = a;
    circle(u, t, dx, dy, d, D, SWORD.circle, true); // OG game.js:12979
    oddsPush(world, u, t, dx, dy, d, D); // OG game.js:12980
    if (u.cooldown > 0 || Math.abs(angDiff(u.heading, a)) > SWORD.facing) return; // OG game.js:12981
    strike(world, u, t, dx / d, dy / d, SWORD.damage + SWORD.damageJitter * signed(world), SWORD.push, SWORD.stun); // OG game.js:12982-12987
    setAttack(u); u.cooldown = SWORD.cooldown + SWORD.cooldownJitter * world.rng(); // OG game.js:12988
  },
});
