// EN / 中文 strings, display names and report wording. Owner: UI.
// Working role names until the user picks names (PLAN step 7).
// Report card wording follows OG card templates (terrain-team-ui.md §4.3-4.4, game.js:7145-7513),
// rewritten in our words for both languages.

import { WEAPONS as MAKER_WEAPONS } from '../sim/maker/catalog.js';

const KEY = 'paint-battle:lang';
const listeners = new Set();

function loadLang() {
  try { const v = localStorage.getItem(KEY); if (v === 'en' || v === 'zh') return v; } catch (e) { /* storage blocked */ }
  try { if (/^zh/i.test(navigator.language || '')) return 'zh'; } catch (e) { /* no navigator */ }
  return 'en';
}
let lang = typeof window === 'undefined' ? 'en' : loadLang();

export function getLang() { return lang; }
/** save = false: a default (the site's language), not the player's pick, so it is not remembered. */
export function setLang(l, save = true) {
  if (l !== 'en' && l !== 'zh') return;
  lang = l;
  if (save) try { localStorage.setItem(KEY, l); } catch (e) { /* storage blocked */ }
  if (typeof document !== 'undefined') document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
  for (const fn of listeners) fn(l);
}
/** Has the player picked a language (EN / 中文 button) on this device? */
export function langPicked() { try { const v = localStorage.getItem(KEY); return v === 'en' || v === 'zh'; } catch (e) { return false; } }
export function toggleLang() { setLang(lang === 'en' ? 'zh' : 'en'); }
export function onLang(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// ---- display names: [EN, 中文, EN plural] ----
export const NAMES = {
  // army
  rifle: ['Rifleman', '步枪兵', 'Riflemen'],
  flamer: ['Flamer', '喷火兵', 'Flamers'],
  sniper: ['Sniper', '狙击手', 'Snipers'],
  legion: ['Legionary', '军团兵', 'Legionaries'],
  grenadier: ['Grenadier', '掷弹兵', 'Grenadiers'],
  archer: ['Archer', '弓箭手', 'Archers'],
  cavalry: ['Cavalry', '骑兵', 'Cavalry'],
  ninja: ['Ninja', '忍者', 'Ninjas'],
  // animals
  boar: ['Boar', '野猪', 'Boars'],
  rat: ['Rat', '老鼠', 'Rats'],
  ant: ['Ant', '蚂蚁', 'Ants'],
  ape: ['Ape', '猩猩', 'Apes'],
  gator: ['Gator', '鳄鱼', 'Gators'],
  piranha: ['Piranha', '食人鱼', 'Piranhas'],
  snake: ['Snake', '蛇', 'Snakes'],
  cheetah: ['Cheetah', '猎豹', 'Cheetahs'],
  // mythical
  zombie: ['Zombie', '僵尸', 'Zombies'],
  slime: ['Slime', '史莱姆', 'Slimes'],
  mage: ['Mage', '法师', 'Mages'],
  giant: ['Giant', '巨人', 'Giants'],
  dragon: ['Dragon', '龙', 'Dragons'],
  necro: ['Necromancer', '死灵法师', 'Necromancers'],
  // props
  barrel: ['Barrel', '油桶', 'Barrels'],
  tree: ['Tree', '树', 'Trees'],
  // spawned only
  knight: ['Knight', '骑士', 'Knights'],
  horse: ['Horse', '马', 'Horses'],
  apecav: ['Ape rider', '猩猩骑兵', 'Ape riders'],
  soldierant: ['Soldier ant', '兵蚁', 'Soldier ants'],
  anthill: ['Anthill', '蚁丘', 'Anthills'],
  frog: ['Frog', '青蛙', 'Frogs'],
  skeleton: ['Skeleton', '骷髅', 'Skeletons'],
  // dinosaurs (OURS, Part 2 step 4; working names until the name pick)
  raptor: ['Raptor', '迅猛龙', 'Raptors'],
  spitter: ['Spitter', '喷毒龙', 'Spitters'],
  trike: ['Triceratops', '三角龙', 'Triceratops'],
  stego: ['Stegosaurus', '剑龙', 'Stegosauruses'],
  ankylo: ['Ankylosaurus', '甲龙', 'Ankylosauruses'],
  ptero: ['Pterodactyl', '翼龙', 'Pterodactyls'],
  trex: ['T-Rex', '霸王龙', 'T-Rexes'],
  longneck: ['Long-neck', '长颈龙', 'Long-necks'],
  // siege
  shieldwall: ['Shield Wall', '盾墙兵', 'Shield Walls'],
  halberd: ['Halberd', '戟兵', 'Halberds'],
  crossbow: ['Crossbow', '弩兵', 'Crossbows'],
  ram: ['Ram', '攻城槌', 'Rams'],
  catapult: ['Catapult', '投石车', 'Catapults'],
  ballista: ['Ballista', '床弩', 'Ballistas'],
  oilpot: ['Oil Pot', '热油锅', 'Oil Pots'],
  siegetower: ['Siege Tower', '攻城塔', 'Siege Towers'],
  siegecrew: ['Siege crew', '攻城兵', 'Siege crew'], // STEP4 SIEGE: machine crew (spawned only)
  // pirates
  deckhand: ['Deckhand', '水手', 'Deckhands'],
  pistol: ['Pistol', '火枪海盗', 'Pistols'],
  blunderbuss: ['Blunderbuss', '喇叭枪手', 'Blunderbusses'],
  bomber: ['Bomb Thrower', '炸弹手', 'Bomb Throwers'],
  anchor: ['Anchor', '铁锚手', 'Anchors'],
  cannon: ['Cannon', '加农炮', 'Cannons'],
  captain: ['Captain', '船长', 'Captains'],
  ship: ['Ship', '海盗船', 'Ships'],
  gunner: ['Gunner', '炮手', 'Gunners'], // STEP4 PIRATES: cannon crew (spawned only)
  // OURS (Part 2 step 6, STEP6.md; working names until the name pick)
  // robots
  drone: ['Drone', '无人机', 'Drones'],
  laserbot: ['Laser Bot', '激光机器人', 'Laser Bots'],
  sawbot: ['Saw Bot', '电锯机器人', 'Saw Bots'],
  magnetbot: ['Magnet Bot', '磁铁机器人', 'Magnet Bots'],
  repairbot: ['Repair Bot', '维修机器人', 'Repair Bots'],
  shieldbot: ['Shield Bot', '护盾机器人', 'Shield Bots'],
  bombbot: ['Bomb Bot', '炸弹机器人', 'Bomb Bots'],
  mech: ['Mech', '机甲', 'Mechs'],
  // space
  alien: ['Alien', '外星人', 'Aliens'],
  jetpack: ['Jetpack', '喷气背包兵', 'Jetpacks'],
  shrinkray: ['Shrink Ray', '缩小枪外星人', 'Shrink Rays'],
  gravity: ['Gravity Alien', '重力外星人', 'Gravity Aliens'],
  teleporter: ['Teleporter', '瞬移外星人', 'Teleporters'],
  mindalien: ['Mind Alien', '心灵外星人', 'Mind Aliens'],
  ufo: ['UFO', '飞碟', 'UFOs'],
  astronaut: ['Astronaut', '宇航员', 'Astronauts'],
  // ocean
  crab: ['Crab', '螃蟹', 'Crabs'],
  shark: ['Shark', '鲨鱼', 'Sharks'],
  octopus: ['Octopus', '章鱼', 'Octopuses'],
  puffer: ['Pufferfish', '河豚', 'Pufferfish'],
  eel: ['Eel', '电鳗', 'Eels'],
  turtle: ['Turtle', '海龟', 'Turtles'],
  walrus: ['Walrus', '海象', 'Walruses'],
  swordfish: ['Swordfish', '剑鱼', 'Swordfish'],
  // sports
  tackler: ['Tackler', '擒抱手', 'Tacklers'],
  batter: ['Batter', '击球手', 'Batters'],
  pitcher: ['Pitcher', '投手', 'Pitchers'],
  bowler: ['Bowler', '保龄球手', 'Bowlers'],
  hockey: ['Hockey Player', '冰球手', 'Hockey Players'],
  sumo: ['Sumo', '相扑手', 'Sumos'],
  boxer: ['Boxer', '拳击手', 'Boxers'],
  cheerleader: ['Cheerleader', '啦啦队员', 'Cheerleaders'],
  // bugs
  bee: ['Bee', '蜜蜂', 'Bees'],
  beehive: ['Beehive', '蜂巢', 'Beehives'],
  spider: ['Spider', '蜘蛛', 'Spiders'],
  beetle: ['Beetle', '甲虫', 'Beetles'],
  mantis: ['Mantis', '螳螂', 'Mantises'],
  bombardier: ['Bombardier', '放屁虫', 'Bombardiers'],
  mosquito: ['Mosquito', '蚊子', 'Mosquitoes'],
  stinkbug: ['Stink Bug', '臭虫', 'Stink Bugs'],
  // bosses
  kraken: ['Kraken', '克拉肯', 'Krakens'],
  gmech: ['Giant Mech', '巨型机甲', 'Giant Mechs'],
  hydra: ['Hydra', '九头蛇', 'Hydras'],
  lavagolem: ['Lava Golem', '熔岩巨人', 'Lava Golems'],
  worm: ['Giant Worm', '巨型沙虫', 'Giant Worms'],
  kingslime: ['King Slime', '史莱姆王', 'King Slimes'],
  bigslime: ['Big slime', '大史莱姆', 'Big slimes'],  // spawned only (king slime split)
  slimelet: ['Small slime', '小史莱姆', 'Small slimes'],  // spawned only (king slime split)
  // secret (STEP7: one per map, locked until found)
  ghost: ['Ghost', '幽灵', 'Ghosts'],
  seagull: ['Seagull', '海鸥', 'Seagulls'],
  yeti: ['Yeti', '雪怪', 'Yetis'],
  cowboy: ['Cowboy', '牛仔', 'Cowboys'],
  scarecrow: ['Scarecrow', '稻草人', 'Scarecrows'],
  phoenix: ['Phoenix', '凤凰', 'Phoenixes'],
  bogmonster: ['Bog Monster', '沼泽怪', 'Bog Monsters'],
  baby: ['Baby', '巨婴', 'Babies'],
  crow: ['Crow', '乌鸦', 'Crows'],  // spawned only (scarecrow)
  // terrain tools
  wall: ['Wall', '墙', 'Walls'],
  water: ['Water', '水', 'Water'],
  ice: ['Ice', '冰', 'Ice'],
  mine: ['Mines', '地雷', 'Mines'],
  peel: ['Banana peel', '香蕉皮', 'Banana peels'],
  lava: ['Lava', '岩浆', 'Lava'],
  mud: ['Mud', '泥巴', 'Mud'],
  bridge: ['Bridge', '桥', 'Bridges'],
  tramp: ['Trampoline', '蹦床', 'Trampolines'],
};

const LI = () => (lang === 'zh' ? 1 : 0);

// ---- made units (Part 2 step 8, STEP8.md): 'mine_<id>' = the recipe's name, or its weapon's catalogue name when the
// player left the name empty. main.js hands us the maker's recipeOf (setMadeLookup); the weapon names come from the
// catalogue (pure data). A made type with no recipe (deleted) reads as the tab word.
const W_NAME = new Map(MAKER_WEAPONS.map((r) => [r.id, r]));
let madeOf = null;
export function setMadeLookup(fn) { madeOf = typeof fn === 'function' ? fn : null; }
export const isMadeType = (type) => typeof type === 'string' && type.startsWith('mine_');
// a made unit the player gave a name (kept as typed inside sentences; an unnamed one reads as its weapon, in lower case)
const named = (type) => { const r = isMadeType(type) && madeOf ? madeOf(type) : null; return !!(r && r.name); };
export function weaponName(id) { const r = W_NAME.get(id); return r ? (lang === 'zh' ? r.zh : r.en) : ''; }
function madeName(type) {
  const r = madeOf ? madeOf(type) : null;
  if (!r) return t('tab_mine');
  return r.name || weaponName(r.weapon) || t('tab_mine');
}

export function unitName(type) {
  if (!type) return '';
  if (NAMES[type]) return NAMES[type][LI()];
  if (isMadeType(type)) return madeName(type);
  // risen copies: risen_<type> → "Zombie <name>" (OG zombie variants, units-mythical)
  if (type.startsWith('risen_')) { const base = unitName(type.slice(6)); return lang === 'zh' ? `僵尸${base}` : `Zombie ${named(type.slice(6)) ? base : base.toLowerCase()}`; } // STEP8 UI: a made unit's name keeps its capitals
  // skeleton copies: skeleton_<type> → "Skeleton <name>" (OG count chip game.js:5697-5704)
  if (type.startsWith('skeleton_')) { const base = unitName(type.slice(9)); return lang === 'zh' ? `骷髅${base}` : `Skeleton ${named(type.slice(9)) ? base : base.toLowerCase()}`; }
  return type;
}
function unitPlural(type) {
  if (NAMES[type]) return lang === 'zh' ? NAMES[type][1] : NAMES[type][2];
  if (named(type)) return unitName(type);   // STEP8 UI: a made unit's name as the player typed it
  return lang === 'zh' ? unitName(type) : unitName(type) + 's';
}

// ---- UI words ----
const S = {
  en: {
    tab_army: 'Army', tab_animals: 'Animals', tab_mythical: 'Mythical', tab_terrain: 'Terrain', tab_dinos: 'Dinosaurs', tab_siege: 'Siege', tab_pirates: 'Pirates',
    tab_robots: 'Robots', tab_space: 'Space', tab_ocean: 'Ocean', tab_sports: 'Sports', tab_bugs: 'Bugs', tab_bosses: 'Bosses', tab_secret: 'Secret',
    maps: 'Maps', map_blank: 'Blank', map_castle: 'Castle', map_beach: 'Beach', map_lake: 'Frozen Lake', map_canyon: 'Canyon', map_village: 'Village', map_volcano: 'Volcano', map_swamp: 'Swamp', map_playground: 'Playground', found: 'Found: {name}!',
    locked: 'Locked', // STEP7 UI: a Secret card not found yet (screen-reader label)
    // STEP8 UI: the Mine tab + the unit maker (button words; the rest are screen-reader / tooltip labels)
    // STEP10 LEAD (share codes, ui/share.js)
    share: 'Share', sh_copy: 'Copy battle', sh_copied: 'Copied!', sh_units: 'Copy a unit', sh_paste: 'Paste a code here', sh_load: 'Load',
    sh_box: 'Copy this code:', sh_broken: "That code doesn't work", sh_new: 'That code needs a newer game', sh_none: 'No code in there',
    sh_full: 'Mine is full: delete a made unit first', sh_added: 'Added to Mine: {name}', sh_unit_copied: 'Copied: {name}', sh_empty: 'Nothing on the field to copy',
    tab_mine: 'Mine', make_new: 'Make a unit', edit: 'Edit', maker: 'Unit maker', save: 'Save', del: 'Delete', del_sure: 'Delete it?',
    m_name: 'Name', m_body: 'Body', m_size: 'Size', m_hp: 'Health', m_speed: 'Speed', m_weapon: 'Weapon', m_ability: 'Ability', m_colour: 'Colour', m_hat: 'Hat', m_none: 'No ability', back: 'Back',
    // STEP9 UI: the campaign (button words + result titles; the rest are screen-reader / tooltip labels). Worlds = tab_* words.
    campaign: 'Campaign', c_leave: 'Leave the battle', c_retry: 'Retry', c_next: 'Next', c_battles: 'Battles', c_win: 'You win!', c_lose: 'You lose', c_time: "Time's up!",
    c_battle: 'Battle {n}', c_stars: '{n} of {m} stars', c_paint: 'Paint spent',
    paused: 'Paused', clear: 'Clear', pause: 'Pause', play: 'Play', sound: 'Sound', lang: '中文', lang_title: 'Language', slow: 'Slow motion', follow: 'Follow a unit', leave: 'Leave',
    teams: 'Team battle', start: 'Start', red: 'Red team', blue: 'Blue team',
    win_left: 'Red team wins!', win_right: 'Blue team wins!', win_draw: "It's a draw!",
    again: 'New battle', stats: 'Stats', more: '+{n} more', less: 'Show less', close: 'Close',
    standing: 'Units standing', winner: 'Winner', total: 'Total',
    title_win: '{team} wins', title_draw: "It's a draw", title_report: 'Battle report', sub: '{outcome} in {time}',
    o_decisive: 'Decisive victory', o_victory: 'Victory', o_pyrrhic: 'Pyrrhic victory', o_mutual: 'Mutual destruction', o_ongoing: 'Ongoing',
  },
  zh: {
    tab_army: '军队', tab_animals: '动物', tab_mythical: '神话', tab_terrain: '地形', tab_dinos: '恐龙', tab_siege: '攻城', tab_pirates: '海盗',
    tab_robots: '机器人', tab_space: '太空', tab_ocean: '海洋', tab_sports: '体育', tab_bugs: '虫子', tab_bosses: '首领', tab_secret: '秘密',
    maps: '地图', map_blank: '空白', map_castle: '城堡', map_beach: '海滩', map_lake: '冰湖', map_canyon: '峡谷', map_village: '村庄', map_volcano: '火山', map_swamp: '沼泽', map_playground: '游乐场', found: '找到了：{name}！',
    locked: '未解锁', // STEP7 UI: a Secret card not found yet (screen-reader label)
    // STEP10 LEAD (share codes, ui/share.js)
    share: '分享', sh_copy: '复制战斗', sh_copied: '已复制！', sh_units: '复制单位', sh_paste: '在这里粘贴代码', sh_load: '载入',
    sh_box: '复制这个代码：', sh_broken: '这个代码用不了', sh_new: '这个代码要新版游戏', sh_none: '里面没有代码',
    sh_full: '“我的”满了：先删一个单位', sh_added: '已加入“我的”：{name}', sh_unit_copied: '已复制：{name}', sh_empty: '场上没有可复制的东西',
    tab_mine: '我的', make_new: '做个新单位', edit: '编辑', maker: '单位工坊', save: '保存', del: '删除', del_sure: '真的删除？',
    m_name: '名字', m_body: '身体', m_size: '大小', m_hp: '生命', m_speed: '速度', m_weapon: '武器', m_ability: '技能', m_colour: '颜色', m_hat: '帽子', m_none: '不要技能', back: '返回',
    campaign: '战役', c_leave: '离开战斗', c_retry: '重来', c_next: '下一关', c_battles: '关卡', c_win: '胜利！', c_lose: '失败', c_time: '时间到！', // STEP9 UI
    c_battle: '第{n}关', c_stars: '{n}/{m}颗星', c_paint: '已用颜料',
    paused: '已暂停', clear: '清空', pause: '暂停', play: '继续', sound: '声音', lang: 'EN', lang_title: '语言', slow: '慢动作', follow: '跟随单位', leave: '离开',
    teams: '团队对战', start: '开始', red: '红队', blue: '蓝队',
    win_left: '红队胜利！', win_right: '蓝队胜利！', win_draw: '平局！',
    again: '再来一局', stats: '战报', more: '还有{n}种', less: '收起', close: '关闭',
    standing: '存活单位', winner: '胜者', total: '合计',
    title_win: '{team}胜利', title_draw: '平局', title_report: '战报', sub: '{time}，{outcome}',
    o_decisive: '大胜', o_victory: '胜利', o_pyrrhic: '惨胜', o_mutual: '同归于尽', o_ongoing: '进行中',
  },
};

export function t(key, vars) {
  let s = (S[lang] && S[lang][key]) ?? S.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return s;
}

// ---- report helpers (OG game.js:7145-7199, 7890-7911) ----
const TEAM_WORD = { en: ['red', 'blue'], zh: ['红队', '蓝队'] };
export function teamName(i) { return t(i === 0 ? 'red' : 'blue'); }

export function clock(sec) { // OG game.js:7161-7166
  if (lang === 'zh') {
    if (sec < 60) return `${Math.round(sec)}秒`;
    return `${Math.floor(sec / 60)}分${String(Math.round(sec % 60)).padStart(2, '0')}秒`;
  }
  if (sec < 60) return `${Math.round(sec)}s`;
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}
export function chartClock(sec) { // chart axis ticks keep the short form in both languages
  if (sec < 60) return `${Math.round(sec)}s`;
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}
export function inWords(sec) { // OG game.js:7897-7911
  const s = Math.max(1, Math.round(sec)), m = Math.floor(s / 60), r = s % 60;
  if (lang === 'zh') return m === 0 ? `${r}秒` : r === 0 ? `${m}分钟` : `${m}分${r}秒`;
  const w = (n, u) => `${n} ${u}${n === 1 ? '' : 's'}`;
  return m === 0 ? w(r, 'second') : r === 0 ? w(m, 'minute') : `${w(m, 'minute')} ${w(r, 'second')}`;
}
const avg = x => String(Math.round(10 * x) / 10); // OG game.js:7167-7169

// Outcome: accepts our ids or OG's English words.
const OUTCOME_IDS = { 'Decisive victory': 'decisive', Victory: 'victory', 'Pyrrhic victory': 'pyrrhic', 'Mutual destruction': 'mutual', Ongoing: 'ongoing' };
export function outcomeText(o) { const id = OUTCOME_IDS[o] || o || 'ongoing'; return t('o_' + id); }

export function reportTitle(summary) { // OG page-ui.js:127-139
  const w = summary.result === 'left' ? 0 : summary.result === 'right' ? 1 : -1;
  if (w >= 0) return t('title_win', { team: teamName(w) });
  return summary.result === 'draw' ? t('title_draw') : t('title_report');
}
export function reportSub(summary) { // OG page-ui.js:146-148
  return t('sub', { outcome: outcomeText(summary.outcome), time: inWords(summary.duration || 0) });
}

// a unit's name inside a sentence: lower case ("a red rifleman"), a made unit's name as the player typed it (STEP8 UI)
const low = (type) => (named(type) ? unitName(type) : unitName(type).toLowerCase());
const lowPlural = (type) => (named(type) ? unitPlural(type) : unitPlural(type).toLowerCase());
// "a red rifleman" (OG game.js:7149-7160)
function aUnit(team, type, cap) {
  if (lang === 'zh') return `${TEAM_WORD.zh[team] ?? ''}${unitName(type)}`;
  const s = `a ${TEAM_WORD.en[team] ?? ''} ${low(type)}`;
  return cap ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
const capFirst = s => s.charAt(0).toUpperCase() + s.slice(1);

// cause words (OG game.js:7184-7199)
const VERB_KILL = { en: { blast: 'blew up', eaten: 'swallowed', fire: 'burned', turned: 'turned' }, zh: { blast: '炸飞了', eaten: '吞掉了', fire: '烧死了', turned: '感染了' } };
const VERB_DIED = { en: { blast: 'was blown up', fire: 'burned', plague: 'died of plague', thrown: 'was flung to its death', turned: 'turned' }, zh: { blast: '被炸飞', fire: '被烧死', plague: '死于瘟疫', thrown: '被摔死', turned: '被感染' } };
const CAUSE_N = { en: { blast: 'blown up', fire: 'burned', plague: 'died of plague', thrown: 'flung to their deaths', eaten: 'swallowed whole', turned: 'turned' }, zh: { blast: '被炸飞', fire: '被烧死', plague: '死于瘟疫', thrown: '被摔死', eaten: '被吞下', turned: '被感染' } };

const LABELS = {
  en: { deadliest: 'Deadliest', first: 'First blood', mvp: 'MVP', multi: 'Multi-kill', friendly: 'Friendly fire', giant: 'Giant slayer', causes: 'How they fell', moment: 'Bloodiest moment', underdog: 'Underdog', comeback: 'Comeback', close: 'Close call', flawless: 'Flawless', rout: 'Rout', stand: 'Last stand', wipeout: 'Wipeout' },
  zh: { deadliest: '最致命', first: '第一滴血', mvp: 'MVP', multi: '一击多杀', friendly: '误伤', giant: '屠巨者', causes: '死因', moment: '最惨烈时刻', underdog: '以少胜多', comeback: '逆转', close: '险胜', flawless: '完胜', rout: '碾压', stand: '最后坚守', wipeout: '同归于尽' },
};
const LABEL_ID = Object.fromEntries(Object.entries(LABELS.en).map(([id, l]) => [l, id]));
// Cards from TERRAIN's report.js carry {kind, label, text, data}; without our {id, ...args} the EN text is shown.
export function cardLabel(h) { const id = h.id ?? LABEL_ID[h.label]; return (LABELS[lang][id] ?? h.label ?? id ?? ''); }

// A highlight card: {id, kind, icon, team, ...args} (args per card below). Falls back to h.text.
export function cardText(h) {
  const zh = lang === 'zh', a = h;
  switch (h.id) {
    case 'deadliest': return zh ? `${TEAM_WORD.zh[a.team]}每个${unitName(a.type)}平均击倒${avg(a.rate)}个` : `Each ${TEAM_WORD.en[a.team]} ${low(a.type)} took out ${avg(a.rate)} on average`;
    case 'first':
      if (a.killerType && a.killerTeam >= 0) {
        const v = VERB_KILL[lang][a.cause] ?? (zh ? '击倒了' : 'took down');
        return zh ? `${aUnit(a.killerTeam, a.killerType)}在${clock(a.t)}时${v}${aUnit(a.victimTeam, a.victimType)}` : `${aUnit(a.killerTeam, a.killerType, true)} ${v} ${aUnit(a.victimTeam, a.victimType)} ${clock(a.t)} in`;
      } else {
        const v = VERB_DIED[lang][a.cause] ?? (zh ? '倒下' : 'fell');
        return zh ? `${aUnit(a.victimTeam, a.victimType)}最先${v}，${clock(a.t)}` : `${aUnit(a.victimTeam, a.victimType, true)} ${v} first, ${clock(a.t)} in`;
      }
    case 'mvp': return zh ? `${aUnit(a.team, a.type)}击倒了${a.n}个${a.m >= 3 ? `，其中${a.m}个死于一次爆炸` : ''}` : `${aUnit(a.team, a.type, true)} took down ${a.n}${a.m >= 3 ? `, ${a.m} of them in one blast` : ''}`;
    case 'multi': return zh ? `${aUnit(a.team, a.type)}一次爆炸击倒${a.m}个` : `${aUnit(a.team, a.type, true)} took out ${a.m} in one blast`;
    case 'friendly':
      if (a.n === 1) return zh ? `${aUnit(a.team, a.type)}误伤了一个自己人` : `${aUnit(a.team, a.type, true)} took out one of its own`;
      return zh ? `${TEAM_WORD.zh[a.team]}${unitName(a.type)}误伤了${a.n}个自己人` : `${capFirst(TEAM_WORD.en[a.team])} ${lowPlural(a.type)} took out ${a.n} of their own`;
    case 'giant': return zh ? `${aUnit(a.team, a.type)}放倒了${aUnit(a.victimTeam, a.victimType)}` : `${aUnit(a.team, a.type, true)} brought down ${aUnit(a.victimTeam, a.victimType)}`;
    case 'causes': {
      const parts = (a.counts || []).map(([c, n]) => zh ? `${n}个${CAUSE_N.zh[c] ?? c}` : `${n} ${CAUSE_N.en[c] ?? c}`);
      const s = parts.join(zh ? '，' : ', ');
      return zh ? s : capFirst(s);
    }
    case 'moment': return zh ? `${clock(a.t)}时，3秒内倒下${a.n}个` : `${a.n} fell in 3 seconds, ${clock(a.t)} in`;
    case 'underdog': { // OG game.js:7414-7434: loser count to winner count
      const r = a.theirs / a.mine, k = r >= 1.95;
      return zh ? `${teamName(a.team)}以${k ? `${Math.round(r)}比1` : `${a.theirs}比${a.mine}`}的人数劣势获胜` : `${teamName(a.team)} won despite being outnumbered ${k ? `${Math.round(r)} to 1` : `${a.theirs} to ${a.mine}`}`;
    }
    case 'comeback': { // OG game.js:7435-7448
      const r = a.theirs / a.mine, k = r >= 1.95;
      if (zh) return `${teamName(a.team)}在${clock(a.t)}时${k ? `以${Math.round(r)}比1被围` : `以${a.mine}比${a.theirs}落后`}，仍然获胜`;
      return `${teamName(a.team)} was ${k ? `outnumbered ${Math.round(r)} to 1` : `down ${a.mine} to ${a.theirs}`} at ${clock(a.t)}, and still won`;
    }
    case 'close': return zh ? `${teamName(a.team)}只剩${a.s}个仍然获胜` : `${teamName(a.team)} won with just ${a.s} left standing`;
    case 'flawless': return zh ? `${teamName(a.team)}一个没损失就赢了` : `${teamName(a.team)} won without losing a single unit`;
    case 'rout': return zh ? `${teamName(a.team)}${a.total}个里只损失了${a.lost}个` : `${teamName(a.team)} lost just ${a.lost} of ${a.total}`;
    case 'stand': return zh ? `最后一个${TEAM_WORD.zh[a.team]}${unitName(a.type)}独自坚持了${Math.round(a.f)}秒` : `The last ${TEAM_WORD.en[a.team]} ${low(a.type)} held out alone for ${Math.round(a.f)}s`;
    case 'wipeout': return zh ? '两队同归于尽' : 'The two teams wiped each other out';
    default: return h.text ?? '';
  }
}

export const STRINGS = S; // for tests
