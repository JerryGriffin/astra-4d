/* ============================================================
   ASTRA·4D — 5.6 viz：图形化 HUD / 世界线 / 小地图 / 剖面 / 4D 场
   ------------------------------------------------------------
   这里的每一张图都直接采样 field4 的 4D 场，不是示意图：
   · 小地图与剖面 = F=0 等值面求根的真实高度
   · 四维场面板   = F(X,Y,Z,W) 的真实密度切片（XZ / YW / ZW 投影）
   ============================================================ */
(function (A) {
'use strict';
const M = A.M;
const $ = (id) => document.getElementById(id);
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

let mapCtx, profCtx, ringCtx, fieldCtx;
let wlCursor, wlInfo, wlPlanets, wlTrack;
let mapAcc = 0, profAcc = 0, ringAcc = 0, fieldAcc = 0, probeAcc = 0;
let fieldMode = 'XZ';
let started = false;

// ---------------- 世界线轨道 ----------------
function buildWorldline() {
  wlTrack = $('wl-track'); wlPlanets = $('wl-planets');
  wlCursor = $('wl-cursor'); wlInfo = $('wl-info');
  if (!wlTrack || !wlPlanets) return;
  wlPlanets.innerHTML = A.PLANETS.map((P, i) => {
    const c = hex(P.pal.mid), c2 = hex(P.pal.high), ring = hex(P.pal.crys);
    return `<button class="wl-planet" data-w="${i}" style="--pl:${c};--pl2:${c2};--ring:${ring};left:${(i / A.F4.W_MAX * 100).toFixed(2)}%"
      title="${P.name} · ${P.type} · 重力 ${P.grav}"><span class="wl-orb"></span><span class="wl-nm">${P.name}</span></button>`;
  }).join('');
  wlPlanets.querySelectorAll('[data-w]').forEach((b) => {
    b.addEventListener('click', (e) => { e.stopPropagation(); A.travel(+b.dataset.w); });
  });
  const setFromEvent = (e) => {
    const r = wlTrack.getBoundingClientRect();
    const v = M.clamp((e.clientX - r.left) / r.width, 0, 1) * A.F4.W_MAX;
    A.player.w = v; A.player.wVel = 0; A.player.wTarget = null;
    A.world.setW(v);
    A.viz.dirty = true;
  };
  let dragging = false;
  wlTrack.addEventListener('pointerdown', (e) => {
    dragging = true; wlTrack.setPointerCapture(e.pointerId); setFromEvent(e);
    e.preventDefault();
  });
  wlTrack.addEventListener('pointermove', (e) => { if (dragging) setFromEvent(e); });
  const end = () => { dragging = false; };
  wlTrack.addEventListener('pointerup', end);
  wlTrack.addEventListener('pointercancel', end);
}

function updateWorldline() {
  const w = A.player.w, P = A.F4.cur;
  if (wlCursor) wlCursor.style.left = (w / A.F4.W_MAX * 100).toFixed(2) + '%';
  if (wlPlanets) wlPlanets.querySelectorAll('[data-w]').forEach((b) => {
    b.classList.toggle('near', Math.abs(+b.dataset.w - w) < 0.42);
  });
  if (wlInfo) {
    const anchor = Math.round(w);
    const transit = Math.abs(w - anchor);
    const txt = transit < 0.06
      ? P.shortName + ' · 稳定'
      : P.from.name + ' → ' + P.to.name + ' · ' + Math.round(P.t * 100) + '%';
    if (wlInfo.textContent !== txt) wlInfo.textContent = txt;
  }
  const rd = $('w-readout');
  if (rd) { const s = w.toFixed(2); if (rd.textContent !== s) rd.textContent = s; }
}

// ---------------- 环境仪表 ----------------
function updateEnvBars() {
  const P = A.F4.cur;
  const set = (id, v, label) => {
    const e = $(id); if (!e) return;
    const bar = e.querySelector('i'); const num = e.querySelector('b');
    if (bar) bar.style.width = M.clamp(v, 0, 1) * 100 + '%';
    if (num && label !== undefined) num.textContent = label;
  };
  set('env-sun', P.sun * A.env.day / 1.5, (P.sun * A.env.day).toFixed(2));
  set('env-wind', P.wind * A.env.wind / 1.5, (P.wind * A.env.wind).toFixed(2));
  set('env-grav', P.grav / 1.5, P.grav.toFixed(2));
  set('env-rad', P.radiation, Math.round(P.radiation * 100) + '%');
  const chip = $('env-planet');
  if (chip) {
    const t = P.shortName + ' · ' + P.type;
    if (chip.textContent !== t) chip.textContent = t;
  }
}

// ---------------- 环形状态表 ----------------
function drawRings() {
  if (!ringCtx) return;
  const c = ringCtx, S = ringCtx.canvas.width, cx = S / 2, cy = S / 2;
  c.clearRect(0, 0, S, S);
  const p = A.player;
  const rings = [
    { r: 37, v: p.oxygen / p.oxygenMax, col: '#5bb8e8' },
    { r: 29, v: p.health / 100, col: '#6ecf96' },
    { r: 21, v: p.soil / p.soilMax, col: '#d9a56a' }
  ];
  for (const g of rings) {
    c.beginPath(); c.arc(cx, cy, g.r, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(255,255,255,.16)'; c.lineWidth = 5; c.stroke();
    c.beginPath(); c.arc(cx, cy, g.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * M.clamp(g.v, 0, 1));
    c.strokeStyle = g.col; c.lineWidth = 5; c.lineCap = 'round'; c.stroke();
  }
  c.fillStyle = 'rgba(255,255,255,.92)';
  c.font = '700 15px "Space Mono", monospace';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(Math.round(p.oxygen), cx, cy - 1);
  c.font = '9px "Space Mono", monospace';
  c.fillStyle = 'rgba(255,255,255,.6)';
  c.fillText('O₂', cx, cy + 12);
}

// ---------------- 小地图（真实等值面高度） ----------------
function drawMap() {
  if (!mapCtx) return;
  const c = mapCtx, W = c.canvas.width, H = c.canvas.height;
  const p = A.player, w = p.w, P = A.F4.cur;
  const R = 78, N = 26;
  const hs = new Float32Array(N * N);
  let lo = 1e9, hi = -1e9;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = p.x + (i / (N - 1) - 0.5) * 2 * R;
      const z = p.z + (j / (N - 1) - 0.5) * 2 * R;
      const h = A.F4.surface(x, z, w, P);
      hs[j * N + i] = h;
      if (h < lo) lo = h; if (h > hi) hi = h;
    }
  }
  const span = Math.max(6, hi - lo);
  const cw = W / (N - 1), ch = H / (N - 1);
  c.clearRect(0, 0, W, H);
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const h = hs[j * N + i];
      const t = M.clamp((h - lo) / span, 0, 1);
      const col = t < 0.5 ? A.F4.mixHex(P.pal.low, P.pal.mid, t * 2)
                          : A.F4.mixHex(P.pal.mid, P.pal.high, (t - 0.5) * 2);
      c.fillStyle = hex(col);
      c.fillRect(i * cw, j * ch, cw + 1, ch + 1);
      const hR = hs[j * N + i + 1], hD = hs[(j + 1) * N + i];
      if (Math.floor(h / 5) !== Math.floor(hR / 5) || Math.floor(h / 5) !== Math.floor(hD / 5)) {
        c.strokeStyle = 'rgba(20,26,36,.30)'; c.lineWidth = 0.7;
        c.beginPath(); c.moveTo(i * cw, j * ch); c.lineTo(i * cw + cw, j * ch + ch); c.stroke();
      }
    }
  }
  // 网格与方位
  c.strokeStyle = 'rgba(255,255,255,.13)'; c.lineWidth = 0.6;
  c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1; c.strokeRect(0.5, 0.5, W - 1, H - 1);

  const toXY = (x, z) => [W / 2 + (x - p.x) / R * (W / 2), H / 2 + (z - p.z) / R * (H / 2)];
  const scanOn = A.world.scanning > (A.viz.time || 0);

  // 矿脉 / 异常结晶
  for (const n of A.world.nodes) {
    if (n.harvested) continue;
    if (Math.abs(w - n.wPos) > (scanOn ? 2.2 : 0.75)) continue;
    if (Math.hypot(n.x - p.x, n.z - p.z) > R) continue;
    const [mx, my] = toXY(n.x, n.z);
    const an = n.band === 'anomaly';
    c.fillStyle = an ? '#d69aff' : hex(A.item(n.type).color);
    c.beginPath(); c.arc(mx, my, an ? 3.4 : 2, 0, Math.PI * 2); c.fill();
    if (an || scanOn) {
      c.strokeStyle = an ? 'rgba(214,154,255,.65)' : 'rgba(255,255,255,.5)';
      c.lineWidth = 1; c.beginPath(); c.arc(mx, my, 5.5, 0, Math.PI * 2); c.stroke();
    }
  }
  // 遗址与模块
  c.fillStyle = '#8ef0d0';
  for (const s of (A.ruins.sites || [])) {
    if (Math.hypot(s.x - p.x, s.z - p.z) > R) continue;
    const [mx, my] = toXY(s.x, s.z);
    c.fillRect(mx - 2, my - 2, 4, 4);
  }
  c.fillStyle = '#ffd166';
  for (const m of (A.build.modules || [])) {
    if (Math.hypot(m.x - p.x, m.z - p.z) > R) continue;
    const [mx, my] = toXY(m.x, m.z);
    c.beginPath(); c.arc(mx, my, 2.4, 0, Math.PI * 2); c.fill();
  }
  // 玩家（朝向三角形）
  c.save(); c.translate(W / 2, H / 2); c.rotate(-p.facing);
  c.fillStyle = '#ffffff'; c.strokeStyle = 'rgba(20,26,36,.75)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(0, 2.5); c.lineTo(-5, 5); c.closePath();
  c.fill(); c.stroke(); c.restore();

  const cap = $('map-caption');
  if (cap) cap.textContent = '±78m · ' + lo.toFixed(0) + ' ~ ' + hi.toFixed(0) + 'm';
}

