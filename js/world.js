/* ============================================================
   ASTRA·4D — 2. world：真实 4D 等值面地形 / 编辑层 / 装饰 / 矿脉 / 风暴
   ------------------------------------------------------------
   v1.1.0：地表高度来自 field4.surface（4D 场 F=0 的等值面求根）。
   网格顶点、玩家、矿脉、系绳、模块全部读同一份顶点数据 → 零误差。
   所有物体一次性散布在 (x, z, w) 里；滑移 w 只改变可见窗口，
   不再「重建一颗行星」，因此七颗行星之间是真正连续的。
   ============================================================ */
(function (A) {
'use strict';
const M = A.M;

const COARSE = 4.8;      // 粗晶格
const ED_CELL = 1.3;     // 编辑层格子
const ED_W = 0.5;        // 编辑层的世界线桶宽
const ED_MAX = 7;        // 单格最大挖深/堆高

const state = {
  pi: 0, w: 0,
  seed: 1337,
  edits: new Map(),
  dirty: false,
  storm: { timer: 100, active: false, intensity: 0, t: 0 },
  scanUntil: 0,
  samplePool: []
};

// 主网格共享的粗晶格（高度 + 颜色）。height() 直接插值主网格顶点，
// 保证「看到的地形」和「踩到的地形」是同一张曲面。
const grid = { H: null, C: null, cn: 0, g0x: 0, g0z: 0, w: NaN };

// ---------------- 编辑层 ----------------
function ekey(gx, gz, wb) { return ((gx + 8192) * 16384 + (gz + 8192)) * 128 + (wb + 64); }
function eRaw(gx, gz, wb) { return state.edits.get(ekey(gx, gz, wb)) || 0; }
function eSet(gx, gz, wb, v) {
  const k = ekey(gx, gz, wb);
  if (Math.abs(v) < 0.004) state.edits.delete(k);
  else state.edits.set(k, M.clamp(v, -ED_MAX, ED_MAX));
}
function eCell(gx, gz, w) {
  const wf = w / ED_W, wb = Math.floor(wf), f = M.smooth(wf - wb);
  const a = eRaw(gx, gz, wb), b = eRaw(gx, gz, wb + 1);
  return a + (b - a) * f;
}
function editAt(x, z, w) {
  if (state.edits.size === 0) return 0;
  const gx = x / ED_CELL, gz = z / ED_CELL;
  const x0 = Math.floor(gx), z0 = Math.floor(gz);
  const u = M.smooth(gx - x0), v = M.smooth(gz - z0);
  const a = eCell(x0, z0, w), b = eCell(x0 + 1, z0, w);
  const c = eCell(x0, z0 + 1, w), d = eCell(x0 + 1, z0 + 1, w);
  return M.lerp(M.lerp(a, b, u), M.lerp(c, d, u), v);
}
function addEdit(x, z, w, amount) {
  const gx = Math.floor(x / ED_CELL), gz = Math.floor(z / ED_CELL);
  const wf = w / ED_W, wb = Math.floor(wf), f = M.smooth(wf - wb);
  eSet(gx, gz, wb, eRaw(gx, gz, wb) + amount * (1 - f));
  eSet(gx, gz, wb + 1, eRaw(gx, gz, wb + 1) + amount * f);
}

// 球形变形：amount<0 挖，>0 填
function deform(x, z, w, radius, amount) {
  const r = radius, r2 = r * r;
  const g0x = Math.floor((x - r) / ED_CELL), g1x = Math.floor((x + r) / ED_CELL);
  const g0z = Math.floor((z - r) / ED_CELL), g1z = Math.floor((z + r) / ED_CELL);
  for (let gz = g0z; gz <= g1z; gz++) {
    for (let gx = g0x; gx <= g1x; gx++) {
      const dx = (gx + 0.5) * ED_CELL - x, dz = (gz + 0.5) * ED_CELL - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) continue;
      const t = 1 - Math.sqrt(d2) / r;
      addEdit((gx + 0.5) * ED_CELL, (gz + 0.5) * ED_CELL, w, amount * t * t);
    }
  }
  state.dirty = true;
}

/** 精确地表（用于剖面图 / 网格外物体）：等值面求根 + 细尺度起伏 */
function baseHeight(x, z, w, par) {
  const P = par || A.F4.at(w);
  const h = A.F4.surface(x, z, w, P);
  return h + A.F4.detail(x, z, w, h, P);
}

/**
 * 游戏内统一高度：直接双线性插值主网格顶点。
 * 顶点里已经包含 detail 与编辑层，所以这里不能再加一次。
 * 网格外的点回退到精确等值面。
 */
function height(x, z, w) {
  const main = A.world.main;
  if (!main || !main.userData || !Number.isFinite(main.userData.lastCX)) {
    return baseHeight(x, z, w) + editAt(x, z, w);
  }
  const ud = main.userData, n = ud.n, cell = ud.cell;
  const half = (n - 1) * cell * 0.5;
  const fi = (x - (ud.lastCX - half)) / cell;
  const fj = (z - (ud.lastCZ - half)) / cell;
  const i = Math.floor(fi), j = Math.floor(fj);
  if (i < 0 || j < 0 || i >= n - 1 || j >= n - 1) {
    return baseHeight(x, z, w) + editAt(x, z, w);
  }
  const u = fi - i, v = fj - j;
  const arr = main.geometry.attributes.position.array;
  const a = arr[(j * n + i) * 3 + 1], b = arr[(j * n + i + 1) * 3 + 1];
  const c = arr[((j + 1) * n + i) * 3 + 1], d = arr[((j + 1) * n + i + 1) * 3 + 1];
  return M.lerp(M.lerp(a, b, u), M.lerp(c, d, u), v);
}

// ---------------- 地形网格 ----------------
const QUAL = { mainN: 88, mainCell: 1.95, ghostN: 40, ghostCell: 4.3 };
if (A.mobile) { QUAL.mainN = 60; QUAL.mainCell = 2.85; QUAL.ghostN = 28; QUAL.ghostCell = 6.2; }

let scene = null;
const meshes = [];

function makeGrid(n, cell, material, wOff, mode) {
  const verts = n * n;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(verts * 3);
  const col = new Float32Array(verts * 3);
  const idx = [];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const posAttr = new THREE.BufferAttribute(pos, 3);
  const colAttr = new THREE.BufferAttribute(col, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  colAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('color', colAttr);
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.userData = { n, cell, wOff, mode, lastCX: NaN, lastCZ: NaN, lastW: NaN };
  scene.add(mesh);
  meshes.push(mesh);
  return mesh;
}

const _c = new THREE.Color(), _c2 = new THREE.Color();
const _cSoil = new THREE.Color(0x8d6a4a), _cRock = new THREE.Color();

/** 高度分层 + 坡度露岩：山脊、雪线、谷底、岩壁都能看出来 */
function coarseColor(ix, iz, w, h, par, out) {
  const pal = par.pal, t = par.terr;
  const x = ix * COARSE, z = iz * COARSE, W = A.F4.wCoord(w);
  const patch = A.noise4(x * 0.031 + 3.1, 0, z * 0.031, W * 0.031 + 5.7);
  const crys = A.noise4(x * 0.017, 0, z * 0.017 + 9.4, W * 0.017 + 8.2);
  const hn = M.clamp((h + t.amp * 0.75) / (t.amp * 1.7), 0, 1);

  const low = _c.setHex(pal.low), mid = _c2.setHex(pal.mid);
  out.copy(low).lerp(mid, M.smoothstep(hn + patch * 0.30, 0.22, 0.70));
  // 沙色只留在真正的高处，避免整片地表被冲成黄色
  out.lerp(_c2.setHex(pal.high), M.smoothstep(hn, 0.82, 1.0));

  // 粗晶格差分求坡度 → 陡坡露岩
  const cn = grid.cn;
  const gi = ix - grid.g0x, gj = iz - grid.g0z;
  let steep = 0;
  if (gi > 0 && gj > 0 && gi < cn - 1 && gj < cn - 1) {
    const dx = grid.H[gj * cn + gi + 1] - grid.H[gj * cn + gi - 1];
    const dz = grid.H[(gj + 1) * cn + gi] - grid.H[(gj - 1) * cn + gi];
    steep = Math.hypot(dx, dz) / (2 * COARSE);
  }
  out.lerp(_c2.setHex(pal.rock), M.smoothstep(steep, 0.42, 1.25) * 0.72);
  if (crys > 0.46) out.lerp(_c2.setHex(pal.crys), Math.min((crys - 0.46) * 1.4, 0.40));
  if (h < 0) out.multiplyScalar(1 + Math.max(-0.22, h * 0.014));
  return out;
}

function fillGrid(cx, cz, w, ud, par) {
  const half = (ud.n - 1) * ud.cell * 0.5;
  const cn = Math.ceil((ud.n - 1) * ud.cell / COARSE) + 4;
  if (!grid.H || grid.cn !== cn) {
    grid.cn = cn;
    grid.H = new Float32Array(cn * cn);
    grid.C = new Float32Array(cn * cn * 3);
  }
  grid.g0x = Math.floor((cx - half) / COARSE) - 1;
  grid.g0z = Math.floor((cz - half) / COARSE) - 1;
  grid.w = w;
  const H = grid.H, C = grid.C;
  for (let j = 0; j < cn; j++) {
    for (let i = 0; i < cn; i++) {
      H[j * cn + i] = A.F4.surface((grid.g0x + i) * COARSE, (grid.g0z + j) * COARSE, w, par);
    }
  }
  for (let j = 0; j < cn; j++) {
    for (let i = 0; i < cn; i++) {
      const k = (j * cn + i) * 3;
      coarseColor(grid.g0x + i, grid.g0z + j, w, H[j * cn + i], par, _c);
      C[k] = _c.r; C[k + 1] = _c.g; C[k + 2] = _c.b;
    }
  }
}

function writeVerts(mesh, cx, cz, ww, par) {
  const ud = mesh.userData, n = ud.n, cell = ud.cell, cn = grid.cn;
  const posAttr = mesh.geometry.attributes.position, colAttr = mesh.geometry.attributes.color;
  const half = (n - 1) * cell * 0.5;
  const H = grid.H, C = grid.C;
  const hasEdits = state.edits.size > 0;
  _cRock.setHex(par.pal.rock);
  for (let j = 0; j < n; j++) {
    const z = cz - half + j * cell;
    const gz = z / COARSE, vz0 = Math.floor(gz), vv = M.smooth(gz - vz0), rz = vz0 - grid.g0z;
    for (let i = 0; i < n; i++) {
      const x = cx - half + i * cell;
      const gx = x / COARSE, vx0 = Math.floor(gx), uu = M.smooth(gx - vx0), rx = vx0 - grid.g0x;
      const k = (j * n + i) * 3;
      const k00 = rz * cn + rx, k10 = k00 + 1, k01 = k00 + cn, k11 = k01 + 1;
      const hb = M.lerp(M.lerp(H[k00], H[k10], uu), M.lerp(H[k01], H[k11], uu), vv);
      const ed = hasEdits ? editAt(x, z, ww) : 0;
      const y = hb + A.F4.detail(x, z, ww, hb, par);
      posAttr.array[k] = x; posAttr.array[k + 1] = y + ed; posAttr.array[k + 2] = z;

      const a00 = k00 * 3, a10 = k10 * 3, a01 = k01 * 3, a11 = k11 * 3;
      let cr = M.lerp(M.lerp(C[a00], C[a10], uu), M.lerp(C[a01], C[a11], uu), vv);
      let cg = M.lerp(M.lerp(C[a00 + 1], C[a10 + 1], uu), M.lerp(C[a01 + 1], C[a11 + 1], uu), vv);
      let cb = M.lerp(M.lerp(C[a00 + 2], C[a10 + 2], uu), M.lerp(C[a01 + 2], C[a11 + 2], uu), vv);
      const gw = ww * 3, gi = Math.floor(gw), gf = M.smooth(gw - gi);
      const grain = (M.lerp(A.hash4(rx * 7 + 13, rz * 11 + 5, 0, gi),
                            A.hash4(rx * 7 + 13, rz * 11 + 5, 0, gi + 1), gf) - 0.5) * 0.05;
      cr += grain; cg += grain; cb += grain;
      if (ed < -0.12) {
        const t = Math.min(1, (-ed - 0.12) * 0.7);
        cr = M.lerp(cr, _cRock.r, t); cg = M.lerp(cg, _cRock.g, t); cb = M.lerp(cb, _cRock.b, t);
      } else if (ed > 0.12) {
        const t = Math.min(0.7, (ed - 0.12) * 0.5);
        cr = M.lerp(cr, _cSoil.r, t); cg = M.lerp(cg, _cSoil.g, t); cb = M.lerp(cb, _cSoil.b, t);
      }
      colAttr.array[k] = cr; colAttr.array[k + 1] = cg; colAttr.array[k + 2] = cb;
    }
  }
  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
}

function updateTerrainMesh(mesh, px, pz, w, force, deformOnly) {
  const ud = mesh.userData;
  const { n, cell, mode } = ud;
  const cx = Math.round(px / cell) * cell, cz = Math.round(pz / cell) * cell;
  const ww = mode === 'main' ? w : ud.wOff(w);

  if (mode !== 'main') {
    // 幽灵层：相邻世界线的低成本投影，展示「第四维里还有别的地面」
    if (!force && Math.abs(ww - ud.lastW) < 0.09 && cx === ud.lastCX && cz === ud.lastCZ) return;
    ud.lastW = ww; ud.lastCX = cx; ud.lastCZ = cz;
    const posAttr = mesh.geometry.attributes.position, colAttr = mesh.geometry.attributes.color;
    const half = (n - 1) * cell * 0.5, W = A.F4.wCoord(ww);
    for (let j = 0; j < n; j++) {
      const z = cz - half + j * cell;
      for (let i = 0; i < n; i++) {
        const x = cx - half + i * cell;
        const k = (j * n + i) * 3;
        const h = A.fbm4(x * 0.013 + 11.3, 0, z * 0.013 - 7.1, W * 0.013, 2) * 22 - 3.5;
        posAttr.array[k] = x; posAttr.array[k + 1] = h; posAttr.array[k + 2] = z;
        const t = M.clamp((h + 12) / 34, 0, 1);
        colAttr.array[k] = 0.38 + 0.30 * t;
        colAttr.array[k + 1] = 0.36 + 0.28 * t;
        colAttr.array[k + 2] = 0.62 + 0.22 * t;
      }
    }
    posAttr.needsUpdate = true; colAttr.needsUpdate = true;
    const geo = mesh.geometry; geo.boundingSphere = null; geo.computeBoundingSphere();
    return;
  }

  const moved = cx !== ud.lastCX || cz !== ud.lastCZ;
  const dw = Math.abs(ww - ud.lastW);
  if (!force && !deformOnly && !moved && dw < 0.055) return;
  const par = A.F4.at(ww);
  if (!force && deformOnly && !moved && dw < 0.001) {
    writeVerts(mesh, ud.lastCX, ud.lastCZ, ud.lastW, par);
    return;
  }
  ud.lastCX = cx; ud.lastCZ = cz; ud.lastW = ww;
  fillGrid(cx, cz, ww, ud, par);
  writeVerts(mesh, cx, cz, ww, par);
  const geo = mesh.geometry;
  geo.boundingSphere = null; geo.computeBoundingSphere();
}

// ---------------- 装饰物 ----------------
const decor = [];
const decorMeshes = [];
let decorLastW = NaN, decorLastX = NaN, decorLastZ = NaN;
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _sv = new THREE.Vector3();
const _pv = new THREE.Vector3(), _eul = new THREE.Euler();

function buildDecor() {
  const rand = A.rng(state.seed ^ 0x9e37);
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const boulderGeo = A.roundedBox(1.6, 1.15, 1.35, 0.34);
  const shrubGeo = new THREE.IcosahedronGeometry(1, 1);
  const shardGeo = new THREE.OctahedronGeometry(1, 0);
  const pal = A.F4.cur.pal;
  const rockMat = new THREE.MeshPhongMaterial({ shininess: 4, flatShading: true });
  const mob = A.mobile ? 0.55 : 1;
  const defs = [
    { geo: rockGeo,    count: Math.round(240 * mob), sMin: 0.22, sMax: 0.62, tint: pal.rock },
    { geo: boulderGeo, count: Math.round(110 * mob), sMin: 0.45, sMax: 1.15, tint: pal.rock },
    { geo: shrubGeo,   count: Math.round(170 * mob), sMin: 0.30, sMax: 0.72, tint: pal.low },
    { geo: shardGeo,   count: Math.round(90 * mob),  sMin: 0.28, sMax: 0.85, tint: pal.crys }
  ];
  for (const def of defs) {
    const im = new THREE.InstancedMesh(def.geo, rockMat.clone(), def.count);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.castShadow = !A.mobile; im.receiveShadow = true;
    for (let i = 0; i < def.count; i++) {
      const ang = rand() * Math.PI * 2;
      const rad = Math.sqrt(rand()) * 235;
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const wPos = rand() * A.F4.W_MAX;
      const s = def.sMin + rand() * (def.sMax - def.sMin);
      const col = new THREE.Color(def.tint).offsetHSL((rand() - 0.5) * 0.04, (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.10);
      decor.push({ im, i, x, z, wPos, s, col, phase: rand() * Math.PI * 2 });
      _eul.set(rand() * 0.35, rand() * Math.PI * 2, rand() * 0.35);
      _q.setFromEuler(_eul);
      _pv.set(x, 0, z); _sv.setScalar(0.001);
      _m4.compose(_pv, _q, _sv);
      im.setMatrixAt(i, _m4); im.setColorAt(i, col);
    }
    scene.add(im); decorMeshes.push(im);
  }
  decorLastW = NaN; decorLastX = NaN; decorLastZ = NaN;
}

function updateDecor(w, px, pz) {
  const qx = Math.round(px / 6) * 6, qz = Math.round(pz / 6) * 6;
  if (Math.abs(w - decorLastW) < 0.05 && qx === decorLastX && qz === decorLastZ) return;
  decorLastW = w; decorLastX = qx; decorLastZ = qz;
  for (const d of decor) {
    const dw = Math.abs(w - d.wPos);
    const vis = 1 - M.smoothstep(dw, 0.45, 1.7);
    const dist = Math.hypot(d.x - px, d.z - pz);
    const far = 1 - M.smoothstep(dist, 120, 205);
    const s = d.s * (0.06 + 0.94 * vis) * (0.05 + 0.95 * far);
    // 看不到就不必采样地表（远处点大多在主网格之外，精确求值很贵）
    const y = s > 0.02 ? height(d.x, d.z, w) + d.s * 0.22 : 0;
    _eul.set(0, d.phase, 0); _q.setFromEuler(_eul);
    _pv.set(d.x, y, d.z); _sv.setScalar(Math.max(s, 0.001));
    _m4.compose(_pv, _q, _sv);
    d.im.setMatrixAt(d.i, _m4);
  }
  for (const im of decorMeshes) im.instanceMatrix.needsUpdate = true;
}

// ---------------- 矿脉：Astroneer 式沉积块 ----------------
const nodes = [];
const nodeGroup = new THREE.Group();
const ECHO_GEO = new THREE.OctahedronGeometry(0.62, 0);
const mats = {};
const BLOB = new THREE.IcosahedronGeometry(1, 1);
const SHARD = new THREE.OctahedronGeometry(1, 0);
const NODE_DEPTH = { near: 0.38, deep: 0.62 };

function buildDeposit(type, units) {
  const t = A.item(type);
  if (!mats[type]) {
    mats[type] = new THREE.MeshPhongMaterial({
      color: t.color, flatShading: true, shininess: t.glow ? 60 : 16,
      emissive: new THREE.Color(t.color).multiplyScalar(t.glow ? 0.45 : 0.05)
    });
  }
  const mat = mats[type];
  const g = new THREE.Group();
  const n = 3 + units;
  for (let i = 0; i < n; i++) {
    const geo = t.shape === 'prism' ? SHARD : BLOB;
    const m = new THREE.Mesh(geo, mat);
    const a = Math.random() * Math.PI * 2, rad = Math.sqrt(Math.random()) * 0.58;
    const s = 0.3 + Math.random() * 0.15;
    m.position.set(Math.cos(a) * rad, -0.5 + Math.random() * 0.26, Math.sin(a) * rad);
    m.scale.set(s * (0.95 + Math.random() * 0.4), s * (0.45 + Math.random() * 0.22), s * (0.95 + Math.random() * 0.4));
    m.rotation.set(Math.random() * 1.4, Math.random() * 6.28, Math.random() * 1.4);
    m.castShadow = !A.mobile; m.receiveShadow = true;
    g.add(m);
  }
  if (t.glow) {
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.95, 10, 8),
      new THREE.MeshBasicMaterial({ color: t.color, transparent: true, opacity: 0.16, depthWrite: false }));
    halo.position.y = 0.1; g.add(halo);
  }
  return g;
}

function spawnNodes() {
  for (const n of nodes) nodeGroup.remove(n.mesh, n.echoA, n.echoB);
  nodes.length = 0;
  const rand = A.rng(state.seed ^ 0x2f1a);
  const count = A.mobile ? 88 : 128;

  const pick = (tbl) => {
    let tot = 0;
    for (const k in tbl) tot += tbl[k];
    if (tot <= 0) return Object.keys(tbl)[0] || 'compound';
    let r = rand() * tot, key = Object.keys(tbl)[0];
    for (const k in tbl) { r -= tbl[k]; if (r <= 0) { key = k; break; } }
    return key;
  };
  const push = (key, x, z, wPos, units, depth, band, bandW) => {
    const top = height(x, z, wPos) - depth;
    const mesh = buildDeposit(key, units);
    const echoMat = new THREE.MeshBasicMaterial({
      color: A.item(key).color, transparent: true, opacity: 0.16, depthWrite: false, wireframe: true
    });
    const echoA = new THREE.Mesh(ECHO_GEO, echoMat);
    const echoB = new THREE.Mesh(ECHO_GEO, echoMat.clone());
    nodeGroup.add(mesh, echoA, echoB);
    nodes.push({
      type: key, x, z, wPos, ay: top, depth, units, mesh, echoA, echoB,
      band, bandW: bandW === undefined ? wPos : bandW,
      phase: rand() * Math.PI * 2, respawn: 0, harvested: false, mineT: 0,
      lastW: NaN, baseY: 0, echoW: NaN, echoYA: 0, echoYB: 0, exposed: depth < 0.2, vis: 1
    });
  };

  // 表层矿：每颗行星的资源表按该矿所在的 w 位置真实采样
  for (let i = 0; i < count; i++) {
    const wPos = rand() * A.F4.W_MAX;
    const key = pick(A.F4.at(wPos).res);
    const ang = rand() * Math.PI * 2;
    const rad = 11 + Math.sqrt(rand()) * 212;
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    const units = 2 + Math.floor(rand() * 4);
    const deep = rand() < NODE_DEPTH.deep;
    const depth = deep ? 1.0 + rand() * 3.1 : -0.45 + rand() * 0.35;
    push(key, x, z, wPos, units, depth, 'surface', wPos);
  }

  // 深层世界线矿带：w > 4.7（格拉西欧 → 阿特洛克斯）
  const deepCount = Math.round(count * 0.22);
  for (let i = 0; i < deepCount; i++) {
    const wPos = 4.72 + rand() * 1.2;
    const key = pick(A.F4.at(wPos).deep);
    const ang = rand() * Math.PI * 2;
    const rad = 16 + Math.sqrt(rand()) * 200;
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    const units = 3 + Math.floor(rand() * 3);
    const depth = rand() < 0.45 ? -0.4 + rand() * 0.3 : 0.8 + rand() * 2.0;
    push(key, x, z, wPos, units, depth, 'deep', wPos);
  }

  // 相位异常结晶：只长在两颗行星之间的过渡带（w = i + 0.5）
  for (let b = 0; b < A.F4.W_MAX; b++) {
    for (let j = 0; j < 2; j++) {
      const wPos = b + 0.5;
      const ang = rand() * Math.PI * 2;
      const rad = 24 + Math.sqrt(rand()) * 150;
      push('anomaly', Math.cos(ang) * rad, Math.sin(ang) * rad, wPos,
        2 + Math.floor(rand() * 2), -0.5 + rand() * 0.2, 'anomaly', wPos);
    }
  }
}

function resourceWindow(dw) { return 1 - M.smoothstep(dw, 0.34, 1.15); }

function updateNodes(w, time, dt, px, pz) {
  for (const r of nodes) {
    if (r.harvested) {
      r.respawn -= dt;
      r.mesh.visible = false; r.echoA.visible = false; r.echoB.visible = false;
      if (r.respawn <= 0) {
        r.harvested = false;
        r.units = 2 + Math.floor(Math.random() * 4);
        if (r.band === 'anomaly') r.wPos = r.bandW;
        else if (r.band === 'deep') r.wPos = 4.72 + Math.random() * 1.2;
        else r.wPos = r.bandW;
        r.depth = Math.random() < NODE_DEPTH.deep ? 1.0 + Math.random() * 3.1 : -0.45 + Math.random() * 0.35;
        if (r.band === 'anomaly') r.depth = -0.5 + Math.random() * 0.2;
        r.ay = height(r.x, r.z, r.wPos) - r.depth;
        r.echoW = NaN; r.lastW = NaN; r.mineT = 0;
      }
      continue;
    }
    const adw = Math.abs(w - r.wPos);
    const vis = resourceWindow(adw);
    if (!(Math.abs(w - r.lastW) < 0.05)) { r.baseY = height(r.x, r.z, w); r.lastW = w; }
    r.exposed = r.baseY < r.ay + 0.45;
    const deeplyBuried = r.baseY > r.ay + 0.95;
    const dist = Math.hypot(r.x - px, r.z - pz);
    const near = 1 - M.smoothstep(dist, 110, 170);
    const sink = (1 - vis) * 1.9;
    r.mesh.position.set(r.x, r.ay - sink, r.z);
    r.mesh.rotation.y = r.phase + (r.band === 'anomaly' ? time * 0.6 : 0);
    r.mesh.scale.setScalar((0.55 + 0.45 * vis) * (0.12 + 0.88 * near));
    r.mesh.visible = vis > 0.02 && near > 0.02 && !deeplyBuried;

    const echoAlpha = (1 - M.smoothstep(adw, 1.8, 3.8)) * 0.2 * near * (deeplyBuried ? 0.4 : 1)
      + (state.scanUntil > time && r.band !== 'anomaly' ? 0.22 * near : 0)
      + (r.band === 'anomaly' ? 0.30 * near : 0);
    r.echoA.visible = echoAlpha > 0.01;
    r.echoB.visible = echoAlpha > 0.01;
    if (r.echoA.visible) {
      if (r.echoW !== r.wPos) {
        r.echoYA = height(r.x, r.z, r.wPos + 0.7) + 0.5;
        r.echoYB = height(r.x, r.z, r.wPos - 0.7) + 0.5;
        r.echoW = r.wPos;
      }
      r.echoA.position.set(r.x, r.echoYA, r.z);
      r.echoA.rotation.y = time * 0.22 + r.phase;
      r.echoA.material.opacity = Math.min(echoAlpha, 0.7);
      r.echoB.position.set(r.x, r.echoYB, r.z);
      r.echoB.rotation.y = time * 0.22 + r.phase;
      r.echoB.material.opacity = Math.min(echoAlpha * 0.7, 0.5);
    }
  }
}

// 用地形工具挖到露头矿脉：每 0.26 秒崩一块进背包
function mineAt(x, z, w, radius, dt, onUnit) {
  for (const r of nodes) {
    if (r.harvested || !r.exposed) continue;
    if (Math.abs(w - r.wPos) > 0.55) continue;
    if (Math.hypot(r.x - x, r.z - z) > radius + 0.9) continue;
    r.mineT += dt;
    if (r.mineT >= 0.26) {
      r.mineT = 0; r.units -= 1;
      if (onUnit) onUnit(r);
      if (r.units <= 0) { r.harvested = true; r.respawn = 55 + Math.random() * 55; }
    }
  }
}

// ---------------- 研究样本 ----------------
const samples = [];
function spawnSamples() {
  for (const s of samples) nodeGroup.remove(s.mesh);
  samples.length = 0;
  const rand = A.rng(state.seed ^ 0x5a17);
  const geo = new THREE.OctahedronGeometry(0.34, 0);
  for (let i = 0; i < 18; i++) {
    const ang = rand() * Math.PI * 2;
    const rad = 25 + Math.sqrt(rand()) * 170;
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    const wPos = rand() * A.F4.W_MAX;
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x8ef0d0, transparent: true, opacity: 0.9 }));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x8ef0d0, transparent: true, opacity: 0.12, depthWrite: false }));
    mesh.add(glow); nodeGroup.add(mesh);
    samples.push({ x, z, wPos, mesh, ay: height(x, z, wPos) + 0.9, taken: false, respawn: 0 });
  }
}
function updateSamples(w, time, dt, px, pz) {
  for (const s of samples) {
    if (s.taken) {
      s.respawn -= dt; s.mesh.visible = false;
      if (s.respawn <= 0) { s.taken = false; s.mesh.visible = true; }
      continue;
    }
    const vis = resourceWindow(Math.abs(w - s.wPos));
    const far = 1 - M.smoothstep(Math.hypot(s.x - px, s.z - pz), 90, 150);
    s.mesh.position.set(s.x, s.ay + Math.sin(time * 1.1 + s.x) * 0.16, s.z);
    s.mesh.rotation.set(time * 0.5, time * 0.8, 0);
    s.mesh.scale.setScalar(0.4 + 0.6 * vis);
    s.mesh.material.opacity = 0.25 + 0.75 * vis * far;
    s.mesh.visible = vis * far > 0.04;
  }
}

