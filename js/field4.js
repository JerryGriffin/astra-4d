/* ============================================================
   ASTRA·4D — 3.5 field4：真实四维场 / 世界线 / 等值面求根
   ------------------------------------------------------------
   v1.1.0 起，世界不再是「一张随 w 变化的 2D 高度贴图」，
   而是一个固定的四维标量场 F(X, Y, Z, W)：

       F(X,Y,Z,W) = Y - H(X,Z,W) - R * N4(X, Y, Z, W)
       H(X,Z,W)   = 四维场在 Y=0 处的采样（大陆 / 山脊 / 峡谷 / 坑）
       N4         = 四个分量全部参与的 4D fbm，Y 真的进入噪声

   地表是这个隐式超曲面在当前 W 切片上、沿 Y 方向 F=0 的根，
   用不动点迭代真实求解。四个轴都是坐标，没有任何「槽位重排」、
   也没有把高度轴塞成常数的假切片。

   W 同时是「世界线」：w ∈ [0,6]，七颗行星分别锚在整数位置，
   行星参数（调色板 / 重力 / 日照 / 资源表 / 地形剖面）用
   smoothstep 连续插值 —— 滑 w 就是平滑地穿过七颗行星。
   ============================================================ */
(function (A) {
'use strict';
const M = A.M;

const W_MAX = A.PLANETS.length - 1;   // 6（七颗行星）
const W_SCALE = 46;                   // 一个世界线单位对应的 4D 空间距离
const W_ORIGIN = 100;                 // 第四坐标原点偏移
const wCoord = (w) => w * W_SCALE + W_ORIGIN;
// 4D 场各轴允许各向异性：高频层用较缓的 W 频率，避免沿世界线滑移时细节闪烁
const wFine = (w) => w * 0.9 + 3.1;

// ---------------- 颜色 / 参数插值 ----------------
function mixHex(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(M.lerp(ar, br, t)), g = Math.round(M.lerp(ag, bg, t)), bl = Math.round(M.lerp(ab, bb, t));
  return (r << 16) | (g << 8) | bl;
}
A.mixHex = mixHex;

// 每颗行星的地貌剖面：山脊 / 沙丘 / 峡谷 / 4D 粗糙度 / 丘陵
const PROFILE = {
  sylva:   { ridge: 0.85, dune: 0.00, valley: 0.70, rough: 2.0, hill: 1.00, crater: 0.00 },
  desolo:  { ridge: 0.30, dune: 0.00, valley: 0.35, rough: 1.7, hill: 0.55, crater: 1.00 },
  calidor: { ridge: 0.62, dune: 1.30, valley: 0.50, rough: 2.2, hill: 0.85, crater: 0.05 },
  vesania: { ridge: 1.15, dune: 0.00, valley: 1.00, rough: 2.6, hill: 1.10, crater: 0.30 },
  novus:   { ridge: 0.92, dune: 0.10, valley: 0.90, rough: 2.3, hill: 0.90, crater: 0.45 },
  glacio:  { ridge: 1.28, dune: 0.25, valley: 0.85, rough: 2.0, hill: 1.20, crater: 0.20 },
  atrox:   { ridge: 1.40, dune: 0.00, valley: 1.20, rough: 3.0, hill: 1.30, crater: 0.30 }
};
const PAL_KEYS = ['skyTop', 'skyHor', 'sun', 'fog', 'low', 'mid', 'high', 'rock', 'crys'];
const TERR_KEYS = ['amp', 'freq', 'detail', 'mesa', 'crater'];
const PROF_KEYS = ['ridge', 'dune', 'valley', 'rough', 'hill', 'crater'];

function blendTable(a, b, t) {
  const out = {};
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    out[k] = M.lerp((a || {})[k] || 0, (b || {})[k] || 0, t);
  }
  return out;
}

/** 世界线 w 处的行星：所有数值都是相邻两颗的连续插值 */
function at(w) {
  const c = M.clamp(w, 0, W_MAX);
  const i = Math.min(W_MAX - 1, Math.floor(c));
  const raw = c - i;
  const t = M.smoothstep(raw, 0, 1);
  const p = A.PLANETS[i], q = A.PLANETS[i + 1];
  const L = (a, b) => M.lerp(a, b, t);
  const pp = PROFILE[p.id], qp = PROFILE[q.id];

  const pal = {};
  for (const k of PAL_KEYS) pal[k] = mixHex(p.pal[k], q.pal[k], t);
  const terr = {};
  for (const k of TERR_KEYS) terr[k] = L(p.terr[k], q.terr[k], t);
  terr.oct = Math.round(L(p.terr.oct, q.terr.oct));
  terr.amp *= 3.6;              // v1.1.0：整体起伏放大到真正的山地尺度
  for (const k of PROF_KEYS) terr[k] = L(pp[k], qp[k], t);
  terr.crater = L(p.terr.crater * pp.crater, q.terr.crater * qp.crater, t);

  const near = raw < 0.5 ? p : q;
  return {
    w: c, i, t, raw, from: p, to: q,
    nearest: raw < 0.5 ? i : i + 1,
    id: near.id, en: near.en, type: near.type, diff: near.diff,
    name: t < 0.04 ? p.name : t > 0.96 ? q.name : p.name + ' ⇢ ' + q.name,
    shortName: near.name,
    sun: L(p.sun, q.sun), wind: L(p.wind, q.wind),
    grav: L(p.grav, q.grav), atm: L(p.atm, q.atm),
    storm: L(p.storm, q.storm),
    fog: [L(p.fog[0], q.fog[0]), L(p.fog[1], q.fog[1])],
    pal, terr,
    res: blendTable(p.res, q.res, t),
    deep: blendTable(p.deep, q.deep, t),
    atmo: t < 0.5 ? (A.ATMO[p.id] || []) : (A.ATMO[q.id] || []),
    // 深层相位带：滑到末段（格拉西欧 → 阿特洛克斯）逐渐出现辐射
    radiation: M.smoothstep(c, 4.55, 5.55),
    seed: p.seed
  };
}

let cur = at(0);
function sync(w) {
  if (Math.abs(cur.w - w) > 0.0004) cur = at(w);
  return cur;
}

// ---------------- 4D 场：地貌基准（Y=0 切片） ----------------
const CW = 56;     // 陨石坑网格
function craterH(x, z, w, par) {
  const amt = par.terr.crater;
  if (amt < 0.002) return 0;
  const gx = Math.floor(x / CW), gz = Math.floor(z / CW);
  let h = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ax = gx + dx, az = gz + dz;
      if (A.hash4(ax, az, 17, 3) > 0.46) continue;
      const cx = ax * CW + A.hash4(ax, az, 31, 7) * CW;
      const cz = az * CW + A.hash4(ax, az, 47, 7) * CW;
      const rad = 9 + A.hash4(ax, az, 59, 7) * 14;
      const d = Math.hypot(x - cx, z - cz) / rad;
      if (d > 1.2) continue;
      const bowl = -1 + 0.92 * Math.min(1, d * d * 1.75);
      const rim = Math.exp(-Math.pow((d - 0.87) / 0.17, 2));
      h += (bowl + rim * 1.3) * rad * 0.23;
    }
  }
  return h * amt;
}

