// boxer (OURS, Sports tab): COMBO: three quick jabs (9 every 0.3 s, left-right-left), then an uppercut (22) that tosses
// a victim of mass ≤ 2 up in the air. DODGE: 35 % of melee hits, bullets and arrows on him miss while he isn't stunned
// (def.damageMul → 0) and he sidesteps away from the blow.
// b.act: 1 jab → `jab0` / `jab1` (by b.arm: 0 left, 1 right), 2 uppercut → `upper`, 3 dodge → `dodge`.
import { athlete, initB, begin, meleeBody, setAct, actAge, hypot, damage, push, toss, tossable, emptySwing } from './_lib.js';

const T = {
  hp: 150, // hit points (STEP6)
  walk: 90, // px/s (STEP6)
  run: 150, // px/s (STEP6)
  jab: {
    damage: 9, // per jab (STEP6)
    damageJitter: 1, // ±
    every: 0.3, // s between jabs (STEP6)
    count: 3, // jabs before the uppercut (STEP6)
    push: 25, // shove
    stun: 0.06, // s
    pose: 0.15, // s of a jab pose
  },
  upper: {
    damage: 22, // (STEP6)
    damageJitter: 2, // ±
    maxMass: 2, // victims this light go up (STEP6)
    up: 360, // px/s upward
    out: 50, // px/s back
    push: 90, // shove when it doesn't fly
    stun: 0.3, // s
    recover: 0.6, // s after the uppercut before the next combo
    pose: 0.35, // s of the `upper` pose
  },
  reset: 1.2, // s out of reach: the combo starts over
  reach: 5, // px past both radii
  band: 16, // px
  facing: 0.6, // rad
  circle: 0.7, // strafing (light on his feet)
  dodge: {
    chance: 0.35, // of each melee hit / bullet / arrow (STEP6)
    time: 0.2, // s sidestep
    speed: 1, // × runSpeed
    pose: 0.25, // s of the `dodge` pose (b.act 3)
  },
};

function blow(world, u, t) {   // meleeFight's strike: the next punch of the combo
  const b = u.b, dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, ux = dx / d, uy = dy / d;
  if (world.time - b.lastPunch > T.reset) b.combo = 0;
  b.lastPunch = world.time; u.attack = 1;
  if (b.combo < T.jab.count) {
    const pass = damage(world, t, T.jab.damage + T.jab.damageJitter * (world.rng() - world.rng()), u);
    if (t.hp > 0) push(world, t, ux, uy, T.jab.push * pass, T.jab.stun * pass);
    b.arm = b.combo & 1; b.combo++;
    setAct(world, u, 1); b.actT = world.time;
    u.cooldown = T.jab.every;
    world.emit('strike', { x: t.x, y: t.y, v: 0.6, type: u.type });
    return;
  }
  const pass = damage(world, t, T.upper.damage + T.upper.damageJitter * (world.rng() - world.rng()), u);
  if (t.hp > 0 && pass >= 0.5 && tossable(t, T.upper.maxMass)) toss(world, t, ux, uy, T.upper.out, T.upper.up);
  else if (t.hp > 0) push(world, t, ux, uy, T.upper.push * pass, T.upper.stun * pass);
  b.combo = 0;
  setAct(world, u, 2);
  u.cooldown = T.upper.recover;
  world.emit('strike', { x: t.x, y: t.y, v: 1.2, type: u.type });
}
const W = { reach: T.reach, band: T.band, facing: T.facing, circle: T.circle, close: 120, strike: blow };

const D = athlete({
  type: 'boxer',
  og: 'Boxer (ours)', // no OG original
  radius: 9, // OG-raw (STEP6)
  mass: 1.3, // STEP6
  maxHp: T.hp,
  melee: true,
  strength: 1,
  walkSpeed: T.walk,
  runSpeed: T.run,
  brushSpacing: 21,
  look: { attack: { time: 0.18 } },
  weapon: { damage: T.jab.damage, cooldown: T.jab.every, reach: T.reach },
  init(world, u) { initB(u); const b = u.b; b.arm = 0; b.combo = 0; b.lastPunch = -9; u.cooldown = world.rng() * T.jab.every; },
  brain(world, u) {
    const b = u.b, age = actAge(world, u);
    if ((b.act === 1 && age >= T.jab.pose) || (b.act === 2 && age >= T.upper.pose) || (b.act === 3 && age >= T.dodge.pose)) setAct(world, u, 0);
    if (begin(world, u)) return;
    meleeBody(world, u, W);
  },
  // DODGE: a melee hit, bullet or arrow ('blow', or no kind) misses 35 % of the time unless he is stunned
  damageMul(world, u, amount, att, kind) {
    // STEP6 (lead): kind === world.projKind = a plain shot hit (damage.js passes the projectile kind for a hit with no kind)
    if (!(kind === undefined || kind === 'blow' || kind === world.projKind) || u.stun > 0 || !(u.hp > 0) || !(amount > 0)) return 1;
    if (world.rng() >= T.dodge.chance) return 1;
    let ax = u.x - Math.cos(u.heading), ay = u.y - Math.sin(u.heading);
    if (att) { ax = att.x; ay = att.y; }
    const dx = u.x - ax, dy = u.y - ay, d = hypot(dx, dy) || 1, side = world.rng() < 0.5 ? -1 : 1;
    u.dodgeX = ((-dy / d) * side + (dx / d) * 0.4) * T.dodge.speed; u.dodgeY = ((dx / d) * side + (dy / d) * 0.4) * T.dodge.speed;
    u.dodgeDelay = 0; u.dodgeTime = T.dodge.time;
    setAct(world, u, 3); u.b.actT = world.time;
    world.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id, dodge: 1 });
    return 0;
  },
  // a dodged blow leaves no hit flash
  onHit(world, u, dealt) { if (dealt === 0 && u.b.act === 3 && u.b.actT === world.time) u.flash = 0; },
  // possessed, attack held at nobody: shadow-box (a jab at the air)
  possessFire(world, u) { if (emptySwing(world, u, T.jab.every)) { const b = u.b; b.arm = b.combo & 1; b.combo = (b.combo + 1) % (T.jab.count + 1); setAct(world, u, 1); b.actT = world.time; } },
});
export default D;
export { T };
