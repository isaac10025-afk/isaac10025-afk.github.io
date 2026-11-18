// Unit maker A-SUPPORT: armour, shield, shell, dodge, spikes (OURS, Part 2 step 8, STEP8.md). Owner: A-SUPPORT.
// Defence passives through the core's hooks: def patches the game already reads (`armorBounce` + `deflects`: ballistics,
// `shield` {arc, block, brace}: damage.js blockFrac + melee.js brace) and the spec hooks (damageMul, onHit, busy, tick).
import { registerAbility } from '../registry.js';
import { ACT, power, used, STATE, hypot, ENEMY, damage, setState, canAuto } from '../lib.js';
import { blockFrac } from '../../combat/index.js';
import { findCharger, stillCharging } from '../../units/siege/_lib.js';
import { pose, unpose, poseFor, MARGIN, Q } from './support-lib.js';

// ================================================================ armour (from units/dinos/ankylo.js armorBounce)
const ARMOUR = {
  rearCos: -0.8,   // a shot from within ~37° of straight behind (cos < -0.8) gets through; every other bullet / arrow /
                   // shuriken bounces off (flames, blasts and melee hurt as normal: the ankylo's rule)
};
registerAbility({
  id: 'armour',
  def: {
    deflects: true,   // as the ankylo (ballistics reads armorBounce first)
    armorBounce(w, u, sx, sy) {
      const dx = sx - u.x, dy = sy - u.y, d = hypot(dx, dy);
      const b = d < 0.001 || (dx * Math.cos(u.heading) + dy * Math.sin(u.heading)) / d > ARMOUR.rearCos;
      if (b) used(w, u, 'armour');
      return b;
    },
  },
  // the matrix field's legionaries can cut a small body down before a rifle bullet reaches it: it gets 5× hp there
  test: { setup(g, w, u) { u.maxHp = u.hp = u.maxHp * 5; }, within: 30 },
});

