// cheerleader (OURS, Sports tab): CHEER AURA r 150: Sports units of her side near her move 20 % faster and never break or
// flee (morale held ≥ 0.6) (the 'sports:aura' system in _lib.js does it, with def.cheerR). She stays behind her side's
// front (about 70 px behind the friend nearest the enemy), slaps with a pom-pom (3) when cornered or when nobody of her
// side but cheerleaders is left (ATTACK3 L3), and jumps and cheers when her side kills someone near her
// ('sports:kills' calls def.onCheer).
// b.act: 1 cheer → `cheer` (jump, poms up; 1 s).
import { athlete, initB, begin, meleeFight, closeOn, idle, setAct, actAge, setState, targetOf, hypot, STATE, DT, maskBit, addCheerleader, emptySwing, fleeSteer, losClear } from './_lib.js';
import { moveTo } from '../../systems/navigation.js';

const T = {
  hp: 80, // hit points (STEP6)
  walk: 85, // px/s (STEP6)
  run: 140, // px/s (STEP6)
  aura: 150, // px cheer aura radius (STEP6; what it does: _lib.js CHEER)
  see: 260, // px: a kill by her side this close makes her cheer
  cheerTime: 1, // s of the `cheer` jump (b.act 1)
  behind: 70, // px behind the friend nearest the enemy
  frontR: 260, // px: friends this close count for "her side's front"
  anywhere: 2000, // px: none that close: any friend on the field (ATTACK3 L3); none at all: she goes in and slaps
  alone: 170, // px: with no friends near she keeps this far from the enemy
  spotEvery: 10, // ticks between picks of her spot (staggered)
  spotStop: 12, // px: close enough to her spot
  slap: {
    damage: 3, // pom-pom slap (STEP6)
    damageJitter: 1, // ±
    cooldown: 0.7, // s
    cooldownJitter: 0.2, // +
    push: 25, // shove
    stun: 0.05, // s
    reach: 4, // px past both radii
    band: 6, // px: she only slaps who is right on her
    facing: 0.8, // rad
    circle: 0.3, // strafing
    chase: false, // ATTACK3 L3: she doesn't run after a foe that leaves her (she stays behind the front)
  },
};

const Q_CAP = 128, _q = new Array(Q_CAP).fill(null);
/** Her spot: T.behind px behind the friend nearest the enemy t (or T.alone px from t with no friend near). */
function frontFriend(world, u, t, R) {
  const n = world.queryMask(u.x, u.y, R, maskBit(u.faction), _q, Q_CAP);
  let f = null, fd = Infinity;
  for (let k = 0; k < n; k++) {
    const o = _q[k]; _q[k] = null;
    if (o === u || !(o.hp > 0) || o.dead || o.def.cheerR !== undefined || o.def.prop) continue;   // another cheerleader isn't a front
    const d = hypot(o.x - t.x, o.y - t.y);
    if (d < fd) { fd = d; f = o; }
  }
  return f;
}
function pickSpot(world, u, t) {
  const b = u.b;
  const f = frontFriend(world, u, t, T.frontR), fd = f ? hypot(f.x - t.x, f.y - t.y) : Infinity;
  // ATTACK3 L3: nobody of hers near: is there anybody of hers at all? Cheerleaders left on their own (or only other
  // cheerleaders) kept 170 px off the enemy for good: the battle never ended. With nobody left to cheer she fights.
  b.alone = f || frontFriend(world, u, t, T.anywhere) ? 0 : 1;
  if (f && fd < hypot(u.x - t.x, u.y - t.y) + T.behind) {
    const dx = f.x - t.x, dy = f.y - t.y, d = hypot(dx, dy) || 1;
    b.spotX = f.x + (dx / d) * T.behind; b.spotY = f.y + (dy / d) * T.behind;
  } else {
    const dx = u.x - t.x, dy = u.y - t.y, d = hypot(dx, dy) || 1;
    b.spotX = t.x + (dx / d) * T.alone; b.spotY = t.y + (dy / d) * T.alone;
  }
  b.spotX = Math.min(world.W - 20, Math.max(20, b.spotX)); b.spotY = Math.min(world.H - 20, Math.max(20, b.spotY));
}

const D = athlete({
  type: 'cheerleader',
  og: 'Cheerleader (ours)', // no OG original
  radius: 8.5, // OG-raw (STEP6)
  mass: 0.9, // STEP6
  maxHp: T.hp,
  melee: true,
  strength: 0.3,
  walkSpeed: T.walk,
  runSpeed: T.run,
  brushSpacing: 20,
  look: { attack: { time: 0.25 } },
  weapon: { ...T.slap, range: T.aura },
  cheerR: T.aura,
  cheerSee: T.see,
  init(world, u) { initB(u); const b = u.b; b.spotX = u.x; b.spotY = u.y; b.spotT = -99; b.alone = 0; u.cooldown = world.rng() * T.slap.cooldown; addCheerleader(world, u); },
  onCheer(world, u) {
    if (u.b.act === 1 && actAge(world, u) < 0.5 * T.cheerTime) return;
    setAct(world, u, 1); u.b.actT = world.time;
    world.emit('cheer', { x: u.x, y: u.y, v: 1, type: u.type });   // STEP6 SPORTS AUDIO: a cheer (Sound ask)
  },
  brain(world, u) {
    const b = u.b;
    if (b.act === 1 && actAge(world, u) >= T.cheerTime) setAct(world, u, 0);
    if (begin(world, u)) return;
    const t = targetOf(world, u);
    if (u.state === STATE.FLEE) { fleeSteer(world, u, t, u.def.runSpeed); return; }
    if (!t) { idle(world, u); return; }
    const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
    if (meleeFight(world, u, t, T.slap, dx, dy, d)) return;                  // someone right on her: pom-pom slap
    if (u.possessed === 1) { setState(u, STATE.ENGAGE); u.face = Math.atan2(dy, dx); u.goalX = (dx / d) * u.def.runSpeed; u.goalY = (dy / d) * u.def.runSpeed; return; }
    if (world.tick - b.spotT >= T.spotEvery) { pickSpot(world, u, t); b.spotT = world.tick; }
    if (b.alone === 1) { closeOn(world, u, t, dx, dy, d); return; }   // nobody left to cheer for: in with the pom-poms
    const sx = b.spotX - u.x, sy = b.spotY - u.y, sd = hypot(sx, sy);
    setState(u, STATE.ALERT);
    if (sd > T.spotStop) moveTo(world, u, b.spotX, b.spotY, sd > 60 ? u.def.runSpeed : u.def.walkSpeed, world.walls.count === 0 || world.lineOfSight(u.x, u.y, b.spotX, b.spotY));
    if (losClear(world, u)) u.face = Math.atan2(dy, dx);
  },
  // possessed, attack held at nobody: a cheer (and a pom-pom swing)
  possessFire(world, u) { if (emptySwing(world, u, T.slap.cooldown)) { setAct(world, u, 1); u.b.actT = world.time; world.emit('cheer', { x: u.x, y: u.y, v: 1, type: u.type }); } },
});
export default D;
export { T };
