// Factions, hostility masks and team rules. OG core-move §7, core-combat §1 (OG game.js:8347-8415, 11539-11563).
// Masks are bitsets over faction ids (27 slots in OG, game.js:8396; 53 with our side slots).

// Faction ids, OG numbering (OG game.js:8370-8395). 22 is unused in OG.
export const F = Object.freeze({
  Soldiers: 0, Wild: 1, Undead: 2, Flamers: 3, Snipers: 4, Romans: 5, Grenadiers: 6, Archers: 7, Slimes: 8,
  Props: 9, Knights: 10, Strays: 11, Mages: 12, Giants: 13, Rats: 14, Ants: 15, Apes: 16, Reptiles: 17,
  Piranhas: 18, Dragons: 19, TeamLeft: 20, TeamRight: 21, Snakes: 23, Necromancers: 24, Ninjas: 25, Cheetahs: 26,
  // OURS (side split 11-17): every new-tab unit type and every unit-maker unit is its own side, except families that
  // work together (SIDE_GROUPS). Their defs carry faction Side (22, never on a live unit) + a side key; the world hands
  // each side key a faction slot from SIDE_SLOTS while that side is on the field (world.js Sides). 22 is unused in OG.
  // (Until 11-17: one faction per tab, Dinosaurs 22 .. Secret 35, and Mine 36 for every made unit.)
  Side: 22,
});
export const FACTION_COUNT = 53; // OG 27 (game.js:8396) + our side slots 27-52 (53 = the most a 2^53 integer mask holds)
// Slots the world hands out to sides (world.js Sides): 26 sides on the field at once; past that a side shares a slot.
export const SIDE_SLOTS = Object.freeze(Array.from({ length: FACTION_COUNT - 27 }, (_, k) => 27 + k));
// Families that stay one side (user 11-17: "only the units that would work together"). Everything else in the new tabs
// is a side of its own (its type), like OG's Army / Animals / Mythical types. OG's own families: Knights (knight +
// cavalry), Ants (ant + soldier ant + anthill), Apes (ape + ape cavalry), Rats/Undead truce. Crews, bees, crows,
// siege-tower halberds and slime splits also take their maker's slot at spawn (they pass faction: maker.faction).
export const SIDE_GROUPS = Object.freeze({
  pirates: ['deckhand', 'pistol', 'blunderbuss', 'bomber', 'anchor', 'cannon', 'gunner', 'captain', 'ship'],
  robots: ['drone', 'laserbot', 'sawbot', 'magnetbot', 'repairbot', 'shieldbot', 'bombbot', 'mech'],
  aliens: ['alien', 'gravity', 'mindalien', 'ufo', 'teleporter', 'shrinkray'],
  humans: ['astronaut', 'jetpack'],
  baseball: ['batter', 'pitcher'],
  football: ['tackler', 'cheerleader'],
  bees: ['bee', 'beehive'],
  scarecrow: ['scarecrow', 'crow'],
  kingslime: ['kingslime', 'bigslime', 'slimelet'],
});
const SIDE_OF = new Map();
for (const [k, ts] of Object.entries(SIDE_GROUPS)) for (const t of ts) SIDE_OF.set(t, k);
/** Side key of a new-tab type: its family, else the type itself. */
export function sideOf(type) { return SIDE_OF.get(type) || type; }

// ---- masks
// A mask is a plain non-negative integer below 2^53: bit f = 2^f. JS bit operators only see the low 32 bits, so with
// 53 factions NEVER use & | ~ << >>> on a whole mask: use these helpers. (maskHas(m, f) for f < 32 is exactly the old
// `(m >>> f) & 1`, so OG factions read the same.)
const TWO32 = 4294967296;
export const BIT = new Float64Array(FACTION_COUNT);
for (let f = 0; f < FACTION_COUNT; f++) BIT[f] = 2 ** f;
export function maskBit(f) { return BIT[f]; }                                               // was 1 << f
export function maskLo(m) { return m >>> 0; }                                               // bits 0-31
export function maskHi(m) { return (m / TWO32) >>> 0; }                                     // bits 32-52
export function maskHas(m, f) { return (f < 32 ? (m >>> f) : ((m / TWO32) >>> (f - 32))) & 1; } // was (m >>> f) & 1
export function maskOr(a, b) { return ((maskHi(a) | maskHi(b)) >>> 0) * TWO32 + ((maskLo(a) | maskLo(b)) >>> 0); }
export function maskAnd(a, b) { return ((maskHi(a) & maskHi(b)) >>> 0) * TWO32 + ((maskLo(a) & maskLo(b)) >>> 0); }
export function maskWithout(m, f) { return maskHas(m, f) ? m - BIT[f] : m; }                // was m & ~(1 << f)
export function maskWith(m, f) { return maskHas(m, f) ? m : m + BIT[f]; }                   // was m | (1 << f)
export function maskOf(...fs) { let m = 0; for (const f of fs) m = maskWith(m, f); return m; }