// ---------------- 世界线 / 存档 ----------------
function resetDecor() {
  for (const im of decorMeshes) { scene.remove(im); im.geometry.dispose(); im.material.dispose(); }
  decorMeshes.length = 0; decor.length = 0;
  buildDecor();
}
function rebuildAll(seed, editsArr) {
  state.seed = seed === undefined ? state.seed : seed;
  state.edits = new Map(editsArr || []);
  state.dirty = true;
  for (const m of meshes) { m.userData.lastW = NaN; m.userData.lastCX = NaN; m.userData.lastCZ = NaN; }
  resetDecor(); spawnNodes(); spawnSamples();
  if (A.ruins) A.ruins.spawn();
}
/** 兼容旧入口：pi 现在就是世界线锚点 */
function setPlanet(pi, seed, editsArr) {
  state.pi = M.clamp(pi, 0, A.F4.W_MAX);
  state.w = state.pi;
  A.F4.sync(state.w);
  rebuildAll(seed, editsArr);
}
/** 每帧同步世界线；不重建物体，只改可见窗口 → 平滑切换 */
function setW(w) {
  state.w = M.clamp(w, 0, A.F4.W_MAX);
  state.pi = Math.round(state.w);
  A.F4.sync(state.w);
}

/** 网格 / 物体全部重锚（编辑层或存档载入后） */
function rebuild(w) {
  for (const m of meshes) { m.userData.lastW = NaN; m.userData.lastCX = NaN; m.userData.lastCZ = NaN; }
  state.dirty = true;
  decorLastW = NaN; decorLastX = NaN; decorLastZ = NaN;
  for (const n of nodes) { n.ay = height(n.x, n.z, n.wPos) - n.depth; n.lastW = NaN; n.echoW = NaN; }
  for (const sp of samples) sp.ay = height(sp.x, sp.z, sp.wPos) + 0.9;
  if (A.ruins) A.ruins.reanchor(w === undefined ? state.w : w);
}

