// Campaign paint prices (OURS, Part 2 step 9, STEP9.md). Owner: PRICE.
// PRICES and MADE are WRITTEN BY game/tools/price-bot.mjs (2026-11-19): measured in real headless battles, rifleman = 10.
// Re-run after balance changes: nice -n 10 node game/tools/price-bot.mjs  (its header explains the method).
// Hand tuning goes in TUNE (type -> price): the bot keeps TUNE when it rewrites this file, and TUNE wins over PRICES.
//
// How a line reads: `legion: 12, // 11.6 = rifle24 n20.7=11.6 ...`: 20.7 legion beat 24 riflemen half the time, so a
// legionary is worth 24 x 10 / 20.7 = 11.6 paint against riflemen. Price = geometric mean of the middle 3 of the 5
// reference armies (the best and worst matchup dropped) (24 rifle = 24 riflemen, 15 legion = 23 riflemen, 10 boar = 24 riflemen, 29 archer = 24 riflemen, 8 giant = 26 riflemen), rounded nice.
// n>500 = never won even with 500 (the value is a bound), !le = the fewest tried already won (a floor).
// "refs x3" = measured against 3x the reference armies (a big unit). Bosses: "legion n58" = it takes 58 legion to beat
// one boss half the time. "support" = paint of the partner army saved per unit painted behind it (the price is the larger
// of that and its worth alone). desk/phone/wide = the same price measured on each screen shape alone.
import { getDef } from '../defs.js';

