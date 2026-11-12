/* ============================================================
   ASTRA·4D — 5. ui：HUD / 背包 / 建造 / 研究 / 模块面板 / 星图
   ============================================================ */
(function (A) {
'use strict';
const M = A.M;
const $ = (id) => document.getElementById(id);

const el = {};
let toastTimer = 0, promptHTML = '', openName = null;

function init() {
  [
    'hud', 'o2-fill', 'o2-num', 'hp-fill', 'hp-num', 'soil-fill', 'soil-num',
    'planet-chip', 'bytes-num', 'prompt', 'toast', 'crosshair', 'w-readout',
    'phase-label', 'view-tag', 'view-btn', 'btn-view', 'btn-wup', 'btn-wdown',
    'phase-fill', 'interact', 'panels', 'backpack-grid', 'printer-list',
    'build-list', 'research-items', 'research-blueprints', 'bytes-big',
    'module-title', 'module-body', 'module-sub', 'travel-list', 'death', 'death-cause',
    'title', 'fx-fade', 'rad-chip',
    'codex-q', 'codex-list', 'net-status', 'net-url', 'net-name', 'net-code',
    'net-create', 'net-join', 'net-leave', 'net-peers', 'net-log', 'net-input', 'net-send'
  ].forEach((id) => { el[id] = $(id); });

  // 面板开关
  document.querySelectorAll('[data-panel]').forEach((b) => {
    b.addEventListener('click', () => togglePanel(b.dataset.panel));
  });
  document.querySelectorAll('[data-close]').forEach((b) => {
    b.addEventListener('click', () => closePanels());
  });
  el.panels.addEventListener('click', (e) => {
    if (e.target === el.panels) closePanels();
  });
  // 工具模式
  document.querySelectorAll('[data-mode]').forEach((b) => {
    b.addEventListener('click', () => setToolMode(b.dataset.mode));
  });
  // 四维场面板（旧版「转换空间视图」已改为真实的 4D 场可视化）
  const openField = () => togglePanel('field');
  if (el['view-btn']) el['view-btn'].addEventListener('click', openField);
  if (el['btn-view']) el['btn-view'].addEventListener('click', openField);
  // 通用委托：建造 / 打印 / 研究 / 模块动作
  el['printer-list'].addEventListener('click', (e) => craftClick(e, 0));
  el['build-list'].addEventListener('click', (e) => craftClick(e, 1));
  el['research-items'].addEventListener('click', researchClick);
  el['research-blueprints'].addEventListener('click', unlockClick);
  el['module-body'].addEventListener('click', moduleClick);
  el['travel-list'].addEventListener('click', travelClick);
  // 图鉴搜索
  if (el['codex-q']) el['codex-q'].addEventListener('input', () => renderCodex());
  // 联机面板
  if (el['net-create']) {
    el['net-create'].addEventListener('click', async () => {
      const r = await A.net.create(el['net-name'].value, el['net-url'].value || A.net.defaultUrl());
      if (!r.ok) toast(A.net.err || r.msg || '创建失败');
      renderNet();
    });
    el['net-join'].addEventListener('click', async () => {
      const r = await A.net.join(el['net-code'].value, el['net-name'].value, el['net-url'].value || A.net.defaultUrl());
      if (!r.ok) toast(A.net.err || r.msg || '加入失败');
      renderNet();
    });
    el['net-leave'].addEventListener('click', async () => { await A.net.leave(); renderNet(); });
    const say = () => { if (A.net.say(el['net-input'].value)) el['net-input'].value = ''; renderNet(); };
    el['net-send'].addEventListener('click', say);
    el['net-input'].addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); say(); } });
    el['net-url'].placeholder = A.net.defaultUrl();
    el['net-name'].value = '宇航员' + (1 + Math.floor(Math.random() * 89));
  }
  setToolMode('dig');
}

// ---------------- 提示 ----------------
function toast(msg) {
  if (!el.toast) return;
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  toastTimer = 2.4;
}
function setPrompt(html) {
  if (html === promptHTML) return;
  promptHTML = html;
  el.prompt.innerHTML = html;
  el.prompt.classList.toggle('show', !!html);
}

