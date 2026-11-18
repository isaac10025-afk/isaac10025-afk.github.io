// Gator: water ambusher tank (OG "Alligator", module 1080, game.js:1690-1956). Owner: ANIMALS.
// Lurks almost unseen in water, lunges at anything within 200 px, bites hard from behind, can hold small prey in its jaws,
// calls nearby gators onto its victim, then heads back to the water.
import { registerUnit } from '../../defs.js';
import {
  S, DT, fac, LOCO, INTEL, hyp, signed, range, setState, getTarget, setTarget, unit, perchOf, hostile, isUndead, climbing, ensure,
  hitAnim, dmg, push, infect, sfx, hasWalls, hasWater, wetAt, nearestWet, shoreAt, inward, goTo, flee, carryOnce, runCarry,
} from './lib.js';

const JAWS_HOLD = 2.2; // OG game.js:1708
const LOW_HP = 0.2; // OG game.js:1829
const BITE = 72; // OG game.js:1856
const BITE_COOLDOWN = 0.9; // OG game.js:1861
const LUNGE_RANGE = 200; // OG game.js:1889
const LUNGE_TIME = 6; // OG game.js:1893
const REVENGE_TIME = 7; // OG game.js:1927
const CALL_RANGE2 = 9e4; // OG game.js:1936 (300 px squared)
const WATER_NEAR = 450; // OG game.js:1918
const JAWS_DPS = 40; // OG game.js:1820
const DRIFT = 3; // OG game.js:1915
const LUNGE = 1, RETURN = 2, REVENGE = 3; // subStates (OG game.js:1843, 1894, 1923)
const spot = new Float32Array(2);

const low = (u) => u.hp < LOW_HP * u.maxHp;
const waterWithin = (w, u, r) => hasWater(w) && nearestWet(w, u.x, u.y, r, spot); // OG game.js:1947-1950
const nearWater = (w, u) => waterWithin(w, u, WATER_NEAR); // OG game.js:1918-1920

// lock onto the attacker for 7 s (OG game.js:1920-1927)
function revenge(w, u, e) {
  setTarget(u, e); u.lastVictim = e.id; u.subState = REVENGE; u.b.timer = w.time + REVENGE_TIME;
}
// call idle, healthy gators within 300 px onto e (OG game.js:1928-1946)
function callGators(w, u, e, isRevenge) {
  w.query(u.x, u.y, 300, (o) => {
    if (o === u || o.dead || o.faction !== u.faction || o.def.brain !== brain) return;
    if (o.subState !== 0 || low(o) || !hostile(o, e) || (o.x - u.x) ** 2 + (o.y - u.y) ** 2 > CALL_RANGE2) return;
    if (isRevenge) revenge(w, o, e);
    else { setTarget(o, e); o.lastVictim = e.id; o.subState = REVENGE; o.b.timer = w.time + LUNGE_TIME; }
  });
}
// may the jaws take this victim? (OG game.js:1863-1877)
function canGrab(u, e) {
  return !u.b.jaws && e.hp > 0 && !e.hurled && e.radius <= 10 && e.mass <= 2 && !e.def.prop && !e.def.untossable && !climbing(e);
}
function bite(w, u, e, nx, ny) { // OG game.js:1850-1886
  const h = perchOf(w, e);
  const bx = h.x - Math.cos(h.heading) * h.radius, by = h.y - Math.sin(h.heading) * h.radius; // victim's back point (OG game.js:1853-1855)
  const m = dmg(w, h, BITE + 6 * signed(w), u, undefined, bx, by);
  if (h === e && e.hp > 0) push(w, e, -nx, -ny, 70 * m, 0.5 * m); // pulls the victim in (OG game.js:1857)
  if (isUndead(u)) infect(w, h, u, 0.5 * m, 0); // OG game.js:1858
  sfx(w, 'strike', u.x, u.y, { type: u.type }); hitAnim(u);
  u.cooldown = BITE_COOLDOWN * range(w, 0.85, 1.15);
  if (h === e && canGrab(u, e) && w.rng() < 0.3) { // OG game.js:1863-1886
    u.b.jaws = e.id; u.b.jawsUntil = w.time + JAWS_HOLD; e.hurled = 1;
    u.cooldown = Math.max(u.cooldown, JAWS_HOLD);
  }
}
// let go of the held victim: flung sideways at 70 px/s (OG game.js:1800-1807)
function release(w, u, e) {
  u.b.jaws = 0;
  if (!e) return;
  e.hurled = 0;
  const side = w.rng() < 0.5 ? 1 : -1;
  e.vx = 70 * -Math.sin(u.heading) * side; e.vy = 70 * Math.cos(u.heading) * side; e.z = Math.max(e.z, 1);
}
// held victim: pinned at the mouth, shaken, 40 hp/s (OG game.js:1795-1822)
const carry = carryOnce(function (w, u) {
  if (!u.b.jaws) return;
  const e = unit(w, u.b.jaws);
  if (!e || e.hp <= 0 || u.hp <= 0 || w.time >= u.b.jawsUntil) { release(w, u, e); return; }
  const side = Math.cos(u.heading) >= 0 ? 1 : -1, r = u.radius, shake = 2.5 * Math.sin(26 * w.time + u.index);
  e.x = u.x + side * r * 1.15 + shake; e.y = u.y + 1;
  e.vx = u.vx; e.vy = u.vy; e.z = e.pz = 0.3 * r; e.vz = 0; e.spin = 0;
  e.stun = Math.max(e.stun || 0, 0.3);
  dmg(w, e, JAWS_DPS * DT, u);
});

