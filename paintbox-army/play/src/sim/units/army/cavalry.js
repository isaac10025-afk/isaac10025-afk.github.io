// cavalry (OG "Cavalry", type 18): shock charger. Charges from 240-380 px, tramples everything in front at speed,
// rides through, re-engages. Panics around fire, rats, snakes and blasts, and may dismount (Horse + Knight).
// When killed the rider often survives as a Knight. OG module 548, def + brain game.js:12657-12882.
import { registerUnit } from '../../defs.js';
import * as DEATH from '../../combat/death.js';
import {
  S, FACTION, LOCO, INTEL, CAVALRY_FLOCK, CAVALRY_MORALE, TRAMPLE, ALL_BUT_PROPS, setState, targetOf, hasLos, flee,
  wetAt, anyWater, isUndead, trample, startled, followContact, pathTo, strike, setAttack, range, hyp, emit, riderType,
  snapshot, applyStatus, replaceUnit, leaveGroup, toss, igniteNow, ratSnakeScare,
} from './_shared.js';

// Slow melee `X` (OG game.js:12872-12882) and brain numbers (OG game.js:12716-12780, 12832-12871).
const SLOW = Object.freeze({
  damage: 32, // no jitter (OG game.js:12875)
  push: 100, // 100·m (OG game.js:12876)
  stun: 0.25, // 0.25·m (OG game.js:12876)
  cooldown: 1, // 1·range(0.8, 1.25) (OG game.js:12880)
  cooldownLo: 0.8, // OG game.js:12880
  cooldownHi: 1.25, // OG game.js:12880
  backOffChance: 0.5, // then 50% back off (subState 2) ... (OG game.js:12881)
  backOffTime: 1, // ... for 1·range(0.8, 1.25) s (OG game.js:12881)
  reachGap: 10, // reach r + r + 10 when charging (OG game.js:12779)
  waterReachGap: 8, // r + r + 8 in water (OG game.js:12760)
  initCooldown: 1, // init 1·next() (OG game.js:12714)
});
const RIDE = Object.freeze({
  chargeFrom: 240, // not yet charging and target > 240 → Advance (OG game.js:12764)
  chargeMax: 380, // target > 380 → Advance; water melee within 380 (OG game.js:12756, 12764)
  leadMax: 0.4, // charge lead min(d/290, 0.4) s (OG game.js:12770)
  rideThrough: 0.8, // after a trample hit: ride on 0.8·range(0.8, 1.25) s (OG game.js:12778)
  rideLo: 0.8, // OG game.js:12778
  rideHi: 1.25, // OG game.js:12778
  burnDismount: 0.75, // first burning tick: 75% dismount (OG game.js:12722)
  scareDismount: 0.5, // first tick of a rat/snake scare: 50% dismount (OG game.js:12835 B = 0.5)
  contactMemory: 5, // OG game.js:12749
  riderDies: 0.75, // death: next() >= 0.75 → the rider dies too (OG game.js:12785)
  riderHp: 0.75, // else a Knight at 75% hp ... (OG game.js:12810)
  riderToss: 90, // ... thrown forward at 90 + 0.3·speed ... (OG game.js:12816)
  riderTossSpeedMul: 0.3, // OG game.js:12816
  riderUp: 260, // ... up 260 (OG game.js:12817)
  dismountToss: 90, // dismounted Knight thrown at heading + π ± 0.9, speed 90, up 208 (OG game.js:12870-12869)
  dismountSpread: 0.9, // OG game.js:12869
  dismountUp: 208, // OG game.js:12870
  dismountFire: 0.4, // 40% the Knight catches fire with 0.6× the burn (OG game.js:12870)
  dismountFireMul: 0.6, // OG game.js:12870
});

// Dismount `K` (OG game.js:12848-12871): the Cavalry becomes a loose Horse (no group); a full-hp Knight is thrown off.
function dismount(world, u) {
  const x = u.x, y = u.y, h = u.heading, g = u.group, burn = u.burning, frac = u.hp / u.maxHp, r = u.radius;
  const st = snapshot(u), type = u.type, team = u.team;
  leaveGroup(world, u); // OG game.js:12861
  const horse = replaceUnit(world, u, 'horse', -1, team); // OG game.js:12862
  if (horse) { // OG game.js:12863-12864
    applyStatus(world, horse, st); horse.hatless = 0; horse.radius = r; horse.hp = horse.maxHp * frac; horse.b.role = 1;
    horse.wander = horse.heading;
  }
  const k = world.spawn(riderType(type), x, y, { group: g, heading: h, team }); // OG game.js:12865
  if (!k) return;
  world.handOver(u, k); // OURS (possess): the player rides on as the thrown rider
  k.hatless = st.hatless; // OG game.js:12866
  const side = world.rng() < 0.5 ? -1 : 1, a = h + Math.PI + RIDE.dismountSpread * side; // OG game.js:12867-12868
  toss(world, k, Math.cos(a), Math.sin(a), RIDE.dismountToss, RIDE.dismountUp); // OG game.js:12869
  if (world.rng() < RIDE.dismountFire) igniteNow(world, k, RIDE.dismountFireMul * burn); // OG game.js:12870
}