// ---------------- HUD ----------------
let lastO2 = -1, lastHp = -1, lastSoil = -1, lastW = '', lastBytes = -1, lastInteract = '';
let lastRad = -1;
function refreshHUD() {
  const p = A.player;
  const o2 = Math.round(p.oxygen), hp = Math.round(p.health), soil = Math.floor(p.soil);
  if (o2 !== lastO2) {
    el['o2-num'].textContent = o2;
    el['o2-fill'].style.width = (p.oxygen / p.oxygenMax * 100) + '%';
    el['o2-fill'].classList.toggle('low', p.oxygen < 26);
    lastO2 = o2;
  }
  if (hp !== lastHp) {
    el['hp-num'].textContent = hp;
    el['hp-fill'].style.width = p.health + '%';
    lastHp = hp;
  }
  if (soil !== lastSoil) {
    el['soil-num'].textContent = soil;
    el['soil-fill'].style.width = (p.soil / p.soilMax * 100) + '%';
    lastSoil = soil;
  }
  // w 读数与世界线指针由 viz 统一绘制（0~6 的七颗行星坐标）
  if (p.bytes !== lastBytes) { el['bytes-num'].textContent = A.M.fmt(p.bytes); lastBytes = p.bytes; }
  // 相位辐射提示（0.8.0）：0 不显示 / 1 辐射中 / 2 防护服生效
  if (el['rad-chip']) {
    const deep = A.F4.cur.radiation > 0.5;
    const key = deep ? (p.suited ? 2 : 1) : 0;
    if (key !== lastRad) {
      lastRad = key;
      el['rad-chip'].classList.toggle('hidden', key === 0);
      el['rad-chip'].classList.toggle('safe', key === 2);
      el['rad-chip'].textContent = key === 1
        ? '⚠ 世界线辐射带 · 氧气消耗上升、持续掉血'
        : key === 2 ? '相位防护服 · 辐射带安全' : '';
    }
  }
}

function setInteract(text) {
  if (text === lastInteract) return;
  lastInteract = text;
  el.interact.textContent = text || '';
  el.interact.classList.toggle('show', !!text);
}

// v1.1.0：HUD 标签统一指向真实 4D 场与世界线
function setViewLabel() {
  if (el['phase-label']) el['phase-label'].textContent = '世界线 W';
  if (el['view-tag']) el['view-tag'].textContent = 'X Y Z W';
  const axis = document.querySelector('.view-axis');
  if (axis) axis.textContent = 'F(X,Y,Z,W)';
  if (el['btn-wup']) el['btn-wup'].textContent = 'W +';
  if (el['btn-wdown']) el['btn-wdown'].textContent = 'W −';
  if (el['view-btn']) el['view-btn'].title = '四维场 F(X,Y,Z,W) 的真实切片（G）';
}

let lastChip = '';
function setPlanetChip() {
  const P = A.F4.cur;
  const key = P.shortName + '|' + P.type + '|' + Math.round(A.player.w * 20);
  if (key === lastChip) return;
  lastChip = key;
  el['planet-chip'].innerHTML = `<b>${P.shortName}</b><span>${P.en}</span><i>${P.type}</i><em>w ${A.player.w.toFixed(2)}</em>`;
}

function setToolMode(mode) {
  A.player.toolMode = mode;
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
}

// ---------------- 面板 ----------------
function togglePanel(name) {
  if (openName === name) { closePanels(); return; }
  openPanel(name);
}
function openPanel(name, data) {
  openName = name;
  el.panels.classList.add('show');
  document.querySelectorAll('.panel').forEach((s) => s.classList.toggle('on', s.id === 'panel-' + name));
  if (name === 'backpack') { renderBackpack(); renderPrinter(); }
  if (name === 'build') renderBuild();
  if (name === 'research') { renderResearch(); renderBlueprints(); }
  if (name === 'module') renderModule(data);
  if (name === 'travel') renderTravel();
  if (name === 'codex') renderCodex();
  if (name === 'net') renderNet();
  if (name === 'travel') { /* renderTravel 下面已调用 */ }
  if (name === 'field' && A.viz) { A.viz.drawField(); A.viz.dirty = true; }
  if (name === 'goals' && A.viz) A.viz.renderGoals();
  A.sfx.blip();
}
function closePanels() {
  openName = null;
  el.panels.classList.remove('show');
  document.querySelectorAll('.panel').forEach((s) => s.classList.remove('on'));
  A.ui.hoverBuild = false;
}

// 背包
function setBytes() {
  const v = A.M.fmt(A.player.bytes);
  document.querySelectorAll('.bytes-big').forEach((n) => (n.textContent = v));
}

function chipHTML(id, n) {
  const it = A.item(id);
  return `<div class="inv-cell" title="${it.name}">
    <span class="sw" style="background:${A.itemColor(id)}"></span>
    <span class="nm">${it.name}</span>
    <span class="ct">${n}</span>
  </div>`;
}
function renderBackpack() {
  const inv = A.player.inv;
  const order = { raw: 0, refined: 1, dust: 2, composite: 3, gas: 4, special: 5 };
  const ids = Object.keys(inv).filter((k) => inv[k] > 0)
    .sort((a, b) => (order[A.item(a).cat] - order[A.item(b).cat]) || a.localeCompare(b));
  el['backpack-grid'].innerHTML = ids.length
    ? ids.map((k) => chipHTML(k, inv[k])).join('')
    : '<div class="empty">背包是空的。按住「采集」把小矿块吸进来，或去挖土。</div>';
  setBytes();
  document.querySelectorAll('.stat-soil').forEach((n) => (n.textContent = Math.floor(A.player.soil) + ' / ' + A.player.soilMax));
}

