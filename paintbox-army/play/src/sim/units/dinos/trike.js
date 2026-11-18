// Triceratops (OURS, Part 2 step 4): head down, charges in a straight line. The first enemy it hits is gored and flipped
// up over its back; anyone else in the way is shoved aside. A wall stops it dazed; a braced shield takes the hit and
// it bounces off. Horn jab in melee. Owner: DINOS-SIM. Pose codes (STEP4.md): b.act 1 charge, 2 dazed (wall).
import {
  dino, initBag, targetOf, act, setState, hunt, idle, fleeing, bite, braced, clearLine, high, grounded, isHostileTo,
  damage, push, toss, stun, hypot, angleDiff, STATE, DINO,
} from './_lib.js';

const T = {
  radius: 16, hp: 520, mass: 7,
  walk: 40, run: 150,
  chargeMul: 1.4,     // charge speed = 1.4 × run
  chargeMin: 90,      // charges at a target this far (px) ...
  chargeMax: 260,     // ... up to this far
  chargeTime: 2.2,    // s: the longest charge
  chargeEvery: 4,     // s between charges (ours: STEP4 gives no number)
  lead: 0.4,          // s: aims where the target will be
  gore: 45,           // first enemy hit: damage ...
  goreOut: 110,       // ... flipped back over the trike at this ground speed ...
  goreUp: 380,        // ... and this upward speed (heavy units, mass 8+, are shoved instead)
  horns: 8,           // px: the horns reach this far past its body for the first hit
  shove: 180,         // others in the way: pushed aside this hard ...
  shoveStun: 0.3,     // ... and stunned this long
  stopMass: 8,        // the first enemy hit is this heavy: the charge stops on it
  wallStun: 1.2,      // s dazed after running into a wall
  braceStun: 0.5,     // s stunned after hitting a braced shield
  stall: 0.3,         // a charge slowed under 30 % of its speed (after 0.4 s) is over
  home: 1.2,          // rad/s: until it hits someone the charge bends this much toward its target (dodgers still get a chance)
  jab: 20, jabEvery: 0.9, jabPush: 120,
};
const CHARGE = 1, DAZED = 2;   // subState

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.subState === DAZED) {
    if (now < b.t1) { u.face = u.heading; return; }
    u.subState = 0; act(w, u, 0);
  }
  if (u.subState === CHARGE) { charging(w, u); return; }
  if (u.stun > 0) { u.face = u.heading; return; }
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  if (d <= u.radius + t.radius + 6) {
    setState(u, STATE.ENGAGE); u.face = Math.atan2(dy, dx);
    if (u.cooldown <= 0) bite(w, u, t, T.jab, T.jabEvery, T.jabPush, 0.2);
    return;
  }
  if (now >= b.next && d >= T.chargeMin && d <= T.chargeMax && clearLine(w, u) && !high(t)) {
    startCharge(w, u, t.x + t.vx * T.lead - u.x, t.y + t.vy * T.lead - u.y);
    return;
  }
  hunt(w, u, t, d < 300 ? T.run : T.walk);
}

function startCharge(w, u, dx, dy) {
  const b = u.b, d = hypot(dx, dy) || 0.001;
  b.dx = dx / d; b.dy = dy / d; b.t0 = w.time; b.k = -1;
  u.subState = CHARGE; u.heading = Math.atan2(b.dy, b.dx);
  act(w, u, 1); setState(u, STATE.CHARGE);
  w.emit('charge', { x: u.x, y: u.y, type: u.type });
}
// stopped dead (wall, braced shield): dazed pose for t s, charge over
function daze(w, u, t) {
  u.subState = DAZED; u.b.t1 = w.time + t; u.b.next = w.time + T.chargeEvery; u.b.k = -1; act(w, u, 2);
  setState(u, STATE.ALERT);
}
function endCharge(w, u) {
  u.subState = 0; u.b.next = w.time + T.chargeEvery; u.b.k = -1;
  if (u.b.act === 1) act(w, u, 0);
  setState(u, STATE.ENGAGE);
}