// ---------------- 地形剖面 ----------------
function drawProfile() {
  if (!profCtx) return;
  const c = profCtx, W = c.canvas.width, H = c.canvas.height;
  const p = A.player, P = A.F4.cur;
  const yaw = p.cam.theta, dx = -Math.sin(yaw), dz = -Math.cos(yaw);
  const L = 74, N = 56;
  const hs = new Float32Array(N);
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1) - 0.5) * 2 * L;
    const h = A.F4.surface(p.x + dx * t, p.z + dz * t, p.w, P);
    hs[i] = h; if (h < lo) lo = h; if (h > hi) hi = h;
  }
  const span = Math.max(8, hi - lo), pad = 8;
  const Y = (h) => H - pad - (h - lo) / span * (H - pad * 2);
  c.clearRect(0, 0, W, H);
  const grad = c.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, hex(P.pal.high)); grad.addColorStop(0.55, hex(P.pal.mid)); grad.addColorStop(1, hex(P.pal.low));
  c.beginPath(); c.moveTo(0, H);
  for (let i = 0; i < N; i++) c.lineTo(i / (N - 1) * W, Y(hs[i]));
  c.lineTo(W, H); c.closePath();
  c.fillStyle = grad; c.globalAlpha = 0.85; c.fill(); c.globalAlpha = 1;
  c.beginPath();
  for (let i = 0; i < N; i++) { const x = i / (N - 1) * W, y = Y(hs[i]); i ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1.4; c.stroke();
  // 玩家位置
  c.strokeStyle = 'rgba(255,255,255,.45)'; c.setLineDash([3, 3]);
  c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.stroke(); c.setLineDash([]);
  const gy = Y(A.world.height(p.x, p.z, p.w));
  c.fillStyle = '#fff'; c.beginPath(); c.arc(W / 2, gy, 3, 0, Math.PI * 2); c.fill();
  const cap = $('profile-caption');
  if (cap) cap.textContent = '沿视线 ±74m · 落差 ' + (hi - lo).toFixed(0) + 'm';
}