// 打印配方
function costHTML(cost) {
  return Object.entries(cost).map(([k, v]) => {
    const have = A.player.count(k);
    const ok = have >= v;
    return `<span class="cost ${ok ? '' : 'no'}" title="${A.item(k).name}：已有 ${have}，需要 ${v}">
      <i style="background:${A.itemColor(k)}"></i>${A.item(k).name}<b>×${v}</b></span>`;
  }).join('');
}
function recipeHTML(id) {
  const r = A.RECIPES[id];
  const unlocked = r.bytes === 0 || A.player.unlocked.includes(id);
  const afford = A.player.canAfford(r.cost);
  const mark = A.itemColor(Object.keys(r.cost)[0]);
  return `<button class="card ${unlocked ? '' : 'locked'} ${afford && unlocked ? '' : 'dim'}" data-craft="${id}">
    <span class="card-h"><i class="card-mark" style="--mk:${mark}"></i><b>${r.name}</b></span>
    <span class="card-d">${r.desc}</span>
    <span class="card-c">${unlocked ? costHTML(r.cost) : '<span class="lock">' + r.bytes + ' 字节解锁</span>'}</span>
  </button>`;
}
function renderPrinter() {
  const ids = A.recipeIds.filter((id) => A.RECIPES[id].tier === 0);
  el['printer-list'].innerHTML = ids.map(recipeHTML).join('');
}
function renderBuild() {
  const t1 = A.recipeIds.filter((id) => A.RECIPES[id].tier === 1);
  const t2 = A.recipeIds.filter((id) => A.RECIPES[id].tier === 2);
  const base = t2.filter((id) => A.RECIPES[id].group !== 'process');
  const proc = t2.filter((id) => A.RECIPES[id].group === 'process');
  el['build-list'].innerHTML =
    `<div class="tier"><div class="tier-h">小型打印机</div><div class="cards">${t1.map(recipeHTML).join('')}</div></div>` +
    `<div class="tier"><div class="tier-h">中型打印机 · 建造</div><div class="cards">${base.map(recipeHTML).join('')}</div></div>` +
    `<div class="tier"><div class="tier-h">中型打印机 · 加工</div><div class="cards">${proc.map(recipeHTML).join('')}</div></div>`;
}

function craftClick(e, from) {
  const btn = e.target.closest('[data-craft]');
  if (!btn) return;
  const id = btn.dataset.craft;
  const r = A.RECIPES[id];
  if (r.bytes > 0 && !A.player.unlocked.includes(id)) { A.sfx.err(); toast('蓝图未解锁 · 去研究舱攒字节'); return; }
  if (!A.player.canAfford(r.cost)) { A.sfx.err(); toast('材料不够'); return; }
  if (r.kind === 'item') {
    A.player.pay(r.cost);
    A.player.addItem(id, 1);
    A.sfx.ok();
    toast('已打印 ' + r.name);
    renderBackpack(); renderPrinter();
  } else {
    A.place.start(id);
    closePanels();
  }
}

// 研究
function renderResearch() {
  const inv = A.player.inv;
  const ids = Object.keys(inv).filter((k) => inv[k] > 0 && A.item(k).bytes > 0);
  el['research-items'].innerHTML = ids.length ? ids.map((k) => {
    const it = A.item(k);
    return `<button class="row" data-res="${k}">
      <span class="sw" style="background:${A.itemColor(k)}"></span>
      <span class="nm">${it.name}</span><span class="ct">×${inv[k]}</span>
      <span class="gain">+${it.bytes} 字节</span>
    </button>`;
  }).join('') : '<div class="empty">没有可研究的样本。去地表捡矿，或用研究舱扫描背包里的资源。</div>';
  setBytes();
}
function renderBlueprints() {
  const ids = A.recipeIds.filter((id) => A.RECIPES[id].bytes > 0)
    .sort((a, b) => A.RECIPES[a].bytes - A.RECIPES[b].bytes);
  el['research-blueprints'].innerHTML = ids.map((id) => {
    const r = A.RECIPES[id];
    const un = A.player.unlocked.includes(id);
    return `<button class="bp ${un ? 'un' : ''}" data-bp="${id}">
      <b>${r.name}</b><span>${un ? '已解锁' : r.bytes + ' 字节'}</span>
    </button>`;
  }).join('');
}
function researchClick(e) {
  const b = e.target.closest('[data-res]');
  if (!b) return;
  const id = b.dataset.res;
  const mod = A.build.nearest(A.player.x, A.player.z, 6);
  if (!mod || mod.type !== 'research') { A.sfx.err(); toast('需要站在研究舱旁边'); return; }
  if (!mod.powered) { A.sfx.err(); toast('研究舱没有电'); return; }
  const bytes = A.item(id).bytes;
  if (!A.player.takeItem(id, 1)) return;
  A.player.bytes += bytes;
  A.sfx.ok();
  toast('+' + bytes + ' 字节 · ' + A.item(id).name);
  renderResearch(); renderBlueprints();
}
function unlockClick(e) {
  const b = e.target.closest('[data-bp]');
  if (!b) return;
  const id = b.dataset.bp;
  const r = A.RECIPES[id];
  if (A.player.unlocked.includes(id)) return;
  if (A.player.bytes < r.bytes) { A.sfx.err(); toast('字节不够 · 还差 ' + (r.bytes - A.player.bytes)); return; }
  A.player.bytes -= r.bytes;
  A.player.unlocked.push(id);
  A.sfx.ok();
  toast('蓝图解锁 · ' + r.name);
  renderBlueprints(); el['bytes-big'].textContent = A.M.fmt(A.player.bytes);
  renderBuild();
}

