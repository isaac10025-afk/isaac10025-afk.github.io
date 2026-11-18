// Brain dispatcher: per-unit timers, then def.brain(world, u, dt) every tick. OG core-move §1 (game.js:4999-5031).
import { DT, LEAP } from '../const.js';

// Grenade dodge mover: wait dodgeDelay, then run along (dodgeX, dodgeY) at `speed` for dodgeTime (OG game.js:3231-3238).
export function dodgeMove(u, speed, dt) {
  if (u.dodgeDelay > 0) u.dodgeDelay -= dt;
  else { u.dodgeTime -= dt; u.goalX = u.dodgeX * speed; u.goalY = u.dodgeY * speed; u.pathing = 1; }
}
export function isAirborne(u) { return u.z > 0 || u.vz > 0; } // OG game.js:9060-9062

export function run(world) {
  const us = world.units, dt = DT, holding = world.holding;
  for (let i = 0, n = us.length; i < n; i++) {
    const u = us[i]; if (u.dead) continue;
    const def = u.def;
    // OG keeps every unit number in a Float32Array (game.js:10861-10990): these timers are rounded the same way, so a
    // countdown ends on the same tick as in OG (a float64 0.067 - 4/60 leaves 1e-17 and stuns one tick longer).
    const f32 = Math.fround;
    u.stateTime = f32(f32(u.stateTime) + dt);                                     // OG game.js:5007
    if (u.flash > 0) u.flash = f32(Math.max(0, f32(u.flash) - dt / 0.12));       // OG game.js:5008
    if (u.attack > 0) { const at = def.look && def.look.attack && def.look.attack.time; u.attack = at > 0 ? f32(Math.max(0, f32(u.attack) - dt / at)) : 0; } // OG game.js:5009
    if (u.stun > 0) u.stun = f32(f32(u.stun) - dt);                               // OG game.js:5010
    if (u.cooldown > 0) u.cooldown = Math.fround(Math.fround(u.cooldown) - dt);  // OG game.js:5011; OG cooldown is a Float32Array (game.js:10861, 10913)
    if (def.carry) def.carry(world, u, dt);                                       // OG game.js:5012
    if (holding) { u.goalX = u.goalY = 0; u.face = NaN; continue; }               // OG game.js:5013-5016
    if (isAirborne(u) && u.leaping !== LEAP.FLY) { u.goalX = u.goalY = 0; u.face = NaN; continue; } // OG game.js:5017-5020
    if (u.react > 0) { u.react = f32(f32(u.react) - dt); continue; }              // keeps last goal (OG game.js:5022-5025)
    u.pathing = 0;
    if (def.brain) def.brain(world, u, dt);
    if (u.dodgeTime > 0) dodgeMove(u, def.runSpeed, dt);                          // OG game.js:5028
  }
}