export const PRICES = {
  rifle: 10,           // 10 by definition. 10 = rifle24 n24.0=10 legion15 n22.7=10 boar10 n23.0=10 archer29 n23.7=10 giant8 n23.7=10 | desk/phone/wide 10/9.2/10
  flamer: 12,          // 12 = rifle24 n27.0=8.9 legion15 n8.0=28 boar10 n16.0=15 archer29 n29.0=8.2 giant8 n22.4=12 | desk/phone/wide 12/12/12
  sniper: 20,          // 22 = rifle24 n11.0=22 legion15 n11.5=20 boar10 n10.0=24 archer29 n11.0=22 giant8 n11.0=24 | desk/phone/wide 24/14/22
  legion: 14,          // 14 = rifle24 n15.5=15 legion15 n15.0=15 boar10 n10.0=24 archer29 n20.0=12 giant8 n85.0=3.1 | desk/phone/wide 15/14/15
  grenadier: 35,       // 33 = rifle24 n8.0=30 legion15 n4.0=57 boar10 n37.2=6.4 archer29 n9.5=25 giant8 n5.5=47 | desk/phone/wide 37/30/23
  archer: 9,           // 8.9 = rifle24 n30.0=8.0 legion15 n21.4=11 boar10 n45.0=5.3 archer29 n29.0=8.2 giant8 n19.0=14 | desk/phone/wide 8.7/9.3/9.2
  cavalry: 25,         // 26 = rifle24 n7.4=33 legion15 n11.5=20 boar10 n8.5=28 archer29 n3.7=64 giant8 n43.7=5.9 | desk/phone/wide 25/28/26
  ninja: 8,            // 8.2 = rifle24 n31.0=7.7 legion15 n34.0=6.7 boar10 n22.0=11 archer29 n9.6=25 giant8 n187=1.4 | desk/phone/wide 8.1/8.7/7.8
  boar: 20,            // 21 = rifle24 n9.7=25 legion15 n14.5=16 boar10 n10.7=22 archer29 n4.7=51 giant8 n43.9=5.9 | desk/phone/wide 20/21/23
  rat: 4,              // 3.8 = rifle24 n135=1.8 legion15 n77.0=3.0 boar10 n76.5=3.1 archer29 n41.0=5.8 giant8 n34.0=7.7 | desk/phone/wide 3.8/3.0/4.3
  ant: 3,              // 2.6 = rifle24 n107=2.2 legion15 n107=2.1 boar10 n67.3=3.5 archer29 n97.0=2.5 giant8 n85.0=3.1 | desk/phone/wide 2.6/2.5/2.7
  ape: 25,             // 23 = rifle24 n10.5=23 legion15 n10.0=23 boar10 n10.3=23 archer29 n4.6=52 giant8 n74.0=3.5 | desk/phone/wide 21/24/21
  gator: 30,           // 31 = rifle24 n8.3=29 legion15 n6.4=36 boar10 n4.3=55 archer29 n8.0=30 giant8 n35.5=7.3 | desk/phone/wide 31/32/32
  piranha: 4,          // 4.5 = rifle24 n69.5=3.5 legion15 n53.5=4.3 boar10 n44.5=5.3 archer29 n36.5=6.5 giant8 n66.8=3.9 (water arena) | desk/phone/wide 4.8/4.7/4.5
  snake: 8,            // 8.4 = rifle24 n31.0=7.7 legion15 n31.0=7.3 boar10 n23.0=10 archer29 n11.0=22 giant8 n75.0=3.5 | desk/phone/wide 7.8/7.8/8.3
  cheetah: 11,         // 11 = rifle24 n18.5=13 legion15 n15.5=15 boar10 n32.2=7.4 archer29 n4.7=50 giant8 n212=1.2 | desk/phone/wide 11/11/12
  zombie: 30,          // 30 = rifle24 n5.6=43 legion15 n4.0=57 boar10 n21.0=11 archer29 n3.5=69 giant8 n368=0.7 | desk/phone/wide 31/29/35
  slime: 17,           // 17 = rifle24 n40.0=6.0 legion15 n9.0=25 boar10 n7.7=31 archer29 n3.5=69 giant8 n57.0=4.6 | desk/phone/wide 13/19/28
  mage: 25,            // 27 = rifle24 n9.0=27 legion15 n4.0=57 boar10 n8.8=27 archer29 n15.0=16 giant8 n10.0=26 | desk/phone/wide 24/25/29
  giant: 50,           // 52 = rifle72 n21.0=34 legion45 n4.4=156 boar30 n5.7=124 archer87 n23.5=30 giant24 n23.6=33 (refs x3) | desk/phone/wide 64/56/52
  dragon: 350,         // 360 = rifle72 n1.2=605 legion45 n2.0=341 boar30 n2.4=303 archer87 n1.6=451 giant24 n3.0=260 (refs x3) | desk/phone/wide 465/369/386
  necro: 15,           // 15 = rifle24 n48.0=5.0 legion15 n48.0=4.7 boar10 n75.6=3.1 archer29 n31.0=7.7 giant8 n>500=0.5 | support 15 behind rifle | desk/phone/wide 5.1/5.5/4.9
  raptor: 10,          // 10 = rifle24 n20.5=12 legion15 n27.0=8.4 boar10 n20.3=12 archer29 n10.7=22 giant8 n193=1.3 | desk/phone/wide 11/11/9.9
  spitter: 8,          // 7.7 = rifle24 n44.5=5.4 legion15 n9.7=24 boar10 n29.3=8.1 archer29 n44.0=5.4 giant8 n25.0=10 | desk/phone/wide 9.4/8.2/7.1
  trike: 25,           // 25 = rifle24 n7.7=31 legion15 n10.2=22 boar10 n11.0=22 archer29 n5.5=44 giant8 n65.0=4.0 | desk/phone/wide 23/24/24
  stego: 8,            // 7.7 = rifle24 n39.0=6.2 legion15 n14.0=16 boar10 n11.3=21 archer29 n53.0=4.5 giant8 n67.6=3.8 | desk/phone/wide 11/11/7.8
  ankylo: 20,          // 20 = rifle24 n6.6=36 legion15 n11.2=20 boar10 n8.6=28 archer29 n18.0=13 giant8 n51.5=5.1 | desk/phone/wide 23/22/20
  ptero: 11,           // 11 = rifle24 n34.7=6.9 legion15 n13.5=17 boar10 n22.7=10 archer29 n14.5=16 giant8 n127=2.0 | desk/phone/wide 11/10/10
  trex: 55,            // 54 = rifle72 n12.0=60 legion45 n11.5=59 boar30 n10.0=71 archer87 n16.5=43 giant24 n28.0=28 (refs x3) | desk/phone/wide 52/56/57
  longneck: 110,       // 110 = rifle72 n20.0=36 legion45 n1.4=483 boar30 n1.5=470 archer87 n19.0=38 giant24 n10.5=74 (refs x3) | desk/phone/wide 262/117/111
  shieldwall: 4,       // 4.3 = rifle24 n166=1.4 legion15 n21.3=11 boar10 n14.0=17 archer29 n47.0=5.1 giant8 n276=0.9 | desk/phone/wide 3.5/4.5/6.9
  halberd: 7,          // 7.1 = rifle24 n31.0=7.7 legion15 n27.0=8.4 boar10 n10.7=22 archer29 n43.0=5.6 giant8 n162=1.6 | desk/phone/wide 6.5/7.4/6.9
  crossbow: 15,        // 15 = rifle24 n14.5=17 legion15 n17.2=13 boar10 n16.7=14 archer29 n13.0=18 giant8 n26.0=10 | desk/phone/wide 14/13/15
  ram: 19,             // 19 = rifle72 n43.0=17 legion45 n16.0=43 boar30 n20.0=36 archer87 n65.0=11 giant24 n93.4=8.4 (refs x3) | desk/phone/wide 24/24/19
  catapult: 25,        // 27 = rifle24 n4.6=52 legion15 n5.0=45 boar10 n23.0=10 archer29 n5.5=44 giant8 n34.3=7.6 | desk/phone/wide 30/20/29
  ballista: 30,        // 30 = rifle24 n4.0=60 legion15 n9.0=25 boar10 n10.5=23 archer29 n5.3=45 giant8 n16.0=16 | desk/phone/wide 32/29/30
  oilpot: 6,           // 5.9 = rifle24 n24.0=10.0 legion15 n28.0=8.1 boar10 n75.7=3.1 archer29 n29.0=8.2 giant8 n>500=0.5 | desk/phone/wide 8.5/7.3/8.7
  siegetower: 50,      // 48 = rifle72 n22.0=33 legion45 n6.6=104 boar30 n5.7=124 archer87 n22.5=32 giant24 n33.3=23 (refs x3) | desk/phone/wide 50/60/47
  deckhand: 7,         // 6.9 = rifle24 n33.0=7.3 legion15 n39.0=5.8 boar10 n30.7=7.7 archer29 n23.0=10 giant8 n354=0.7 | desk/phone/wide 6.9/6.8/6.9
  pistol: 7,           // 7.1 = rifle24 n34.0=7.1 legion15 n35.0=6.5 boar10 n24.0=9.9 archer29 n31.0=7.7 giant8 n224=1.2 | desk/phone/wide 6.9/7.0/6.9
  blunderbuss: 10,     // 9.7 = rifle24 n26.5=9.1 legion15 n21.5=11 boar10 n21.3=11 archer29 n25.0=9.5 giant8 n50.3=5.2 | desk/phone/wide 9.7/10/10
  bomber: 6,           // 6.4 = rifle24 n23.0=10 legion15 n24.6=9.2 boar10 n59.0=4.0 archer29 n34.0=7.0 giant8 n76.2=3.4 | desk/phone/wide 4.3/6.8/7.0
  anchor: 12,          // 12 = rifle24 n18.0=13 legion15 n9.7=23 boar10 n12.0=20 archer29 n33.0=7.2 giant8 n79.0=3.3 | desk/phone/wide 11/17/12
  cannon: 30,          // 29 = rifle24 n5.5=44 legion15 n7.5=30 boar10 n11.4=21 archer29 n6.0=40 giant8 n25.5=10 | desk/phone/wide 29/27/31
  captain: 14,         // 14 = rifle24 n16.0=15 legion15 n21.7=10 boar10 n14.0=17 archer29 n12.5=19 giant8 n122=2.1 | support 10 behind deckhand | desk/phone/wide 14/17/14
  ship: 200,           // 206 = rifle72 n3.5=208 legion45 n1.0=682!le boar30 n3.6=198 archer87 n3.4=213 giant24 n5.3=148 (refs x3) (water arena) | desk/phone/wide 212/227/197
  drone: 4,            // 3.7 = rifle24 n68.6=3.5 legion15 n67.0=3.4 boar10 n57.3=4.1 archer29 n32.3=7.4 giant8 n471=0.6 | desk/phone/wide 3.5/4.0/3.6
  magnetbot: 3,        // 3.4 = rifle24 n85.5=2.8 legion15 n12.2=19 boar10 n65.0=3.7 archer29 n63.0=3.8 giant8 n322=0.8 | desk/phone/wide 3.7/5.1/3.4
  shieldbot: 3,        // 2.6 = rifle24 n95.5=2.5 legion15 n97.0=2.3 boar10 n40.0=5.9 archer29 n79.0=3.0 giant8 n>500=0.5 | support 2.5 behind rifle | desk/phone/wide 2.8/3.0/3.0
  laserbot: 10,        // 10 = rifle24 n14.3=17 legion15 n21.0=11 boar10 n22.0=11 archer29 n41.0=5.8 giant8 n29.7=8.7 | desk/phone/wide 9.8/11/9.8
  sawbot: 20,          // 22 = rifle24 n16.0=15 legion15 n11.6=20 boar10 n6.6=36 archer29 n3.0=80 giant8 n76.5=3.4 | desk/phone/wide 22/23/21
  repairbot: 5,        // 5.3 = rifle24 n>500=0.5 legion15 n>500=0.5 boar10 n183=1.3 archer29 n>500=0.5 giant8 n>500=0.5 | support 5.3 behind laserbot | desk/phone/wide 1.3/0.9/0.7
  bombbot: 5,          // 5.4 = rifle24 n>500=0.5 legion15 n>500=0.5 boar10 n>500=0.5 archer29 n>500=0.5 giant8 n>500=0.5 | support 5.4 behind rifle | desk/phone/wide -/-/-
  mech: 110,           // 111 = rifle72 n8.0=90 legion45 n4.4=156 boar30 n5.0=142 archer87 n6.7=106 giant24 n26.8=29 (refs x3) | desk/phone/wide 93/117/112
  alien: 8,            // 8.5 = rifle24 n28.5=8.4 legion15 n24.5=9.3 boar10 n28.5=8.3 archer29 n31.3=7.6 giant8 n30.0=8.7 | desk/phone/wide 8.5/8.6/8.4
  jetpack: 25,         // 27 = rifle24 n17.5=14 legion15 n6.0=38 boar10 n8.0=30 archer29 n6.0=40 giant8 n15.5=17 | desk/phone/wide 29/20/23
  shrinkray: 5,        // 5.1 = rifle24 n54.0=4.4 legion15 n39.0=5.8 boar10 n29.0=8.2 archer29 n48.0=5.0 giant8 n>500=0.5 | desk/phone/wide 6.1/5.6/5.4
  gravity: 13,         // 13 = rifle24 n24.4=9.8 legion15 n7.7=30 boar10 n9.4=25 archer29 n27.2=8.8 giant8 n>500=0.5 | desk/phone/wide 16/17/16
  teleporter: 10,      // 10.0 = rifle24 n23.5=10 legion15 n28.3=8.0 boar10 n19.7=12 archer29 n10.0=24 giant8 n150=1.7 | desk/phone/wide 10.0/9.7/10
  mindalien: 13,       // 13 = rifle24 n24.0=10.0 legion15 n13.0=17 boar10 n19.5=12 archer29 n30.0=8.0 giant8 n7.0=37 | desk/phone/wide 13/13/14
  ufo: 40,             // 39 = rifle72 n26.0=28 legion45 n3.6=188 boar30 n7.5=95 archer87 n33.0=22 giant24 n34.2=23 (refs x3) | desk/phone/wide 50/45/39
  astronaut: 5,        // 5.4 = rifle24 n67.6=3.5 legion15 n20.3=11 boar10 n20.0=12 archer29 n61.0=3.9 giant8 n409=0.6 | desk/phone/wide 5.5/6.0/5.4
  crab: 5,             // 5.4 = rifle24 n44.7=5.4 legion15 n43.5=5.2 boar10 n28.0=8.5 archer29 n56.0=4.3 giant8 n47.0=5.5 | desk/phone/wide 5.2/6.0/5.5
  shark: 14,           // 14 = rifle24 n22.0=11 legion15 n22.7=10 boar10 n10.0=24 archer29 n9.0=27 giant8 n77.0=3.4 (water arena) | desk/phone/wide 26/23/10
  octopus: 7,          // 6.7 = rifle24 n79.0=3.0 legion15 n2.4=93 boar10 n7.3=32 archer29 n76.5=3.1 giant8 n222=1.2 | desk/phone/wide 19/9.7/6.8
  puffer: 2,           // 2.2 = rifle24 n>500=0.5 legion15 n46.5=4.9 boar10 n44.5=5.3 archer29 n>500=0.5 giant8 n61.0=4.3 | desk/phone/wide 4.8/5.0/4.1
  eel: 14,             // 14 = rifle24 n19.3=12 legion15 n24.7=9.2 boar10 n14.0=17 archer29 n5.0=48 giant8 n21.5=12 (water arena) | desk/phone/wide 11/17/14
  turtle: 2,           // 2.1 = rifle24 n420=0.6 legion15 n34.3=6.6 boar10 n23.0=10 archer29 n145=1.6 giant8 n301=0.9 | desk/phone/wide 3.9/2.1/2.0
  walrus: 16,          // 16 = rifle24 n14.0=17 legion15 n11.0=21 boar10 n11.3=21 archer29 n19.5=12 giant8 n51.0=5.1 | desk/phone/wide 14/18/17
  swordfish: 9,        // 9.3 = rifle24 n25.0=9.6 legion15 n29.0=7.8 boar10 n22.4=11 archer29 n7.0=34 giant8 n216=1.2 (water arena) | desk/phone/wide 9.0/9.9/9.0
  tackler: 8,          // 7.9 = rifle24 n26.7=9.0 legion15 n40.5=5.6 boar10 n24.7=9.6 archer29 n21.5=11 giant8 n>500=0.5 | desk/phone/wide 7.8/10/9.2
  batter: 7,           // 6.9 = rifle24 n31.0=7.7 legion15 n39.5=5.8 boar10 n31.7=7.5 archer29 n23.0=10 giant8 n500=0.5 | desk/phone/wide 7.2/6.8/7.7
  pitcher: 12,         // 12 = rifle24 n20.0=12 legion15 n18.5=12 boar10 n19.5=12 archer29 n19.6=12 giant8 n37.3=7.0 | desk/phone/wide 12/12/12
  bowler: 11,          // 11 = rifle24 n17.5=14 legion15 n24.5=9.3 boar10 n23.4=10 archer29 n16.6=14 giant8 n119=2.2 | desk/phone/wide 11/11/12
  hockey: 11,          // 11 = rifle24 n21.0=11 legion15 n22.0=10 boar10 n21.0=11 archer29 n21.5=11 giant8 n55.0=4.7 | desk/phone/wide 11/11/11
  sumo: 10,            // 9.5 = rifle24 n21.0=11 legion15 n18.0=13 boar10 n16.0=15 archer29 n40.0=6.0 giant8 n117=2.2 | desk/phone/wide 7.2/12/9.4
  boxer: 12,           // 12 = rifle24 n16.7=14 legion15 n24.0=9.5 boar10 n18.0=13 archer29 n9.7=24 giant8 n195=1.3 | desk/phone/wide 12/13/6.9
  cheerleader: 5,      // 4.7 = rifle24 n114=2.1 legion15 n118=1.9 boar10 n73.2=3.2 archer29 n92.0=2.6 giant8 n>500=0.5 | support 4.7 behind tackler | desk/phone/wide 2.4/2.1/2.4
  bee: 2,              // 2.3 = rifle24 n94.0=2.6 legion15 n95.5=2.4 boar10 n115=2.1 archer29 n33.3=7.2 giant8 n>500=0.5 | desk/phone/wide 2.2/3.0/2.5
  beehive: 17,         // 17 = rifle72 n16.7=43 legion45 n32.8=21 boar30 n36.0=20 archer87 n55.0=13 giant24 n86.5=9.0 (refs x3) | desk/phone/wide 18/19/17
  spider: 7,           // 7.3 = rifle24 n34.0=7.1 legion15 n42.0=5.4 boar10 n23.0=10 archer29 n23.6=10 giant8 n>500=0.5 | desk/phone/wide 8.2/7.7/8.6
  beetle: 15,          // 15 = rifle24 n12.2=20 legion15 n20.3=11 boar10 n14.0=17 archer29 n10.0=24 giant8 n252=1.0 | desk/phone/wide 16/16/15
  mantis: 11,          // 11 = rifle24 n22.0=11 legion15 n24.3=9.3 boar10 n19.0=12 archer29 n10.0=24 giant8 n155=1.7 | desk/phone/wide 11/11/11
  bombardier: 11,      // 11 = rifle24 n26.0=9.2 legion15 n14.7=16 boar10 n21.0=11 archer29 n21.0=11 giant8 n114=2.3 | desk/phone/wide 11/11/11
  mosquito: 2,         // 2.3 = rifle24 n97.0=2.5 legion15 n98.0=2.3 boar10 n106=2.2 archer29 n87.0=2.7 giant8 n>500=0.5 | desk/phone/wide 2.4/2.6/2.4
  stinkbug: 8,         // 8.0 = rifle24 n49.0=4.9 legion15 n30.5=7.5 boar10 n22.0=11 archer29 n35.0=6.8 giant8 n26.0=10 | desk/phone/wide 12/8.6/8.0
  kraken: 500,         // 489 = rifle n35.7=357 legion n124=1.9k boar n45.0=1.1k archer n1.0=8.2!le giant n9.5=308 (water arena) | desk/phone/wide 500/489/482
  gmech: 750,          // 751 = rifle n41.5=415 legion n215=3.3k boar n67.0=1.6k archer n58.6=482 giant n17.0=553 | desk/phone/wide 752/855/735
  hydra: 275,          // 278 = rifle n22.0=220 legion n56.3=854 boar n14.6=347 archer n15.3=126 giant n8.7=281 | desk/phone/wide 292/305/270
  lavagolem: 350,      // 357 = rifle n24.8=248 legion n78.0=1.2k boar n33.3=791 archer n28.2=232 giant n5.0=163 | desk/phone/wide 359/348/379
  worm: 475,           // 465 = rifle n68.0=680 legion n75.5=1.1k boar n11.0=261 archer n69.0=568 giant n3.5=113 | desk/phone/wide 442/461/445
  kingslime: 150,      // 147 = rifle n1.0=10!le legion n68.0=1.0k boar n33.2=788 archer n4.5=37 giant n3.4=109 | desk/phone/wide 132/171/153
  ghost: 50,           // 49 = rifle24 n5.5=44 legion15 n3.5=66 boar10 n6.4=37 archer29 n2.2=108 giant8 n6.5=40 | desk/phone/wide 50/48/47
  seagull: 2,          // 1.8 = rifle24 n126=1.9 legion15 n118=1.9 boar10 n138=1.7 archer29 n88.6=2.7 giant8 n>500=0.5 | desk/phone/wide 2.2/1.9/1.9
  yeti: 80,            // 79 = rifle72 n6.0=120 legion45 n6.5=105 boar30 n14.2=50 archer87 n7.6=94 giant24 n29.8=26 (refs x3) | desk/phone/wide 90/76/77
  cowboy: 15,          // 15 = rifle24 n15.0=16 legion15 n15.0=15 boar10 n16.0=15 archer29 n14.7=16 giant8 n41.0=6.3 | desk/phone/wide 15/15/15
  scarecrow: 45,       // 43 = rifle72 n38.7=19 legion45 n31.5=22 boar30 n1.7=424 archer87 n9.5=75 giant24 n16.0=49 (refs x3) | desk/phone/wide 41/43/44
  phoenix: 160,        // 156 = rifle72 n10.5=69 legion45 n2.2=308 boar30 n1.0=712!le archer87 n4.0=179 giant24 n23.7=33 (refs x3) | desk/phone/wide 195/171/164
  bogmonster: 25,      // 23 = rifle24 n14.5=17 legion15 n4.0=57 boar10 n5.3=45 archer29 n15.5=15 giant8 n27.0=9.6 | desk/phone/wide 32/31/22
  baby: 100,           // 99 = rifle72 n11.5=63 legion45 n1.4=483 boar30 n2.4=291 archer87 n13.5=53 giant24 n18.0=43 (refs x3) | desk/phone/wide 165/145/100
};

