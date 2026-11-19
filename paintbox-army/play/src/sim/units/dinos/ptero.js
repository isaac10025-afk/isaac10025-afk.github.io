// Pterodactyl (OURS, Part 2 step 4): flies at z 60 over walls and water; melee units can't reach it up there (they
// don't target it: _lib.js dinoSense), shots still do. Dives at a lone light enemy, grabs it, climbs to z 110 while
// flying up to 160 px toward its own side, then drops it: fall damage, and whoever it lands on is hurt and knocked down
// (_lib.js dinoFlung). With no such prey it dive-pecks its target (ours: STEP4 gives it nothing else). Shot below half hp
// while carrying = it lets go early. Owner: DINOS-SIM.
// Pose codes (STEP4.md): b.act 1 dive, 2 carry (b.victim hangs under it); flying = fly0 / fly1 / glide (art).
import {
  dino, initBag, targetOf, act, setState, idle, fleeing, chew, bite, grabbable, grounded, high, glue, markSky, flung, unitOf,
  hypot, STATE, LEAP, GRAVITY, DINO, ENEMY,
} from './_lib.js';
import { maskBit } from '../../factions.js';

const T = {
  radius: 10, hp: 120, mass: 1,
  speed: 150,         // px/s flying
  flyH: 60,           // px: cruising height
  rise: 3,            // 1/s: how fast it eases back to cruising height
  diveStart: 70,      // px (ground distance): starts a dive at prey this close
  diveTime: 0.4,      // s down
  diveLow: 4,         // px: bottom of a dive (never quite lands)
  grabReach: 12,      // px past both bodies at the bottom of the dive
  grabMass: 2,        // grabs enemies this light or lighter ...
  loneR: 45,          // ... with none of their own side within 45 px
  preyR: 280,         // px: looks this far for prey
  scanEvery: 12,      // ticks between prey searches
  carryTime: 1.2,     // s climbing with the victim ...
  carryH: 110,        // ... up to this height ...
  carryDist: 160,     // ... flying up to this far toward its own side
  fall: 45,           // fall damage to the dropped victim (shared landing bump included; none over water)
  landHit: 20,        // whoever it lands on: damage (+ knocked down)
  grabEvery: 3,       // s between dives
  peck: 12,           // dive-peck damage when there's nothing to grab
  peckEvery: 1.3,     // s between dive-pecks (a grab dive waits grabEvery). attack 3 (11-18): pecks waited the 3 s of a grab, so
                      // against anything too heavy or never alone (cavalry, a giant, a legion block) it circled 3 s per 12 hp
                      // and the fight never ended (ptero v giant / cavalry 1v1, 5 ptero v 19 legion: still going at 60-90 s)
  airPeckEvery: 0.8,  // s between pecks at another flyer
  dropAt: 0.5,        // shot below this hp fraction while carrying: drops the victim
  circleR: 90,        // px: circles its target this far out between dives
};
const DT = 1 / 60, DIVE = 1, CARRY = 2;   // subState
const PQ = new Array(32), LQ = new Array(4);