// ================================================================ shield (from units/siege/shieldwall.js)
const SHIELD = {
  arc: 0.35,       // cos threshold: blocks within ±70° of the facing (shieldwall)
  block: 0.9,      // 90 % of a frontal hit
  brace: 80,       // OG brace damage to a rider trampling into it (melee.js reads def.shield.brace)
  R: 170,          // px × power: watches for chargers this far ...
  minSpeed: 140,   // px/s: ... running at least this fast ...
  cos: 0.8,        // ... straight at it (within ~37°)
  scanEvery: 6,    // ticks between charger scans
  hold: 0.6,       // s it stays braced after the threat passes
  touch: 5,        // px: contact gap for the bounce
  keep: 0.35,      // the charger bounces back at this × its speed ...
  stun: 0.5,       // ... stunned this long
  again: 0.8,      // s: the same charger bounces at most once per this
};
function bounce(w, u, bag, c) {
  if (bag.bounced === c.id && w.time - bag.bouncedAt < SHIELD.again) return;
  bag.bounced = c.id; bag.bouncedAt = w.time;
  c.vx = -c.vx * SHIELD.keep; c.vy = -c.vy * SHIELD.keep;
  if (c.stun < SHIELD.stun) c.stun = SHIELD.stun;
  if (c.state === STATE.CHARGE) setState(c, STATE.ENGAGE);
  used(w, u, 'shield');
  w.emit('block', { x: u.x, y: u.y, v: 1, type: u.type, as: 'shieldwall' });
  w.emit('bounce', { x: c.x, y: c.y, v: 1, type: u.type, as: 'shieldwall' });
}
registerAbility({
  id: 'shield',
  def: { shield: { arc: SHIELD.arc, block: SHIELD.block, brace: SHIELD.brace } },
  init(w, u, bag) { bag.charger = -1; bag.until = -1; bag.bx = u.x; bag.by = u.y; bag.bounced = -1; bag.bouncedAt = -9; bag.pc = 0; bag.pt = 0; },
  // brace: someone runs at it → it plants the shield toward them (the weapon waits), and a charger that reaches the
  // shield face bounces off, stunned
  busy(w, u, bag) {
    if (!(u.hp > 0) || u.stun > 0 || u.state === STATE.FLEE || !canAuto(w, u)) { if (bag.pc !== 0) unpose(w, u, bag); return false; }
    const R = SHIELD.R * power(u);
    let c = bag.charger >= 0 ? w.unitById(bag.charger) : null;
    if (c && !stillCharging(u, c, SHIELD.minSpeed * 0.5, 0.5, R)) c = null;
    if (!c && (w.tick + u.index) % SHIELD.scanEvery === 0) c = findCharger(w, u, R, SHIELD.minSpeed, SHIELD.cos);
    bag.charger = c ? c.id : -1;
    if (c) { bag.until = w.time + SHIELD.hold; bag.bx = c.x; bag.by = c.y; }
    if (w.time >= bag.until) { if (bag.pc !== 0) unpose(w, u, bag); return false; }
    pose(w, u, bag, ACT.SHELL);   // braced (no BRACE code yet: the hunkered pose)
    setState(u, STATE.ENGAGE);
    u.face = Math.atan2(bag.by - u.y, bag.bx - u.x);
    if (c && hypot(c.x - u.x, c.y - u.y) <= u.radius + c.radius + SHIELD.touch && blockFrac(u, c.x, c.y) > 0) bounce(w, u, bag, c);
    return true;
  },
  // a hit the shield took (counted), and a charger that hits the shield face bounces off even unseen (shieldwall onHit)
  onHit(w, u, dealt, att, kind, bag) {
    if (!att || att === u || kind === 'blast' || kind === 'fire') return;
    const bf = blockFrac(u, att.x, att.y);
    if (bf > 0) used(w, u, 'shield');
    if (bf === 0 || u.hp <= 0 || u.stun > 0 || !canAuto(w, u)) return;
    if (hypot(att.vx, att.vy) < SHIELD.minSpeed || hypot(att.x - u.x, att.y - u.y) > u.radius + att.radius + SHIELD.touch + 4) return;
    bag.until = w.time + SHIELD.hold; bag.bx = att.x; bag.by = att.y;
    pose(w, u, bag, ACT.SHELL);
    bounce(w, u, bag, att);
  },
});

// ================================================================ shell (from units/ocean/turtle.js)
const SHELL = {
  at: 0.6,         // hides below 60 % hp ...
  crowd: 3,        // ... or with 3+ enemies ...
  gap: 30,         // ... within this many px (× power) of its body (edge to edge)
  every: 6,        // ticks between crowd counts
  time: 4,         // s in the shell (it can't move or attack)
  rest: 6,         // s after coming out before it can hide again
  mul: 0.15,       // damage factor in the shell
};
function crowded(w, u) {
  const g = SHELL.gap * power(u), n = w.queryMask(u.x, u.y, u.radius + g + MARGIN, ENEMY[u.faction], Q, Q.length);
  let c = 0;
  for (let k = 0; k < n; k++) {
    const o = Q[k]; Q[k] = null;
    if (c >= SHELL.crowd || !(o.hp > 0) || o.dead || o.def.prop) continue;
    if (hypot(o.x - u.x, o.y - u.y) - o.radius - u.radius <= g) c++;
  }
  return c >= SHELL.crowd;
}
function hide(w, u, bag) {
  bag.on = 1; bag.t0 = w.time;
  pose(w, u, bag, ACT.SHELL);
  u.goalX = 0; u.goalY = 0;
  used(w, u, 'shell');
  w.emit('block', { x: u.x, y: u.y, v: 0.6, type: u.type, as: 'turtle' });
}
registerAbility({
  id: 'shell',
  init(w, u, bag) { bag.on = 0; bag.t0 = -9; bag.next = 0; bag.pc = 0; bag.pt = 0; },
  // runs first every brain tick: in the shell it stands still; out of it, hurt or crowded = in it goes (not while the
  // player drives it: the turtle's rule; taken over inside it = out at once)
  busy(w, u, bag) {
    const now = w.time;
    if (bag.on === 1) {
      if (now - bag.t0 < SHELL.time && u.possessed !== 1 && u.hp > 0) { u.goalX = 0; u.goalY = 0; u.face = u.heading; setState(u, STATE.ALERT); pose(w, u, bag, ACT.SHELL); return true; }
      bag.on = 0; bag.next = now + SHELL.rest; unpose(w, u, bag);
    }
    if (now >= bag.next && u.possessed !== 1 && u.hp > 0 && (u.hp < SHELL.at * u.maxHp || ((w.tick + u.index) % SHELL.every === 0 && crowded(w, u)))) { hide(w, u, bag); return true; }
    return false;
  },
  // the clock also runs while the brain is skipped (tossed, reacting)
  tick(w, u, bag) { if (bag.on === 1 && w.time - bag.t0 >= SHELL.time + 0.5) { bag.on = 0; bag.next = w.time + SHELL.rest; unpose(w, u, bag); } },
  damageMul(w, u, amount, att, kind, bag) { return bag.on === 1 ? SHELL.mul : 1; },
  holdsNerve(w, u, bag) { return bag.on === 1; },
  test: { setup(g, w, u) { u.hp = u.maxHp * 0.5; }, within: 10 },
});

