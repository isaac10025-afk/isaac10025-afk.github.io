// CORE-B combat barrel: import everything shared from here (or from the single files).
export { damage, blockFrac, suppress, spark, blockedSpark, hatKnock, perchOf, killerOf, isSick, recordHarm } from './damage.js';
export { meleeStrike, oddsApproach, circle, trample, localOdds } from './melee.js';
export { gunBrain, gunInit, gunFire, inRange, sidestep, closeToRange, advanceTo, takeCover, moveTo, pursue } from './gun.js';
export { fireProjectile, spawnProjectile, removeProjectile, shoot, PK, flameRadius } from './projectiles.js';
export { explode, registerBlast, getBlast } from './explode.js';
export { push, toss, land, unperch, perchHeight } from './push.js';
export { stun, slip, dodgeWarn, dodgeStep, startleAround, startleStep, canStartle, fleeSteer } from './status.js';
export { ignite, igniteNow, quench, quenchAll, BURN_BASE } from './fire.js';
export { getOil, OilGrid, slickAt, burningAt, awayFromFire, pour, igniteOil } from './oil.js';
export { catchPlague, canCatch, spread as spreadPlague } from './plague.js';
export { infect, risenTypeOf } from './infect.js';
export { onDeath, processDeath, addCorpse, corpseAlpha, corpseVisible, corpseHeld, corpseLookAge, CORPSE_FADE_START, CORPSE_FADE_END, CORPSE_TOPPLE, CORPSE_TOPPLE_GIANT, GHOST_START, GHOST_END } from './death.js';
export { moraleThink, moraleTarget } from './morale.js';
export { initCombat, setCombatHook, hooks, STATE, CAUSE, INTEL, setState, targetOf, wetAt, depthAt, raycast, lineOfSight, splatFear, splatNoise, stat } from './env.js';