export const ALL_MASK = 2 ** FACTION_COUNT - 1; // OG game.js:8397 ("all", 373.a)

// ENEMY[f]: who faction f may target (373.e). Everyone but self, Props and Strays; Props/Strays have no enemies (OG game.js:8403).
export const ENEMY = new Float64Array(FACTION_COUNT);
for (let f = 0; f < FACTION_COUNT; f++) {
  ENEMY[f] = (f === F.Props || f === F.Strays) ? 0 : maskWithout(maskWithout(maskWithout(ALL_MASK, f), F.Props), F.Strays);
}
ENEMY[F.Wild] = maskWith(ENEMY[F.Wild], F.Strays); // Wild also hunts Strays (OG game.js:8404)
for (const [a, b] of [[F.Rats, F.Undead]]) { ENEMY[a] = maskWithout(ENEMY[a], b); ENEMY[b] = maskWithout(ENEMY[b], a); } // truce (OG game.js:8405-8406)
// HITTABLE[f]: what f's projectiles can hit (373.d) = enemies + Props + Strays (OG game.js:8407-8408).
export const HITTABLE = new Float64Array(FACTION_COUNT);
for (let f = 0; f < FACTION_COUNT; f++) HITTABLE[f] = maskWith(maskWith(ENEMY[f], F.Props), F.Strays);
// The same two tables as flat lookups for the per-unit checks (fast: one byte read).
const FC = FACTION_COUNT, HOST = new Uint8Array(FC * FC), HITS = new Uint8Array(FC * FC);
for (let a = 0; a < FC; a++) for (let b = 0; b < FC; b++) { HOST[a * FC + b] = maskHas(ENEMY[a], b); HITS[a * FC + b] = maskHas(HITTABLE[a], b); }

// Faction-level checks.
export function factionHostile(fa, fb) { return HOST[fa * FC + fb] === 1; } // 373.f
export function isTeamFaction(f) { return f === F.TeamLeft || f === F.TeamRight; } // 373.g
// Unit-level checks (ARCH cross calls): a may target b / a's shots may hit b.
export function isHostile(a, b) { return !!a && !!b && HOST[a.faction * FC + b.faction] === 1; }
export function canHit(a, b) { return !!a && !!b && HITS[a.faction * FC + b.faction] === 1; }
export function enemyMask(f) { return ENEMY[f]; }
export function hitMask(f) { return HITTABLE[f]; }

// Team mode: a type joins a team unless its def faction is Props or Strays (OG game.js:11549-11552, 5579-5581).
export function teamable(def) { return !!def && def.faction !== F.Props && def.faction !== F.Strays; }
export function teamFaction(team) { return team === 0 ? F.TeamLeft : team === 1 ? F.TeamRight : -1; }
export function teamOfFaction(f) { return f === F.TeamLeft ? 0 : f === F.TeamRight ? 1 : -1; }
// Team side by x: left half = TeamLeft (OG game.js:5559-5561).
export function teamAtX(world, x) { return x < world.W / 2 ? 0 : 1; }
// Living units per team, as OG counts them (hp > 0) (OG game.js:11553-11561).
export function teamCounts(world) {
  let l = 0, r = 0; const us = world.units;
  for (let i = 0; i < us.length; i++) { const u = us[i]; if (u.dead || u.hp <= 0) continue; if (u.faction === F.TeamLeft) l++; else if (u.faction === F.TeamRight) r++; }
  return [l, r];
}

// Intelligence levels (OG game.js:8442) and helpers (OG game.js:8444-8452).
export const INT = Object.freeze({ Mindless: 0, Animal: 1, Trained: 2 });
export function mineAware(def) { return def.mines !== undefined && def.mines !== null ? !!def.mines : def.intelligence >= INT.Trained; }
export function isTrained(def) { return def.intelligence >= INT.Trained; }
export function isAnimalPlus(def) { return def.intelligence >= INT.Animal; }
