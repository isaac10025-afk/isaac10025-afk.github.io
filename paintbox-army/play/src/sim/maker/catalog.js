// Unit maker catalogue (OURS, Part 2 step 8, STEP8.md). Owner: LEAD. Pure data: no imports, so the UI, the art and the
// tests can read it without loading the sim.
// - WEAPONS: every weapon in the game, one row each, in picker order. `from` = the unit it comes from (its numbers, sounds
//   and look are the source's), `group` = picker group, `hold` = how a body carries it (the art's pose class), `agent`
//   = who builds it (STEP8.md). A weapon shows in the maker only once its module has called registerWeapon.
// - ABILITIES: every trick, one row each. `kind`: move (only ONE move ability per unit), act, support, passive, death.
// - Names are plain: the source unit's word for the thing (EN + 中文).

// hold classes (art): gun (two hands, long), pistol (one hand), bow, throw (overhand, the thing in the hand), cast (hand /
// staff up), swing (one-hand melee), pole (two-hand long reach), heavy (two-hand big swing), mouth, head, fist, tail.
export const WEAPONS = [
  // ---- guns (W-GUN)
  { id: 'rifle', from: 'rifle', group: 'gun', hold: 'gun', agent: 'W-GUN', en: 'Rifle', zh: '步枪' },
  { id: 'sniper', from: 'sniper', group: 'gun', hold: 'gun', agent: 'W-GUN', en: 'Sniper rifle', zh: '狙击枪' },
  { id: 'flamer', from: 'flamer', group: 'gun', hold: 'gun', agent: 'W-GUN', en: 'Flamethrower', zh: '喷火器' },
  { id: 'pistol', from: 'pistol', group: 'gun', hold: 'pistol', agent: 'W-GUN', en: 'Pistol', zh: '手枪' },
  { id: 'blunderbuss', from: 'blunderbuss', group: 'gun', hold: 'gun', agent: 'W-GUN', en: 'Blunderbuss', zh: '喇叭枪' },
  { id: 'revolvers', from: 'cowboy', group: 'gun', hold: 'pistol', agent: 'W-GUN', en: 'Revolvers', zh: '双左轮' },
  { id: 'crossbow', from: 'crossbow', group: 'gun', hold: 'gun', agent: 'W-GUN', en: 'Crossbow', zh: '弩' },
  { id: 'ballista', from: 'ballista', group: 'gun', hold: 'heavy', agent: 'W-GUN', en: 'Ballista', zh: '床弩' },
  { id: 'raygun', from: 'alien', group: 'gun', hold: 'pistol', agent: 'W-GUN', en: 'Ray gun', zh: '射线枪' },
  { id: 'shrink', from: 'shrinkray', group: 'gun', hold: 'gun', agent: 'W-GUN', en: 'Shrink ray', zh: '缩小枪' },
  { id: 'rockets', from: 'jetpack', group: 'gun', hold: 'gun', agent: 'W-GUN', en: 'Rockets', zh: '火箭' },
  { id: 'missiles', from: 'gmech', group: 'gun', hold: 'heavy', agent: 'W-GUN', en: 'Missiles', zh: '导弹' },
  { id: 'laser', from: 'laserbot', group: 'gun', hold: 'gun', agent: 'W-GUN', en: 'Laser', zh: '激光' },
  { id: 'zap', from: 'drone', group: 'gun', hold: 'pistol', agent: 'W-GUN', en: 'Zapper', zh: '电击器' },
  { id: 'web', from: 'spider', group: 'gun', hold: 'gun', agent: 'W-GUN', en: 'Web', zh: '蛛网' },
  { id: 'cannon', from: 'cannon', group: 'gun', hold: 'heavy', agent: 'W-GUN', en: 'Cannon', zh: '大炮' },
  // ---- thrown + magic (W-THROW)
  { id: 'grenade', from: 'grenadier', group: 'throw', hold: 'throw', agent: 'W-THROW', en: 'Grenade', zh: '手榴弹' },
  { id: 'shuriken', from: 'ninja', group: 'throw', hold: 'throw', agent: 'W-THROW', en: 'Shuriken', zh: '飞镖' },
  { id: 'bow', from: 'archer', group: 'throw', hold: 'bow', agent: 'W-THROW', en: 'Bow', zh: '弓' },
  { id: 'bombs', from: 'bomber', group: 'throw', hold: 'throw', agent: 'W-THROW', en: 'Bombs', zh: '炸弹' },
  { id: 'oilpot', from: 'oilpot', group: 'throw', hold: 'throw', agent: 'W-THROW', en: 'Oil pot', zh: '油罐' },
  { id: 'fastball', from: 'pitcher', group: 'throw', hold: 'throw', agent: 'W-THROW', en: 'Baseball', zh: '棒球' },
  { id: 'bowling', from: 'bowler', group: 'throw', hold: 'throw', agent: 'W-THROW', en: 'Bowling ball', zh: '保龄球' },
  { id: 'puck', from: 'hockey', group: 'throw', hold: 'pole', agent: 'W-THROW', en: 'Hockey stick', zh: '冰球杆' },
  { id: 'snowball', from: 'yeti', group: 'throw', hold: 'throw', agent: 'W-THROW', en: 'Snowball', zh: '雪球' },
  { id: 'boulder', from: 'catapult', group: 'throw', hold: 'heavy', agent: 'W-THROW', en: 'Boulder', zh: '巨石' },
  { id: 'lavablob', from: 'lavagolem', group: 'throw', hold: 'throw', agent: 'W-THROW', en: 'Lava blob', zh: '岩浆球' },
  { id: 'spit', from: 'spitter', group: 'throw', hold: 'mouth', agent: 'W-THROW', en: 'Spit', zh: '口水' },
  { id: 'fireball', from: 'mage', group: 'magic', hold: 'cast', agent: 'W-THROW', en: 'Fireball', zh: '火球' },
  { id: 'lightning', from: 'mage', group: 'magic', hold: 'cast', agent: 'W-THROW', en: 'Lightning', zh: '闪电' },
  { id: 'bubble', from: 'gravity', group: 'magic', hold: 'cast', agent: 'W-THROW', en: 'Bubble', zh: '泡泡' },
  { id: 'firebreath', from: 'dragon', group: 'magic', hold: 'mouth', agent: 'W-THROW', en: 'Fire breath', zh: '龙息' },
  { id: 'spray', from: 'bombardier', group: 'magic', hold: 'tail', agent: 'W-THROW', en: 'Boiling spray', zh: '沸水喷' },
  // ---- held melee (W-MELEE)
  { id: 'sword', from: 'legion', group: 'melee', hold: 'swing', agent: 'W-MELEE', en: 'Sword', zh: '剑' },
  { id: 'club', from: 'giant', group: 'melee', hold: 'heavy', agent: 'W-MELEE', en: 'Club', zh: '大棒' },
  { id: 'halberd', from: 'halberd', group: 'melee', hold: 'pole', agent: 'W-MELEE', en: 'Halberd', zh: '长戟' },
  { id: 'cutlass', from: 'deckhand', group: 'melee', hold: 'swing', agent: 'W-MELEE', en: 'Cutlass', zh: '弯刀' },
  { id: 'anchor', from: 'anchor', group: 'melee', hold: 'heavy', agent: 'W-MELEE', en: 'Anchor', zh: '船锚' },
  { id: 'bat', from: 'batter', group: 'melee', hold: 'swing', agent: 'W-MELEE', en: 'Bat', zh: '球棒' },
  { id: 'dagger', from: 'teleporter', group: 'melee', hold: 'swing', agent: 'W-MELEE', en: 'Dagger', zh: '匕首' },
  { id: 'ram', from: 'ram', group: 'melee', hold: 'heavy', agent: 'W-MELEE', en: 'Ram', zh: '攻城锤' },
  { id: 'saw', from: 'sawbot', group: 'melee', hold: 'swing', agent: 'W-MELEE', en: 'Saw', zh: '圆锯' },
  { id: 'fists', from: 'boxer', group: 'melee', hold: 'fist', agent: 'W-MELEE', en: 'Fists', zh: '拳头' },
  { id: 'slam', from: 'ape', group: 'melee', hold: 'fist', agent: 'W-MELEE', en: 'Ground slam', zh: '捶地' },
  { id: 'shove', from: 'sumo', group: 'melee', hold: 'fist', agent: 'W-MELEE', en: 'Shove', zh: '推掌' },
  { id: 'floatpunch', from: 'astronaut', group: 'melee', hold: 'fist', agent: 'W-MELEE', en: 'Float punch', zh: '失重拳' },
  // ---- body weapons (W-BODY)
  { id: 'bite', from: 'raptor', group: 'body', hold: 'mouth', agent: 'W-BODY', en: 'Bite', zh: '咬' },
  { id: 'jaws', from: 'trex', group: 'body', hold: 'mouth', agent: 'W-BODY', en: 'Big jaws', zh: '大嘴' },
  { id: 'zombiebite', from: 'zombie', group: 'body', hold: 'mouth', agent: 'W-BODY', en: 'Zombie bite', zh: '僵尸咬' },
  { id: 'peck', from: 'seagull', group: 'body', hold: 'mouth', agent: 'W-BODY', en: 'Peck', zh: '啄' },
  { id: 'tusks', from: 'boar', group: 'body', hold: 'head', agent: 'W-BODY', en: 'Tusks', zh: '獠牙' },
  { id: 'horns', from: 'beetle', group: 'body', hold: 'head', agent: 'W-BODY', en: 'Horns', zh: '犄角' },
  { id: 'pinch', from: 'crab', group: 'body', hold: 'fist', agent: 'W-BODY', en: 'Claws', zh: '大钳' },
  { id: 'blades', from: 'mantis', group: 'body', hold: 'fist', agent: 'W-BODY', en: 'Blades', zh: '镰刀臂' },
  { id: 'tail', from: 'stego', group: 'body', hold: 'tail', agent: 'W-BODY', en: 'Tail swipe', zh: '甩尾' },
  { id: 'tailclub', from: 'ankylo', group: 'body', hold: 'tail', agent: 'W-BODY', en: 'Tail club', zh: '尾锤' },
  { id: 'sting', from: 'bee', group: 'body', hold: 'tail', agent: 'W-BODY', en: 'Stinger', zh: '毒刺' },
];