// ---------------- 四维场面板：真实密度切片 ----------------
function drawField() {
  if (!fieldCtx) return;
  const c = fieldCtx, W = c.canvas.width, H = c.canvas.height;
  const p = A.player, w = p.w, N = 38;
  const px = p.x, pz = p.z, y0 = A.world.height(px, pz, w);
  const cw = W / N, ch = H / N;
  const vals = new Float32Array(N * N);
  c.clearRect(0, 0, W, H);
  for (let j = 0; j < N; j++) {
    const ww = (j / (N - 1)) * A.F4.W_MAX;
    const rowPar = fieldMode === 'XZ' ? A.F4.cur : A.F4.at(ww);
    for (let i = 0; i < N; i++) {
      let val;
      if (fieldMode === 'XZ') {
        const u = px + (i / (N - 1) - 0.5) * 130;
        const v = pz + (j / (N - 1) - 0.5) * 130;
        val = A.F4.density(u, y0, v, w, rowPar);
      } else if (fieldMode === 'YW') {
        const y = -26 + (i / (N - 1)) * 62;
        val = A.F4.density(px, y, pz, ww, rowPar);
      } else {
        const z = pz + (i / (N - 1) - 0.5) * 130;
        val = A.F4.density(px, y0, z, ww, rowPar);
      }
      vals[j * N + i] = val;
      const t = M.clamp(val / 26 + 0.5, 0, 1);
      // 负（实体）偏紫蓝，正（空）偏暖橙，F=0 附近发白 → 等值面清晰可见
      const col = t < 0.5
        ? A.F4.mixHex(0x2d3a72, 0xf2f6ff, t * 2)
        : A.F4.mixHex(0xf2f6ff, 0xe08a3c, (t - 0.5) * 2);
      c.fillStyle = hex(col);
      c.fillRect(i * cw, j * ch, cw + 1, ch + 1);
    }
  }
  // 等值面描边（复用刚算出的真实密度，不重复求值）
  c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.2;
  c.beginPath();
  let pen = false;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      if (Math.abs(vals[j * N + i]) < 1.1) {
        const x = (i + 0.5) * cw, y = (j + 0.5) * ch;
        if (!pen) { c.moveTo(x, y); pen = true; } else c.lineTo(x, y);
      } else pen = false;
    }
  }
  c.stroke();
  const lab = $('field-axis');
  if (lab) lab.textContent = fieldMode === 'XZ'
    ? '横 X · 纵 Z · 固定 Y=' + y0.toFixed(1) + '、W=' + w.toFixed(2)
    : fieldMode === 'YW'
      ? '横 Y(-26~36) · 纵 W(0~6) · 固定 X=' + px.toFixed(0) + '、Z=' + pz.toFixed(0)
      : '横 Z · 纵 W(0~6) · 固定 X=' + px.toFixed(0) + '、Y=' + y0.toFixed(1);
}

