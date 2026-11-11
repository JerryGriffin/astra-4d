/* ============================================================
   ASTRA·4D — 2. world：四维地形 / 可挖掘编辑层 / 装饰 / 矿脉 / 风暴
   地形 = 程序化基础地形(x,z,w) + 编辑层(x,z,w)（玩家挖出来的形状）
   ============================================================ */
(function (A) {
'use strict';
const M = A.M;

const COARSE = 3.6;      // 基础地形粗晶格
const ED_CELL = 1.3;     // 编辑层格子
const ED_W = 1.0;        // 编辑层的相位桶宽
const ED_MAX = 7;        // 单格最大挖深/堆高

const state = {
  pi: 0,
  planet: A.PLANETS[0],
  seed: 1337,
  o: 0,
  edits: new Map(),
  dirty: false,
  storm: { timer: 100, active: false, intensity: 0, t: 0 },
  samplePool: []
};

// ---------------- 基础地形 ----------------
function coarseH(i, j, w) {
  const P = state.planet, t = P.terr, o = state.o;
  const x = i * COARSE, z = j * COARSE;
  let h = t.amp * A.fbmS(x * t.freq + o, z * t.freq - o, w * 0.42, 11.7, t.oct);
  h += t.amp * 0.32 * A.fbmS(x * t.freq * 3.1, z * t.freq * 3.1, w * 0.75, 4.2, 2);
  if (t.mesa > 0) {
    const step = Math.round(h * 1.5) / 1.5;
    const m = M.smoothstep(A.noiseS(x * 0.02, z * 0.02, w * 0.3, 77), -0.25, 0.55);
    h = M.lerp(h, step, t.mesa * 0.5 * m);
  }
  if (t.crater > 0) {
    const cf = A.noiseS(x * 0.032 + o, z * 0.032 - o, w * 0.18, 3.3);
    h -= t.crater * t.amp * 0.9 * (1 - M.smoothstep(Math.abs(cf), 0.0, 0.38));
  }
  return h - t.amp * 0.32;
}

function detailH(x, z, w) {
  return state.planet.terr.detail * A.noiseS(x * 0.30, z * 0.30, w * 1.15, 27.0);
}

function baseHeight(x, z, w) {
  const gx = x / COARSE, gz = z / COARSE;
  const xi = Math.floor(gx), zi = Math.floor(gz);
  const u = M.smooth(gx - xi), v = M.smooth(gz - zi);
  const h00 = coarseH(xi, zi, w), h10 = coarseH(xi + 1, zi, w);
  const h01 = coarseH(xi, zi + 1, w), h11 = coarseH(xi + 1, zi + 1, w);
  return M.lerp(M.lerp(h00, h10, u), M.lerp(h01, h11, u), v) + detailH(x, z, w);
}

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

function height(x, z, w) {
  return baseHeight(x, z, w) + editAt(x, z, w);
}

// ---------------- 地形网格 ----------------
const QUAL = {
  mainN: 96, mainCell: 1.7,
  ghostN: 46, ghostCell: 3.5
};
if (A.mobile) { QUAL.mainN = 64; QUAL.mainCell = 2.5; QUAL.ghostN = 32; QUAL.ghostCell = 5.0; }

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
  const cn = Math.ceil((n - 1) * cell / COARSE) + 4;
  mesh.userData = {
    n, cell, wOff, mode, cn,
    Hc: new Float32Array(cn * cn),
    Cc: new Float32Array(cn * cn * 3),
    lastCX: NaN, lastCZ: NaN, lastW: NaN, coarsed: false
  };
  scene.add(mesh);
  meshes.push(mesh);
  return mesh;
}

const _c = new THREE.Color(), _c2 = new THREE.Color(), _cSoil = new THREE.Color(0x8d6a4a);
const _cRock = new THREE.Color();

function coarseColor(i, j, w, h, out) {
  const P = state.planet, pal = P.pal, t = P.terr;
  const x = i * COARSE, z = j * COARSE, o = state.o;
  const patch = A.noiseS(x * 0.031 + o, z * 0.031, w * 0.5 + 3.1, 51.2);
  const crys = A.noiseS(x * 0.017, z * 0.017 + o, w * 0.63 + 9.4, 88.8);
  const hn = M.clamp((h + t.amp * 0.9) / (t.amp * 2.1), 0, 1);
  const low = _c.setHex(pal.low), mid = _c2.setHex(pal.mid);
  out.copy(low).lerp(mid, M.smoothstep(hn + patch * 0.34, 0.18, 0.66));
  out.lerp(_c2.setHex(pal.high), M.smoothstep(hn, 0.62, 0.96));
  if (crys > 0.44) out.lerp(_c2.setHex(pal.crys), Math.min((crys - 0.44) * 1.5, 0.45));
  // 低洼处压暗一点，山脊提亮，制造起伏感
  if (h < 0) out.multiplyScalar(1 + Math.max(-0.18, h * 0.035));
  return out;
}

function updateTerrainMesh(mesh, px, pz, w, force, deformOnly) {
  const ud = mesh.userData;
  const { n, cell, mode } = ud;
  const cx = Math.round(px / cell) * cell;
  const cz = Math.round(pz / cell) * cell;
  const ww = ud.wOff(w);
  const minDW = mode === 'main' ? 0.045 : 0.09;
  const moved = cx !== ud.lastCX || cz !== ud.lastCZ;
  if (!force && !deformOnly && !moved && Math.abs(ww - ud.lastW) < minDW) return;
  if (!force && deformOnly && !moved && Math.abs(ww - ud.lastW) < 0.001) {
    // 只更新编辑层：跳过粗晶格与颜色
    writeVerts(mesh, cx, cz, ww, true);
    return;
  }
  ud.lastCX = cx; ud.lastCZ = cz; ud.lastW = ww;

  const half = (n - 1) * cell * 0.5;
  if (mode === 'main') {
    const cn = ud.cn, Hc = ud.Hc, Cc = ud.Cc;
    const g0x = Math.floor((cx - half) / COARSE) - 1;
    const g0z = Math.floor((cz - half) / COARSE) - 1;
    for (let j = 0; j < cn; j++) {
      for (let i = 0; i < cn; i++) Hc[j * cn + i] = coarseH(g0x + i, g0z + j, ww);
    }
    for (let j = 0; j < cn; j++) {
      for (let i = 0; i < cn; i++) {
        const k = (j * cn + i) * 3;
        coarseColor(g0x + i, g0z + j, ww, Hc[j * cn + i], _c);
        Cc[k] = _c.r; Cc[k + 1] = _c.g; Cc[k + 2] = _c.b;
      }
    }
    ud.coarsed = true;
    writeVerts(mesh, cx, cz, ww, false);
  } else {
    // 幽灵层：低成本直接采样
    const posAttr = mesh.geometry.attributes.position;
    const colAttr = mesh.geometry.attributes.color;
    const amp = state.planet.terr.amp;
    for (let j = 0; j < n; j++) {
      const z = cz - half + j * cell;
      for (let i = 0; i < n; i++) {
        const x = cx - half + i * cell;
        const k = (j * n + i) * 3;
        const h = amp * A.fbmS(x * state.planet.terr.freq * 1.1 + state.o, z * state.planet.terr.freq * 1.1, ww * 0.42, 11.7, 2) - amp * 0.32;
        posAttr.array[k] = x; posAttr.array[k + 1] = h; posAttr.array[k + 2] = z;
        const t = M.clamp((h + 3.2) / 8.5, 0, 1);
        colAttr.array[k] = 0.42 + 0.30 * t;
        colAttr.array[k + 1] = 0.40 + 0.28 * t;
        colAttr.array[k + 2] = 0.62 + 0.22 * t;
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }
  const geo = mesh.geometry;
  geo.boundingSphere = null;
  geo.computeBoundingSphere();
}

function writeVerts(mesh, cx, cz, ww, deformOnly) {
  const ud = mesh.userData, { n, cell, cn, Hc, Cc } = ud;
  const posAttr = mesh.geometry.attributes.position;
  const colAttr = mesh.geometry.attributes.color;
  const half = (n - 1) * cell * 0.5;
  const g0x = Math.floor((cx - half) / COARSE) - 1;
  const g0z = Math.floor((cz - half) / COARSE) - 1;
  const hasEdits = state.edits.size > 0;
  const pal = state.planet.pal;
  _cRock.setHex(pal.rock);
  for (let j = 0; j < n; j++) {
    const z = cz - half + j * cell;
    const gz = z / COARSE, vz0 = Math.floor(gz), vv = M.smooth(gz - vz0), rz = vz0 - g0z;
    for (let i = 0; i < n; i++) {
      const x = cx - half + i * cell;
      const gx = x / COARSE, vx0 = Math.floor(gx), uu = M.smooth(gx - vx0), rx = vx0 - g0x;
      const k = (j * n + i) * 3;
      const k00 = rz * cn + rx, k10 = k00 + 1, k01 = k00 + cn, k11 = k01 + 1;
      const hb = M.lerp(M.lerp(Hc[k00], Hc[k10], uu), M.lerp(Hc[k01], Hc[k11], uu), vv);
      const ed = hasEdits ? editAt(x, z, ww) : 0;
      posAttr.array[k] = x;
      posAttr.array[k + 1] = hb + detailH(x, z, ww) + ed;
      posAttr.array[k + 2] = z;

      const a00 = k00 * 3, a10 = k10 * 3, a01 = k01 * 3, a11 = k11 * 3;
      let cr = M.lerp(M.lerp(Cc[a00], Cc[a10], uu), M.lerp(Cc[a01], Cc[a11], uu), vv);
      let cg = M.lerp(M.lerp(Cc[a00 + 1], Cc[a10 + 1], uu), M.lerp(Cc[a01 + 1], Cc[a11 + 1], uu), vv);
      let cb = M.lerp(M.lerp(Cc[a00 + 2], Cc[a10 + 2], uu), M.lerp(Cc[a01 + 2], Cc[a11 + 2], uu), vv);
      const gw = ww * 20, gi = Math.floor(gw), gf = M.smooth(gw - gi);
      const grain = (M.lerp(A.hash4(rx * 7 + 13, rz * 11 + 5, 0, gi),
                            A.hash4(rx * 7 + 13, rz * 11 + 5, 0, gi + 1), gf) - 0.5) * 0.055;
      cr += grain; cg += grain; cb += grain;
      // 挖开的地方露出岩层，堆起来的地方是土色
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

// ---------------- 装饰物 ----------------
const decor = [];
const decorMeshes = [];
let decorLastW = NaN, decorLastX = NaN, decorLastZ = NaN;
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _sv = new THREE.Vector3();
const _pv = new THREE.Vector3(), _eul = new THREE.Euler();

function buildDecor() {
  const rand = A.rng(state.seed ^ 0x9e37);
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const boulderGeo = roundedBox(1.6, 1.15, 1.35, 0.34);
  const shrubGeo = new THREE.IcosahedronGeometry(1, 1);
  const shardGeo = new THREE.OctahedronGeometry(1, 0);
  const pal = state.planet.pal;
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
    im.castShadow = !A.mobile;
    im.receiveShadow = true;
    for (let i = 0; i < def.count; i++) {
      const ang = rand() * Math.PI * 2;
      const rad = Math.sqrt(rand()) * 235;
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const wPos = (rand() - 0.5) * 14;
      const s = def.sMin + rand() * (def.sMax - def.sMin);
      const col = new THREE.Color(def.tint).offsetHSL((rand() - 0.5) * 0.04, (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.10);
      decor.push({ im, i, x, z, wPos, s, col, phase: rand() * Math.PI * 2 });
      _eul.set(rand() * 0.35, rand() * Math.PI * 2, rand() * 0.35);
      _q.setFromEuler(_eul);
      _pv.set(x, 0, z); _sv.setScalar(0.001);
      _m4.compose(_pv, _q, _sv);
      im.setMatrixAt(i, _m4);
      im.setColorAt(i, col);
    }
    scene.add(im);
    decorMeshes.push(im);
  }
  decorLastW = NaN; decorLastX = NaN; decorLastZ = NaN;
}

function updateDecor(w, px, pz) {
  const qx = Math.round(px / 6) * 6, qz = Math.round(pz / 6) * 6;
  if (Math.abs(w - decorLastW) < 0.05 && qx === decorLastX && qz === decorLastZ) return;
  decorLastW = w; decorLastX = qx; decorLastZ = qz;
  for (const d of decor) {
    const dw = Math.abs(w - d.wPos);
    const vis = 1 - M.smoothstep(dw, 1.15, 3.4);
    const dist = Math.hypot(d.x - px, d.z - pz);
    const far = 1 - M.smoothstep(dist, 120, 205);
    const s = d.s * (0.06 + 0.94 * vis) * (0.05 + 0.95 * far);
    const y = height(d.x, d.z, w) + d.s * 0.22;
    _eul.set(0, d.phase, 0);
    _q.setFromEuler(_eul);
    _pv.set(d.x, y, d.z);
    _sv.setScalar(Math.max(s, 0.001));
    _m4.compose(_pv, _q, _sv);
    d.im.setMatrixAt(d.i, _m4);
  }
  for (const im of decorMeshes) im.instanceMatrix.needsUpdate = true;
}

function roundedBox(w, h, d, round) {
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const p = g.attributes.position;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(
      M.clamp(v.x, -w / 2 + round, w / 2 - round),
      M.clamp(v.y, -h / 2 + round, h / 2 - round),
      M.clamp(v.z, -d / 2 + round, d / 2 - round)
    );
    v.sub(c).normalize().multiplyScalar(round).add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
A.roundedBox = roundedBox;

// ---------------- 矿脉 ----------------
const nodes = [];
const nodeGroup = new THREE.Group();
const ECHO_GEO = new THREE.OctahedronGeometry(0.62, 0);
const mats = {};

// ---------------- 矿脉：Astroneer 式沉积块 ----------------
// 一坨同色圆润矿块半埋在地里，浅的露头、深的要挖开才看得见。
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
    m.castShadow = !A.mobile;
    m.receiveShadow = true;
    g.add(m);
  }
  if (t.glow) {
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.95, 10, 8),
      new THREE.MeshBasicMaterial({ color: t.color, transparent: true, opacity: 0.16, depthWrite: false }));
    halo.position.y = 0.1;
    g.add(halo);
  }
  return g;
}

function spawnNodes() {
  for (const n of nodes) nodeGroup.remove(n.mesh, n.echoA, n.echoB);
  nodes.length = 0;
  const P = state.planet;
  const table = Object.entries(P.res);
  const total = table.reduce((a, [, v]) => a + v, 0);
  const rand = A.rng((state.seed ^ P.seed) + 0x2f1a);
  const count = A.mobile ? 80 : 112;

  const pick = (tbl) => {
    const tot = tbl.reduce((a, [, v]) => a + v, 0);
    let r = rand() * tot, key = tbl[0][0];
    for (const [k, v] of tbl) { r -= v; if (r <= 0) { key = k; break; } }
    return key;
  };
  const push = (key, x, z, wPos, units, depth, deep) => {
    const top = height(x, z, wPos) - depth;
    const mesh = buildDeposit(key, units);
    const echoMat = new THREE.MeshBasicMaterial({
      color: A.item(key).color, transparent: true, opacity: 0.16, depthWrite: false, wireframe: true
    });
    const echoA = new THREE.Mesh(ECHO_GEO, echoMat);
    const echoB = new THREE.Mesh(ECHO_GEO, echoMat.clone());
    nodeGroup.add(mesh, echoA, echoB);
    nodes.push({
      type: key, x, z, wPos, ay: top, depth, units, mesh, echoA, echoB, deep: !!deep,
      phase: rand() * Math.PI * 2, respawn: 0, harvested: false, mineT: 0,
      lastW: NaN, baseY: 0, echoW: NaN, echoYA: 0, echoYB: 0, exposed: depth < 0.2, vis: 1
    });
  };

  for (let i = 0; i < count; i++) {
    const key = pick(table);
    const ang = rand() * Math.PI * 2;
    const rad = 11 + Math.sqrt(rand()) * 212;
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    const wPos = (rand() - 0.5) * 11.5;
    const units = 2 + Math.floor(rand() * 4);
    const deep = rand() < NODE_DEPTH.deep;
    const depth = deep ? 1.0 + rand() * 3.1 : -0.45 + rand() * 0.35;
    push(key, x, z, wPos, units, depth, false);
  }

  // 深层相位矿带（0.8.0）：只存在于 |w| > RADIATION_W 的相位，产出高阶矿
  const deepTable = P.deep ? Object.entries(P.deep) : [];
  const deepCount = Math.round(count * 0.22);
  for (let i = 0; i < deepCount && deepTable.length; i++) {
    const key = pick(deepTable);
    const ang = rand() * Math.PI * 2;
    const rad = 16 + Math.sqrt(rand()) * 200;
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    const sgn = rand() < 0.5 ? -1 : 1;
    const wPos = sgn * (A.RADIATION_W + 0.15 + rand() * 1.5);
    const units = 3 + Math.floor(rand() * 3);
    // 深层矿带一半露头（滑到深相位就能看见），一半要挖
    const depth = rand() < 0.45 ? -0.4 + rand() * 0.3 : 0.8 + rand() * 2.0;
    push(key, x, z, wPos, units, depth, true);
  }
}

function resourceWindow(dw) { return 1 - M.smoothstep(dw, 0.55, 1.55); }


function resourceWindow(dw) { return 1 - M.smoothstep(dw, 0.55, 1.55); }

function updateNodes(w, time, dt, px, pz) {
  for (const r of nodes) {
    if (r.harvested) {
      r.respawn -= dt;
      r.mesh.visible = false; r.echoA.visible = false; r.echoB.visible = false;
      if (r.respawn <= 0) {
        r.harvested = false;
        r.units = 2 + Math.floor(Math.random() * 4);
        // 深层矿带重生后仍留在深相位，普通矿回到相位中段
        r.wPos = r.deep
          ? (r.wPos < 0 ? -1 : 1) * (A.RADIATION_W + 0.15 + Math.random() * 1.5)
          : (Math.random() - 0.5) * 11.5;
        r.depth = Math.random() < NODE_DEPTH.deep ? 1.0 + Math.random() * 3.1 : -0.45 + Math.random() * 0.35;
        r.ay = height(r.x, r.z, r.wPos) - r.depth;
        r.echoW = NaN; r.lastW = NaN; r.mineT = 0;
      }
      continue;
    }
    const adw = Math.abs(w - r.wPos);
    const vis = resourceWindow(adw);
    if (!(Math.abs(w - r.lastW) < 0.05)) {
      r.baseY = height(r.x, r.z, w);
      r.lastW = w;
    }
    // 露头：沉积块的顶已经高过地表，能看见、也能采
    r.exposed = r.baseY < r.ay + 0.45;
    const deeplyBuried = r.baseY > r.ay + 0.95;
    const dist = Math.hypot(r.x - px, r.z - pz);
    const near = 1 - M.smoothstep(dist, 110, 170);
    // 相位不对就沉回土里；深浅靠地形自然遮挡
    const sink = (1 - vis) * 1.9;
    r.mesh.position.set(r.x, r.ay - sink, r.z);
    r.mesh.rotation.y = r.phase;
    r.mesh.scale.setScalar((0.55 + 0.45 * vis) * (0.12 + 0.88 * near));
    r.mesh.visible = vis > 0.02 && near > 0.02 && !deeplyBuried;

    const echoAlpha = (1 - M.smoothstep(adw, 2.2, 4.6)) * 0.2 * near * (deeplyBuried ? 0.4 : 1);
    r.echoA.visible = echoAlpha > 0.01;
    r.echoB.visible = echoAlpha > 0.01;
    if (r.echoA.visible) {
      if (r.echoW !== r.wPos) {
        r.echoYA = height(r.x, r.z, r.wPos + 0.95) + 0.5;
        r.echoYB = height(r.x, r.z, r.wPos - 0.95) + 0.5;
        r.echoW = r.wPos;
      }
      r.echoA.position.set(r.x, r.echoYA, r.z);
      r.echoA.rotation.y = time * 0.22 + r.phase;
      r.echoA.material.opacity = echoAlpha;
      r.echoB.position.set(r.x, r.echoYB, r.z);
      r.echoB.rotation.y = time * 0.22 + r.phase;
      r.echoB.material.opacity = echoAlpha * 0.7;
    }
  }
}

// 用地形工具挖到露头矿脉：每 0.26 秒崩一块进背包（Astroneer 的挖矿手感）
function mineAt(x, z, w, radius, dt, onUnit) {
  for (const r of nodes) {
    if (r.harvested || !r.exposed) continue;
    if (Math.abs(w - r.wPos) > 0.55) continue;
    if (Math.hypot(r.x - x, r.z - z) > radius + 0.9) continue;
    r.mineT += dt;
    if (r.mineT >= 0.26) {
      r.mineT = 0;
      r.units -= 1;
      if (onUnit) onUnit(r);
      if (r.units <= 0) { r.harvested = true; r.respawn = 55 + Math.random() * 55; }
    }
  }
}

// ---------------- 研究样本（发光小方块，白给字节） ----------------
const samples = [];
function spawnSamples() {
  for (const s of samples) nodeGroup.remove(s.mesh);
  samples.length = 0;
  const rand = A.rng(state.seed ^ 0x5a17);
  const geo = new THREE.OctahedronGeometry(0.34, 0);
  for (let i = 0; i < 16; i++) {
    const ang = rand() * Math.PI * 2;
    const rad = 25 + Math.sqrt(rand()) * 170;
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    const wPos = (rand() - 0.5) * 10;
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x8ef0d0, transparent: true, opacity: 0.9 }));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x8ef0d0, transparent: true, opacity: 0.12, depthWrite: false }));
    mesh.add(glow);
    nodeGroup.add(mesh);
    samples.push({ x, z, wPos, mesh, ay: height(x, z, wPos) + 0.9, taken: false, respawn: 0 });
  }
}
function updateSamples(w, time, dt, px, pz) {
  for (const s of samples) {
    if (s.taken) {
      s.respawn -= dt;
      s.mesh.visible = false;
      if (s.respawn <= 0) { s.taken = false; s.mesh.visible = true; }
      continue;
    }
    const dw = Math.abs(w - s.wPos);
    const vis = resourceWindow(dw);
    const dist = Math.hypot(s.x - px, s.z - pz);
    const far = 1 - M.smoothstep(dist, 90, 150);
    s.mesh.position.set(s.x, s.ay + Math.sin(time * 1.1 + s.x) * 0.16, s.z);
    s.mesh.rotation.set(time * 0.5, time * 0.8, 0);
    s.mesh.scale.setScalar(0.4 + 0.6 * vis);
    s.mesh.material.opacity = 0.25 + 0.75 * vis * far;
    s.mesh.visible = vis * far > 0.04;
  }
}