function brain(w, u) { // OG game.js:1824-1917
  runCarry(w, u);
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.stun > 0) { u.face = u.heading; return; }
  const wet = wetAt(w, u), weak = low(u);
  if (u.subState === REVENGE) { // keep the revenge target while it lives (OG game.js:1831-1836)
    const p = unit(w, u.lastVictim);
    if (p && p.hp > 0) { if (u.target !== p.id) setTarget(u, p); } else u.subState = RETURN;
  }
  const c = getTarget(w, u);
  if (c && !weak) {
    const dx = c.x - u.x, dy = c.y - u.y, d = hyp(dx, dy) || 0.001;
    const isRevenge = u.subState === REVENGE, hunting = u.subState === LUNGE || isRevenge;
    if (hunting && (w.time > u.b.timer || (nearWater(w, u) && !waterWithin(w, u, isRevenge ? 600 : 260)))) u.subState = RETURN; // OG game.js:1843
    else {
      if (d <= u.radius + c.radius + 6) { // OG game.js:1845
        setState(u, S.ENGAGE); u.face = Math.atan2(dy, dx);
        if (u.cooldown <= 0) bite(w, u, c, dx / d, dy / d);
        return;
      }
      if (hunting || (d <= LUNGE_RANGE && u.subState !== RETURN)) { // OG game.js:1889-1899
        if (!hunting) { u.subState = LUNGE; u.b.timer = w.time + LUNGE_TIME; callGators(w, u, c, false); sfx(w, 'charge', u.x, u.y, { type: u.type }); }
        setState(u, S.CHARGE);
        goTo(w, u, c.x, c.y, u.def.runSpeed, u.los === 1 || !hasWalls(w));
        return;
      }
    }
  } else if (u.subState === LUNGE || u.subState === REVENGE) u.subState = RETURN;
  if (u.subState === RETURN && !(!wet && nearWater(w, u))) u.subState = 0; // OG game.js:1900
  if (!wet) { // OG game.js:1901-1908
    if (hasWater(w) && nearestWet(w, u.x, u.y, WATER_NEAR, spot)) {
      setState(u, weak ? S.FLEE : S.ADVANCE);
      goTo(w, u, spot[0], spot[1], weak ? u.def.runSpeed : 2 * u.def.walkSpeed, false); // OG game.js:1904 (derived: 2 × walkSpeed)
      return;
    }
    if (weak && c) { setState(u, S.FLEE); flee(w, u, c, u.def.runSpeed); return; }
  }
  if (wet && shoreAt(w, u.x, u.y) < 3 && inward(w, u.x, u.y, spot)) { // OG game.js:1909-1910
    setState(u, S.ADVANCE); goTo(w, u, spot[0], spot[1], u.def.walkSpeed, true); return;
  }
  setState(u, S.IDLE);
  if (wet) { // drift almost still (OG game.js:1911-1916)
    if (w.rng() < 0.3 * DT) u.wander += 1.5 * signed(w);
    u.goalX = DRIFT * Math.cos(u.wander); u.goalY = DRIFT * Math.sin(u.wander);
  }
}

