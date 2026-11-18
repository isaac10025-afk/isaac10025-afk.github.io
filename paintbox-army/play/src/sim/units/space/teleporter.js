// teleporter (OURS, Space tab): a dagger alien (18 every 0.5 s) that blinks. Every 5 s, with its target 120+ px away, it
// vanishes (0.25 s: untargetable and untouchable) and appears 30 px behind the target (the far side from where it
// stood); its first stab after that is a backstab ×2. Below 30 % hp it blinks home to its own side once (its team's
// edge in Team battle, else where it was painted). Owner: SPACE-SIM.
// Pose codes (STEP6.md): b.act 1 blink out → `blink`; 2 blink in → `appear`; `atk` stab. b.x0 / b.y0 = where it will
// appear (set at blink out), for a flash on the ground there.
import { registerSystem } from '../../systems/extra.js';
import {
  alien, initBag, act, targetOf, setState, idle, fleeing, closeOn, meleeFight, swing, standable,
  hypot, STATE, meleeStrike,
} from './_lib.js';

const T = {
  hp: 85, mass: 1, radius: 8,
  walk: 90, run: 150,       // px/s
  every: 5,                 // s between blinks
  minD: 120,                // px: blinks only at a target at least this far
  out: 0.25,                // s vanished (b.act 1)
  appear: 0.25,             // s of the `appear` pose (b.act 2)
  behind: 30,               // px from the target's middle, on its far side
  backstab: 2,              // × damage on the first stab after a blink
  homeAt: 0.3,              // hp fraction: blinks home once below this
  homeEdge: 60,             // px in from its team's edge (Team battle)
  aimBlink: 160,            // px: possessed, attack at nobody: blinks this far toward the aim at most
  dagger: {
    damage: 18, damageJitter: 3, cooldown: 0.5, cooldownJitter: 0.1, push: 50, stun: 0.1,
    reach: 6, band: 16, facing: 0.7, circle: 0.5, backStep: false, close: 120,
  },
};
const NONE = 0, OUT = 1, IN = 2;   // subState
const STAB = { ...T.dagger };     // the backstab (damage × backstab), reused