function lone(w, o) {
  const n = w.queryMask(o.x, o.y, T.loneR, maskBit(o.faction), LQ, LQ.length);
  let c = 0;
  for (let k = 0; k < n; k++) { const a = LQ[k]; LQ[k] = null; if (a !== o && !a.dead && a.hp > 0) c++; }
  return c === 0;
}
// nearest lone light enemy on the ground within 280 px
function findPrey(w, u) {
  const n = w.queryMask(u.x, u.y, T.preyR, ENEMY[u.faction], PQ, PQ.length);
  let best = null, bd = Infinity;
  for (let k = 0; k < n; k++) {
    const o = PQ[k]; PQ[k] = null;
    if (o.dead || !grabbable(o, T.grabMass) || high(o)) continue;
    const d = hypot(o.x - u.x, o.y - u.y);
    if (d < bd && lone(w, o)) { bd = d; best = o; }
  }
  return best;
}

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN; u.leaping = LEAP.FLY; u.vz = 0;
  if (u.subState === DIVE) { markSky(w); dive(w, u); return; }
  if (u.subState === CARRY) { carry(w, u); return; }
  u.z += (T.flyH - u.z) * Math.min(1, T.rise * DT);
  markSky(w);   // a ptero is about: melee units are checked for targeting it while it's up (dinoSense)
  if (b.act !== 0) act(w, u, 0);
  if (u.stun > 0) { u.face = u.heading; return; }
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  const ready = now >= b.next;
  let p = unitOf(w, b.prey);
  if (u.possessed === 1) p = t && grabbable(t, T.grabMass) ? t : null;   // the player picks; no "lone" rule
  else if (ready && (w.tick + u.index) % T.scanEvery === 0) p = findPrey(w, u);
  if (p && (!grabbable(p, T.grabMass) || high(p))) p = null;
  b.prey = p ? p.id : -1;
  const g = p || t;
  if (!g) { idle(w, u); return; }
  const dx = g.x - u.x, dy = g.y - u.y, d = hypot(dx, dy) || 0.001;
  if (high(g)) { // another flyer: chase it and peck it up there
    setState(u, STATE.ENGAGE);
    u.goalX = dx / d * T.speed; u.goalY = dy / d * T.speed; u.face = Math.atan2(dy, dx);
    u.z += Math.max(-2, Math.min(2, g.z - u.z));
    if (hypot(d, g.z - u.z) <= u.radius + g.radius + 6 && u.cooldown <= 0) bite(w, u, g, T.peck, T.airPeckEvery, 40, 0);
    return;
  }
  setState(u, ready ? STATE.CHARGE : STATE.ENGAGE);
  if (ready && d < T.diveStart && grounded(g)) { startDive(w, u, g.x, g.y, p ? 1 : 0); return; }
  if (ready) { u.goalX = dx / d * T.speed; u.goalY = dy / d * T.speed; u.face = Math.atan2(dy, dx); return; }
  // between dives: circle it
  const s = u.index & 1 ? 1 : -1, m = Math.max(-T.speed, Math.min(T.speed, 2.5 * (d - T.circleR)));
  let vx = -dy / d * s * T.speed + dx / d * m, vy = dx / d * s * T.speed + dy / d * m;
  const v = hypot(vx, vy) || 0.001; vx *= T.speed / v; vy *= T.speed / v;
  u.goalX = vx; u.goalY = vy;
}