// Hand-tuned prices (type -> paint). Kept by the price bot; wins over PRICES.
export const TUNE = {
};

// Made units (Mine tab): madePrice(recipe) = weapon[w][0] x body[c][body] x size[c][i] x hp[c][i] x speed[c][i] x ability[a]...
// c = weapon[w][1] ('melee' | 'ranged'). weapon[w][0] = paint for a person (size 1, hp 100, speed 1) carrying w; every
// other number = how much that one change multiplies the price of the sword person (melee) / rifle person (ranged).
// Arrays are by step index (catalog.js SIZES, HP_STEPS, SPEED_STEPS). Measured by the price bot against riflemen,
// legion and boars (geometric mean); hp steps 25 / 200 / 800 / 3000 and speeds x0.5 / x1.5 are read off the log-log line
// between their measured neighbours; hp, size and speed made rising (an hp / size step at least +5 %: ranged weapons don't
// scale with size, measured ~flat). Abilities were measured on the sword person and
// never go below 1 (an ability never makes a unit cheaper: Self-destruct measured 0.04, Magnet 0.19, Drink 0.72).
export const MADE = {
  weapon: {sword: [11.8, 'melee'], rifle: [9.1, 'ranged'], sniper: [16.2, 'ranged'], flamer: [10.5, 'ranged'],
    pistol: [8.2, 'ranged'], blunderbuss: [10.9, 'ranged'], revolvers: [13.1, 'ranged'], crossbow: [17.4, 'ranged'],
    ballista: [19.7, 'ranged'], raygun: [9.1, 'ranged'], shrink: [7.9, 'ranged'], rockets: [17.5, 'ranged'],
    missiles: [64.8, 'ranged'], laser: [11, 'ranged'], zap: [6.4, 'ranged'], web: [7.8, 'ranged'],
    cannon: [19, 'ranged'], grenade: [20, 'ranged'], shuriken: [10.1, 'ranged'], bow: [8.4, 'ranged'],
    bombs: [8.3, 'ranged'], oilpot: [5.6, 'ranged'], fastball: [14.5, 'ranged'], bowling: [12.5, 'ranged'],
    puck: [10.2, 'ranged'], snowball: [30, 'ranged'], boulder: [17.8, 'ranged'], lavablob: [39.7, 'ranged'],
    spit: [9.3, 'ranged'], fireball: [15.5, 'ranged'], lightning: [24.3, 'ranged'], bubble: [20.8, 'ranged'],
    firebreath: [125.9, 'ranged'], spray: [10.2, 'ranged'], club: [18.5, 'melee'], halberd: [11.8, 'melee'],
    cutlass: [9, 'melee'], anchor: [12.2, 'melee'], bat: [10.8, 'melee'], dagger: [10.2, 'melee'],
    ram: [17, 'melee'], saw: [16.3, 'melee'], fists: [9.8, 'melee'], slam: [15.6, 'melee'], shove: [9.1, 'melee'],
    floatpunch: [11.2, 'melee'], bite: [8.2, 'melee'], jaws: [14.3, 'melee'], zombiebite: [26.7, 'melee'],
    peck: [3.3, 'melee'], tusks: [15.1, 'melee'], horns: [9.5, 'melee'], pinch: [7.3, 'melee'],
    blades: [11.3, 'melee'], tail: [10.7, 'melee'], tailclub: [11.3, 'melee'], sting: [5.1, 'melee'], },
  body: {
    melee: { person: 1, animal: 0.991, beast: 0.757, giant: 0.692, },
    ranged: { person: 1, animal: 0.977, beast: 0.917, giant: 0.891, },
  },
  size: {
    melee: [0.714, 0.848, 1, 1.181, 1.456],
    ranged: [0.907, 0.952, 1, 1.05, 1.103],
  },
  hp: {
    melee: [0.434, 0.591, 0.746, 1, 1.39, 1.933, 2.945, 4.315, 5.995, 8.33],
    ranged: [0.507, 0.643, 0.769, 1, 1.472, 2.167, 3.008, 4.05, 6.035, 8.993],
  },
  speed: {
    melee: [0.519, 0.735, 0.901, 1, 1.081, 1.142, 1.201],
    ranged: [0.922, 0.961, 0.98, 1, 1.02, 1.064, 1.223],
  },
  ability: {fly: 1.195, swim: 1.008, burrow: 2.07, ghost: 2.898, lowgrav: 1, grabdrop: 1.056, beam: 2.148,
    firedive: 1.993, fireproof: 1.009, heavy: 1.041, lavatrail: 2.515, sneak: 1.021, skates: 1.035, pounce: 1.059,
    charge: 1, tackle: 1.03, blink: 1.193, roar: 1.141, throw: 1.206, lasso: 1.124, slide: 1.057, stomp: 1.542,
    sit: 2.371, swallow: 1.09, bomb: 1, magnet: 1, ink: 1.928, stink: 1.886, mind: 1.477, grabfour: 1.925, drink: 1,
    shock: 1.011, curse: 1.727, smoke: 1, rally: 1.046, heal: 1.252, dome: 1.349, scare: 1.729, raise: 1.682,
    bees: 2.398, crows: 2.168, armour: 1.446, shield: 2.022, shell: 1, dodge: 1.151, spikes: 1.216, split: 2.425,
    rebirth: 2.838, },
};