function serializeEdits() { return Array.from(state.edits.entries()); }

A.world = {
  state, height, baseHeight, editAt, deform, setPlanet, setW, rebuild, rebuildAll,
  serializeEdits, nodes, samples, resourceWindow, updateDecor, updateNodes,
  mineAt, updateSamples,
  get planet() { return A.F4.cur; },
  get storm() { return state.storm; },
  init(s) {
    scene = s;
    scene.add(nodeGroup);
    const matMain = new THREE.MeshPhongMaterial({ shininess: 4, vertexColors: true, flatShading: true });
    const main = makeGrid(QUAL.mainN, QUAL.mainCell, matMain, (w) => w, 'main');
    main.receiveShadow = true;
    const gmA = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const gmB = gmA.clone(); gmB.opacity = 0.075;
    const gA = makeGrid(QUAL.ghostN, QUAL.ghostCell, gmA, (w) => w + 0.62, 'ghost');
    const gB = makeGrid(QUAL.ghostN, QUAL.ghostCell, gmB, (w) => w - 0.62, 'ghost');
    gA.renderOrder = 2; gB.renderOrder = 2;
    this.meshes = meshes; this.main = main; this.ghosts = [gA, gB];
  },
  update(w, px, pz, deformOnly, force) {
    const main = this.main;
    if (main) updateTerrainMesh(main, px, pz, w, !!force, deformOnly);
    if (this.ghosts) for (const g of this.ghosts) updateTerrainMesh(g, px, pz, w, !!force, false);
    updateDecor(w, px, pz);
  },
  scanPulse(time) { state.scanUntil = time + 9; return state.scanUntil; },
  get scanning() { return state.scanUntil; },
  updateStorm(dt, shelter) {
    const s = state.storm;
    const interval = A.F4.cur.storm;
    s.timer -= dt;
    if (!s.active && s.timer <= 0) {
      s.active = true; s.t = 22; s.timer = interval;
      A.ui && A.ui.toast('沙尘风暴来袭 · 找掩体或躲进庇护所');
    }
    if (s.active) {
      s.t -= dt;
      s.intensity = M.lerp(s.intensity, shelter ? 0.15 : 1, 1 - Math.exp(-dt * 2));
      if (s.t <= 0) { s.active = false; s.intensity = 0; }
    } else s.intensity = M.lerp(s.intensity, 0, 1 - Math.exp(-dt * 1.5));
    return s.intensity;
  }
};

})(window.A);