// ================================================================ dodge (from units/sports/boxer.js damageMul)
const DODGE = {
  chance: 0.35,    // of each melee hit / bullet / arrow (not blasts, fire, poison...), unless stunned
  time: 0.2,       // s sidestep ...
  speed: 1,        // ... at this × its run speed (brain.js dodgeMove)
  pose: 0.25,      // s of the dodge pose (ACT.HOP: no DODGE code yet)
};
registerAbility({
  id: 'dodge',
  init(w, u, bag) { bag.dodgeT = -9; bag.pc = 0; bag.pt = 0; },
  damageMul(w, u, amount, att, kind, bag) {
    // kind === world.projKind = a plain shot hit (damage.js passes the projectile kind for a hit with no kind)
    if (!(kind === undefined || kind === 'blow' || kind === w.projKind) || u.stun > 0 || !(u.hp > 0) || !(amount > 0)) return 1;
    if (w.rng() >= DODGE.chance) return 1;
    let ax = u.x - Math.cos(u.heading), ay = u.y - Math.sin(u.heading);
    if (att) { ax = att.x; ay = att.y; }
    const dx = u.x - ax, dy = u.y - ay, d = hypot(dx, dy) || 1, side = w.rng() < 0.5 ? -1 : 1;
    u.dodgeX = ((-dy / d) * side + (dx / d) * 0.4) * DODGE.speed; u.dodgeY = ((dx / d) * side + (dy / d) * 0.4) * DODGE.speed;
    u.dodgeDelay = 0; u.dodgeTime = DODGE.time;
    bag.dodgeT = w.time;
    pose(w, u, bag, ACT.HOP);
    used(w, u, 'dodge');
    w.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id, dodge: 1, as: 'boxer' });
    return 0;
  },
  onHit(w, u, dealt, att, kind, bag) { if (dealt === 0 && bag.dodgeT === w.time) u.flash = 0; },   // a dodged blow leaves no hit flash
  tick(w, u, bag) { poseFor(w, u, bag, DODGE.pose); },
  // the matrix field can kill a small body in a few stunning blows (no dodge while stunned): it gets 5× hp there
  test: { setup(g, w, u) { u.maxHp = u.hp = u.maxHp * 5; }, within: 30 },
});