// ---------------- 行星切换 / 存档 ----------------
function setPlanet(pi, seed, editsArr) {
  state.pi = pi;
  state.planet = A.PLANETS[pi];
  state.seed = seed;
  state.o = ((seed % 997) / 997) * 37.3;
  state.edits = new Map(editsArr || []);
  state.dirty = true;
  scene.fog.near = state.planet.fog[0];
  scene.fog.far = state.planet.fog[1];
  scene.fog.color.setHex(state.planet.pal.fog);
  for (const m of meshes) {
    m.userData.lastW = NaN; m.userData.lastCX = NaN; m.userData.lastCZ = NaN;
  }
  for (const im of decorMeshes) { scene.remove(im); im.geometry.dispose(); im.material.dispose(); }
  decorMeshes.length = 0; decor.length = 0;
  buildDecor();
  spawnNodes();
  spawnSamples();
  if (A.ruins) A.ruins.spawn();
}

function serializeEdits() { return Array.from(state.edits.entries()); }

// 切换空间视图后：地形全量重建、把矿脉重新锚到新的地表
function rebuild() {
  for (const m of meshes) {
    m.userData.lastW = NaN; m.userData.lastCX = NaN; m.userData.lastCZ = NaN;
  }
  state.dirty = true;
  decorLastW = NaN; decorLastX = NaN; decorLastZ = NaN;
  for (const n of nodes) {
    n.ay = height(n.x, n.z, n.wPos) - n.depth;
    n.lastW = NaN; n.echoW = NaN;
  }
  for (const sp of samples) {
    sp.ay = height(sp.x, sp.z, sp.wPos) + 0.9;
  }
  if (A.ruins) A.ruins.reanchor(A.player ? A.player.w : 0);
}