// 模块面板
function renderModule(mod) {
  A.ui.module = mod;
  if (!mod) { el['module-title'].textContent = '模块'; el['module-body'].innerHTML = ''; return; }
  const r = mod.def;
  el['module-title'].textContent = r.name || '庇护所';
  const power = (r.power ? '耗电 ' + r.power + 'A' : '') +
    (r.gen ? (r.gen.type === 'solar' ? '日照发电 ' : r.gen.type === 'wind' ? '风力发电 ' : r.gen.type === 'fuel' ? '烧碳发电 ' : '恒定发电 ') + r.gen.a + 'A' : '') +
    (r.cap ? ' · 储电 ' + Math.round(mod.charge) + '/' + r.cap + '（放电 ' + (r.discharge || A.BATTERY_DISCHARGE) + 'A）' : '') +
    ((r.power || r.gen) ? ' · 电压 ' + (A.VOLTS[r.volt || 1] || 'LV') : '');
  const voltWarn = mod.lowVolt ? ' · 电压不足（电网 ' + (A.VOLTS[mod.netVolt] || 'LV') + '）降速 75%' : '';
  el['module-sub'].textContent = power + voltWarn + (mod.fused > 0 ? ' · 熔断器烧毁 ' + Math.ceil(mod.fused) + 's' : mod.powered ? ' · 通电' : ' · 断电');
  el['module-sub'].classList.toggle('bad', (!mod.powered && (r.power > 0)) || mod.fused > 0 || mod.lowVolt);

  let body = '';
  const jobBar = () => mod.job
    ? `<div class="job"><div class="job-bar"><i style="width:${Math.min(100, mod.job.t / mod.job.total * 100)}%"></i></div>
       <span>${mod.job.label} · ${Math.max(0, (mod.job.total - mod.job.t)).toFixed(1)}s${mod.eff < 0.99 ? ' · 供电不足 ' + Math.round(mod.eff * 100) + '%' : ''}</span></div>`
    : '';

  if (mod.type === 'research') {
    body = `<div class="hint">把样本放进研究舱换成字节。字节用于解锁新蓝图。</div>
      <div class="rows">${Object.keys(A.player.inv).filter((k) => A.player.inv[k] > 0 && A.item(k).bytes > 0).map((k) =>
        `<button class="row" data-mact="res:${k}">
          <span class="sw" style="background:${A.itemColor(k)}"></span><span class="nm">${A.item(k).name}</span>
          <span class="ct">×${A.player.inv[k]}</span><span class="gain">+${A.item(k).bytes}</span></button>`).join('') || '<div class="empty">没有可研究的样本</div>'}</div>`;
  } else if (mod.type === 'smelter') {
    body = jobBar() + `<div class="hint">熔炼：1 份天然资源 / 碎矿 / 纯净矿 → 1 份精炼资源，每个 4 秒。碎矿来自破碎机（2 矿→3 碎矿），纯净矿来自洗矿机（3 碎矿→4 纯净矿）。</div><div class="rows">${Object.entries(A.SMELT).map(([from, to]) =>
      `<button class="row" data-mact="smelt:${from}">
        <span class="sw" style="background:${A.itemColor(from)}"></span><span class="nm">${A.item(from).name}</span>
        <span class="arrow">→</span><span class="sw" style="background:${A.itemColor(to)}"></span><span class="nm">${A.item(to).name}</span>
        <span class="ct">×${A.player.count(from)}</span></button>`).join('')}</div>`;
  } else if (mod.type === 'crusher' || mod.type === 'crusher_m') {
    const ind = mod.type === 'crusher_m';
    body = jobBar() + `<div class="hint">${ind ? 'MV 工业粉碎' : '粉碎'}：2 份金属矿 → ${ind ? A.CRUSH_M.qty : 3} 份碎矿（碎矿熔炉 1:1 出金属），每次 ${Math.round((ind ? A.CRUSH_M.by : A.CRUSH_BY_CHANCE) * 100)}% 概率副产一份稀有粉。${ind ? '需 MV 电源。' : ''}</div>
      <div class="rows">${Object.entries(A.CRUSH).map(([from, c]) => {
        const ok = A.player.count(from) >= 2;
        return `<button class="row ${ok ? '' : 'dim'}" data-mact="crush:${from}">
          <span class="sw" style="background:${A.itemColor(from)}"></span><span class="nm">${A.item(from).name}</span>
          <span class="arrow">→</span><span class="sw" style="background:${A.itemColor(c.cr)}"></span><span class="nm">${A.item(c.cr).name}×${ind ? A.CRUSH_M.qty : 3}</span>
          <span class="ct">×${A.player.count(from)}</span></button>`;
      }).join('')}</div>`;
  } else if (mod.type === 'washer' || mod.type === 'washer_m') {
    const ind = mod.type === 'washer_m';
    body = jobBar() + `<div class="hint">${ind ? 'MV 工业洗涤' : '洗涤'}：3 份碎矿 + ${A.WASH_COMPOUND} 份化合物 → ${ind ? A.WASH_M.qty : 4} 份纯净矿（熔炉 1:1 出金属），每次 ${Math.round((ind ? A.WASH_M.by : A.WASH_BY_CHANCE) * 100)}% 概率副产稀有粉。${ind ? '需 MV 电源。' : ''}</div>
      <div class="rows">${Object.entries(A.WASH).map(([from, w]) => {
        const ok = A.player.count(from) >= 3 && A.player.count('compound') >= A.WASH_COMPOUND;
        return `<button class="row ${ok ? '' : 'dim'}" data-mact="wash:${from}">
          <span class="sw" style="background:${A.itemColor(from)}"></span><span class="nm">${A.item(from).name}</span>
          <span class="arrow">→</span><span class="sw" style="background:${A.itemColor(w.pu)}"></span><span class="nm">${A.item(w.pu).name}×${ind ? A.WASH_M.qty : 4}</span>
          <span class="ct">×${A.player.count(from)}</span></button>`;
      }).join('')}</div>`;
  } else if (mod.type === 'chemistry') {
    body = jobBar() + `<div class="hint">化学实验室：两种资源合成复合材料，标 🔬 的需要对应气体。</div><div class="rows">${A.CHEM.map((c, i) => {
      const gasOk = !c.gas || A.player.count(c.gas) > 0;
      const ok = A.player.count(c.a) > 0 && A.player.count(c.b) > 0 && gasOk;
      return `<button class="row ${ok ? '' : 'dim'}" data-mact="chem:${i}">
        <span class="sw" style="background:${A.itemColor(c.a)}"></span><span class="nm">${A.item(c.a).name}</span>
        <span class="plus">+</span>
        <span class="sw" style="background:${A.itemColor(c.b)}"></span><span class="nm">${A.item(c.b).name}</span>
        <span class="arrow">→</span>
        <span class="sw" style="background:${A.itemColor(c.out)}"></span><span class="nm">${A.item(c.out).name}</span>
        ${c.gas ? `<span class="gas ${gasOk ? '' : 'no'}">${A.item(c.gas).name}</span>` : ''}
      </button>`;
    }).join('')}</div>`;
  } else if (mod.type === 'condenser') {
    const gases = A.ATMO[A.world.planet.id] || [];
    body = jobBar() + `<div class="hint">大气冷凝：${A.world.planet.name}的大气成分。</div><div class="rows">${gases.length ? gases.map((g) =>
      `<button class="row" data-mact="gas:${g}"><span class="sw" style="background:${A.itemColor(g)}"></span>
        <span class="nm">${A.item(g).name}</span><span class="gain">冷凝 8s</span></button>`).join('') : '<div class="empty">德索罗没有大气，什么都冷凝不出来。</div>'}</div>`;
  } else if (mod.type === 'centrifuge') {
    body = jobBar() + `<div class="hint">土壤离心：消耗 4 单位土壤，随机产出一种基础资源。</div>
      <button class="row wide" data-mact="soil"><span class="sw" style="background:#a9805c"></span>
        <span class="nm">离心 4 土壤</span><span class="ct">${Math.floor(A.player.soil)}</span></button>`;
  } else if (mod.type === 'printer_s') {
    body = `<div class="hint">小型打印机 · 制造中型模块，打印后进入放置模式。</div><div class="rows cards-mini">${A.recipeIds.filter((id) => A.RECIPES[id].tier === 1).map(recipeHTML).join('')}</div>`;
  } else if (mod.type === 'printer_m') {
    body = `<div class="hint">中型打印机 · 制造大型模块，打印后进入放置模式。</div><div class="rows cards-mini">${A.recipeIds.filter((id) => A.RECIPES[id].tier === 2).map(recipeHTML).join('')}</div>`;
  } else if (mod.type === 'rover' || mod.type === 'shuttle') {
    body = `<div class="hint">${mod.type === 'rover' ? '漫游车：按 E 上车，WASD 驾驶，用来跑远路搬货。' : '穿梭机：按 E 打开星图，装满固体燃料就能去下一颗行星。'}</div>
      <button class="row wide" data-mact="mount">${mod.type === 'rover' ? '登上漫游车' : '打开星图'}</button>`;
  } else if (mod.type === 'battery_m') {
    body = `<div class="hint">电池电量：${Math.round(mod.charge)} / ${mod.def.cap} C</div>
      <div class="bigbar"><i style="width:${(mod.charge / mod.def.cap * 100).toFixed(1)}%"></i></div>`;
  } else if (mod.type === 'habitat') {
    body = `<div class="hint">庇护所是你的起点：自带 1A 同位素电源与无限氧气，风暴里躲进来能挡沙。</div>`;
  } else {
    body = `<div class="hint">${mod.def.desc || '这个模块没有可操作项。'}</div>`;
  }
  el['module-body'].innerHTML = body;
  // 打印卡片走同一套 craft 委托
  el['module-body'].querySelectorAll('[data-craft]').forEach((b) => {
    b.addEventListener('click', (e) => craftClick(e));
  });
}
function refreshModule(m) {
  if (openName === 'module' && A.ui.module === m) renderModule(m);
}