const CQ = new Array(32);
function charging(w, u) {
  const b = u.b, now = w.time, sp = T.run * T.chargeMul;
  if (u.stun > 0 || now - b.t0 >= T.chargeTime) { endCharge(w, u); return; }
  if (now - b.t0 > 0.4 && hypot(u.vx, u.vy) < T.stall * sp) { endCharge(w, u); return; }
  const t = b.k < 0 && u.target >= 0 ? w.unitById(u.target) : null;
  if (t && t.hp > 0) { // bend a little toward the target
    const a = Math.atan2(b.dy, b.dx), want = Math.atan2(t.y - u.y, t.x - u.x), da = angleDiff(a, want), step = T.home / 60;
    if (Math.abs(da) < 1.2) { const na = a + Math.max(-step, Math.min(step, da)); b.dx = Math.cos(na); b.dy = Math.sin(na); }
  }
  u.goalX = b.dx * sp; u.goalY = b.dy * sp; u.face = Math.atan2(b.dy, b.dx);
  // wall straight ahead: dazed
  const ahead = u.radius + 3 + sp / 60;
  if (w.walls.count > 0 && w.walls.isSolidAt(u.x + b.dx * ahead, u.y + b.dy * ahead)) {
    daze(w, u, T.wallStun);
    stun(w, u, T.wallStun); push(w, u, -b.dx, -b.dy, 0.4 * sp * u.mass, 0);
    w.emit('trample', { x: u.x + b.dx * u.radius, y: u.y + b.dy * u.radius, v: 2, type: u.type });
    w.emit('bounce', { x: u.x + b.dx * u.radius, y: u.y + b.dy * u.radius, v: 1, snd: 'trike' });   // STEP4 AUDIO: the trample makes the crash
    return;
  }
  // bodies in the way: the first enemy is gored, the rest are shoved aside
  const n = w.queryMask(u.x, u.y, u.radius + DINO.MARGIN + 3, DINO.PROPS_OUT, CQ, CQ.length);
  for (let k = 0; k < n; k++) {
    const o = CQ[k]; CQ[k] = null;
    if (o === u || o.dead || !(o.hp > 0) || !grounded(o) || o.hurled === 1 || o.id === b.k) continue;
    const ox = o.x - u.x, oy = o.y - u.y, d = hypot(ox, oy) || 0.001;
    if (ox * b.dx + oy * b.dy <= 0) continue;   // ahead only
    const first = b.k < 0 && isHostileTo(u, o);
    if (d > u.radius + o.radius + (first ? T.horns : 2)) continue;   // touching (the horns reach further)
    if (first) {
      if (braced(o, u.x, u.y)) { // the shield takes the hit; the trike bounces off
        damage(w, o, T.gore, u);
        damage(w, u, o.def.shield.brace, o);
        push(w, u, -b.dx, -b.dy, 0.5 * sp * u.mass, T.braceStun); stun(w, u, T.braceStun);
        w.emit('block', { x: o.x, y: o.y, v: 1, type: o.type });
        daze(w, u, T.braceStun); return;
      }
      b.k = o.id;
      const pass = damage(w, o, T.gore, u);
      u.attack = 1;
      w.emit('trample', { x: o.x, y: o.y, v: 1.5, type: u.type });
      if (o.hp > 0) {
        if (o.mass < T.stopMass && !o.def.untossable && pass >= 0.5) toss(w, o, -b.dx, -b.dy, T.goreOut * pass, T.goreUp * pass); // up over its back
        else push(w, o, b.dx, b.dy, 2 * T.shove * pass, 0.4 * pass);
      }
      if (o.mass >= T.stopMass) { u.vx *= 0.2; u.vy *= 0.2; endCharge(w, u); return; }
      continue;
    }
    const side = b.dx * oy - b.dy * ox >= 0 ? 1 : -1;
    push(w, o, -b.dy * side, b.dx * side, T.shove, T.shoveStun);
  }
}

dino({
  type: 'trike', og: 'Triceratops',   // ours (no OG unit): the name is for tracing only
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 4,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: 230, accel: 520, decel: 600, turnRate: 3.2,
  sightRange: 300, alertSightRange: 360, flammability: 0.4, density: 3,
  brushSpacing: 44,
  morale: { baseline: 0.95, oddsWeight: 0.2, breakAt: 0.18, woundWeight: 0.2 },
  look: { attack: { time: 0.4 } },
  init(w, u) { initBag(w, u); u.b.next = w.time + 0.5; },
  holdsNerve(w, u) { return u.subState === CHARGE; },
  // possessed, attack held at nobody: charge where it aims
  possessFire(w, u, aim) {
    if (u.subState !== 0 || w.time < u.b.next) return;
    startCharge(w, u, Math.cos(aim), Math.sin(aim));
  },
  brain,
});
