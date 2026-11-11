/* ============================================================
   ASTRA·4D — 0. lib：命名空间 / 数学 / 行星表 / 调色板 / 音效
   零构建：所有文件挂到 window.A，按 index.html 顺序加载。
   ============================================================ */
window.A = window.A || {};

(function (A) {
'use strict';

// ---------------- 数学 ----------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const smoothstep = (x, e0, e1) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const sign = (v) => (v < 0 ? -1 : 1);
const fmt = (n) => (n >= 10000 ? Math.round(n / 1000) + 'k' : String(Math.round(n)));

A.M = { clamp, lerp, smooth, smoothstep, sign, fmt };

// 确定性随机（mulberry32）
A.rng = function (seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---------------- 四维噪声（连续性是一切的核心） ----------------
A.hash4 = function (x, y, z, w) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) +
           Math.imul(z | 0, 1274126177) + Math.imul(w | 0, 2246822519)) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
};

A.noise4 = function (x, y, z, w) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), wi = Math.floor(w);
  const u = smooth(x - xi), v = smooth(y - yi), s = smooth(z - zi), t = smooth(w - wi);
  const h = A.hash4;
  const c0000 = h(xi, yi, zi, wi),     c1000 = h(xi + 1, yi, zi, wi);
  const c0100 = h(xi, yi + 1, zi, wi), c1100 = h(xi + 1, yi + 1, zi, wi);
  const c0010 = h(xi, yi, zi + 1, wi), c1010 = h(xi + 1, yi, zi + 1, wi);
  const c0110 = h(xi, yi + 1, zi + 1, wi), c1110 = h(xi + 1, yi + 1, zi + 1, wi);
  const c0001 = h(xi, yi, zi, wi + 1), c1001 = h(xi + 1, yi, zi, wi + 1);
  const c0101 = h(xi, yi + 1, zi, wi + 1), c1101 = h(xi + 1, yi + 1, zi, wi + 1);
  const c0011 = h(xi, yi, zi + 1, wi + 1), c1011 = h(xi + 1, yi, zi + 1, wi + 1);
  const c0111 = h(xi, yi + 1, zi + 1, wi + 1), c1111 = h(xi + 1, yi + 1, zi + 1, wi + 1);
  const x00 = lerp(c0000, c1000, u), x10 = lerp(c0100, c1100, u);
  const x01 = lerp(c0010, c1010, u), x11 = lerp(c0110, c1110, u);
  const x20 = lerp(c0001, c1001, u), x30 = lerp(c0101, c1101, u);
  const x21 = lerp(c0011, c1011, u), x31 = lerp(c0111, c1111, u);
  const y0 = lerp(x00, x10, v), y1 = lerp(x01, x11, v);
  const y2 = lerp(x20, x30, v), y3 = lerp(x21, x31, v);
  return lerp(lerp(y0, y1, s), lerp(y2, y3, s), t) * 2 - 1;
};

A.fbm4 = function (x, y, z, w, oct) {
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * A.noise4(x * f, y * f, z * f, w * f);
    norm += amp; amp *= 0.5; f *= 2.02;
  }
  return sum / norm;
};