function moduleClick(e) {
  const b = e.target.closest('[data-mact]');
  if (!b) return;
  const mod = A.ui.module;
  if (!mod) return;
  const [act, val] = b.dataset.mact.split(':');
  if (act === 'mount') {
    if (mod.type === 'shuttle') { openPanel('travel'); return; }
    A.player.mount = mod; mod.driving = false; A.player.cam.dist = 12;
    closePanels(); toast('已登上漫游车 · WASD 驾驶，E 下车');
    return;
  }
  if (act === 'res') {
    if (!mod.powered) { A.sfx.err(); toast('研究舱没有电'); return; }
    const bytes = A.item(val).bytes;
    if (!A.player.takeItem(val, 1)) return;
    A.player.bytes += bytes; A.sfx.ok(); toast('+' + bytes + ' 字节');
    renderModule(mod); return;
  }
  if (act === 'smelt') {
    if (A.player.count(val) < 1) { A.sfx.err(); toast('没有' + A.item(val).name); return; }
    if (A.build.startJob(mod, {
      total: 4, label: '熔炼 ' + A.item(val).name, out: A.SMELT[val],
      onDone: () => { A.ui.toast('产出 ' + A.item(A.SMELT[val]).name); }
    })) A.player.takeItem(val, 1);
    return;
  }
  if (act === 'crush') {
    const c = A.CRUSH[val];
    if (!c) return;
    if (A.player.count(val) < 2) { A.sfx.err(); toast('需要 2 份' + A.item(val).name); return; }
    const ind = mod.type === 'crusher_m';
    const qty = ind ? A.CRUSH_M.qty : 3;
    const chance = ind ? A.CRUSH_M.by : A.CRUSH_BY_CHANCE;
    if (A.build.startJob(mod, {
      total: 5, label: (ind ? '工业粉碎 ' : '粉碎 ') + A.item(val).name, out: c.cr, qty, by: c.by,
      onDone: (j) => {
        if (j.by && Math.random() < chance) {
          A.player.addItem(j.by, 1);
          toast('副产 ' + A.item(j.by).name);
        }
      }
    })) A.player.takeItem(val, 2);
    return;
  }
  if (act === 'wash') {
    const w = A.WASH[val];
    if (!w) return;
    if (A.player.count(val) < 3) { A.sfx.err(); toast('需要 3 份' + A.item(val).name); return; }
    if (A.player.count('compound') < A.WASH_COMPOUND) { A.sfx.err(); toast('需要 ' + A.WASH_COMPOUND + ' 份化合物作洗涤剂'); return; }
    const ind = mod.type === 'washer_m';
    const qty = ind ? A.WASH_M.qty : 4;
    const chance = ind ? A.WASH_M.by : A.WASH_BY_CHANCE;
    if (A.build.startJob(mod, {
      total: 6, label: (ind ? '工业洗涤 ' : '洗涤 ') + A.item(val).name, out: w.pu, qty, by: w.by,
      onDone: (j) => {
        if (j.by && Math.random() < chance) {
          A.player.addItem(j.by, 1);
          toast('副产 ' + A.item(j.by).name);
        }
      }
    })) { A.player.takeItem(val, 3); A.player.takeItem('compound', A.WASH_COMPOUND); }
    return;
  }
  if (act === 'chem') {
    const c = A.CHEM[+val];
    if (A.player.count(c.a) < 1 || A.player.count(c.b) < 1) { A.sfx.err(); toast('原料不够'); return; }
    if (c.gas && A.player.count(c.gas) < 1) { A.sfx.err(); toast('需要' + A.item(c.gas).name); return; }
    if (A.build.startJob(mod, { total: 6, label: '合成 ' + A.item(c.out).name, out: c.out })) {
      A.player.takeItem(c.a, 1); A.player.takeItem(c.b, 1);
      if (c.gas) A.player.takeItem(c.gas, 1);
    }
    return;
  }
  if (act === 'gas') {
    A.build.startJob(mod, { total: 8, label: '冷凝 ' + A.item(val).name, out: val });
    return;
  }
  if (act === 'soil') {
    if (A.player.soil < 4) { A.sfx.err(); toast('土壤不够 · 用工具挖一点'); return; }
    A.player.soil -= 4;
    const out = A.SOIL_YIELD[Math.floor(Math.random() * A.SOIL_YIELD.length)];
    A.build.startJob(mod, { total: 5, label: '离心土壤', out, onDone: () => A.ui.toast('离心出 ' + A.item(out).name) });
    return;
  }
}

