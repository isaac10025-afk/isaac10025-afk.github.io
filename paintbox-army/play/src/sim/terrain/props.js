// Tree and Barrel: rule numbers and the tree-side helpers other owners call (sniper perch: ARMY; shooter cover: CORE-B).
// The unit defs themselves are in units/props/barrel.js and tree.js. OG modules 572 (game.js:14587-14765),
// 626 (game.js:18804-18892), sniper perch (game.js:16420-16552) and cover (game.js:10300-10371).

// ---------------------------------------------------------------- barrel
export const BARREL_BLAST = Object.freeze({ radius: 70, damage: 110, minFalloff: 0.2, push: 260, stun: 0.6, noiseRadius: 480, tossUp: 540, tossSpeed: 230, tossFrom: 0.3, hatChance: 0.7 }); // OG game.js:14603-14614
export const BARREL = Object.freeze({
  fuseJitterLo: 0.6, fuseJitterHi: 1.4,  // fuse = base × rand(0.6, 1.4) (OG game.js:14751)
  fuseBurning: 1.3,                      // catches fire (OG game.js:14678)
  fuseKilled: 0.15,                      // damage took hp ≤ 0: hp back to 1 (OG game.js:14722-14725)
  fuseLanding: 0.045, landingSpeed: 200, // lands faster than 200 px/s (OG game.js:14745-14747)
  oilPuddles: 8, oilReach: 22, oilReachMin: 0.3, oilSpread: 0.6, oilEach: 6 / 8, // death spill (OG game.js:14726-14734)
  tipSpeed: 60,                          // itself faster than 60 px/s tips it (OG game.js:14682)
  tipShove: 420, tipShoveLoose: 150,     // closing speed × mass from a toucher; 150 if airborne/stunned (OG game.js:14695)
  tipGap: 2, tipHigh: 2.5, tipQueryMax: 16, // touch = radii + 2 px, z ≤ 2.5 × radius, first 16 near units (OG game.js:14686-14693)
  tipSpeedOut: 110, tipLeak: 3.5,        // tipped: 110 px/s away, 3.5 s leak (OG game.js:14754-14762)
  leakArrow: 9, leakBullet: 9, leakThrough: 4.5, punctureChance: 0.6, // OG game.js:14737-14744
  leakTotal: 40, leakStanding: 9, leakTipped: 3.5, // 40 oil over 9 s standing, 40 / 3.5 per s tipped (OG game.js:14700-14713)
  leakOut: 0.6, leakDown: 0.3, leakSide: 1.4, leakJitter: 2,
  floatTurn: 1.5, floatSpeed: 9,         // drifts in deep water (OG game.js:14763-14764)
});

// ---------------------------------------------------------------- tree
export const TREE = Object.freeze({
  leafCooldown: 0.25, leafBig: 30,       // leaf puffs at most every 0.25 s; 3 instead of 2 when the hit > 30 (OG game.js:18821-18824)
  fallDust: 3,                           // dust puffs when it falls (OG game.js:18875)
});
export const PERCH_HEIGHT = 26;          // climbed unit height = climb × 26 (OG game.js:9012, 9014)
export const PERCH_SEARCH = 150;         // sniper looks for a tree within radius + 150 (OG game.js:16527)
export const PERCH_GAP = 6, PERCH_LEAVE_GAP = 12, PERCH_Y = 1; // climb from radii + 6; knocked off past radii + 12; perch at tree.y + 1 (OG 16433, 16447, 16469)
export const COVER_REACH = 110, COVER_GAP = 1, COVER_STOP = 3; // cover tree within radius + 110; spot radii + 1 behind; stop within 3 px (OG game.js:10300-10303)

function live(world, id) { return id >= 0 ? world.unitById(id) : null; }

// A tree that can hold a climber: a live Tree, not burning, not singed (OG game.js:16425-16430).
export function treeUsable(world, tree) {
  return !!tree && !tree.dead && tree.type === 'tree' && tree.hp > 0 && !(tree.burning > 0) && tree.singed !== 1;
}
// Free for this climber: usable and not reserved by another unit still perched on it (OG game.js:16547-16551).
export function treeCanPerch(world, tree, u) {
  if (!treeUsable(world, tree)) return false;
  const s = live(world, tree.b.climber ?? -1);
  return !s || s === u || s.perch !== tree.id;
}
// Reserve the tree: the climber keeps the tree id in u.perch, the tree keeps the climber in b.climber (OG game.js:16538-16543).
export function claimPerch(world, tree, u) { u.perch = tree.id; u.climb = 0; tree.b.climber = u.id; }
// Where a climber stands: on the tree, 1 px below its centre (OG game.js:16430).
export function perchSpot(tree, out) { out[0] = tree.x; out[1] = tree.y + PERCH_Y; return out; }

// Cover: a live Tree, not burning, not thrown, not already sheltering another shooter (OG game.js:10304-10309).
export function treeCanShelter(world, tree, u) {
  if (!tree || tree.dead || tree.type !== 'tree' || tree.hp <= 0 || tree.burning > 0 || tree.hurled === 1) return false;
  const s = live(world, tree.b.shelter ?? -1);
  return !s || s === u || s.cover !== tree.id;
}
// The cover spot: far side of the tree from (tx,ty), at tree radius + unit radius + 1 (OG game.js:10310-10317).
export function coverSpot(tree, u, tx, ty, out) {
  const dx = tree.x - tx, dy = tree.y - ty, d = Math.hypot(dx, dy) || 0.001, f = tree.radius + u.radius + COVER_GAP;
  out[0] = tree.x + (dx / d) * f; out[1] = tree.y + (dy / d) * f; return out;
}
export function claimShelter(world, tree, u) { u.cover = tree.id; tree.b.shelter = u.id; } // OG game.js:10354-10360

// Charred look: burn progress 0..1 while burning (OG 626.b, game.js:18888-18891).
export function treeCharred(tree) { const t = tree.b.burnTotal || 0; return tree.burning > 0 && t > 0 ? Math.min(1, Math.max(0, 1 - tree.burning / t)) : 0; }