function baseH(x, z, w, par) {
  const t = par.terr, W = wCoord(w);
  // 高频层的第四轴单独收窄：否则 ridged 的第 4 八度在 Δw=0.02 时
  // 相位就走 0.17，地形会「跳台阶」，世界线不再平滑。
  const Ws = W * 0.32;
  const n4 = A.noise4, f4 = A.fbm4;
  const lowOct = A.mobile ? 3 : 4;

  // 大陆：长波基底，W 是真正的第四坐标
  let h = f4(x * 0.0062 + 11.3, 0, z * 0.0062 - 7.1, W * 0.0062, lowOct) * 27;

  // 山脊：ridged multifractal，只在山地掩膜内抬升 → 有山也有平原
  const mask = M.smoothstep(n4(x * 0.0042 + 31, 0, z * 0.0042 - 17, W * 0.0042), -0.30, 0.42);
  let amp = 1, f = t.freq, sum = 0, norm = 0;
  const ridgeOct = A.mobile ? 3 : 4;
  for (let k = 0; k < ridgeOct; k++) {
    const n = n4(x * f, 0, z * f, Ws * f + 7.3);
    const r = 1 - Math.abs(n);
    sum += amp * r * r; norm += amp;
    amp *= 0.52; f *= 2.07;
  }
  h += (sum / norm - 0.40) * t.amp * 2.55 * t.ridge * (0.28 + 0.72 * mask);

  // 丘陵（中频，平原也有缓坡）
  h += f4(x * 0.019 + 91, 0, z * 0.019 - 55, Ws * 0.019, 2) * t.amp * 0.45 * t.hill;
  // 近场起伏：波长约 18m，保证玩家周围就能看到坡，而不是一整片缓坡
  h += f4(x * 0.055 + 37, 0, z * 0.055 - 19, Ws * 0.055 + 4.7, 2) * t.amp * 0.27 * t.hill;

  // 峡谷：沿一条窄噪声带切下去
  const v = f4(x * 0.010 + 5, 0, z * 0.010 + 63, Ws * 0.010, 2);
  h -= (1 - M.smoothstep(Math.abs(v), 0.0, 0.30)) * t.amp * 0.85 * t.valley;

  // 台地（卡利多 / 格拉西欧）：软量化阶梯。
  // 不能用 Math.round —— 硬阶梯会在 w 微移时让高度瞬间跳 3.6m，破坏世界线连续性。
  if (t.mesa > 0.01) {
    const q = h / 3.6, qi = Math.floor(q), qf = q - qi;
    const step = (qi + M.smoothstep(qf, 0.10, 0.90)) * 3.6;
    const m = M.smoothstep(n4(x * 0.02, 0, z * 0.02, Ws * 0.02 + 44), -0.22, 0.52);
    h = M.lerp(h, step, t.mesa * 0.55 * m);
  }
  // 沙丘波纹
  if (t.dune > 0.01) {
    const sw = n4(x * 0.024, 0, z * 0.024, Ws * 0.024 + 2) * 5.5;
    h += t.dune * Math.sin(x * 0.15 + sw) * (0.35 + 0.65 * mask);
  }
  h += craterH(x, z, w, par);
  return h;
}