// ---------------- 图鉴（生产链查询，0.9.0） ----------------
let codexIndex = null;
const CAT_NAME = { raw: '天然', refined: '精炼', dust: '处理链', composite: '复合', gas: '气体', special: '特殊' };
function buildCodexIndex() {
  const idx = {};
  const ensure = (k) => (idx[k] || (idx[k] = { src: [], use: [] }));
  const seen = new Set();
  const add = (arr, s) => { if (!seen.has(arr.tag + s)) { seen.add(arr.tag + s); arr.push(s); } };
  const S = (k) => { const e = ensure(k); e.src.tag = k; return e.src; };
  const U = (k) => { const e = ensure(k); e.use.tag = k; return e.use; };
  for (const c of A.CHEM) {
    add(S(c.out), '化学实验室：' + A.item(c.a).name + ' + ' + A.item(c.b).name + (c.gas ? ' + ' + A.item(c.gas).name : ''));
    for (const k of [c.a, c.b, c.gas]) if (k && k !== c.out) add(U(k), A.item(c.out).name);
  }
  for (const [from, to] of Object.entries(A.SMELT)) {
    add(S(to), '熔炉：' + A.item(from).name + ' ×1');
    add(U(from), A.item(to).name);
  }
  for (const [ore, c] of Object.entries(A.CRUSH)) {
    add(S(c.cr), '破碎机：' + A.item(ore).name + ' ×2');
    add(S(c.by), '破碎机副产（' + A.item(ore).name + '）');
    add(U(ore), '碎矿 · ' + A.item(c.cr).name);
  }
  for (const [cr, w] of Object.entries(A.WASH)) {
    add(S(w.pu), '洗矿机：' + A.item(cr).name + ' ×3 + 化合物');
    add(S(w.by), '洗矿机副产（' + A.item(cr).name + '）');
    add(U(cr), '纯净矿 · ' + A.item(w.pu).name);
  }
  for (const [id, r] of Object.entries(A.RECIPES)) {
    if (r.kind === 'item') add(S(id), '打印：' + r.name);
    for (const k of Object.keys(r.cost || {})) add(U(k), r.name);
  }
  for (const P of A.PLANETS) {
    for (const k of Object.keys(P.res || {})) add(S(k), '矿脉 · ' + P.name);
    for (const k of Object.keys(P.deep || {})) add(S(k), '深层相位（|w|>4.5） · ' + P.name);
    for (const g of A.ATMO[P.id] || []) add(S(g), '大气冷凝 · ' + P.name);
  }
  add(S('soil'), '地形工具挖掘');
  add(S('scrap'), '遗址搜刮');
  return idx;
}
function renderCodex() {
  if (!el['codex-list']) return;
  if (!codexIndex) codexIndex = buildCodexIndex();
  const q = (el['codex-q'] && el['codex-q'].value || '').trim().toLowerCase();
  const order = { raw: 0, refined: 1, dust: 2, composite: 3, gas: 4, special: 5 };
  const ids = Object.keys(A.ITEMS)
    .filter((k) => !q || A.item(k).name.toLowerCase().includes(q) || k.includes(q) || (A.item(k).en || '').toLowerCase().includes(q))
    .sort((a, b) => ((order[A.item(a).cat] ?? 9) - (order[A.item(b).cat] ?? 9)) || A.item(a).name.localeCompare(A.item(b).name));
  if (!ids.length) { el['codex-list'].innerHTML = '<div class="empty">没有匹配的物品</div>'; return; }
  el['codex-list'].innerHTML = ids.map((k) => {
    const it = A.item(k);
    const idx = codexIndex[k] || { src: [], use: [] };
    const src = [...new Set(idx.src)].slice(0, 3).join(' · ') || '无天然来源（中间产物）';
    const use = [...new Set(idx.use)].slice(0, 4).join('、') || '—';
    return `<div class="codex-item">
      <div class="codex-head">
        <span class="sw" style="background:${A.itemColor(k)}"></span>
        <b>${it.name}</b><i>${CAT_NAME[it.cat] || it.cat}</i>
        ${it.bytes ? '<em>' + it.bytes + ' 字节</em>' : ''}
      </div>
      <div class="codex-line"><span>来源</span>${src}</div>
      <div class="codex-line"><span>用途</span>${use}</div>
    </div>`;
  }).join('');
}