A.world = {
  state, height, baseHeight, editAt, deform, setPlanet, serializeEdits, rebuild, nodes, samples,
  resourceWindow, updateDecor, updateNodes, mineAt, updateSamples,
  get planet() { return state.planet; },
  get storm() { return state.storm; },
  init(s) {
    scene = s;
    scene.add(nodeGroup);
    const matMain = new THREE.MeshPhongMaterial({ shininess: 4, vertexColors: true, flatShading: true });
    const main = makeGrid(QUAL.mainN, QUAL.mainCell, matMain, (w) => w, 'main');
    main.receiveShadow = true;
    const gmA = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const gmB = gmA.clone(); gmB.opacity = 0.075;
    const gA = makeGrid(QUAL.ghostN, QUAL.ghostCell, gmA, (w) => w + 0.95, 'ghost');
    const gB = makeGrid(QUAL.ghostN, QUAL.ghostCell, gmB, (w) => w - 0.95, 'ghost');
    gA.renderOrder = 2; gB.renderOrder = 2;
    this.meshes = meshes;
    this.main = main;
    this.ghosts = [gA, gB];
  },
  update(w, px, pz, deformOnly) {
    const main = this.main;
    if (main) updateTerrainMesh(main, px, pz, w, false, deformOnly);
    if (this.ghosts) for (const g of this.ghosts) updateTerrainMesh(g, px, pz, w, false, false);
    updateDecor(w, px, pz);
  },
  updateStorm(dt, shelter) {
    const s = state.storm;
    const interval = state.planet.storm;
    s.timer -= dt;
    if (!s.active && s.timer <= 0) {
      s.active = true; s.t = 22; s.timer = interval;
      A.ui && A.ui.toast('沙尘风暴来袭 · 找掩体或躲进庇护所');
    }
    if (s.active) {
      s.t -= dt;
      s.intensity = M.lerp(s.intensity, shelter ? 0.15 : 1, 1 - Math.exp(-dt * 2));
      if (s.t <= 0) { s.active = false; s.intensity = 0; }
    } else {
      s.intensity = M.lerp(s.intensity, 0, 1 - Math.exp(-dt * 1.5));
    }
    return s.intensity;
  }
};

})(window.A);