function updateProbe() {
  const e = $('field-probe'); if (!e) return;
  const q = A.F4.probe(A.player.x, A.player.z, A.player.w);
  e.innerHTML =
    `<div><span>四维坐标 (X,Y,Z,W)</span><b>${q.point4.join(' , ')}</b></div>` +
    `<div><span>场基准 H(X,0,Z,W)</span><b>${q.base}</b></div>` +
    `<div><span>等值面解 Y  (F=0)</span><b>${q.height}</b></div>` +
    `<div><span>残差 F(X,Y,Z,W)</span><b>${q.residual}</b></div>` +
    `<div><span>地表梯度 |∇h|</span><b>${q.slope}</b></div>` +
    `<div><span>当前行星 / 重力</span><b>${q.planet} · ${q.grav}</b></div>`;
}

function renderGoals() {
  const el = $('goals-list'); if (!el || !A.goals) return;
  const pr = A.goals.progress();
  const pct = Math.round(pr.done / pr.total * 100);
  const head = `<div class="goals-head">
      <div class="goals-ring" style="--pct:${pct}"><b>${pr.done}</b><i>/ ${pr.total}</i></div>
      <div class="goals-sum"><h3>远征进度 ${pct}%</h3><p>已累计获得 <b>${pr.bytes}</b> 字节 · 里程碑自动结算</p></div>
    </div>`;
  const groups = {};
  for (const g of A.goals.list()) (groups[g.group] || (groups[g.group] = [])).push(g);
  const body = Object.entries(groups).map(([name, arr]) =>
    `<div class="goals-group"><h4>${name}</h4><div class="goals-grid">${arr.map((g) =>
      `<div class="goal ${g.done ? 'done' : ''}"><span class="goal-ic">${g.done ? '✓' : g.icon}</span>
        <b>${g.name}</b><p>${g.desc}</p><em>+${g.reward} 字节</em></div>`).join('')}</div></div>`
  ).join('');
  el.innerHTML = head + body;
}