// where to appear: `dist` px past (tx, ty) along the line from the teleporter, else turned up to ±90° round it
function spotBehind(w, u, tx, ty, dist, out) {
  const a0 = Math.atan2(ty - u.y, tx - u.x);
  for (let k = 0; k < 5; k++) {
    const a = a0 + (k === 0 ? 0 : (k & 1 ? 1 : -1) * Math.ceil(k / 2) * 0.785);
    const x = tx + Math.cos(a) * dist, y = ty + Math.sin(a) * dist;
    if (standable(w, x, y, u.radius + 2)) { out[0] = x; out[1] = y; return true; }
  }
  return false;
}
const SPOT = new Float64Array(2);
function blinkOut(w, u, x, y) {
  const b = u.b;
  u.subState = OUT; b.t0 = w.time; b.x0 = x; b.y0 = y; b.next = w.time + T.every;
  u.hidden = 0.001;   // untargetable while gone (conceal.js reads it); damageMul 0 makes it untouchable
  act(w, u, 1);
  w.emit('teleport', { x: u.x, y: u.y, id: u.id, type: u.type, out: 1 });
}
function blinkIn(w, u) {
  const b = u.b;
  const t = targetOf(w, u);
  if (t && b.k === 0 && spotBehind(w, u, t.x, t.y, Math.max(T.behind, t.radius + u.radius + 4), SPOT)) { b.x0 = SPOT[0]; b.y0 = SPOT[1]; }   // follow the target if it moved
  u.x = u.px = b.x0; u.y = u.py = b.y0; u.vx = 0; u.vy = 0;
  u.hidden = 0; u.subState = IN; b.t0 = w.time;
  b.stab = b.k === 0 ? 1 : 0;   // a backstab is ready (not after blinking home)
  if (t && b.k === 0) u.face = u.heading = Math.atan2(t.y - u.y, t.x - u.x);
  act(w, u, 2);
  w.emit('teleport', { x: u.x, y: u.y, id: u.id, type: u.type, in: 1 });
}
// its own side: its team's edge in Team battle, else back where it was painted
function blinkHome(w, u) {
  let x = u.homeX, y = u.homeY;
  if (u.team === 0) x = T.homeEdge; else if (u.team === 1) x = w.W - T.homeEdge;
  if (u.team >= 0) y = u.y;
  if (!standable(w, x, y, u.radius + 2)) { x = u.homeX; y = u.homeY; }
  u.b.k = 1; u.b.home = 1;
  blinkOut(w, u, x, y);
}

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.subState === OUT) return;   // gone: the blink system brings it back
  if (u.stun > 0) { u.face = u.heading; return; }
  if (b.home === 0 && u.hp < T.homeAt * u.maxHp && u.possessed !== 1) { blinkHome(w, u); return; }
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  if (now >= b.next && u.subState === NONE && d >= T.minD && spotBehind(w, u, t.x, t.y, Math.max(T.behind, t.radius + u.radius + 4), SPOT)) {
    b.k = 0; setState(u, STATE.CHARGE); u.face = Math.atan2(dy, dx);
    blinkOut(w, u, SPOT[0], SPOT[1]); return;
  }
  if (b.stab === 1) {   // the first stab after a blink: ×2
    const reach = u.radius + t.radius + T.dagger.reach;
    if (d <= reach && u.cooldown <= 0) {
      setState(u, STATE.ENGAGE); u.face = Math.atan2(dy, dx);
      STAB.damage = T.dagger.damage * T.backstab;
      meleeStrike(w, u, t, STAB); b.stab = 0;
      w.emit('strike', { x: t.x, y: t.y, v: 1.5, type: u.type, backstab: 1 });
      return;
    }
  }
  if (meleeFight(w, u, t, T.dagger, dx, dy, d) !== 0) return;
  closeOn(w, u, t, dx, dy, d);
}

// Blink timing runs every tick in its own system (after the brains): a brain can skip ticks (a reaction delay on a new
// target, in the air), and the teleporter must never stay gone longer than 0.25 s.
function blinkSys(w) {
  const us = w.units, now = w.time;
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    if (u.dead || u.def !== D || u.subState === NONE) continue;
    if (u.subState === OUT) { if (now - u.b.t0 >= T.out - 1e-9) blinkIn(w, u); }
    else if (now - u.b.t0 >= T.appear - 1e-9) { u.subState = NONE; act(w, u, 0); }
  }
}
registerSystem('spaceBlink', blinkSys, 'brain');

const D = alien({
  type: 'teleporter', og: 'Teleporter (ours)',   // no OG unit
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 0.9, melee: true,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: T.run * 1.3,
  weapon: T.dagger,
  look: { attack: { time: 0.25 } },
  init(w, u) { initBag(w, u); u.b.stab = 0; u.b.home = 0; u.b.next = w.time + 1 + 2 * w.rng(); u.cooldown = w.rng() * 0.5; },
  damageMul(w, u) { return u.subState === OUT ? 0 : 1; },   // gone: nothing touches it
  onDeath(w, u) { u.hidden = 0; },
  // possessed, attack held at nobody: blink toward the aim (up to 160 px) when ready, else an empty stab
  possessFire(w, u, aim, ax, ay) {
    if (w.time < u.b.next || u.subState !== NONE) { swing(w, u, T.dagger.cooldown); return; }
    const dx = ax - u.x, dy = ay - u.y, d = hypot(dx, dy) || 0.001, k = Math.min(T.aimBlink, d) / d;
    let x = u.x + dx * k, y = u.y + dy * k;
    for (let s = 0; s < 4 && !standable(w, x, y, u.radius + 2); s++) { x = u.x + (x - u.x) * 0.6; y = u.y + (y - u.y) * 0.6; }
    if (!standable(w, x, y, u.radius + 2)) return;
    u.b.k = 2;   // no backstab after a free blink
    blinkOut(w, u, x, y);
  },
  brain,
});
export default D;
export { T };