// ---------------- 联机面板（0.9.0） ----------------
function renderNet() {
  const n = A.net;
  if (!n || !el['net-status']) return;
  if (!el['net-url'].value) el['net-url'].placeholder = n.defaultUrl();
  el['net-status'].textContent = n.online
    ? '房间 ' + n.code + (n.isHost ? ' · 房主' : ' · 成员') + ' · ' + (n.peers.size + 1) + ' 人 · ' +
      (n.fails ? '重连中…' : '同步中 ' + (n.latency || 0) + 'ms')
    : '未连接';
  el['net-status'].classList.toggle('on', n.online);
  const rows = n.peerRows();
  el['net-peers'].innerHTML = n.online
    ? ('<div class="net-peer me"><b>' + n.name + '</b><span>你 · ' + (n.isHost ? '房主' : '成员') + '</span></div>' +
       (rows.length ? rows.map((r) => `<div class="net-peer"><b>${r.name}</b><span>${r.host ? '房主 · ' : ''}${r.where}</span></div>`).join('') : '<div class="empty">还没有队友加入</div>'))
    : '<div class="empty">创建房间后把 4 位房号发给队友</div>';
  el['net-log'].innerHTML = n.log.length
    ? n.log.map((l) => l.sys
      ? `<div class="net-line sys">${l.t}</div>`
      : `<div class="net-line"><b>${l.by}</b><span>${l.t}</span></div>`).join('')
    : '<div class="empty">无线电静默。说说你的计划？</div>';
  el['net-log'].scrollTop = el['net-log'].scrollHeight;
}