export const ABILITIES = [
  // ---- move: only one per unit (A-MOVE)
  { id: 'fly', from: 'dragon', kind: 'move', agent: 'A-MOVE', en: 'Fly', zh: '飞行' },
  { id: 'swim', from: 'crab', kind: 'move', agent: 'A-MOVE', en: 'Swim', zh: '游泳' },
  { id: 'burrow', from: 'worm', kind: 'move', agent: 'A-MOVE', en: 'Burrow', zh: '钻地' },
  { id: 'ghost', from: 'ghost', kind: 'move', agent: 'A-MOVE', en: 'Ghost', zh: '幽灵' },
  { id: 'lowgrav', from: 'astronaut', kind: 'move', agent: 'A-MOVE', en: 'Low gravity', zh: '低重力' },
  { id: 'grabdrop', from: 'ptero', kind: 'move', agent: 'A-MOVE', en: 'Grab and drop', zh: '抓起摔下' },
  { id: 'beam', from: 'ufo', kind: 'move', agent: 'A-MOVE', en: 'Beam up', zh: '光束吸走' },
  { id: 'firedive', from: 'phoenix', kind: 'move', agent: 'A-MOVE', en: 'Fire dive', zh: '火焰俯冲' },
  // ---- passive, movement-like (A-MOVE)
  { id: 'fireproof', from: 'lavagolem', kind: 'passive', agent: 'A-MOVE', en: 'Fireproof', zh: '防火' },
  { id: 'heavy', from: 'longneck', kind: 'passive', agent: 'A-MOVE', en: 'Heavy', zh: '超重' },
  { id: 'lavatrail', from: 'lavagolem', kind: 'passive', agent: 'A-MOVE', en: 'Lava trail', zh: '岩浆脚印' },
  { id: 'sneak', from: 'cheetah', kind: 'passive', agent: 'A-MOVE', en: 'Sneak', zh: '潜行' },
  { id: 'skates', from: 'hockey', kind: 'passive', agent: 'A-MOVE', en: 'Skates', zh: '冰鞋' },
  // ---- act 1 (A-ACT1)
  { id: 'pounce', from: 'raptor', kind: 'act', agent: 'A-ACT1', en: 'Pounce', zh: '飞扑' },
  { id: 'charge', from: 'trike', kind: 'act', agent: 'A-ACT1', en: 'Charge', zh: '冲锋' },
  { id: 'tackle', from: 'tackler', kind: 'act', agent: 'A-ACT1', en: 'Tackle', zh: '擒抱' },
  { id: 'blink', from: 'teleporter', kind: 'act', agent: 'A-ACT1', en: 'Blink', zh: '瞬移' },
  { id: 'roar', from: 'trex', kind: 'act', agent: 'A-ACT1', en: 'Roar', zh: '咆哮' },
  { id: 'throw', from: 'baby', kind: 'act', agent: 'A-ACT1', en: 'Throw', zh: '抓人扔' },
  { id: 'lasso', from: 'cowboy', kind: 'act', agent: 'A-ACT1', en: 'Lasso', zh: '套索' },
  { id: 'slide', from: 'walrus', kind: 'act', agent: 'A-ACT1', en: 'Belly slide', zh: '肚皮滑' },
  { id: 'stomp', from: 'longneck', kind: 'act', agent: 'A-ACT1', en: 'Stomp', zh: '跺地' },
  { id: 'sit', from: 'baby', kind: 'act', agent: 'A-ACT1', en: 'Sit', zh: '坐扁' },
  { id: 'swallow', from: 'snake', kind: 'act', agent: 'A-ACT1', en: 'Swallow', zh: '吞下' },
  // ---- act 2 (A-ACT2)
  { id: 'bomb', from: 'bombbot', kind: 'act', agent: 'A-ACT2', en: 'Self-destruct', zh: '自爆' },
  { id: 'magnet', from: 'magnetbot', kind: 'act', agent: 'A-ACT2', en: 'Magnet', zh: '磁铁' },
  { id: 'ink', from: 'octopus', kind: 'act', agent: 'A-ACT2', en: 'Ink', zh: '喷墨' },
  { id: 'stink', from: 'stinkbug', kind: 'act', agent: 'A-ACT2', en: 'Stink cloud', zh: '臭气' },
  { id: 'mind', from: 'mindalien', kind: 'act', agent: 'A-ACT2', en: 'Mind control', zh: '控心' },
  { id: 'grabfour', from: 'octopus', kind: 'act', agent: 'A-ACT2', en: 'Grab four', zh: '四手抓' },
  { id: 'drink', from: 'mosquito', kind: 'act', agent: 'A-ACT2', en: 'Drink blood', zh: '吸血' },
  { id: 'shock', from: 'eel', kind: 'act', agent: 'A-ACT2', en: 'Shock', zh: '放电' },
  { id: 'curse', from: 'mage', kind: 'act', agent: 'A-ACT2', en: 'Frog curse', zh: '变青蛙' },
  { id: 'smoke', from: 'ninja', kind: 'act', agent: 'A-ACT2', en: 'Smoke bomb', zh: '烟雾弹' },
  // ---- support + defence + death (A-SUPPORT)
  { id: 'rally', from: 'captain', kind: 'support', agent: 'A-SUPPORT', en: 'Rally', zh: '鼓舞' },
  { id: 'heal', from: 'repairbot', kind: 'support', agent: 'A-SUPPORT', en: 'Heal', zh: '治疗' },
  { id: 'dome', from: 'shieldbot', kind: 'support', agent: 'A-SUPPORT', en: 'Dome', zh: '护罩' },
  { id: 'scare', from: 'scarecrow', kind: 'support', agent: 'A-SUPPORT', en: 'Scare', zh: '吓跑' },
  { id: 'raise', from: 'necro', kind: 'support', agent: 'A-SUPPORT', en: 'Raise dead', zh: '复活死人' },
  { id: 'bees', from: 'beehive', kind: 'support', agent: 'A-SUPPORT', en: 'Bees', zh: '蜜蜂' },
  { id: 'crows', from: 'scarecrow', kind: 'support', agent: 'A-SUPPORT', en: 'Crows', zh: '乌鸦' },
  { id: 'armour', from: 'ankylo', kind: 'passive', agent: 'A-SUPPORT', en: 'Armour', zh: '盔甲' },
  { id: 'shield', from: 'shieldwall', kind: 'passive', agent: 'A-SUPPORT', en: 'Shield', zh: '盾牌' },
  { id: 'shell', from: 'turtle', kind: 'passive', agent: 'A-SUPPORT', en: 'Shell', zh: '龟壳' },
  { id: 'dodge', from: 'boxer', kind: 'passive', agent: 'A-SUPPORT', en: 'Dodge', zh: '闪避' },
  { id: 'spikes', from: 'puffer', kind: 'passive', agent: 'A-SUPPORT', en: 'Spikes', zh: '尖刺' },
  { id: 'split', from: 'kingslime', kind: 'death', agent: 'A-SUPPORT', en: 'Split', zh: '分裂' },
  { id: 'rebirth', from: 'phoenix', kind: 'death', agent: 'A-SUPPORT', en: 'Rebirth', zh: '重生' },
];

