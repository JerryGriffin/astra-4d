/* ============================================================
   ASTRA·4D — 5.5 goals：世界线里程碑（v1.1.0 新玩法）
   沿 w 漫游本身成为目标：发现七颗行星、穿越过渡带、采集相位结晶、
   登上高峰、扫描、建基地。全部给字节奖励，进度图形化。
   ============================================================ */
(function (A) {
'use strict';

const st = {
  visited: {},   // 行星锚点
  done: {},      // 已完成目标
  minW: 0, maxW: 0,
  maxY: -999,
  seenAnomaly: false,
  scanUsed: false
};

const PLANET_GOALS = A.PLANETS.map((P, i) => ({
  id: 'p' + i, group: '七行星',
  name: '抵达 ' + P.name, desc: '把世界线滑到 w = ' + i + '（' + P.en + '）',
  reward: 180, icon: '◉',
  test: () => !!st.visited[i]
}));

const EXTRA_GOALS = [
  {
    id: 'cross', group: '世界线', name: '贯穿第四维',
    desc: '从 w=0 一路滑到 w=6（不靠瞬移）', reward: 1600, icon: '⇢',
    test: () => st.minW < 0.08 && st.maxW > 5.92
  },
  {
    id: 'anomaly', group: '世界线', name: '拾取相位结晶',
    desc: '在两颗行星之间的异常带找到结晶', reward: 900, icon: '◆',
    test: () => st.seenAnomaly
  },
  {
    id: 'summit', group: '地形', name: '登上高峰',
    desc: '脚下的地表高度超过 22 米', reward: 700, icon: '▲',
    test: () => st.maxY > 22
  },
  {
    id: 'scan', group: '地形', name: '相位扫描',
    desc: '按 X 扫描一次周围矿脉', reward: 240, icon: '◎',
    test: () => st.scanUsed
  },
  {
    id: 'base', group: '基地', name: '搭起基地',
    desc: '同时部署 5 个模块', reward: 600, icon: '⬡',
    test: () => A.build.modules.filter((m) => m.type !== 'habitat').length >= 5
  },
  {
    id: 'tether', group: '基地', name: '氧气长链',
    desc: '铺下 8 根系绳桩', reward: 420, icon: '⌁',
    test: () => A.player.tethers.length >= 8
  }
];

const ALL = PLANET_GOALS.concat(EXTRA_GOALS);

function complete(g) {
  if (st.done[g.id]) return;
  st.done[g.id] = true;
  A.player.bytes += g.reward;
  A.sfx.ok();
  A.ui.toast('里程碑达成 · ' + g.name + '  +' + g.reward + ' 字节');
  A.burst(A.player.x, A.player.y + 1.6, A.player.z, new THREE.Color(0xffd166), 30, 2.6);
  A.writeSave && A.writeSave(true);
  if (A.viz) A.viz.dirty = true;
}

function tick(dt, time) {
  const p = A.player;
  if (p.dead) return;
  const w = p.w;
  const i = Math.round(w);
  if (Math.abs(w - i) < 0.13 && A.PLANETS[i]) st.visited[i] = true;
  st.minW = Math.min(st.minW, w);
  st.maxW = Math.max(st.maxW, w);
  const gh = A.world.height(p.x, p.z, w);
  st.maxY = Math.max(st.maxY, gh);
  if ((p.inv && p.inv.anomaly > 0) || A.world.nodes.some((n) => n.band === 'anomaly' && n.units < 2)) st.seenAnomaly = true;
  if (A.world.scanning > time) st.scanUsed = true;
  for (const g of ALL) if (!st.done[g.id] && g.test()) complete(g);
}

function list() {
  return ALL.map((g) => ({
    id: g.id, group: g.group, name: g.name, desc: g.desc,
    reward: g.reward, icon: g.icon, done: !!st.done[g.id]
  }));
}
function progress() {
  const n = ALL.filter((g) => st.done[g.id]).length;
  return { done: n, total: ALL.length, bytes: ALL.reduce((a, g) => a + (st.done[g.id] ? g.reward : 0), 0) };
}
function serialize() {
  return { visited: st.visited, done: st.done, minW: st.minW, maxW: st.maxW,
    maxY: st.maxY, seenAnomaly: st.seenAnomaly, scanUsed: st.scanUsed };
}
function load(s) {
  if (!s) return;
  st.visited = s.visited || {}; st.done = s.done || {};
  st.minW = s.minW === undefined ? A.player.w : s.minW;
  st.maxW = s.maxW === undefined ? A.player.w : s.maxW;
  st.maxY = s.maxY === undefined ? -999 : s.maxY;
  st.seenAnomaly = !!s.seenAnomaly; st.scanUsed = !!s.scanUsed;
}

A.goals = { init() {}, tick, list, progress, serialize, load, state: st };

})(window.A);
