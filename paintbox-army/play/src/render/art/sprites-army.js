// Army sprites, POSTER PAINT look. Owner: ARMY art agent. Contract: src/render/art/ART.md.
// Bodies are painted by people.js (human, horse, rider). Every entry paints facing right, feet at (0,0).
//
// Pose picking, shared by every foot entry (rifle flamer sniper legion grenadier archer ninja knight):
//   o.dead            any pose name: painted in the default pose (idle) with X eyes / charcoal; RENDER lays it on its back.
//   'fly'             airborne after a toss: u.z > 1 (OG Ot toss: blasts, trample, the knight thrown off his horse).
//   'walk0'/'walk1'   moving (speed over ~8 px/s), alternating on the stride (u.anim.walk); else the default pose.
//   o.hatless         u.hatless || u.singed (OG game.js:21012: hat knocked off by a big hit / a blast, or singed away).
//                     Units that wear one: rifle sniper grenadier archer legion knight cavalry (rider). Messy hair instead.
//   o.risen           risen_<type> copies: zombie face, green skin, weapon dropped, arms out (OG: a Roman keeps its shield).
//   The unit-specific picks are in each entry's comment, in priority order (first match wins after dead and fly).
import { C } from './paint.js';
import { human, horse, rider, humanLeg, leanOf, hasBack, humanJoints, HORSE_PARTS, horseParts } from './people.js';

const OWN = { rifle: C.blue, flamer: C.orange, sniper: '#55606e', legion: C.red, grenadier: C.brown, archer: '#0f9c8c', ninja: '#26222e', cloth: C.yellow };
const BOX_MAN = [48, 46, 22, 41], BOX_BIG = [50, 50, 22, 45];
const opts = (o, extra) => ({ risen: o.risen, hatless: o.hatless, kindled: o.kindled, ...extra });
/** A foot entry: map our pose names to human() poses. Floppy bodies (rig.js): the entry also gets the person's parts as
 *  extra poses 'r:leg', 'r:body', 'r:head', 'r:headO' (open mouth, tossed), 'r:arm:<human pose>', 'r:back:<human pose>',
 *  and `rig` saying which part goes with which pose. Poses the rig can't bend (prone, perch) stay whole sprites. */
const NO_RIG = new Set(['prone', 'perch']);
const ARM_KEY = { walk1: 'walk0', run1: 'run0' };   // both strides hold the arms the same (human())
function man(kind, own, poses, map, extra = [], box = BOX_MAN, more) {
  const hpOf = (pose) => map[pose] || pose;
  const hps = new Set();
  for (const p of poses.concat(extra)) { const hp = hpOf(p); if (!NO_RIG.has(hp)) hps.add(ARM_KEY[hp] || hp); }
  const parts = ['r:leg', 'r:body', 'r:head', 'r:headO'];
  for (const hp of hps) { parts.push('r:arm:' + hp); if (hasBack(kind, hp, false)) parts.push('r:back:' + hp); }
  const J = humanJoints(kind);
  return {
    box, scale: 1, own, poses, extra: extra.concat(parts),
    rig: {
      driver: 'biped', kind, joints: J,
      run: kind === 'ninja',
      /** parts for an entry pose: null = draw the whole sprite. zom = risen copy (no back weapon). */
      parts(pose, zom) {
        const hp = hpOf(pose);
        if (NO_RIG.has(hp)) return null;
        const ak = ARM_KEY[hp] || hp;
        return { leg: 'r:leg', body: 'r:body', arm: 'r:arm:' + ak, back: hasBack(kind, ak, zom) ? 'r:back:' + ak : null, head: hp === 'fly' ? 'r:headO' : 'r:head', lean: leanOf(kind, hp) };
      },
    },
    paint(c, o) {
      const pz = o.pose;
      if (pz.charCodeAt(0) === 114 && pz.charCodeAt(1) === 58) {   // 'r:' rig part
        const skin = o.risen ? C.zskin : undefined, op = opts(o, more && more(o));
        if (pz === 'r:leg') { humanLeg(c, kind, o.M, o.dead === 'burnt'); return; }
        if (pz === 'r:body') { op.layer = 'body'; human(c, kind, o.col, 'aim', o.M, o.dead, skin, op); return; }
        if (pz === 'r:head' || pz === 'r:headO') { op.layer = 'head'; human(c, kind, o.col, pz === 'r:headO' ? 'fly' : 'aim', o.M, o.dead, skin, op); return; }
        const [, L, hp] = pz.split(':');
        op.layer = L === 'arm' ? 'arms' : 'back';
        human(c, kind, o.col, hp, o.M, o.dead, skin, op);
        return;
      }
      const p = o.dead ? map[poses[0]] : (map[o.pose] || o.pose);
      human(c, kind, o.col, p, o.M, o.dead, o.risen ? C.zskin : undefined, opts(o, more && more(o)));
    },
  };
}
const WALK = { walk0: 'walk0', walk1: 'walk1', fly: 'fly' };