// Body choices, size / hp / speed steps, colours and hats (the maker's other rows).
export const BODY_IDS = ['person', 'animal', 'beast', 'giant'];
export const BODY_NAMES = { person: ['Person', '人'], animal: ['Animal', '动物'], beast: ['Beast', '巨兽'], giant: ['Giant', '巨人'] };
export const SIZES = [0.5, 0.75, 1, 1.5, 2.25];            // radius × this, mass × this²
export const HP_STEPS = [10, 25, 50, 100, 200, 400, 800, 1500, 3000, 6000];
export const SPEED_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3]; // × the body's walk / run speed
// Poster paint: bright enough to read on every ground, none of them grass green.
export const COLORS = ['#e3241a', '#ff8a12', '#ffd51e', '#9ac21f', '#0f9c8c', '#1f57d8', '#8d4fd6', '#e85a7a', '#8b5a2b', '#26222e', '#f4efe2', '#55606e'];
export const HATS = ['none', 'helmet', 'crown', 'pirate', 'cowboy', 'tophat', 'party', 'wizard', 'viking', 'chef', 'flower', 'cap'];
export const HAT_NAMES = {
  none: ['No hat', '不戴帽'], helmet: ['Helmet', '头盔'], crown: ['Crown', '王冠'], pirate: ['Pirate hat', '海盗帽'],
  cowboy: ['Cowboy hat', '牛仔帽'], tophat: ['Top hat', '礼帽'], party: ['Party hat', '派对帽'], wizard: ['Wizard hat', '巫师帽'],
  viking: ['Viking helmet', '维京头盔'], chef: ['Chef hat', '厨师帽'], flower: ['Flower', '小花'], cap: ['Cap', '鸭舌帽'],
};
export const MINE_MAX = 12;   // made units kept on the device