// dive to (x, y) (following its prey if it has one); grab = 1 tries to grab, 0 pecks
function startDive(w, u, x, y, grab) {
  const b = u.b;
  u.subState = DIVE; b.t0 = w.time; b.t1 = u.z; b.x0 = x; b.y0 = y; b.k = grab;
  act(w, u, 1); setState(u, STATE.CHARGE);
  w.emit('flap', { x: u.x, y: u.y, v: 1, type: u.type });
}
function dive(w, u) {
  const b = u.b, now = w.time, f = Math.min(1, (now - b.t0) / T.diveTime);
  const p = unitOf(w, b.prey);
  if (p && p.hp > 0 && !high(p)) { b.x0 = p.x; b.y0 = p.y; }
  u.z = b.t1 - (b.t1 - T.diveLow) * f * f;
  const dx = b.x0 - u.x, dy = b.y0 - u.y, d = hypot(dx, dy) || 0.001, left = Math.max(DT, T.diveTime - (now - b.t0));
  const sp = Math.min(u.def.maxSpeed, d / left);
  u.goalX = dx / d * sp; u.goalY = dy / d * sp; u.face = Math.atan2(dy, dx);
  if (f < 1) return;
  // bottom of the dive: grab or peck the enemy there
  let v = p && p.hp > 0 ? p : null;
  if (!v) v = w.findNearest(u.x, u.y, u.radius + DINO.MARGIN, ENEMY[u.faction], null, 0);
  u.subState = 0; b.prey = -1; b.next = now + T.grabEvery; act(w, u, 0);
  if (!v || hypot(v.x - u.x, v.y - u.y) > u.radius + v.radius + T.grabReach || !grounded(v) || v.def.prop) return;
  const grab = (b.k === 1 || u.possessed === 1) && grabbable(v, T.grabMass);
  if (!grab) { chew(w, u, v, T.peck); u.attack = 1; b.next = now + T.peckEvery; return; }
  u.subState = CARRY; b.victim = v.id; b.t0 = now; v.hurled = 1;
  // its own side: its team's half in Team battle, else back where it was painted, else straight away
  let hx = u.team === 0 ? -1 : u.team === 1 ? 1 : u.homeX - u.x, hy = u.team >= 0 ? 0 : u.homeY - u.y;
  if (u.team < 0 && hx * hx + hy * hy < 1600) { hx = -dx; hy = -dy; }
  const hd = hypot(hx, hy) || 1; b.dx = hx / hd; b.dy = hy / hd;
  act(w, u, 2);
  w.emit('throw', { x: v.x, y: v.y, v: 0.8, type: u.type });
}
function carry(w, u) {
  const b = u.b, v = unitOf(w, b.victim), f = (w.time - b.t0) / T.carryTime;
  if (!v || !(v.hp > 0)) { endCarry(w, u); return; }
  if (f >= 1) { release(w, u); return; }
  const e = f * f * (3 - 2 * f);
  u.z = T.diveLow + (T.carryH - T.diveLow) * e;
  markSky(w);
  const sp = T.carryDist / T.carryTime;
  u.goalX = b.dx * sp; u.goalY = b.dy * sp; u.face = Math.atan2(b.dy, b.dx);
  setState(u, STATE.ENGAGE);
  glue(v, u.x, u.y - 1, u.z - 3.1 * v.radius, u.vx, u.vy);   // LEAD 11-14 (DINOS-ART ask): behind the ptero, claws on its head
  v.hurled = 1;
}
function endCarry(w, u) {
  u.subState = 0; u.b.victim = -1; u.b.next = w.time + T.grabEvery; act(w, u, 0);
}
// let go: it falls; dinoFlung adds the fall damage past the shared landing bump (8·impact/400) and hits whoever is under
function release(w, u) {
  const v = unitOf(w, u.b.victim);
  endCarry(w, u);
  if (!v) return;
  v.hurled = 0; v.vx = u.vx * 0.6; v.vy = u.vy * 0.6; v.vz = 0;
  const z = Math.max(2, v.z), air = Math.sqrt(2 * z / GRAVITY), bump = 8 * Math.sqrt(2 * GRAVITY * z) / 400;
  v.stun = Math.max(v.stun, air + 0.3); v.thrownAt = w.time;
  v.spin = (v.vx >= 0 ? 1 : -1) * Math.PI / Math.max(0.2, air);
  flung(w, v, u, Math.max(0, T.fall - bump), T.landHit);
  w.emit('throw', { x: u.x, y: u.y, v: 1, type: u.type });
}

dino({
  type: 'ptero', og: 'Pterodactyl',   // ours (no OG unit): the name is for tracing only
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 1,
  walkSpeed: T.speed, runSpeed: T.speed, maxSpeed: 320, accel: 900, decel: 900, turnRate: 6,
  sightRange: 320, alertSightRange: 380, flammability: 0.6, density: 1,
  flies: true,        // read by _lib.js: melee units don't target it while it's up
  brushSpacing: 30,
  flock: { herd: 0, separation: 20 },
  morale: { baseline: 0.85, oddsWeight: 0.3, breakAt: 0.25 },
  init(w, u) { initBag(w, u); u.leaping = LEAP.FLY; u.z = u.pz = 0; u.b.next = w.time + 1; },
  holdsNerve(w, u) { return u.subState !== 0; },
  onHit(w, u) { if (u.subState === CARRY && u.hp < T.dropAt * u.maxHp) release(w, u); },
  onDeath(w, u) { if (u.subState === CARRY) release(w, u); },
  // possessed, attack held at nobody: dive at the aim point (grabs / pecks whatever is there)
  possessFire(w, u, aim, ax, ay) {
    if (u.subState !== 0 || w.time < u.b.next) return;
    let dx = ax - u.x, dy = ay - u.y; const d = hypot(dx, dy) || 0.001, k = Math.min(T.diveStart, d) / d;
    startDive(w, u, u.x + dx * k, u.y + dy * k, 1);
  },
  brain,
});