registerUnit({
  type: 'gator',
  og: 'Alligator', // OG game.js:1713
  category: 'animals', // OG game.js:1714
  faction: fac('Reptiles'), // OG game.js:1715
  swims: true, // OG game.js:1716
  waterStealth: 70, // OG game.js:1717
  waterArmor: 0.5, // OG game.js:1718
  lowLying: true, // OG game.js:1719
  untossable: true, // OG game.js:1720
  waterPace: 1.5, // OG game.js:1721
  radius: 15, // OG game.js:1722
  radiusJitter: 0.1, // OG game.js:1723
  mass: 3, // OG game.js:1724
  density: 1.5, // OG game.js:1725
  maxHp: 380, // OG game.js:1726
  melee: true, // OG game.js:1727
  strength: 1.7, // OG game.js:1728
  locomotion: LOCO.Holonomic, // OG game.js:1729
  walkSpeed: 34, // OG game.js:1730
  runSpeed: 175, // OG game.js:1731
  maxSpeed: 260, // OG game.js:1732
  accel: 700, // OG game.js:1733
  decel: 600, // OG game.js:1734
  turnRate: 5, // OG game.js:1735
  turnSpeedFalloff: Infinity, // OG game.js:1736
  sightRange: 260, // OG game.js:1737
  alertSightRange: 300, // OG game.js:1738
  stickyTarget: true, // OG game.js:1739
  reactionTime: 0.15, // OG game.js:1740
  huntRange: Infinity, // OG game.js:1741
  minDistance: 0, // OG game.js:1742
  drilled: false, // OG game.js:1743
  intelligence: INTEL.Animal, // OG game.js:1744
  infectable: true, // OG game.js:1745
  flammability: 0.2, // OG game.js:1746
  brushSpacing: 50, // OG game.js:1747
  flock: {
    personalSpace: 1.2, // OG game.js:1749
    separation: 30, // OG game.js:1750
    alignment: 0, // OG game.js:1751
    cohesion: 0, // OG game.js:1752
    formation: 0, // OG game.js:1753
    herd: 0, // OG game.js:1754
    herdSpacing: 0, // OG game.js:1755
    flockByState: [0, 0, 0, 0, 0, 0], // OG game.js:1756
    formationByState: [0, 0, 0, 0, 0, 0], // OG game.js:1757
  },
  morale: {
    baseline: 0.9, // OG game.js:1760
    oddsWeight: 0.1, // OG game.js:1761
    fearWeight: 0.03, // OG game.js:1762
    casualtyWeight: 0.05, // OG game.js:1763
    woundWeight: 0.5, // OG game.js:1764
    hitShock: 0.02, // OG game.js:1765
    suppression: 0, // OG game.js:1766
    canBreak: false, // OG game.js:1767
    breakAt: 0.15, // OG game.js:1768
    rallyAt: 0.5, // OG game.js:1769
    minFleeTime: 3, // OG game.js:1770
    dropRate: 2, // OG game.js:1771
    recoverRate: 0.1, // OG game.js:1772
    panicFear: 0.2, // OG game.js:1773
    deathFear: 0.2, // OG game.js:1774
  },
  look: {
    attack: {
      time: 0.35, // OG game.js:1782
      kick: 0, // OG game.js:1782
    },
  },
  init(w, u) { // OG game.js:1784-1786
    ensure(u);
    u.wander = w.rng() * Math.PI * 2;
    u.b.jaws = 0; u.b.jawsUntil = 0; u.b.timer = 0;
  },
  onHit(w, u, amount, att) { // OG game.js:1787-1794
    if (!att || att.dead || att.hp <= 0 || !hostile(u, att)) return;
    if (u.hp < LOW_HP * u.maxHp) return;
    const fresh = u.subState !== REVENGE || u.lastVictim !== att.id;
    revenge(w, u, att);
    if (fresh) { callGators(w, u, att, true); sfx(w, 'charge', u.x, u.y, { type: u.type }); }
  },
  onDeath(w, u) { if (u.b.jaws) release(w, u, unit(w, u.b.jaws)); }, // OG releases in carry once hp <= 0 (game.js:1799)
  brain,
  carry,
});
