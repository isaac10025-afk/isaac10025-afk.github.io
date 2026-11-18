// batter (OURS, Sports tab): HOME RUN: winds up, swings (22, once per 1.0 s); a victim of mass ≤ 2.5 flies 150-220 px
// up and away like a rag doll; where it lands it and whoever it lands on take 15 and are knocked down. BATS BACK: a grenade, bomb, oil pot,
// baseball or mini rocket of another side coming within r + 18 of him is hit back at its thrower (30 %, 2 s cooldown);
// it becomes his (his side, his kills). The bat-back runs in the tab's 'sports:bat' system (_lib.js) with def.batBack.
// b.act: 1 wind-up → `wind`, 2 swing → `swing` (also the bat-back swing); b.victim = the one he's swinging at.
import { athlete, initB, begin, meleeFight, closeOn, idle, setAct, actAge, setState, targetOf, hypot, angleDiff, STATE, damage, push, hatKnock, tossable, tossTo, flung, addBatter, fleeSteer, KNOCK } from './_lib.js';

const T = {
  hp: 110, // hit points (STEP6)
  walk: 80, // px/s (STEP6)
  run: 130, // px/s (STEP6)
  bat: {
    damage: 22, // per swing (STEP6)
    damageJitter: 3, // ±
    cooldown: 1.0, // s between swings (STEP6)
    cooldownJitter: 0.15, // +
    push: 120, // shove when it doesn't fly
    stun: 0.2, // s
    reach: 9, // px past both radii (a bat is long)
    band: 18, // px
    facing: 0.6, // rad
    circle: 0.4, // strafing
  },
  wind: 0.3, // s wind-up before the swing (b.act 1)
  stepIn: 110, // px/s: steps in on his man while winding up
  swingPose: 0.3, // s of the `swing` pose (b.act 2)
  homer: {
    maxMass: 2.5, // victims this light fly (STEP6)
    min: 150, // px: shortest flight (STEP6)
    max: 220, // px: longest flight (STEP6)
    up: 420, // px/s upward (a high arc, ~0.9 s in the air)
    landHit: KNOCK.landHit, // 15 to it and whoever it lands on (STEP6; the number lives in _lib.js KNOCK)
  },
  batBack: {
    reach: 18, // px past his radius (STEP6)
    chance: 0.3, // per projectile coming at him, rolled once (STEP6)
    cooldown: 2, // s after a bat-back (STEP6)
    maxZ: 40, // px: higher than this it sails over the bat
    lobSpeed: 300, // px/s over the ground: a batted lob flies back this fast
    apexPer: 0.25, // a batted lob's arc top = 0.25 × distance + apexMin
    apexMin: 10, // px
    minFlight: 0.3, // s
    fusePad: 0.05, // s: a batted bomb blows this long after it lands (it would roll on past the thrower)
    lineMin: 500, // px/s: a batted line drive flies at least this fast
    linePad: 1.3, // its life = distance / speed × 1.3
    lost: 160, // px: thrower gone → it flies back this far the way it came
    kinds: { grenade: 1, bomb: 2, oilpot: 1, baseball: 3, minirocket: 4 }, // kind → mode (1 lob, 2 bomb, 3 line, 4 rocket: _lib.js), STEP6 list
  },
};

function swing(world, u) {   // the bat comes round: whoever is still in front of him within reach
  const b = u.b, t = b.victim >= 0 ? world.unitById(b.victim) : null;
  setAct(world, u, 2);
  u.attack = 1; u.cooldown = T.bat.cooldown - T.wind + world.rng() * T.bat.cooldownJitter;   // wind + this = one swing per 1.0 s
  if (!t || !(t.hp > 0)) { world.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id }); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, reach = u.radius + t.radius + T.bat.reach + T.bat.band;
  if (d > reach || Math.abs(angleDiff(u.heading, Math.atan2(dy, dx))) > 1.2) { world.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id }); return; }
  const ux = dx / d, uy = dy / d;
  const pass = damage(world, t, T.bat.damage + T.bat.damageJitter * (world.rng() - world.rng()), u);
  world.emit('strike', { x: t.x, y: t.y, v: 1, type: u.type });
  if (t.hp > 0 && pass >= 0.5 && tossable(t, T.homer.maxMass)) {
    tossTo(world, t, ux, uy, T.homer.min + world.rng() * (T.homer.max - T.homer.min), T.homer.up);
    flung(world, t, u, T.homer.landHit);
    hatKnock(world, t, ux, uy, 1);
  } else if (t.hp > 0) push(world, t, ux, uy, T.bat.push * pass, T.bat.stun * pass);
}

const D = athlete({
  type: 'batter',
  og: 'Batter (ours)', // no OG original
  radius: 9, // OG-raw (STEP6)
  mass: 1.1, // STEP6
  maxHp: T.hp,
  melee: true,
  strength: 0.9,
  walkSpeed: T.walk,
  runSpeed: T.run,
  brushSpacing: 22,
  look: { hat: true, attack: { time: 0.35 } }, // cap
  weapon: T.bat,
  batBack: T.batBack,
  init(world, u) { initB(u); const b = u.b; b.batAt = -9; b.batted = 0; u.cooldown = world.rng() * T.bat.cooldown; addBatter(world, u); },
  brain(world, u) {
    const b = u.b;
    if (b.act === 2 && actAge(world, u) >= T.swingPose) { setAct(world, u, 0); b.victim = -1; }
    if (b.act === 1 && actAge(world, u) >= T.wind && !(u.stun > 0)) swing(world, u);
    if (begin(world, u)) { if (b.act === 1) { setAct(world, u, 0); b.victim = -1; } return; }
    const t = targetOf(world, u);
    if (u.state === STATE.FLEE) { if (b.act === 1) setAct(world, u, 0); fleeSteer(world, u, t, u.def.runSpeed); return; }
    if (!t) { idle(world, u); return; }
    const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
    if (b.act === 1) {                                 // winding up: step into the swing (they back off)
      u.face = Math.atan2(dy, dx); b.victim = t.id; setState(u, STATE.ENGAGE);
      const reach = u.radius + t.radius + T.bat.reach;
      if (d > reach) { u.goalX = (dx / d) * T.stepIn; u.goalY = (dy / d) * T.stepIn; }
      return;
    }
    if (meleeFight(world, u, t, W, dx, dy, d) === 0) closeOn(world, u, t, dx, dy, d);
  },
  // possessed, attack held at nobody: an empty swing (wind-up, swing); held = he's also ready to bat things back
  possessFire(world, u) {
    const b = u.b;
    if (b.act === 0 && u.cooldown <= 0) { setAct(world, u, 1); b.victim = -1; u.cooldown = T.wind + 0.05; }
  },
});
// the melee fight starts the wind-up instead of hitting at once; the swing lands T.wind s later (swing() above)
const W = { ...T.bat, strike(world, u, t) { setAct(world, u, 1); u.b.victim = t.id; u.cooldown = T.wind + 0.05; } };
export default D;
export { T };