function slowMelee(world, u, t, nx, ny) { // OG `X` (game.js:12872-12882)
  strike(world, u, t, nx, ny, SLOW.damage, SLOW.push, SLOW.stun);
  setAttack(u);
  u.cooldown = SLOW.cooldown * range(world, SLOW.cooldownLo, SLOW.cooldownHi);
  if (world.rng() < SLOW.backOffChance) { u.b.subState = 2; u.b.timer = world.time + SLOW.backOffTime * range(world, SLOW.cooldownLo, SLOW.cooldownHi); }
}

function canTrample(world, u, sp) { return sp >= TRAMPLE.minSpeed && !wetAt(world, u); } // OG game.js:12727 etc.

const D = registerUnit({
  type: 'cavalry',
  og: 'Cavalry', // OG game.js:12660
  key: 'cavalry', // OG game.js:12659
  category: 'army',
  faction: FACTION.Knights, // OG game.js:12661
  skittish: true, // OG game.js:12662
  radius: 13.5, // OG game.js:12663
  radiusJitter: 0.06, // OG game.js:12664
  mass: 4.5, // OG game.js:12665
  iceGrip: 0.05, // OG game.js:12666
  density: 2, // OG game.js:12667
  conductivity: 2, // OG game.js:12668
  maxHp: 200, // OG game.js:12669
  melee: true, // OG game.js:12670
  strength: 1.8, // OG game.js:12671
  locomotion: LOCO.Vehicle, // OG game.js:12672
  walkSpeed: 75, // OG game.js:12673
  runSpeed: 150, // OG game.js:12674
  maxSpeed: 300, // OG game.js:12675
  accel: 340, // OG game.js:12676
  decel: 340, // OG game.js:12677
  turnRate: 3, // OG game.js:12678
  turnSpeedFalloff: 70, // OG game.js:12679
  sightRange: 380, // OG game.js:12680
  alertSightRange: 420, // OG game.js:12681
  stickyTarget: true, // OG game.js:12682
  reactionTime: 0.25, // OG game.js:12683
  huntRange: Infinity, // OG game.js:12684
  minDistance: 0, // OG game.js:12685
  drilled: false, // OG game.js:12686
  intelligence: INTEL.Animal, // OG game.js:12687
  mines: true, // OG game.js:12688
  infectable: true, // OG game.js:12689
  turnsWhenKilled: true, // OG game.js:12690
  flammability: 0.4, // OG game.js:12691
  brushSpacing: 34, // OG game.js:12692
  flock: CAVALRY_FLOCK, // OG game.js:12693-12703
  morale: CAVALRY_MORALE, // OG game.js:12704 (`I`, game.js:12640-12656)
  look: {
    attack: { time: 0.35 }, // OG game.js:12711
  },
  bodyShape: 'horse', // art only: the corpse is drawn as a horse (OG bodyShape, game.js:12781)
  weapon: SLOW, // ours: the slow melee; trample config is TRAMPLE in _shared.js
  init(world, u) { u.cooldown = SLOW.initCooldown * world.rng(); u.b.role = 0; u.b.subState = 0; u.b.timer = 0; }, // OG game.js:12713-12715
  brain(world, u) { // OG game.js:12716-12780
    const b = u.b;
    u.goalX = 0; u.goalY = 0; u.face = NaN;
    if (u.stun > 0) return; // nothing, not even facing (OG game.js:12718)
    const sp = hyp(u.vx, u.vy), t = targetOf(world, u), undead = isUndead(u);
    if (u.burning > 0 && !undead) { // OG game.js:12721-12727
      if (b.role === 0) { b.role = 1; if (world.rng() < RIDE.burnDismount) { dismount(world, u); return; } }
      setState(u, S.FLEE); flee(world, u, t, D.runSpeed);
      if (canTrample(world, u, sp)) trample(world, u, sp, TRAMPLE);
      return;
    }
    if (startled(world, u, D.runSpeed)) { if (canTrample(world, u, sp)) trample(world, u, sp, TRAMPLE, ALL_BUT_PROPS); return; } // OG game.js:12728-12729
    if (!undead && ratSnakeScare(world, u, D.runSpeed)) { // OG game.js:12730-12732
      if (b.role !== 2) { b.role = 2; if (world.rng() < RIDE.scareDismount) { dismount(world, u); return; } }
      if (canTrample(world, u, sp)) trample(world, u, sp, TRAMPLE);
      return;
    }
    b.role = 0;
    if (u.state === S.FLEE) { flee(world, u, t, D.runSpeed); return; } // OG game.js:12733
    if (b.subState !== 0) { // OG game.js:12734-12747
      if (world.time < b.timer) {
        if (b.subState === 1) { u.goalX = Math.cos(u.heading) * TRAMPLE.fullSpeed; u.goalY = Math.sin(u.heading) * TRAMPLE.fullSpeed; } // ride through
        else if (t) { const ax = u.x - t.x, ay = u.y - t.y, o = hyp(ax, ay) || 1; u.goalX = (ax / o) * D.runSpeed; u.goalY = (ay / o) * D.runSpeed; } // back off
        if (canTrample(world, u, sp)) trample(world, u, sp, TRAMPLE);
        return;
      }
      b.subState = 0;
    }
    if (!t) { if (followContact(world, u, D.walkSpeed, RIDE.contactMemory)) return; setState(u, S.IDLE); return; } // OG game.js:12748-12751
    const dx = t.x - u.x, dy = t.y - u.y, d = hyp(dx, dy) || 0.001, charging = u.state === S.CHARGE;
    if (anyWater(world) && wetAt(world, u) && d <= RIDE.chargeMax) { // in water: walk up and melee, no trample (OG game.js:12756-12763)
      setState(u, S.ENGAGE); u.face = Math.atan2(dy, dx);
      if (d > u.radius + t.radius + SLOW.waterReachGap) pathTo(world, u, t.x, t.y, D.walkSpeed, hasLos(world, u));
      else if (u.cooldown <= 0) slowMelee(world, u, t, dx / d, dy / d);
      return;
    }
    if ((!charging && d > RIDE.chargeFrom) || d > RIDE.chargeMax) { // OG game.js:12764-12768
      setState(u, S.ADVANCE); pathTo(world, u, t.x, t.y, D.walkSpeed, hasLos(world, u)); return;
    }
    setState(u, S.CHARGE); // OG game.js:12769-12780
    const lead = Math.min(d / TRAMPLE.fullSpeed, RIDE.leadMax), lx = dx + t.vx * lead, ly = dy + t.vy * lead, a = hyp(lx, ly) || 0.001;
    u.goalX = (lx / a) * TRAMPLE.fullSpeed; u.goalY = (ly / a) * TRAMPLE.fullSpeed;
    if (canTrample(world, u, sp)) {
      if (trample(world, u, sp, TRAMPLE) > 0) { b.subState = 1; b.timer = world.time + RIDE.rideThrough * range(world, RIDE.rideLo, RIDE.rideHi); }
    } else if (u.cooldown <= 0 && d <= u.radius + t.radius + SLOW.reachGap) slowMelee(world, u, t, dx / d, dy / d);
  },
  onDeath(world, u) { // OG game.js:12782-12819
    if (u.infection > 0) return; // infected: the zombie conversion handles it (OG game.js:12784)
    const rider = riderType(u.type);
    if (world.rng() >= RIDE.riderDies) { // rider dies too: an unseated rider corpse (OG game.js:12785-12808)
      const facing = Math.cos(u.heading) >= 0 ? 1 : -1;
      const fall = world.time - (u.hitAt ?? -Infinity) < 0.5 && u.hitDx ? u.hitDx : -facing; // OG game.js:12793
      const spec = { type: rider, x: u.x, y: u.y + 1, facing, hatless: u.hatless || 0, undead: isUndead(u) ? 1 : 0, burning: u.burning > 0 ? 1 : 0, fall, unseated: 1, from: u };
      if (typeof DEATH.addCorpse === 'function') DEATH.addCorpse(world, spec);
      else emit(world, 'unseated', spec);
      return;
    }
    const k = world.spawn(rider, u.x, u.y, { group: u.group, heading: u.heading, team: u.team }); // OG game.js:12809
    if (!k) return;
    world.handOver(u, k); // OURS (possess): the horse died, the player goes on as the rider
    k.hp = RIDE.riderHp * k.maxHp; // OG game.js:12812
    toss(world, k, Math.cos(u.heading), Math.sin(u.heading), RIDE.riderToss + RIDE.riderTossSpeedMul * hyp(u.vx, u.vy), RIDE.riderUp); // OG game.js:12813-12818
  },
});