// ---------------- 生命周期 ----------------
function init() {
  buildWorldline();
  const mk = (id) => { const el = $(id); return el ? el.getContext('2d') : null; };
  mapCtx = mk('viz-map'); profCtx = mk('viz-profile'); ringCtx = mk('viz-rings'); fieldCtx = mk('field-canvas');
  document.querySelectorAll('[data-field-mode]').forEach((b) => {
    b.addEventListener('click', () => {
      fieldMode = b.dataset.fieldMode;
      document.querySelectorAll('[data-field-mode]').forEach((o) => o.classList.toggle('on', o === b));
      A.viz.dirty = true;
    });
  });
  const fw = $('field-w');
  if (fw) fw.addEventListener('input', () => {
    const v = +fw.value;
    A.player.w = v; A.player.wVel = 0; A.player.wTarget = null;
    A.world.setW(v);
    A.viz.dirty = true;
  });
  const scan = $('btn-scan');
  if (scan) scan.addEventListener('click', () => {
    A.world.scanPulse(A.viz.time || 0);
    A.sfx.ok(); A.ui.toast('相位扫描 · 附近矿脉已标出 9 秒');
  });
}

function tick(dt, time) {
  if (!started) started = true;
  A.viz.time = time;
  updateWorldline();
  updateEnvBars();
  ringAcc += dt; if (ringAcc > 0.1) { ringAcc = 0; drawRings(); }
  profAcc += dt; if (profAcc > 0.18) { profAcc = 0; drawProfile(); }
  mapAcc += dt; if (mapAcc > 0.32 || A.viz.dirty) { mapAcc = 0; drawMap(); }
  const fieldOpen = A.ui && A.ui.openName === 'field';
  const goalsOpen = A.ui && A.ui.openName === 'goals';
  if (fieldOpen) {
    fieldAcc += dt; probeAcc += dt;
    if (fieldAcc > 0.45 || A.viz.dirty) { fieldAcc = 0; drawField(); }
    if (probeAcc > 0.25 || A.viz.dirty) { probeAcc = 0; updateProbe(); }
    const fw = $('field-w'); if (fw && document.activeElement !== fw) fw.value = A.player.w.toFixed(2);
  }
  if (goalsOpen && (A.viz.dirty || probeAcc > 0.8)) renderGoals();
  A.viz.dirty = false;
}

A.viz = {
  init, tick, drawField, drawMap, drawProfile, renderGoals,
  start() { A.viz.dirty = true; },
  dirty: true, time: 0,
  get mode() { return fieldMode; },
  setMode(m) { fieldMode = m; A.viz.dirty = true; }
};

})(window.A);