// ---------------- 7 颗行星（数值参照 Astroneer Wiki） ----------------
// sun / wind：0~1.5 的日照与风力系数，直接乘到发电量上
// grav：重力系数（跳跃与下落手感）
A.PLANETS = [
  {
    id: 'sylva', name: '希尔瓦', en: 'SYLVA', type: '类地行星', diff: '简单',
    sun: 1.0, wind: 1.0, grav: 1.0, atm: 1.0,
    fog: [64, 108], seed: 1337,
    // 地形参数
    terr: { amp: 4.6, freq: 0.021, oct: 4, detail: 0.40, flat: 0.0, mesa: 0.0, crater: 0.0 },
    pal: {
      skyTop: 0x5f9fd8, skyHor: 0xf6dfb0, sun: 0xfff3dc, fog: 0xf2d6a4,
      low: 0x4f8f74, mid: 0x9db877, high: 0xd9b183, rock: 0x8b7c74, crys: 0xa9a3cf
    },
    res: { organic: 12, compound: 26, resin: 22, laterite: 14, sphalerite: 8, malachite: 8, quartz: 6, ammonium: 4, graphite: 4 },
    storm: 210
  },
  {
    id: 'desolo', name: '德索罗', en: 'DESOLO', type: '类地卫星', diff: '简单',
    sun: 1.25, wind: 0.45, grav: 0.55, atm: 0.0,
    fog: [70, 130], seed: 2027,
    terr: { amp: 5.6, freq: 0.019, oct: 4, detail: 0.30, flat: 0.0, mesa: 0.0, crater: 0.85 },
    pal: {
      skyTop: 0x1c2338, skyHor: 0x7d7f96, sun: 0xfff0e0, fog: 0x8e8f9c,
      low: 0x6b6a72, mid: 0x9a968d, high: 0xc9c1b2, rock: 0x55535c, crys: 0xb9b3d0
    },
    res: { laterite: 20, wolframite: 16, sphalerite: 12, compound: 18, resin: 12, quartz: 10, graphite: 8, ammonium: 6, astronium: 2 },
    storm: 260
  },
  {
    id: 'calidor', name: '卡利多', en: 'CALIDOR', type: '干旱行星', diff: '中等',
    sun: 1.35, wind: 0.5, grav: 0.9, atm: 1.0,
    fog: [52, 96], seed: 3313,
    terr: { amp: 5.2, freq: 0.023, oct: 4, detail: 0.34, flat: 0.0, mesa: 1.0, crater: 0.0 },
    pal: {
      skyTop: 0xd8895a, skyHor: 0xf6d3a0, sun: 0xfff1cf, fog: 0xe8b183,
      low: 0xa9673c, mid: 0xcf9455, high: 0xe8c78d, rock: 0x8a573c, crys: 0xe0b0b8
    },
    res: { malachite: 20, wolframite: 16, laterite: 18, compound: 16, quartz: 8, ammonium: 6, graphite: 5, titanite: 2 },
    storm: 190
  },
  {
    id: 'vesania', name: '弗沙尼亚', en: 'VESANIA', type: '奇异行星', diff: '中等',
    sun: 0.75, wind: 1.25, grav: 0.85, atm: 1.0,
    fog: [46, 92], seed: 4111,
    terr: { amp: 5.0, freq: 0.026, oct: 4, detail: 0.42, flat: 0.0, mesa: 0.0, crater: 0.3 },
    pal: {
      skyTop: 0x4b3b7a, skyHor: 0xcba6d6, sun: 0xf2e0ff, fog: 0xb795c8,
      low: 0x4f4a7d, mid: 0x7d68a8, high: 0xb59ad0, rock: 0x3f3a5c, crys: 0x9ef0e0
    },
    res: { lithium: 18, titanite: 16, laterite: 14, compound: 18, resin: 12, graphite: 8, quartz: 6, astronium: 3 },
    storm: 230
  },
  {
    id: 'novus', name: '诺福斯', en: 'NOVUS', type: '奇异卫星', diff: '中等',
    sun: 1.1, wind: 1.3, grav: 0.6, atm: 1.0,
    fog: [58, 104], seed: 5209,
    terr: { amp: 4.2, freq: 0.028, oct: 3, detail: 0.36, flat: 0.1, mesa: 0.0, crater: 0.45 },
    pal: {
      skyTop: 0x2f5f78, skyHor: 0x8fd4cd, sun: 0xe8fffb, fog: 0x86c3c2,
      low: 0x2f6f6c, mid: 0x5b9a90, high: 0x9dc7b6, rock: 0x27504f, crys: 0xc0e8ff
    },
    res: { hematite: 18, lithium: 14, laterite: 16, compound: 18, resin: 14, quartz: 6, ammonium: 5, astronium: 2 },
    storm: 240
  },
  {
    id: 'glacio', name: '格拉西欧', en: 'GLACIO', type: '苔原行星', diff: '困难',
    sun: 0.5, wind: 1.45, grav: 1.05, atm: 1.0,
    fog: [40, 84], seed: 6301,
    terr: { amp: 5.8, freq: 0.022, oct: 4, detail: 0.30, flat: 0.05, mesa: 0.5, crater: 0.2 },
    pal: {
      skyTop: 0x9dc4d8, skyHor: 0xe4f1f6, sun: 0xffffff, fog: 0xdceaf0,
      low: 0x7fa2b2, mid: 0xb6cfd9, high: 0xe8f4f8, rock: 0x5f7d8c, crys: 0x8fd8f0
    },
    res: { titanite: 20, hematite: 18, laterite: 14, compound: 16, resin: 12, quartz: 8, ammonium: 4, astronium: 4 },
    storm: 175
  },
  {
    id: 'atrox', name: '阿特洛克斯', en: 'ATROX', type: '辐射行星', diff: '非常困难',
    sun: 0.55, wind: 0.7, grav: 1.15, atm: 1.0,
    fog: [34, 74], seed: 7477,
    terr: { amp: 6.2, freq: 0.02, oct: 4, detail: 0.44, flat: 0.0, mesa: 0.6, crater: 0.25 },
    pal: {
      skyTop: 0x25301f, skyHor: 0x8b9a5a, sun: 0xe3ffb0, fog: 0x77804e,
      low: 0x41502a, mid: 0x6b7838, high: 0x9aa45c, rock: 0x2e3520, crys: 0xc7e86a
    },
    res: { compound: 20, resin: 18, organic: 14, laterite: 16, astronium: 12, graphite: 6, ammonium: 5 },
    storm: 120
  }
];