// ================================================================ spikes (from units/ocean/puffer.js)
const SPIKES = {
  r: 60,           // px × power from its middle to an enemy's edge: that close puffs it up ...
  time: 4,         // ... for 4 s (a hit puffs it too, and keeps it puffed 4 s more)
  rest: 1,         // s flat after a puff before a nearby enemy can puff it again
  every: 6,        // ticks between looks for enemies close by
  back: 12,        // × power: a melee hit on it while puffed costs the attacker this
  meleeGap: 30,    // px × power past both bodies: a melee unit's blow from this close is a melee hit
  touch: 6,        // × power: enemies touching it while puffed take this ...
  touchEvery: 0.5, // ... every 0.5 s
  touchGap: 3,     // px × power past both bodies = touching
  pose: 0.3,       // s of the puff-up pose (ACT.PUFF); the spikes stay out (bag.puffed) for the art
};
function puff(w, u, bag) {
  const fresh = bag.puffed !== 1;
  bag.puffed = 1; bag.until = w.time + SPIKES.time;
  if (!fresh) return;
  bag.t0 = w.time + SPIKES.touchEvery;   // first spike check 0.5 s after it puffs
  bag.puffT = w.time;
  pose(w, u, bag, ACT.PUFF);
  w.emit('puffup', { x: u.x, y: u.y, type: u.type, as: 'puffer' });
}
// every enemy touching it takes the touch damage
function spikesOut(w, u) {
  const p = power(u), gap = SPIKES.touchGap * p, n = w.queryMask(u.x, u.y, u.radius + gap + MARGIN, ENEMY[u.faction], Q, Q.length);
  let hit = 0;
  for (let k = 0; k < n; k++) {
    const o = Q[k]; Q[k] = null;
    if (!(o.hp > 0) || o.dead || o.def.prop || o.z > 8 || o.climb > 0 || o.inside >= 0) continue;
    if (hypot(o.x - u.x, o.y - u.y) > u.radius + o.radius + gap) continue;
    damage(w, o, SPIKES.touch * p, u, 'spike', o.x, o.y); hit++;   // from its own spot: spikes poke round shields
  }
  if (hit > 0) { used(w, u, 'spikes'); w.emit('strike', { x: u.x, y: u.y, v: 0.5, type: u.type, as: 'puffer' }); }
}
registerAbility({
  id: 'spikes',
  init(w, u, bag) { bag.puffed = 0; bag.until = 0; bag.t0 = 0; bag.next = 0; bag.puffT = -9; bag.pc = 0; bag.pt = 0; },
  tick(w, u, bag) {
    poseFor(w, u, bag, SPIKES.pose);
    if (!(u.hp > 0) || u.inside >= 0) return;
    const now = w.time;
    if (bag.puffed === 1) {
      if (now >= bag.until) { bag.puffed = 0; bag.next = now + SPIKES.rest; }
      else if (now >= bag.t0) { bag.t0 += SPIKES.touchEvery; spikesOut(w, u); }
    } else if (now >= bag.next && (w.tick + u.index) % SPIKES.every === 0 && canAuto(w, u)) {
      const R = SPIKES.r * power(u), o = w.findNearest(u.x, u.y, R + MARGIN, ENEMY[u.faction], null, 0);
      if (o && hypot(o.x - u.x, o.y - u.y) - o.radius <= R) puff(w, u, bag);
    }
  },
  // hit: a melee hit on the spikes hurts the attacker (kind 'spike' back, so two spiky units can't ping-pong), then it puffs
  onHit(w, u, amount, att, kind, bag) {
    if (!(u.hp > 0)) return;
    if (bag.puffed === 1 && att && att !== u && att.def.melee === true && (kind === undefined || kind === 'blow') && att.hp > 0 && !att.dead
      && hypot(att.x - u.x, att.y - u.y) <= u.radius + att.radius + SPIKES.meleeGap * power(u)) {
      damage(w, att, SPIKES.back * power(u), u, 'spike', att.x, att.y);   // from its own spot: a shield doesn't help the arm that struck
      used(w, u, 'spikes');
    }
    puff(w, u, bag);
  },
});

export { ARMOUR, SHIELD, SHELL, DODGE, SPIKES };