export function priceOf(type) {
  const t = TUNE[type];
  if (t > 0) return t;
  const p = PRICES[type];
  if (p > 0) return p;
  const d = getDef(type);
  if (!d) return 0;
  if (d.maker && d.maker.recipe) return madePrice(d.maker.recipe);
  return guess(d);
}
// A unit the bot hasn't measured yet (added after the last run): rifleman (100 hp, r 9.5) = 10, scaled by hp and size.
function guess(d) { return d.boss ? 600 : Math.max(5, Math.round(10 * Math.sqrt((d.maxHp || 100) / 100) * ((d.radius || 9.5) / 9.5))); }
// Round to a nice price: whole paint under 20, then steps of 5 / 10 / 25 / 50 / 100.
export function nicePrice(v) {
  if (!(v > 0)) return 0;
  const step = v < 20 ? 1 : v < 100 ? 5 : v < 200 ? 10 : v < 1000 ? 25 : v < 2000 ? 50 : 100;
  return Math.max(1, Math.round(v / step) * step);
}
/** A made unit's price from its recipe (step indexes, maker cleanRecipe shape). */
export function madePrice(r) {
  if (!r) return 0;
  const M = MADE;
  if (!M) return Math.max(5, Math.round(10 * (1 + (r.hp || 0) * 0.5) * (1 + (r.size || 0) * 0.3)));   // before the bot has run
  const w = M.weapon[r.weapon] || M.weapon.sword, c = w[1];
  const at = (tab, i, d) => { const v = tab[c][i ?? d]; return v > 0 ? v : 1; };
  let p = w[0] * (M.body[c][r.body] || 1) * at(M.size, r.size, 2) * at(M.hp, r.hp, 3) * at(M.speed, r.speed, 3);
  for (const a of r.abilities || []) p *= M.ability[a] || 1;
  return nicePrice(p);
}
