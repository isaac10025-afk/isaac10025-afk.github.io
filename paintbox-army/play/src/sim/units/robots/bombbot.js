// bombbot (OURS, Robots tab): runs in and blows. Sprints at the biggest enemy crowd it can see and explodes the moment it
// touches an enemy: r 55, 110 dmg + toss. Shot dead = 60 % chance it still blows (the fuse was lit). Beeps faster as it
// closes in (event `beep`, v 0..1 = how close). Driving it: the attack sprints it at the aim and touching blows it; the
// attack with nobody in the aim blows it where it stands.
// b.act: 1 armed / running in → `run0`/`run1` (red light on); b.beepT = world.time of the last beep (the light can blink).
import { robot, initB, setAct, begin, targetOf, idle, closeOn, mayAttack, crowdTarget, touchable, blowUp, spentMul, losClear, hypot, STATE, CB, ENEMY, moveTo, setState, ROBOT } from './_lib.js';

const T = {
  hp: 60, // hit points
  mass: 1, // -
  walk: 80, // px/s
  run: 190, // px/s sprinting in
  scanR: 320, // px: looks this far for a crowd
  scanEvery: 15, // ticks between crowd searches
  touch: 2, // px past both radii: touching = boom
  stillBlows: 0.6, // shot dead: chance it blows anyway
  beepFar: 250, // px: beeping starts this close ...
  beepSlow: 0.6, // ... one beep per 0.6 s there ...
  beepFast: 0.1, // ... one per 0.1 s at the touch
  blast: {
    radius: 55, // px
    damage: 110, // at the centre (falls off to 0.25)
    minFalloff: 0.25, // edge keeps 25 %
    push: 240, // shove
    stun: 0.5, // s
    tossUp: 420, // people fly
    tossSpeed: 220, // px/s outward
    tossFrom: 0.3, // toss when falloff × pass ≥ 0.3
    hatChance: 0.7, // hats fly
    noiseRadius: 420, // px
  },
};
const BLAST = CB.registerBlast('bombbot', Object.freeze({ ...T.blast }));

function boom(world, u) { setAct(world, u, 0); blowUp(world, u, BLAST); }
// the nearest enemy, if it touches the bomb bot
function touching(world, u) {
  const o = world.findNearest(u.x, u.y, u.radius + ROBOT.margin + T.touch, ENEMY[u.faction], u, 1);
  return !!o && o.hp > 0 && touchable(o) && hypot(o.x - u.x, o.y - u.y) <= u.radius + o.radius + T.touch;
}
function beep(world, u, d) {
  const b = u.b;
  if (d > T.beepFar || world.time < b.beepAt) return;
  const k = Math.max(0, Math.min(1, d / T.beepFar));
  b.beepT = world.time; b.beepAt = world.time + T.beepFast + (T.beepSlow - T.beepFast) * k;
  world.emit('beep', { x: u.x, y: u.y, v: 1 - k, type: u.type, id: u.id });
}

function brain(world, u) {
  const b = u.b;
  if (b.spent === 1) { u.goalX = 0; u.goalY = 0; return; }
  if (begin(world, u)) return;
  const may = mayAttack(world, u);
  if (may && touching(world, u)) { boom(world, u); return; }
  const t = targetOf(world, u);
  let c = b.crowd >= 0 ? world.unitById(b.crowd) : null;
  if (u.possessed === 1) c = may && t && touchable(t) ? t : null;                 // the player picks who
  else if ((world.tick + u.index) % T.scanEvery === 0 || !c || !(c.hp > 0)) c = crowdTarget(world, u, T.scanR);
  b.crowd = c ? c.id : -1;
  if (c && c.hp > 0) {
    const dx = c.x - u.x, dy = c.y - u.y, d = hypot(dx, dy) || 0.001;
    setAct(world, u, 1);
    setState(u, STATE.CHARGE);
    moveTo(world, u, c.x, c.y, T.run, losClear(world, u) || world.lineOfSight(u.x, u.y, c.x, c.y));
    u.face = Math.atan2(dy, dx);
    beep(world, u, d - c.radius - u.radius);
    return;
  }
  setAct(world, u, 0);
  if (!t) { idle(world, u); return; }
  closeOn(world, u, t, t.x - u.x, t.y - u.y, T.walk);
}

const D = robot({
  type: 'bombbot',
  og: 'Bomb Bot (ours)', // no OG original
  radius: 7, // OG-raw
  mass: T.mass,
  maxHp: T.hp,
  melee: true, // runs into its target
  strength: 1.2,
  walkSpeed: T.walk,
  runSpeed: T.run,
  accel: 800,
  decel: 800,
  turnRate: 8,
  sightRange: 340,
  alertSightRange: 380,
  brushSpacing: 20,
  flock: { separation: 26, formation: 0.6 },
  look: { attack: { time: 0.3 } },
  weapon: { range: T.scanR }, // for possess (aim reach) and readers
  blast: BLAST,
  init(world, u) { initB(u); const b = u.b; b.crowd = -1; b.beepAt = 0; b.beepT = -1e9; b.spent = 0; b.spentTick = 0; },
  brain,
  damageMul: spentMul, // a spent bomb bot is a wreck about to go: nothing hurts it
  // shot dead: 60 % it still blows where it fell
  onDeath(world, u) {
    if (u.b.spent === 1 || world.rng() >= T.stillBlows) return;
    CB.explode(world, u.x, u.y, BLAST, u);
  },
  // possessed, attack held at nobody: it blows where it stands
  possessFire(world, u) { if (u.b.spent !== 1) boom(world, u); },
});
export default D;
export { T };