A.planetById = (id) => A.PLANETS.find((p) => p.id === id) || A.PLANETS[0];

// ---------------- 空间视图：同一片四维场，切不同的三维 ----------
// 视图 "abc" 的含义：a = 地面横向，b = 高度方向，c = 地面纵向，缺的那个是相位轴。
// xyz 就是原始视角（高度 y，相位 w）；换成 xyw 时地面变成 (x,w) 平面，相位轴变成 z。
A.AXI = { x: 0, y: 1, z: 2, w: 3 };
A.VIEW_IDS = ['xyz', 'xyw', 'yzw', 'xzw'];

A.parseView = function (id) {
  const s = String(id || 'xyz').toLowerCase();
  if (!/^[xyzw]{3}$/.test(s)) return A.parseView('xyz');
  const set = new Set(s.split(''));
  let phase = 'w';
  for (const k of ['w', 'z', 'y', 'x']) if (!set.has(k)) { phase = k; break; }
  return { id: s, a: s[0], b: s[1], c: s[2], phase: phase };
};

A.view = A.parseView('xyz');

// 按当前视图把「地面两轴 + 相位」摆进四维噪声的四个槽位；b 槽放常数 k
const _s4 = [0, 0, 0, 0];
A.slice4 = function (u, v, p, k) {
  const vw = A.view, ix = A.AXI;
  _s4[0] = _s4[1] = _s4[2] = _s4[3] = 0;
  _s4[ix[vw.a]] = u;
  _s4[ix[vw.b]] = k;
  _s4[ix[vw.c]] = v;
  _s4[ix[vw.phase]] = p;
  return _s4;
};
A.noiseS = function (u, v, p, k) {
  const s = A.slice4(u, v, p, k);
  return A.noise4(s[0], s[1], s[2], s[3]);
};
A.fbmS = function (u, v, p, k, oct) {
  const s = A.slice4(u, v, p, k);
  return A.fbm4(s[0], s[1], s[2], s[3], oct);
};

// ---------------- 设备判定 ----------------
A.mobile = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
  /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent);
A.touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// ---------------- 音效（WebAudio 小合成器，零资源） ----------------
A.sfx = (function () {
  let ctx = null, muted = false;
  function ac() {
    if (muted) return null;
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type, gain) {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(gain || 0.06, c.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start(); o.stop(c.currentTime + dur + 0.02);
  }
  return {
    blip: () => tone(720, 0.09, 'triangle', 0.05),
    ok: () => { tone(520, 0.1, 'triangle', 0.05); setTimeout(() => tone(780, 0.14, 'triangle', 0.045), 70); },
    err: () => tone(180, 0.16, 'sawtooth', 0.035),
    harvest: () => tone(300 + Math.random() * 140, 0.07, 'square', 0.022),
    digit: () => tone(140 + Math.random() * 60, 0.05, 'sawtooth', 0.02),
    toggle() { muted = !muted; return muted; },
    get muted() { return muted; }
  };
})();

})(window.A);