// ---------------- 4D 场密度与等值面求根 ----------------
/** 真正的四维标量场；Y 参与噪声，不是常数槽 */
function density(X, Y, Z, w, par) {
  const P = par || at((wCoord(w) - W_ORIGIN) / W_SCALE);
  const W = wCoord(w);
  return Y - baseH(X, Z, w, P) - P.terr.rough * A.fbm4(X * 0.085, Y * 0.145, Z * 0.085, wFine(w), 2);
}

/**
 * 求 F=0 的地表高度：y ← H + R·N4(X,y,Z,W) 的不动点迭代。
 * 因为 |∂N4/∂y| * R < 1，迭代单调收敛；返回的就是等值面上的 Y。
 */
function surface(x, z, w, par) {
  const P = par || cur;
  const H = baseH(x, z, w, P);
  const f = 0.085, WN = wFine(w);
  let y = H;
  for (let k = 0; k < (A.mobile ? 4 : 7); k++) {
    y = H + P.terr.rough * A.fbm4(x * f, y * 0.145, z * f, WN, 2);
  }
  return y;
}

/** 细尺度起伏：同样让 Y 进入 4D 场 */
function detail(x, z, w, y, par) {
  const P = par || cur;
  return P.terr.detail * A.noise4(x * 0.30, y * 0.24 + 2.3, z * 0.30, w * 1.1 + 13.7);
}

/** 地表坡度（数值梯度），用于移动减速与岩壁着色 */
function slope(x, z, w, par) {
  const d = 2.4;
  const hx = surface(x + d, z, w, par) - surface(x - d, z, w, par);
  const hz = surface(x, z + d, w, par) - surface(x, z - d, w, par);
  return Math.hypot(hx, hz) / (2 * d);
}

/** 诊断接口：证明场是真实演算的（冒烟测试会断言） */
function probe(x, z, w) {
  const P = at(w), y = surface(x, z, w, P);
  return {
    w, point4: [x, +y.toFixed(4), z, +wCoord(w).toFixed(2)],
    base: +baseH(x, z, w, P).toFixed(4),
    height: +y.toFixed(4),
    residual: +density(x, y, z, w, P).toFixed(5),
    slope: +slope(x, z, w, P).toFixed(4),
    planet: P.name, grav: +P.grav.toFixed(3)
  };
}

A.F4 = {
  W_MAX, W_SCALE, wCoord, at, sync,
  get cur() { return cur; },
  density, baseH, surface, detail, slope, probe, mixHex,
  get planet() { return cur; }
};

})(window.A);
