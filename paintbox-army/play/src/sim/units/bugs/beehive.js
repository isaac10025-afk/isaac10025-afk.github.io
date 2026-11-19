// Beehive (OURS, Part 2 step 6): a placed home that makes bees, like OG's anthill: it can't move, isn't possessed and
// isn't raised (`prop: true`, the anthill's rule: possess.js canPossess, the necro, the mage's curse and grabs all skip
// props), but it is a real Bugs unit: it joins a team in Team battle and the enemy attacks it. With enemies within 300 px
// it sends out a bee every 2.5 s (max 12 of its bees alive); hit = 4 bees burst out at once at the attacker (3 s
// cooldown). Its bees carry b.home = its id and go back to hover round it when there's nothing to fight. Burns (0.9).
// Owner: BUGS-SIM. Pose codes (STEP6.md): b.act 1 bees coming out → `buzz` (the hive shakes).
import { bug, initBag, act, setState, unitOf, isHostileTo, STATE, ENEMY, INT } from './_lib.js';

const T = {
  radius: 9,          // OG-raw radius (registerUnit ×1.1)
  hp: 220,
  mass: 1000,         // a fixed home (the anthill's 1000)
  senseR: 300,        // px: enemies this close wake it
  every: 2.5,         // s between bees while enemies are near
  maxBees: 12,        // its own bees alive at once
  burst: 4,           // bees out at once when it's hit ...
  burstEvery: 3,      // ... at most every 3 s
  pose: 0.5,          // s of the `buzz` shake per bee out
  scanEvery: 15,      // ticks between looks for enemies
  outR: 5,            // px: bees come out round the hive's mouth this far apart
  outZ: 6,            // px: and this high (they rise to flying height)
};

// its own bees alive right now (a scan: only when it's about to make some)
function beesOf(w, u) {
  const us = w.units; let n = 0;
  for (let i = 0; i < us.length; i++) { const o = us[i]; if (!o.dead && o.hp > 0 && o.b.home === u.id && o.type === 'bee') n++; }
  return n;
}
// send out up to n bees (cap 12 alive); they go for foe if there is one
function release(w, u, n, foe) {
  const room = T.maxBees - beesOf(w, u);
  let made = 0;
  for (let k = 0; k < n && k < room; k++) {
    const a = w.rng() * Math.PI * 2;
    const o = w.spawn('bee', u.x + Math.cos(a) * T.outR, u.y + Math.sin(a) * T.outR * 0.5 - 2, { team: u.team, group: u.group, faction: u.faction, heading: a, like: u });
    if (!o) break;
    o.b.home = u.id; o.z = o.pz = T.outZ; o.homeX = u.x; o.homeY = u.y - 6;
    if (foe && isHostileTo(o.faction, foe)) { o.target = foe.id; o.react = 0; o.state = STATE.CHARGE; }   // out angry: alert sight, so it keeps the foe in view; attack 3 lead: only at an enemy
    made++;
  }
  if (made > 0) { act(w, u, 1); w.emit('flap', { x: u.x, y: u.y, v: 0.4 * made, type: 'bee' }); }
  return made;
}

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = u.heading;
  setState(u, STATE.IDLE);
  if (b.act === 1 && now - b.actT > T.pose) act(w, u, 0);
  if ((w.tick + u.index) % T.scanEvery === 0) {
    const foe = w.findNearest(u.x, u.y, T.senseR, ENEMY[u.faction], u, 1);
    b.prey = foe && foe.hp > 0 ? foe.id : -1;
  }
  if (b.flag === 1 && now >= b.next2) {   // hit: a burst at the attacker (or the nearest enemy)
    b.flag = 0; b.next2 = now + T.burstEvery;
    const foe = unitOf(w, b.k) || unitOf(w, b.prey);
    release(w, u, T.burst, foe && foe.hp > 0 ? foe : null);
    b.k = -1;
    if (now >= b.next - T.every * 0.5) b.next = now + T.every;
    return;
  }
  b.flag = 0;
  const foe = unitOf(w, b.prey);
  if (foe && foe.hp > 0 && now >= b.next) { b.next = now + T.every; release(w, u, 1, foe); }
}

bug({
  type: 'beehive', og: 'Beehive (ours)',   // ours (no OG unit): the name is for tracing
  prop: true,                              // the anthill's rule: not possessed, not raised, no body (OG anthill game.js:12190)
  untossable: true,
  radius: T.radius, radiusJitter: 0, mass: T.mass, maxHp: T.hp, density: 99,
  melee: false, strength: 0, intelligence: INT.Mindless, infectable: false, risenMode: undefined,
  walkSpeed: 0, runSpeed: 0, maxSpeed: 0, accel: 160, decel: 500, turnRate: 0,
  sightRange: 0, alertSightRange: 0, stickyTarget: false, reactionTime: 0, huntRange: 0,
  flammability: 0.9, burnTime: 6,
  brushSpacing: 40,   // a stroke paints hives well apart
  flock: { personalSpace: 1, separation: 0, alignment: 0, cohesion: 0, formation: 0, herd: 0, herdSpacing: 0, flockByState: [0, 0, 0, 0, 0, 0] },
  morale: { baseline: 1, oddsWeight: 0, fearWeight: 0, casualtyWeight: 0, woundWeight: 0, hitShock: 0, canBreak: false, panicFear: 0, deathFear: 0 },
  look: { attack: { time: 0.1 } },
  init(w, u) { initBag(w, u); u.b.k = -1; u.b.next = w.time + 0.5; },
  // any hit: 4 bees burst out (next brain tick, at the attacker), at most every 3 s
  onHit(w, u, amount, att) {
    if (!(amount > 0) || w.time < u.b.next2) return;
    u.b.flag = 1;
    if (att && att.hp > 0 && att !== u && isHostileTo(u.faction, att)) u.b.k = att.id;   // the bees go for whoever hit it; attack 3 lead (L4's find): a friend's blow (blinded, splash) still lets them out, at the nearest enemy
  },
  brain,
});
export { T };