export const SPRITES = {
  // rifle (OG Soldier): kid-a soldier. idle = aiming (kid-a). Picks: 'atk' u.attack > 0 (0.28 s recoil after a shot,
  // OG look.attack.time game.js:9974); 'reload' u.reload > 0 (muzzle up, fresh magazine; OG "Reloading, the muzzle goes up").
  rifle: man('soldier', OWN.rifle, ['idle', 'walk0', 'walk1', 'atk'], { idle: 'aim', atk: 'atk', reload: 'reload', ...WALK }, ['reload', 'fly']),

  // flamer (OG Flamethrower): kid-a flamer, tank on the back. Picks: 'atk' u.attack > 0 (0.12 s after each puff, so held
  // while spraying at 30 puffs/s): nozzle juddering with a lick of flame at its tip (RENDER draws the stream itself).
  flamer: man('flamer', OWN.flamer, ['idle', 'walk0', 'walk1', 'atk'], { idle: 'aim', atk: 'atk', ...WALK }, ['fly']),

  // sniper: kid-a sniper (boonie hat, scope). Picks: 'perch' u.climb >= 0.5 (sitting on a branch; RENDER raises it by
  // climb·PERCH_H like sim/combat/projectiles.js and draws the tree's leaves); 'prone' u.prone >= 0.5 (on its belly, rifle
  // on its bipod; u.prone eases 0..1 over 0.7 s down / 0.55 s up, OG game.js:16547-16552); 'atk' u.attack > 0 (0.5 s
  // recoil); 'reload' u.reload > 0 (also OG's bolt work after a shot). The prone frame's anchor is the middle of the body.
  sniper: man('sniper', OWN.sniper, ['idle', 'walk0', 'walk1', 'atk'], { idle: 'aim', atk: 'atk', reload: 'reload', prone: 'prone', perch: 'perch', ...WALK }, ['prone', 'perch', 'reload', 'fly']),

  // legion (OG Roman): kid-a 'heavy' (plumed helmet, round shield with a yellow cross, sword). idle = sword drawn back
  // ready (also OG's wind-up before a blow). Picks: 'atk' u.attack > 0 (0.35 s thrust over the shield's rim).
  // Walking: sword held up in front (OG's "forest of points above a legion" as it marches).
  legion: man('heavy', OWN.legion, ['idle', 'walk0', 'walk1', 'atk'], { idle: 'aim', atk: 'atk', ...WALK }, ['fly'], BOX_BIG),

  // grenadier: kid-a grenadier (lit bomb held up behind the head). Picks: 'throw' u.attack > 0 (0.8 s: arm flung forward,
  // empty-handed); 'windup' u.state === 2 (Engage) && u.b.reload <= 0 && u.b.ammo > 0 && u.cooldown < 0.35 (cocked far
  // back, leaning back, OG game.js:19352-19355); 'reload' u.b.reload > 0 (a hand in the bomb bag). Its ammo is u.b.ammo.
  grenadier: man('grenadier', OWN.grenadier, ['idle', 'walk0', 'walk1', 'atk'], { idle: 'aim', atk: 'throw', throw: 'throw', windup: 'windup', reload: 'reload', ...WALK }, ['windup', 'reload', 'fly']),

  // archer: kid-a archer (cap with a yellow feather). idle = an arrow on a slack string (OG: "an arrow always on the
  // string"). Picks: 'atk' u.attack > 0 (0.3 s: string snapped back, arrow gone, draw hand flung open); 'draw'
  // u.b.timer > 0 && u.state === 2 (drawing for the volley: full draw = kid-a's archer; progress 1 - (b.timer - time) / 0.6,
  // OG game.js:19356). o.kindled = u.kindled: the arrow head burns (fire arrows; key the bake by it).
  archer: man('archer', OWN.archer, ['idle', 'walk0', 'walk1', 'atk'], { idle: 'nock', atk: 'loose', draw: 'aim', ...WALK }, ['draw', 'fly']),

  // cavalry: a brown horse in a saddle cloth of the rider's colours, a knight in the saddle with a lance. Picks:
  // 'charge0'/'charge1' u.state === 4 (Charge), alternating on the stride (lance lowered, flying gallop); 'atk' u.attack > 0
  // (0.35 s after a trample hit or a blow: lance thrust out, leaning in); 'run0'/'run1' speed > 130 px/s and not charging
  // (bolting: fleeing, startled, burning, riding through; lance up); 'walk0'/'walk1' a trot; 'idle' standing.
  // o.hatless = the rider's hat (u.hatless). Dead: the horse on its back with an empty saddle cloth (the corpse is
  // bodyShape 'horse'; an unseated rider is a separate knight corpse). lie 'none': paint it as is, don't turn it.
  // Floppy bodies (ANIMALS, rig-quad.js 'quad', table 'horse'): the horse's legs trot / gallop (charge and run gallop, atk
  // gallops when fast), its body pitches and bobs, the neck + head lag and nod, the tail streams out behind at a gallop;
  // the rider is one part ('r:rider' lance up, 'r:riderC' lance lowered, 'r:riderA' thrust) on the horse's back that
  // tilts after it and bounces in the saddle (the atk lean 0.16 is the rider's spring). Dead: the horse alone, limp on its back.
  cavalry: {
    box: [66, 64, 26, 59], scale: 1, own: OWN.cloth, lie: 'none',
    poses: ['idle', 'walk0', 'walk1'], extra: ['run0', 'run1', 'charge0', 'charge1', 'atk'].concat(HORSE_PARTS, ['r:rider', 'r:riderC', 'r:riderA']),
    rig: {
      driver: 'quad', q: 'horse',
      parts(pose) {
        const charge = pose === 'charge0' || pose === 'charge1', run = charge || pose === 'run0' || pose === 'run1';
        return horseParts({ rider: pose === 'atk' ? 'r:riderA' : charge ? 'r:riderC' : 'r:rider', gait: run ? 2 : pose === 'atk' ? 5 : 1,
          headA: run ? 0.12 : 0, rlean: pose === 'atk' ? 0.16 : run ? 0.06 : 0 });
      },
    },
    paint(c, o) {
      const p = o.pose;
      if (p.charCodeAt(0) === 114 && p.charCodeAt(1) === 58) {   // 'r:' rig part
        const L = p.slice(2);
        if (L.startsWith('rider')) { if (!o.dead) rider(c, o.M, o.col, L === 'riderC' ? 'charge0' : L === 'riderA' ? 'atk' : 'idle', false, o.risen ? C.zskin : undefined, { risen: o.risen, hatless: o.hatless, rest: true }); return; }
        horse(c, o.M, 'idle', o.col, o.dead, { risen: o.risen, saddle: 'rider', layer: L });
        return;
      }
      const hp = p === 'charge0' || p === 'atk' ? 'run0' : p === 'charge1' ? 'run1' : p;
      horse(c, o.M, hp, o.col, o.dead, { risen: o.risen, saddle: 'rider' });
      if (!o.dead) rider(c, o.M, o.col, p, o.dead, o.risen ? C.zskin : undefined, { risen: o.risen, hatless: o.hatless });
    },
  },

  // ninja: black suit and hood, a slit showing the eyes, a headband (red; yellow in Team battle so it never reads as the
  // red team), katana. Walks at a run (long stride, leaning in). Picks: 'dash' u.leaping === 1 (the 0.18 s dash through
  // its target: lunging, katana swept back low, OG game.js:19340); 'star' u.attack > 0 && (u.b.flags & 4) (FLAG_THREW:
  // a shuriken just leaving the hand); 'atk' u.attack > 0 otherwise (0.26 s katana cut, high over the shoulder and down).
  ninja: man('ninja', OWN.ninja, ['idle', 'walk0', 'walk1', 'atk'], { idle: 'aim', walk0: 'run0', walk1: 'run1', atk: 'atk', dash: 'dash', star: 'star', fly: 'fly' }, ['dash', 'star', 'fly'], BOX_MAN,
    o => ({ band: o.col === OWN.ninja ? C.red : C.yellow })),

  // knight (spawned only: a cavalry rider who fell or was thrown off): grey armour, a tabard in the rider's colours, a
  // pointed helm with a feather, a white kite shield with a cross, a sword held up. Picks: 'atk' u.attack > 0 (0.3 s
  // overhand swing); walking: sword back on the shoulder. 'fly' while thrown off the horse (spawned with up 208 / 260).
  knight: man('knight', OWN.cloth, ['idle', 'walk0', 'walk1', 'atk'], { idle: 'aim', atk: 'atk', ...WALK }, ['fly'], BOX_BIG),

  // horse (spawned only: a loose horse after a dismount; faction Strays, so col is its own saddle-cloth colour). Picks:
  // 'drink' u.b.subState === 8 (drinking at the water's edge, sim/units/army/horse.js DRINK.drink); 'run0'/'run1' speed >
  // 130 px/s (bolting: burning or startled); 'walk0'/'walk1' moving; 'idle'. Dead: on its back, legs up (lie 'none').
  // Floppy bodies (ANIMALS): as the cavalry's horse, no rider; drinking is drawn whole.
  horse: {
    box: [52, 46, 25, 41], scale: 1, own: OWN.cloth, lie: 'none',
    poses: ['idle', 'walk0', 'walk1'], extra: ['run0', 'run1', 'drink'].concat(HORSE_PARTS),
    rig: {
      driver: 'quad', q: 'horse',
      parts(pose) {
        if (pose === 'drink') return null;
        const run = pose === 'run0' || pose === 'run1';
        return horseParts({ gait: run ? 2 : 1, headA: run ? 0.12 : 0 });
      },
    },
    paint(c, o) {
      const p = o.pose;
      if (p.charCodeAt(0) === 114 && p.charCodeAt(1) === 58) { horse(c, o.M, 'idle', o.col, o.dead, { risen: o.risen, saddle: 'empty', layer: p.slice(2) }); return; }
      horse(c, o.M, p, o.col, o.dead, { risen: o.risen, saddle: 'empty' });
    },
  },
};