// 星图 = 世界线的七颗锚点；点击只设定目标，玩家沿 w 平滑滑过去
function renderTravel() {
  const w = A.player.w;
  el['travel-list'].innerHTML = A.PLANETS.map((P, i) => {
    const cur = Math.abs(w - i) < 0.12;
    const c1 = '#' + P.pal.mid.toString(16).padStart(6, '0');
    const c2 = '#' + P.pal.high.toString(16).padStart(6, '0');
    return `<button class="planet ${cur ? 'cur' : ''}" data-go="${i}" style="--pl:${c1};--pl2:${c2}">
      <span class="pl-orb"></span>
      <span class="pn">${P.name}<i>${P.en}</i></span>
      <span class="pt">${P.type} · 难度${P.diff}</span>
      <span class="pd">☀ ${P.sun.toFixed(2)} · 风 ${P.wind.toFixed(2)} · 重力 ${P.grav.toFixed(2)}</span>
      <span class="pl-w">w = ${i}</span>
      ${cur ? '<span class="badge">当前所在</span>' : ''}
    </button>`;
  }).join('') +
    '<div class="travel-note">也可直接拖动屏幕下方的<b>世界线轨道</b>，或按数字键 <b>1–7</b> 设定航线。滑移会真实经过中间的每一颗行星，地形、天空与资源连续过渡。</div>';
}
function travelClick(e) {
  const b = e.target.closest('[data-go]');
  if (!b) return;
  closePanels();
  A.travel(+b.dataset.go);
}

// 死亡
function showDeath() {
  el.death.classList.remove('hidden');
  el['death-cause'].textContent = '氧气耗尽';
}
function hideDeath() { el.death.classList.add('hidden'); }

// 每帧
function update(dt) {
  refreshHUD();
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) el.toast.classList.remove('show');
  }
  if (openName === 'module' && A.ui.module) {
    const mod = A.ui.module;
    const bar = el['module-body'].querySelector('.job-bar i');
    if (bar && mod.job) bar.style.width = Math.min(100, mod.job.t / mod.job.total * 100) + '%';
  }
  // 模块交互提示
  if (!openName && !A.player.mount && !A.player.dead) {
    const ruin = A.ruins && A.ruins.nearest(A.player.x, A.player.z, 4.6);
    if (ruin) {
      setInteract('F · 搜刮' + (ruin.entry.label || '残骸'));
      return;
    }
    const m = A.build.nearest(A.player.x, A.player.z, 5.0);
    if (m) {
      const label = m.type === 'rover' ? '登上漫游车' : m.type === 'shuttle' ? '打开星图' : m.def.name;
      setInteract('F · ' + label);
    } else setInteract('');
  } else setInteract('');
}

A.ui = {
  init, toast, setPrompt, refreshHUD,
  refreshInventory(id) {
    if (openName === 'backpack') { renderBackpack(); renderPrinter(); }
    else if (openName === 'research') { renderResearch(); }
    else if (openName === 'module' && A.ui.module) renderModule(A.ui.module);
  },
  openPanel, closePanels, togglePanel, renderBackpack, renderPrinter, renderBuild,
  renderResearch, renderBlueprints, renderModule, refreshModule, renderTravel,
  renderCodex, renderNet,
  setPlanetChip, setToolMode, showDeath, hideDeath, setInteract, update, setViewLabel,
  el, hoverBuild: false,
  get openName() { return openName; }
};

})(window.A);
