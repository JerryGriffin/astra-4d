/* ============================================================
   ASTRA·4D — 1. data：资源 / 精炼 / 合成 / 蓝图（数值参照 Astroneer Wiki）
   ============================================================ */
(function (A) {
'use strict';

// ---------------- 物品总表 ----------------
// cat: raw 天然 | refined 精炼 | composite 复合 | gas 大气 | special 特殊
// bytes: 研究舱可换取的字节
const ITEMS = {
  // —— 天然非金属（全行星） ——
  organic:   { name: '有机物', en: 'Organic',   cat: 'raw', color: 0x9bbf5e, bytes: 20, shape: 'drop' },
  compound:  { name: '化合物', en: 'Compound',  cat: 'raw', color: 0xe8c98f, bytes: 25, shape: 'icosa' },
  resin:     { name: '树脂',   en: 'Resin',     cat: 'raw', color: 0xe08b3c, bytes: 25, shape: 'drop' },
  clay:      { name: '粘土',   en: 'Clay',      cat: 'raw', color: 0xb48a6a, bytes: 20, shape: 'icosa0' },
  quartz:    { name: '石英',   en: 'Quartz',    cat: 'raw', color: 0xdcd6ee, bytes: 40, shape: 'prism' },
  ammonium:  { name: '铵',     en: 'Ammonium',  cat: 'raw', color: 0xd9d24a, bytes: 40, shape: 'dodeca' },
  graphite:  { name: '石墨',   en: 'Graphite',  cat: 'raw', color: 0x5c5a62, bytes: 40, shape: 'dodeca' },
  // —— 天然金属矿（按行星分布） ——
  laterite:   { name: '红土',     en: 'Laterite',   cat: 'raw', color: 0xb4553c, bytes: 30, shape: 'icosa0' },
  sphalerite: { name: '闪锌矿',   en: 'Sphalerite', cat: 'raw', color: 0x93a58c, bytes: 40, shape: 'icosa' },
  wolframite: { name: '钨锰铁矿', en: 'Wolframite', cat: 'raw', color: 0x6d6a7a, bytes: 50, shape: 'dodeca' },
  malachite:  { name: '孔雀石',   en: 'Malachite',  cat: 'raw', color: 0x3fa887, bytes: 40, shape: 'icosa0' },
  lithium:    { name: '锂',       en: 'Lithium',    cat: 'raw', color: 0xcfd8e6, bytes: 60, shape: 'prism' },
  hematite:   { name: '赤铁矿',   en: 'Hematite',   cat: 'raw', color: 0xa34a3f, bytes: 50, shape: 'dodeca' },
  titanite:   { name: '榍石',     en: 'Titanite',   cat: 'raw', color: 0x8f7fb5, bytes: 60, shape: 'prism' },
  astronium:  { name: '星辉矿',   en: 'Astronium',  cat: 'raw', color: 0x8d63d6, bytes: 500, shape: 'prism', glow: 1 },
  // —— 精炼 ——
  carbon:    { name: '碳',   en: 'Carbon',    cat: 'refined', color: 0x3f3f46, bytes: 60 },
  ceramic:   { name: '陶瓷', en: 'Ceramic',   cat: 'refined', color: 0xc96f52, bytes: 60 },
  glass:     { name: '玻璃', en: 'Glass',     cat: 'refined', color: 0xa9d8e8, bytes: 80 },
  aluminum:  { name: '铝',   en: 'Aluminum',  cat: 'refined', color: 0xc8ccd2, bytes: 60 },
  zinc:      { name: '锌',   en: 'Zinc',      cat: 'refined', color: 0xa8b4be, bytes: 80 },
  copper:    { name: '铜',   en: 'Copper',    cat: 'refined', color: 0xc47a4a, bytes: 80 },
  tungsten:  { name: '钨',   en: 'Tungsten',  cat: 'refined', color: 0x7d7f8c, bytes: 100 },
  iron:      { name: '铁',   en: 'Iron',      cat: 'refined', color: 0x8e8b86, bytes: 100 },
  titanium:  { name: '钛',   en: 'Titanium',  cat: 'refined', color: 0xb6bcc4, bytes: 120 },
  // —— 复合 ——
  rubber:      { name: '橡胶',     en: 'Rubber',           cat: 'composite', color: 0x4a4d55, bytes: 120 },
  plastic:     { name: '塑料',     en: 'Plastic',          cat: 'composite', color: 0xd8e0e6, bytes: 120 },
  aluminum_alloy: { name: '铝合金', en: 'Aluminum Alloy',  cat: 'composite', color: 0xb9c2cc, bytes: 160 },
  tungsten_carbide: { name: '钨碳化物', en: 'Tungsten Carbide', cat: 'composite', color: 0x6a6d78, bytes: 200 },
  silicone:    { name: '硅酮',     en: 'Silicone',         cat: 'composite', color: 0x6f7f8f, bytes: 200 },
  steel:       { name: '钢',       en: 'Steel',            cat: 'composite', color: 0x7a828c, bytes: 240 },
  explosive:   { name: '爆炸粉末', en: 'Explosive Powder', cat: 'composite', color: 0xb03a3a, bytes: 240 },
  graphene:    { name: '石墨烯',   en: 'Graphene',         cat: 'composite', color: 0x45484f, bytes: 280 },
  titanium_alloy: { name: '钛合金', en: 'Titanium Alloy',  cat: 'composite', color: 0xa7b3bf, bytes: 300 },
  diamond:     { name: '钻石',     en: 'Diamond',          cat: 'composite', color: 0xbfe6f2, bytes: 400 },
  hydrazine:   { name: '联氨',     en: 'Hydrazine',        cat: 'composite', color: 0xd05ac0, bytes: 320 },
  nanocarbon:  { name: '纳米碳合金', en: 'Nanocarbon Alloy', cat: 'composite', color: 0x33363c, bytes: 600 },
  // —— 大气 ——
  hydrogen: { name: '氢气', en: 'Hydrogen', cat: 'gas', color: 0xbfe0ff, bytes: 100 },
  nitrogen: { name: '氮气', en: 'Nitrogen', cat: 'gas', color: 0xa7c4e8, bytes: 100 },
  argon:    { name: '氩气', en: 'Argon',    cat: 'gas', color: 0xc8b8f0, bytes: 120 },
  methane:  { name: '甲烷', en: 'Methane',  cat: 'gas', color: 0x9fd8a8, bytes: 120 },
  sulfur:   { name: '硫磺', en: 'Sulfur',   cat: 'gas', color: 0xe8d05a, bytes: 120 },
  helium:   { name: '氦气', en: 'Helium',   cat: 'gas', color: 0xf0c0d8, bytes: 160 },
  // —— 粉碎链（GregTech 0.6.0）：碎矿与副产粉 ——
  cr_laterite:   { name: '粉碎红土',   en: 'Crushed Laterite',   cat: 'dust', color: 0x7a3626, bytes: 0 },
  cr_sphalerite: { name: '粉碎闪锌矿', en: 'Crushed Sphalerite', cat: 'dust', color: 0x64705f, bytes: 0 },
  cr_wolframite: { name: '粉碎钨锰矿', en: 'Crushed Wolframite', cat: 'dust', color: 0x494753, bytes: 0 },
  cr_malachite:  { name: '粉碎孔雀石', en: 'Crushed Malachite',  cat: 'dust', color: 0x2a7a62, bytes: 0 },
  cr_hematite:   { name: '粉碎赤铁矿', en: 'Crushed Hematite',   cat: 'dust', color: 0x73332b, bytes: 0 },
  cr_titanite:   { name: '粉碎榍石',   en: 'Crushed Titanite',   cat: 'dust', color: 0x665a84, bytes: 0 },
  magnesium_dust: { name: '镁粉',   en: 'Magnesium Dust', cat: 'dust', color: 0xc9cbb4, bytes: 150 },
  nickel_dust:    { name: '镍粉',   en: 'Nickel Dust',    cat: 'dust', color: 0xb8bcc0, bytes: 150 },
  cobalt_dust:    { name: '钴粉',   en: 'Cobalt Dust',    cat: 'dust', color: 0x5a6a9a, bytes: 150 },
  manganese_dust: { name: '锰粉',   en: 'Manganese Dust', cat: 'dust', color: 0x9a8a96, bytes: 150 },
  gallium_dust:   { name: '镓粉',   en: 'Gallium Dust',   cat: 'dust', color: 0x9ab8d8, bytes: 150 },
  rare_earth_dust:{ name: '稀土粉', en: 'Rare Earth Dust', cat: 'dust', color: 0xc9a48a, bytes: 200 },
  // —— 洗矿链（GregTech 0.7.0）：纯净矿 ——
  pu_laterite:   { name: '纯净红土',   en: 'Purified Laterite',   cat: 'dust', color: 0x9c4a37, bytes: 0 },
  pu_sphalerite: { name: '纯净闪锌矿', en: 'Purified Sphalerite', cat: 'dust', color: 0x83927c, bytes: 0 },
  pu_wolframite: { name: '纯净钨锰矿', en: 'Purified Wolframite', cat: 'dust', color: 0x60606f, bytes: 0 },
  pu_malachite:  { name: '纯净孔雀石', en: 'Purified Malachite',  cat: 'dust', color: 0x45c4a0, bytes: 0 },
  pu_hematite:   { name: '纯净赤铁矿', en: 'Purified Hematite',   cat: 'dust', color: 0xbf5a48, bytes: 0 },
  pu_titanite:   { name: '纯净榍石',   en: 'Purified Titanite',   cat: 'dust', color: 0x9a86c8, bytes: 0 },
  // —— 合金与电子（0.7.0）：稀有粉与电路板的下游 ——
  magnalium:        { name: '镁铝合金',   en: 'Magnalium',         cat: 'composite', color: 0xb2bcc6, bytes: 340 },
  nickel_steel:     { name: '镍钢',       en: 'Nickel Steel',      cat: 'composite', color: 0x8c949e, bytes: 380 },
  mangalloy:        { name: '锰钢',       en: 'Mangalloy',         cat: 'composite', color: 0x7f828a, bytes: 360 },
  hardmetal:        { name: '硬质合金',   en: 'Hardmetal',         cat: 'composite', color: 0x5c626d, bytes: 420 },
  circuit:          { name: '电路板',     en: 'Circuit Board',     cat: 'composite', color: 0x3f8f6a, bytes: 260 },
  advanced_circuit: { name: '进阶电路板', en: 'Advanced Circuit',  cat: 'composite', color: 0x6fd0a0, bytes: 520 },
  magnet:           { name: '稀土磁体',   en: 'Rare Earth Magnet', cat: 'composite', color: 0x9a5fa8, bytes: 380 },
  // —— 工具 / 特殊 ——
  soil:     { name: '土壤',   en: 'Soil',    cat: 'special', color: 0xa9805c, bytes: 0 },
  scrap:    { name: '金属碎料', en: 'Scrap', cat: 'special', color: 0x9aa0a6, bytes: 45 },
  tether:   { name: '系绳桩', en: 'Tether',  cat: 'special', color: 0x9be8ff, bytes: 0 },
  beacon:   { name: '信标',   en: 'Beacon',  cat: 'special', color: 0xffd166, bytes: 0 },
  canister: { name: '罐',     en: 'Canister', cat: 'special', color: 0x8fe0b0, bytes: 0 }
};
A.ITEMS = ITEMS;
A.item = (id) => ITEMS[id] || { name: id, cat: 'raw', color: 0xcccccc, bytes: 0 };
A.itemColor = (id) => '#' + A.item(id).color.toString(16).padStart(6, '0');

// ---------------- 熔炉：天然/碎矿 → 精炼 ----------------
A.SMELT = {
  laterite: 'aluminum', sphalerite: 'zinc', malachite: 'copper',
  wolframite: 'tungsten', hematite: 'iron', titanite: 'titanium',
  quartz: 'glass', clay: 'ceramic', organic: 'carbon',
  // 碎矿 1:1 熔炼（破碎机 2 矿→3 碎矿，净赚 50%）
  cr_laterite: 'aluminum', cr_sphalerite: 'zinc', cr_malachite: 'copper',
  cr_wolframite: 'tungsten', cr_hematite: 'iron', cr_titanite: 'titanium',
  // 纯净矿 1:1 熔炼（洗矿机 3 碎矿→4 纯净矿，全链每矿约 2 份金属）
  pu_laterite: 'aluminum', pu_sphalerite: 'zinc', pu_malachite: 'copper',
  pu_wolframite: 'tungsten', pu_hematite: 'iron', pu_titanite: 'titanium'
};

// ---------------- 破碎机（GregTech 0.6.0）：2 矿 → 3 碎矿 + 副产粉 ----------------
A.CRUSH = {
  laterite:   { cr: 'cr_laterite',   by: 'magnesium_dust' },
  sphalerite: { cr: 'cr_sphalerite', by: 'gallium_dust' },
  malachite:  { cr: 'cr_malachite',  by: 'cobalt_dust' },
  wolframite: { cr: 'cr_wolframite', by: 'manganese_dust' },
  hematite:   { cr: 'cr_hematite',   by: 'nickel_dust' },
  titanite:   { cr: 'cr_titanite',   by: 'rare_earth_dust' }
};
A.CRUSH_BY_CHANCE = 0.35;   // 每次粉碎（2 矿）副产概率 ≈ 每矿 15%

// ---------------- 洗矿机（GregTech 0.7.0）：3 碎矿 + 1 化合物 → 4 纯净矿 ----------------
A.WASH = {
  cr_laterite:   { pu: 'pu_laterite',   by: 'magnesium_dust' },
  cr_sphalerite: { pu: 'pu_sphalerite', by: 'gallium_dust' },
  cr_malachite:  { pu: 'pu_malachite',  by: 'cobalt_dust' },
  cr_wolframite: { pu: 'pu_wolframite', by: 'manganese_dust' },
  cr_hematite:   { pu: 'pu_hematite',   by: 'nickel_dust' },
  cr_titanite:   { pu: 'pu_titanite',   by: 'rare_earth_dust' }
};
A.WASH_COMPOUND = 1;        // 每批洗涤消耗的化合物
A.WASH_BY_CHANCE = 0.25;    // 每批洗涤副产概率

// ---------------- 电压档（0.6.0 引入，0.8.0 扩展 MV/HV） ----------------
A.VOLTS = { 1: 'LV', 2: 'MV', 3: 'HV' };
A.VOLT_NAMES = { 1: '低压', 2: '中压', 3: '高压' };
A.BATTERY_DISCHARGE = 2;    // 每块电池最大放电 A
A.FUSE_OVERLOAD_TIME = 2;   // 超载持续多少秒烧熔断器
A.FUSE_RESET_TIME = 12;     // 熔断器冷却秒数

// ---------------- 化学实验室：双原料（部分需气体） ----------------
A.CHEM = [
  { out: 'rubber', a: 'organic', b: 'resin' },
  { out: 'plastic', a: 'carbon', b: 'compound' },
  { out: 'aluminum_alloy', a: 'aluminum', b: 'copper' },
  { out: 'tungsten_carbide', a: 'tungsten', b: 'carbon' },
  { out: 'silicone', a: 'resin', b: 'quartz', gas: 'methane' },
  { out: 'steel', a: 'iron', b: 'carbon', gas: 'argon' },
  { out: 'explosive', a: 'carbon', b: 'carbon', gas: 'sulfur' },
  { out: 'titanium_alloy', a: 'titanium', b: 'graphite', gas: 'nitrogen' },
  { out: 'hydrazine', a: 'ammonium', b: 'ammonium', gas: 'hydrogen' },
  { out: 'graphene', a: 'graphite', b: 'hydrazine' },
  { out: 'diamond', a: 'graphene', b: 'graphene' },
  { out: 'nanocarbon', a: 'titanium_alloy', b: 'steel', gas: 'helium' },
  // —— 0.7.0：稀有粉 → 合金，硅酮/铜 → 电路板 ——
  { out: 'magnalium', a: 'aluminum', b: 'magnesium_dust' },
  { out: 'nickel_steel', a: 'iron', b: 'nickel_dust' },
  { out: 'mangalloy', a: 'iron', b: 'manganese_dust' },
  { out: 'hardmetal', a: 'tungsten_carbide', b: 'cobalt_dust' },
  { out: 'circuit', a: 'copper', b: 'silicone' },
  { out: 'advanced_circuit', a: 'circuit', b: 'gallium_dust' },
  { out: 'magnet', a: 'rare_earth_dust', b: 'steel' }
];

// ---------------- 大气冷凝（每颗行星可冷凝的气体） ----------------
A.ATMO = {
  sylva: ['hydrogen', 'nitrogen'],
  desolo: [],
  calidor: ['hydrogen', 'sulfur'],
  vesania: ['hydrogen', 'nitrogen', 'argon'],
  novus: ['hydrogen', 'methane'],
  glacio: ['argon'],
  atrox: ['helium', 'methane', 'nitrogen', 'sulfur']
};

// ---------------- 土壤离心机产物 ----------------
A.SOIL_YIELD = ['compound', 'resin', 'organic', 'clay', 'quartz', 'ammonium', 'graphite'];

// ---------------- 蓝图（打印配方） ----------------
// tier: 0 背包打印机 / 1 小型打印机 / 2 中型打印机
// kind: 'module' 放置模块 | 'item' 放入背包
// power: 运行时耗电 A | gen: {type:'solar'|'wind'|'fuel'|'rtg', a: 输出}
A.RECIPES = {
  // 背包打印机（随身，永远可用）
  tether:    { name: '系绳桩', tier: 0, kind: 'item', cost: { compound: 1 }, bytes: 0, desc: '把氧气网络向前延伸 17 米，最多 80 根' },
  canister:  { name: '罐',     tier: 0, kind: 'item', cost: { resin: 1 }, bytes: 0, desc: '土壤容量 +12，地形工具的弹药' },
  beacon:    { name: '信标',   tier: 0, kind: 'item', cost: { quartz: 1 }, bytes: 0, desc: '在天空投出一道光柱，标记回家的路' },
  solar_s:   { name: '小型太阳能板', tier: 0, kind: 'item', cost: { compound: 1 }, bytes: 0, desc: '放在背包侧槽，白天发电 0.5A' },
  wind_s:    { name: '小型风力机',   tier: 0, kind: 'item', cost: { compound: 1 }, bytes: 0, desc: '有风时发电 0.5A' },
  battery_s: { name: '小号电池',     tier: 0, kind: 'item', cost: { zinc: 1 }, bytes: 300, desc: '随身储电 32C，给背包打印机供电' },
  oxygen_s:  { name: '氧气瓶',       tier: 0, kind: 'item', cost: { glass: 1 }, bytes: 300, desc: '氧气上限 +35，深入洞穴的底气' },
  worklight: { name: '工作灯',       tier: 0, kind: 'item', cost: { compound: 1 }, bytes: 200, desc: '连接电网后照亮四周' },

  // 小型打印机（需放在平台/地面上运行）
  printer_s: { name: '小型打印机', tier: 1, kind: 'module', cost: { compound: 2 }, bytes: 0, power: 0.5, slot: 'm', desc: '打印中型模块：制氧机、太阳能板、漫游车' },
  platform:  { name: '平台',       tier: 1, kind: 'module', cost: { compound: 1, resin: 1 }, bytes: 0, power: 0, slot: 'm', desc: '模块的落脚点，平台之间自动接线成电网' },
  oxygenator:{ name: '制氧机',     tier: 1, kind: 'module', cost: { compound: 1, resin: 1 }, bytes: 200, power: 1, slot: 'm', desc: '为整个电网提供氧气，并给附近系绳桩充氧' },
  solar_m:   { name: '中型太阳能板', tier: 1, kind: 'module', cost: { copper: 1, glass: 1 }, bytes: 400, power: 0, gen: { type: 'solar', a: 2.0 }, slot: 'm', desc: '白天发电 2A，行星日照系数会放大或削弱它' },
  wind_m:    { name: '中型风力机',   tier: 1, kind: 'module', cost: { zinc: 1, glass: 1 }, bytes: 400, power: 0, gen: { type: 'wind', a: 2.5 }, slot: 'm', desc: '有风时发电 2.5A，格拉西欧的风很值钱' },
  battery_m: { name: '中型电池',     tier: 1, kind: 'module', cost: { zinc: 1, lithium: 1 }, bytes: 600, power: 0, cap: 64, slot: 'm', desc: '储电 64C，把白天的阳光留到夜里' },
  gen_m:     { name: '中型发电机',   tier: 1, kind: 'module', cost: { zinc: 1, carbon: 1 }, bytes: 500, power: 0, gen: { type: 'fuel', a: 2.0 }, slot: 'm', desc: '烧碳发电 2A，没有太阳也没有风时的保底' },
  rover:     { name: '漫游车',       tier: 1, kind: 'module', cost: { aluminum: 2, compound: 2 }, bytes: 1000, power: 0, vehicle: 'rover', slot: 'l', desc: '四个轮子加一个座位，按住前进就能越野' },
  shuttle:   { name: '穿梭机',       tier: 1, kind: 'module', cost: { aluminum: 2, ceramic: 2 }, bytes: 1200, power: 0, vehicle: 'shuttle', slot: 'l', desc: '在七颗行星间往返，每颗行星的基地与地形独立保留' },

  // 中型打印机
  printer_m: { name: '中型打印机', tier: 2, kind: 'module', cost: { aluminum: 1, compound: 1 }, bytes: 800, power: 1, slot: 'l', desc: '打印大型模块：研究舱、熔炉、化学实验室' },
  research:  { name: '研究舱',     tier: 2, kind: 'module', cost: { compound: 2 }, bytes: 500, power: 1, slot: 'l', desc: '把资源样本转成字节，字节解锁蓝图' },
  smelter:   { name: '熔炉',       tier: 2, kind: 'module', cost: { resin: 2, compound: 1 }, bytes: 500, power: 1, slot: 'l', group: 'process', desc: '红土→铝、孔雀石→铜、石英→玻璃；碎矿与纯净矿也能熔' },
  crusher:   { name: '破碎机',     tier: 2, kind: 'module', cost: { aluminum: 1, compound: 2 }, bytes: 900, power: 1.5, slot: 'l', volt: 1, group: 'process', desc: '2 份金属矿粉碎成 3 份碎矿（碎矿熔炼 1:1 出金属），概率副产稀有粉' },
  washer:    { name: '洗矿机',     tier: 2, kind: 'module', cost: { aluminum: 2, circuit: 1, zinc: 1 }, bytes: 2500, power: 2, slot: 'l', volt: 1, group: 'process', desc: '3 份碎矿 + 1 化合物 → 4 份纯净矿，副产稀有粉；全链每矿约出 2 份金属' },
  chemistry: { name: '化学实验室', tier: 2, kind: 'module', cost: { ceramic: 1, glass: 1, tungsten: 1 }, bytes: 1800, power: 1, slot: 'l', group: 'process', desc: '两种资源合成复合材料与合金，部分需要气体' },
  condenser: { name: '大气冷凝机', tier: 2, kind: 'module', cost: { glass: 1, plastic: 1, ceramic: 1 }, bytes: 2000, power: 1, slot: 'l', group: 'process', desc: '从大气里冷凝出氢气、氩气、甲烷……' },
  centrifuge:{ name: '土壤离心机', tier: 2, kind: 'module', cost: { aluminum: 1, compound: 2, zinc: 1 }, bytes: 1200, power: 1, slot: 'l', group: 'process', desc: '一罐土换一份基础资源，挖山的理由' },
  rtg:       { name: '同位素发电机', tier: 2, kind: 'module', cost: { astronium: 1, titanium: 1, glass: 1 }, bytes: 4000, power: 0, gen: { type: 'rtg', a: 4 }, slot: 'l', desc: '不挑昼夜不挑风，稳定 4A —— 星辉矿的用处' }
};

A.recipe = (id) => A.RECIPES[id];
A.recipeIds = Object.keys(A.RECIPES);

// 蓝图是否默认解锁（无字节成本的基础件）
A.isFree = (id) => (A.RECIPES[id] ? A.RECIPES[id].bytes === 0 : false);

})(window.A);
