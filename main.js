/* ============================================================
   ASTRA·4D — 四维远征
   一个以 Astroneer 几何美学为底的四维 (x,y,z,w) 探索游戏。
   核心原则：w 是连续的。地形、资源、系绳皆为 w 的连续函数，
   相位滑移时整个世界平滑呼吸。
   ============================================================ */
(function () {
'use strict';

// ============================================================
// 0. 调色板（Astroneer 式粉彩）
// ============================================================
const PAL = {
  skyTopDay:   new THREE.Color(0x6fa8de),
  skyHorDay:   new THREE.Color(0xf2d6a4),
  skyTopDusk:  new THREE.Color(0x4d5ba6),
  skyHorDusk:  new THREE.Color(0xe89272),
  sunDay:      new THREE.Color(0xfff3dc),
  sunDusk:     new THREE.Color(0xffc98f),
  fogDay:      new THREE.Color(0xf2d6a4),
  fogDusk:     new THREE.Color(0xd8937e),
  // 地形
  lowGreen:    new THREE.Color(0x7fb291),
  sandTan:     new THREE.Color(0xd9a468),
  rockMauve:   new THREE.Color(0x9b8580),
  crystalPatch:new THREE.Color(0xb3a4cd),
  // 资源
  compound:    new THREE.Color(0xe2c493),
  resin:       new THREE.Color(0xe9973f),
  quartz:      new THREE.Color(0xdcd6ee),
  hematite:    new THREE.Color(0xa75548),
  malachite:   new THREE.Color(0x46a583),
  astronium:   new THREE.Color(0x8d63d6),
  // 系绳
  tetherGlow:  new THREE.Color(0x9be8ff),
  phaseViolet: new THREE.Color(0x8d78d6)
};

// ============================================================
// 1. 四维值噪声 + fbm（一切连续性的源头）
// ============================================================
function hash4(x, y, z, w) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) +
           Math.imul(z | 0, 1274126177) + Math.imul(w | 0, 2246822519)) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}
function quintic(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + (b - a) * t; }

// 4D 值噪声，输出 [-1, 1]
function noise4(x, y, z, w) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), wi = Math.floor(w);
  const u = quintic(x - xi), v = quintic(y - yi), s = quintic(z - zi), t = quintic(w - wi);
  const c0000 = hash4(xi, yi, zi, wi),     c1000 = hash4(xi + 1, yi, zi, wi);
  const c0100 = hash4(xi, yi + 1, zi, wi), c1100 = hash4(xi + 1, yi + 1, zi, wi);
  const c0010 = hash4(xi, yi, zi + 1, wi), c1010 = hash4(xi + 1, yi, zi + 1, wi);
  const c0110 = hash4(xi, yi + 1, zi + 1, wi), c1110 = hash4(xi + 1, yi + 1, zi + 1, wi);
  const c0001 = hash4(xi, yi, zi, wi + 1), c1001 = hash4(xi + 1, yi, zi, wi + 1);
  const c0101 = hash4(xi, yi + 1, zi, wi + 1), c1101 = hash4(xi + 1, yi + 1, zi, wi + 1);
  const c0011 = hash4(xi, yi, zi + 1, wi + 1), c1011 = hash4(xi + 1, yi, zi + 1, wi + 1);
  const c0111 = hash4(xi, yi + 1, zi + 1, wi + 1), c1111 = hash4(xi + 1, yi + 1, zi + 1, wi + 1);
  const x00 = lerp(c0000, c1000, u), x10 = lerp(c0100, c1100, u);
  const x01 = lerp(c0010, c1010, u), x11 = lerp(c0110, c1110, u);
  const x20 = lerp(c0001, c1001, u), x30 = lerp(c0101, c1101, u);
  const x21 = lerp(c0011, c1011, u), x31 = lerp(c0111, c1111, u);
  const y0 = lerp(x00, x10, v), y1 = lerp(x01, x11, v);
  const y2 = lerp(x20, x30, v), y3 = lerp(x21, x31, v);
  return (lerp(lerp(y0, y1, s), lerp(y2, y3, s), t)) * 2 - 1;
}

function fbm4(x, y, z, w, oct) {
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += a * noise4(x * f, y * f, z * f, w * f);
    norm += a;
    a *= 0.5; f *= 2.02;
  }
  return sum / norm;
}

// ============================================================
// 2. 世界场：地形高度 = f(x, z, w) —— 对 w 连续
//    性能策略：粗晶格双线性 + 细节层。
//    物理与网格共享同一函数，不会踩空/陷地。
// ============================================================
const COARSE = 3.6; // 粗晶格间距
function smooth(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

function coarseH(i, j, w) {
  const x = i * COARSE, z = j * COARSE;
  return 3.6 * fbm4(x * 0.024, 11.7, z * 0.024, w * 0.42, 3)
       + 1.25 * fbm4(x * 0.082, 4.2, z * 0.082, w * 0.75, 2)
       - 1.35;
}
function detailH(x, z, w) {
  return 0.32 * noise4(x * 0.30, 27.0, z * 0.30, w * 1.15);
}
function terrainHeight(x, z, w) {
  const gx = x / COARSE, gz = z / COARSE;
  const xi = Math.floor(gx), zi = Math.floor(gz);
  const u = smooth(gx - xi), v = smooth(gz - zi);
  const h00 = coarseH(xi, zi, w), h10 = coarseH(xi + 1, zi, w);
  const h01 = coarseH(xi, zi + 1, w), h11 = coarseH(xi + 1, zi + 1, w);
  return lerp(lerp(h00, h10, u), lerp(h01, h11, u), v) + detailH(x, z, w);
}

// 粗晶格颜色场（同样对 w 连续）
function coarseColor(i, j, w, h, out) {
  const x = i * COARSE, z = j * COARSE;
  const patch = noise4(x * 0.031, 51.2, z * 0.031, w * 0.5 + 3.1);
  const crys  = noise4(x * 0.017, 88.8, z * 0.017, w * 0.63 + 9.4);
  const hn = THREE.MathUtils.clamp((h + 4.2) / 9.5, 0, 1);
  let t = THREE.MathUtils.smoothstep(hn + patch * 0.16, 0.34, 0.78);
  out.copy(PAL.lowGreen).lerp(PAL.sandTan, t);
  if (crys > 0.42) out.lerp(PAL.crystalPatch, Math.min((crys - 0.42) * 1.6, 0.5));
  return out;
}

// ============================================================
// 3. 渲染器 / 场景 / 天空 / 光照
// ============================================================
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf2d6a4, 46, 88);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 900);

// —— 天空穹顶（渐变 + 太阳辉光，Astroneer 水彩天空） ——
const skyUniforms = {
  topColor:     { value: PAL.skyTopDay.clone() },
  horizonColor: { value: PAL.skyHorDay.clone() },
  sunColor:     { value: PAL.sunDay.clone() },
  sunDir:       { value: new THREE.Vector3(0.45, 0.62, 0.32).normalize() }
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(430, 32, 18),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 sunColor; uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float t = clamp(d.y * 1.35 + 0.16, 0.0, 1.0);
        vec3 col = mix(horizonColor, topColor, pow(t, 0.72));
        float ds = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * (pow(ds, 240.0) * 1.15 + pow(ds, 8.0) * 0.20);
        gl_FragColor = vec4(col, 1.0);
      }`
  })
);
sky.frustumCulled = false;
scene.add(sky);

// —— 星空（夜晚渐显） ——
{
  const starPos = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2;
    const y = Math.random() * 2 - 1;
    const r = Math.sqrt(1 - y * y);
    starPos.set([Math.cos(a) * r * 390, Math.abs(y) * 350 + 8, Math.sin(a) * r * 390], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xfff6e8, size: 1.7, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  stars.frustumCulled = false;
  scene.add(stars);
  scene.userData.stars = stars;
}

// —— 光照 ——
const hemi = new THREE.HemisphereLight(0xcfe0f4, 0xd9a76c, 0.92);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2dd, 1.18);
sun.position.set(38, 52, 26);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 2;
sun.shadow.camera.far = 190;
const SC = 58;
sun.shadow.camera.left = -SC; sun.shadow.camera.right = SC;
sun.shadow.camera.top = SC; sun.shadow.camera.bottom = -SC;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(sun.target);

// —— 云层（圆润小几何体团块，缓慢漂移） ——
const cloudGroup = new THREE.Group();
{
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xfdf6ea, transparent: true, opacity: 0.92, flatShading: true });
  for (let i = 0; i < 11; i++) {
    const cluster = new THREE.Group();
    const n = 3 + Math.floor(Math.random() * 3);
    for (let j = 0; j < n; j++) {
      const s = 4 + Math.random() * 7;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), cloudMat);
      m.position.set((Math.random() - 0.5) * s * 2.4, (Math.random() - 0.5) * s * 0.5, (Math.random() - 0.5) * s * 2.4);
      m.scale.y = 0.42;
      cluster.add(m);
    }
    const ang = Math.random() * Math.PI * 2;
    const rad = 42 + Math.random() * 130;
    cluster.position.set(Math.cos(ang) * rad, 32 + Math.random() * 24, Math.sin(ang) * rad);
    cluster.userData.speed = 0.22 + Math.random() * 0.35;
    cloudGroup.add(cluster);
  }
  scene.add(cloudGroup);
}

// ============================================================
// 4. 地形网格（主切片 + 两层相位幽灵地形）
//    顶点高度是 f(x,z,w) —— w 滑移时连续变形
// ============================================================
function makeTerrainGrid(n, cell, material, wOffsetFn, mode) {
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
  mesh.userData = {
    n, cell, wOffsetFn, mode,
    lastCX: NaN, lastCZ: NaN, lastW: NaN,
    // 粗晶格采样缓存（主地形）
    cn: Math.ceil((n - 1) * cell / COARSE) + 4,
    Hc: null, Cc: null
  };
  mesh.userData.Hc = new Float32Array(mesh.userData.cn * mesh.userData.cn);
  mesh.userData.Cc = new Float32Array(mesh.userData.cn * mesh.userData.cn * 3);
  scene.add(mesh);
  return mesh;
}

const mainTerrain = makeTerrainGrid(
  88, 1.8,
  new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  (w) => w, 'main'
);
mainTerrain.receiveShadow = true;
mainTerrain.castShadow = false;

const ghostMatA = new THREE.MeshBasicMaterial({
  vertexColors: true, transparent: true, opacity: 0.12,
  depthWrite: false, side: THREE.DoubleSide, fog: false
});
const ghostMatB = ghostMatA.clone(); ghostMatB.opacity = 0.085;
const ghostA = makeTerrainGrid(44, 3.4, ghostMatA, (w) => w + 0.95, 'ghost');
const ghostB = makeTerrainGrid(44, 3.4, ghostMatB, (w) => w - 0.95, 'ghost');
ghostA.renderOrder = 2; ghostB.renderOrder = 2;

const _col = new THREE.Color();
const _cc = new THREE.Color();
const _handPos = new THREE.Vector3(), _beamDir = new THREE.Vector3(), _beamUp = new THREE.Vector3(0, 1, 0);
const _jumpColor = new THREE.Color(0xd9c2a2);
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _move = new THREE.Vector3();
const _targetPos = new THREE.Vector3(), _off = new THREE.Vector3(), _desired = new THREE.Vector3();
const _sd = new THREE.Vector3(), _sunPos = new THREE.Vector3();
const W_LIMIT = 6.5;
let wAtLimit = false;

function updateTerrain(mesh, w, force) {
  const ud = mesh.userData;
  const { n, cell, wOffsetFn, mode } = ud;
  const cx = Math.round(player.x / cell) * cell;
  const cz = Math.round(player.z / cell) * cell;
  const ww = wOffsetFn(w);
  const minDW = mode === 'main' ? 0.045 : 0.09;
  const prevCX = ud.lastCX, prevCZ = ud.lastCZ;
  if (!force && Math.abs(cx - ud.lastCX) < cell * 0.5 &&
      Math.abs(cz - ud.lastCZ) < cell * 0.5 && Math.abs(ww - ud.lastW) < minDW) return;
  ud.lastCX = cx; ud.lastCZ = cz; ud.lastW = ww;
  const moved = cx !== prevCX || cz !== prevCZ;

  const posAttr = mesh.geometry.attributes.position;
  const colAttr = mesh.geometry.attributes.color;
  const half = (n - 1) * cell * 0.5;

  if (mode === 'main') {
    // —— 主切片：粗晶格缓存 + 双线性 + 细节层 ——
    const cn = ud.cn, Hc = ud.Hc, Cc = ud.Cc;
    const g0x = Math.floor((cx - half) / COARSE) - 1;
    const g0z = Math.floor((cz - half) / COARSE) - 1;
    // 1) 粗晶格高度
    for (let j = 0; j < cn; j++) {
      for (let i = 0; i < cn; i++) {
        Hc[j * cn + i] = coarseH(g0x + i, g0z + j, ww);
      }
    }
    // 2) 粗晶格颜色
    for (let j = 0; j < cn; j++) {
      for (let i = 0; i < cn; i++) {
        const k = (j * cn + i) * 3;
        coarseColor(g0x + i, g0z + j, ww, Hc[j * cn + i], _cc);
        Cc[k] = _cc.r; Cc[k + 1] = _cc.g; Cc[k + 2] = _cc.b;
      }
    }
    // 3) 细网格顶点：双线性高度 + 细节层；双线性颜色 + 颗粒
    for (let j = 0; j < n; j++) {
      const z = cz - half + j * cell;
      const gz = z / COARSE;
      const z0 = Math.floor(gz), v = smooth(gz - z0);
      const rz = z0 - g0z;
      for (let i = 0; i < n; i++) {
        const x = cx - half + i * cell;
        const gx = x / COARSE;
        const x0 = Math.floor(gx), u = smooth(gx - x0);
        const rx = x0 - g0x;
        const k = (j * n + i) * 3;
        const k00 = rz * cn + rx, k10 = k00 + 1, k01 = k00 + cn, k11 = k01 + 1;
        const hb = lerp(lerp(Hc[k00], Hc[k10], u), lerp(Hc[k01], Hc[k11], u), v);
        posAttr.array[k] = x;
        posAttr.array[k + 1] = hb + detailH(x, z, ww);
        posAttr.array[k + 2] = z;
        // 颜色双线性
        const a00 = k00 * 3, a10 = k10 * 3, a01 = k01 * 3, a11 = k11 * 3;
        let cr = lerp(lerp(Cc[a00], Cc[a10], u), lerp(Cc[a01], Cc[a11], u), v);
        let cg = lerp(lerp(Cc[a00 + 1], Cc[a10 + 1], u), lerp(Cc[a01 + 1], Cc[a11 + 1], u), v);
        let cb = lerp(lerp(Cc[a00 + 2], Cc[a10 + 2], u), lerp(Cc[a01 + 2], Cc[a11 + 2], u), v);
        // 每顶点颗粒（廉价哈希抖动，手绘低多边形质感）
        const gw = ww * 20, gi = Math.floor(gw), gf = smooth(gw - gi);
        const grain = (lerp(hash4(rx * 7 + 13, rz * 11 + 5, 0, gi),
                            hash4(rx * 7 + 13, rz * 11 + 5, 0, gi + 1), gf) - 0.5) * 0.055;
        cr += grain; cg += grain; cb += grain;
        colAttr.array[k] = cr; colAttr.array[k + 1] = cg; colAttr.array[k + 2] = cb;
      }
    }
  } else {
    // —— 相位幽灵层：低成本直接采样（半透明远景，细节不可辨） ——
    for (let j = 0; j < n; j++) {
      const z = cz - half + j * cell;
      for (let i = 0; i < n; i++) {
        const x = cx - half + i * cell;
        const k = (j * n + i) * 3;
        const h = 3.6 * fbm4(x * 0.024, 11.7, z * 0.024, ww * 0.42, 2) - 1.35;
        posAttr.array[k] = x; posAttr.array[k + 1] = h; posAttr.array[k + 2] = z;
        const t = THREE.MathUtils.clamp((h + 3.2) / 8.5, 0, 1);
        colAttr.array[k] = 0.42 + 0.32 * t;
        colAttr.array[k + 1] = 0.40 + 0.30 * t;
        colAttr.array[k + 2] = 0.62 + 0.22 * t;
      }
    }
  }
  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
  if (mode === 'main') mesh.geometry.computeVertexNormals();
  if (moved || force || !mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
}

// ============================================================
// 5. 几何元素库：圆润小几何体（Astroneer 的基本积木）
// ============================================================
// 软圆角方块：把方块顶点向球面方向揉圆
function roundedBox(w, h, d, round) {
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const p = g.attributes.position;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(
      THREE.MathUtils.clamp(v.x, -w / 2 + round, w / 2 - round),
      THREE.MathUtils.clamp(v.y, -h / 2 + round, h / 2 - round),
      THREE.MathUtils.clamp(v.z, -d / 2 + round, d / 2 - round)
    );
    v.sub(c).normalize().multiplyScalar(round).add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// —— 地表装饰：岩石 / 水晶簇 / 圆润灌木 ——
const decor = [];
const decorMeshes = [];
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _sv = new THREE.Vector3(), _pv = new THREE.Vector3(), _eul = new THREE.Euler();
let decorLastW = NaN, decorLastX = NaN, decorLastZ = NaN;
{
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const boulderGeo = roundedBox(1.6, 1.15, 1.35, 0.34);
  const shrubGeo = new THREE.IcosahedronGeometry(1, 1);
  const shardGeo = new THREE.OctahedronGeometry(1, 0);

  const rockMat = new THREE.MeshLambertMaterial({ flatShading: true });
  const defs = [
    { geo: rockGeo,   count: 260, sMin: 0.22, sMax: 0.62, tint: 0xa8928c },
    { geo: boulderGeo,count: 120, sMin: 0.45, sMax: 1.15, tint: 0xb59d92 },
    { geo: shrubGeo,  count: 190, sMin: 0.30, sMax: 0.72, tint: 0x74ab8c },
    { geo: shardGeo,  count: 90,  sMin: 0.28, sMax: 0.85, tint: 0xb3a4cd }
  ];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
  const eul = new THREE.Euler();
  for (const def of defs) {
    const im = new THREE.InstancedMesh(def.geo, rockMat.clone(), def.count);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < def.count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * 235;
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const wPos = (Math.random() - 0.5) * 14;
      const s = def.sMin + Math.random() * (def.sMax - def.sMin);
      const col = new THREE.Color(def.tint).offsetHSL((Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.1);
      decor.push({ im, i, x, z, wPos, s, col, phase: Math.random() * Math.PI * 2 });
      eul.set(Math.random() * 0.35, Math.random() * Math.PI * 2, Math.random() * 0.35);
      q.setFromEuler(eul);
      pv.set(x, 0, z); sv.setScalar(0.001);
      m4.compose(pv, q, sv);
      im.setMatrixAt(i, m4);
      im.setColorAt(i, col);
    }
    im.castShadow = true;
    im.receiveShadow = true;
    scene.add(im);
    decorMeshes.push(im);
  }
}
function updateDecor(w) {
  const qx = Math.round(player.x / 6) * 6, qz = Math.round(player.z / 6) * 6;
  if (Math.abs(w - decorLastW) < 0.05 && qx === decorLastX && qz === decorLastZ) return;
  decorLastW = w; decorLastX = qx; decorLastZ = qz;
  for (const d of decor) {
    const dw = Math.abs(w - d.wPos);
    // w 窗口：连续淡出，永不突变
    const vis = 1 - THREE.MathUtils.smoothstep(dw, 1.15, 3.4);
    const dist = Math.hypot(d.x - player.x, d.z - player.z);
    const far = 1 - THREE.MathUtils.smoothstep(dist, 120, 205);
    const s = d.s * (0.06 + 0.94 * vis) * (0.05 + 0.95 * far);
    const y = terrainHeight(d.x, d.z, w) + d.s * 0.22;
    _eul.set(0, d.phase, 0);
    _q.setFromEuler(_eul);
    _pv.set(d.x, y, d.z);
    _sv.setScalar(Math.max(s, 0.001));
    _m4.compose(_pv, _q, _sv);
    d.im.setMatrixAt(d.i, _m4);
  }
  for (const im of decorMeshes) im.instanceMatrix.needsUpdate = true;
}

// ============================================================
// 6. 资源矿块（Astroneer 原版小几何体造型）+ 相位回声
// ============================================================
const RES_TYPES = {
  compound:  { name: '化合物', color: PAL.compound,  weight: 26, shape: 'icosa' },
  resin:     { name: '树脂',   color: PAL.resin,     weight: 22, shape: 'drop' },
  quartz:    { name: '石英',   color: PAL.quartz,    weight: 18, shape: 'prism', glow: 0.25 },
  hematite:  { name: '赤铁矿', color: PAL.hematite,  weight: 14, shape: 'dodeca' },
  malachite: { name: '孔雀石', color: PAL.malachite, weight: 14, shape: 'icosa0' },
  astronium: { name: '星辉矿', color: PAL.astronium, weight: 6,  shape: 'prism', glow: 0.75, rare: true }
};
const ECHO_GEO = new THREE.OctahedronGeometry(0.62, 0);
function buildResourceMesh(type) {
  const t = RES_TYPES[type];
  const g = new THREE.Group();
  let core;
  if (!t.mat) t.mat = new THREE.MeshPhongMaterial({
    color: t.color, flatShading: true, shininess: 26,
    transparent: true, opacity: 1,
    emissive: t.color.clone().multiplyScalar(t.glow || 0.06)
  });
  const mat = t.mat;
  if (t.shape === 'icosa') {
    core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 1), mat);
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 5), mat);
      const a = (i / 5) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.36, 0.22 + Math.sin(i * 2.3) * 0.16, Math.sin(a) * 0.36);
      spike.rotation.set(Math.random() * 0.7, 0, Math.random() * 0.7);
      g.add(spike);
    }
  } else if (t.shape === 'drop') {
    core = new THREE.Mesh(new THREE.SphereGeometry(0.44, 10, 8), mat);
    core.scale.set(1, 1.32, 1);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 8), mat);
    tip.position.y = 0.62;
    g.add(tip);
  } else if (t.shape === 'prism') {
    core = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), mat);
    core.scale.set(0.8, 1.55, 0.8);
    const side = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), mat);
    side.position.set(0.34, -0.12, 0.18);
    side.scale.y = 1.7;
    g.add(side);
    const side2 = side.clone();
    side2.position.set(-0.3, -0.2, -0.22);
    side2.scale.setScalar(0.8);
    g.add(side2);
    if (t.glow > 0.4) {
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 10),
        new THREE.MeshBasicMaterial({ color: t.color, transparent: true, opacity: 0.12, depthWrite: false }));
      g.add(halo);
    }
  } else if (t.shape === 'dodeca') {
    core = new THREE.Mesh(new THREE.DodecahedronGeometry(0.48, 0), mat);
    core.scale.set(1.1, 0.9, 1.05);
  } else {
    core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 0), mat);
    core.scale.set(1.15, 0.85, 1.1);
  }
  core.castShadow = true;
  g.add(core);
  return g;
}

const resources = [];
{
  const totalWeight = Object.values(RES_TYPES).reduce((a, t) => a + t.weight, 0);
  for (let i = 0; i < 96; i++) {
    let r = Math.random() * totalWeight, key = 'compound';
    for (const [k, t] of Object.entries(RES_TYPES)) { r -= t.weight; if (r <= 0) { key = k; break; } }
    const ang = Math.random() * Math.PI * 2;
    const rad = 14 + Math.sqrt(Math.random()) * 215;
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    // 每块矿有自己的 w 相位 —— 想采集必须滑到它的相位上
    const wPos = (Math.random() - 0.5) * 12;
    const mesh = buildResourceMesh(key);
    // 相位回声：w±0.9 的半透明投影，可视化第四维
    const echoMat = new THREE.MeshBasicMaterial({
      color: RES_TYPES[key].color, transparent: true, opacity: 0.16,
      depthWrite: false, wireframe: true
    });
    const echoA = new THREE.Mesh(ECHO_GEO, echoMat);
    const echoB = new THREE.Mesh(ECHO_GEO, echoMat.clone());
    scene.add(mesh, echoA, echoB);
    resources.push({
      type: key, x, z, wPos, mesh, echoA, echoB,
      bobPhase: Math.random() * Math.PI * 2,
      respawn: 0, harvested: false,
      lastW: NaN, baseY: 0, echoW: NaN, echoYA: 0, echoYB: 0
    });
  }
}

function resourceWindow(dw) {
  // 连续可采窗口：|Δw| < 0.55 完全对齐，1.5 外完全透明
  return 1 - THREE.MathUtils.smoothstep(dw, 0.55, 1.55);
}

function updateResources(w, time, dt) {
  for (const r of resources) {
    const dw = w - r.wPos;
    const adw = Math.abs(dw);
    const vis = resourceWindow(adw);

    if (r.harvested) {
      r.respawn -= dt;
      if (r.respawn <= 0) {
        r.harvested = false;
        r.wPos = (Math.random() - 0.5) * 12; // 从另一个相位重新浮现
        r.echoW = NaN;
      }
      r.mesh.visible = false; r.echoA.visible = false; r.echoB.visible = false;
      continue;
    }

    if (!(Math.abs(w - r.lastW) < 0.05)) {
      r.baseY = terrainHeight(r.x, r.z, w);
      r.lastW = w;
    }
    const y = r.baseY + 0.55 + Math.sin(time * 1.4 + r.bobPhase) * 0.07;
    const dist = Math.hypot(r.x - player.x, r.z - player.z);
    const near = 1 - THREE.MathUtils.smoothstep(dist, 110, 170);

    r.mesh.position.set(r.x, y, r.z);
    const s = (0.22 + 0.78 * vis) * (0.05 + 0.95 * near);
    r.mesh.scale.setScalar(s);
    r.mesh.rotation.y = time * 0.22 + r.bobPhase;
    r.mesh.visible = s > 0.05;

    // 回声随 w 连续滑移（y 随地形连续变化）
    const echoAlpha = (1 - THREE.MathUtils.smoothstep(adw, 2.2, 4.6)) * 0.22 * near;
    r.echoA.visible = echoAlpha > 0.01;
    r.echoB.visible = echoAlpha > 0.01;
    if (r.echoA.visible) {
      if (r.echoW !== r.wPos) {
        r.echoYA = terrainHeight(r.x, r.z, r.wPos + 0.95) + 0.55;
        r.echoYB = terrainHeight(r.x, r.z, r.wPos - 0.95) + 0.55;
        r.echoW = r.wPos;
      }
      r.echoA.position.set(r.x, r.echoYA, r.z);
      r.echoA.rotation.y = time * 0.22 + r.bobPhase;
      r.echoA.material.opacity = echoAlpha;
      r.echoB.position.set(r.x, r.echoYB, r.z);
      r.echoB.rotation.y = time * 0.22 + r.bobPhase;
      r.echoB.material.opacity = echoAlpha * 0.7;
    }
  }
}

// ============================================================
// 7. 宇航员（圆润小几何体拼装）
// ============================================================
const player = {
  x: 0, y: 4, z: 0, w: 0,
  wVel: 0,
  vy: 0, grounded: false,
  facing: 0,
  oxygen: 100, health: 100,
  inNetwork: false,
  dead: false, deadTimer: 0
};

function buildAstronaut() {
  const g = new THREE.Group();
  const suit = new THREE.MeshLambertMaterial({ color: 0xf3f0e8, flatShading: true });
  const suitDark = new THREE.MeshLambertMaterial({ color: 0xd8d2c4, flatShading: true });
  const visorMat = new THREE.MeshPhongMaterial({ color: 0x2c3a52, flatShading: true, shininess: 90, emissive: 0x1a2436 });
  const accent = new THREE.MeshLambertMaterial({ color: 0xe8853c, flatShading: true });

  const torso = new THREE.Mesh(roundedBox(0.72, 0.86, 0.56, 0.2), suit);
  torso.position.y = 1.02;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.37, 12, 10), suit);
  helmet.position.y = 1.72;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.295, 12, 10, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.22, Math.PI * 0.5), visorMat);
  visor.position.set(0, 1.74, 0.13);
  visor.rotation.y = Math.PI / 2;
  const pack = new THREE.Mesh(roundedBox(0.56, 0.62, 0.3, 0.12), suitDark);
  pack.position.set(0, 1.12, -0.42);
  const packTop = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), accent);
  packTop.position.set(0.14, 1.46, -0.44);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 5), suitDark);
  antenna.position.set(-0.16, 1.62, -0.44);
  const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x9be8ff, emissive: 0x9be8ff, flatShading: true }));
  antTip.position.set(-0.16, 1.9, -0.44);

  const armL = new THREE.Mesh(roundedBox(0.2, 0.62, 0.22, 0.09), suit);
  armL.position.set(-0.52, 1.12, 0);
  const armR = armL.clone();
  armR.position.x = 0.52;
  const legL = new THREE.Mesh(roundedBox(0.26, 0.66, 0.3, 0.11), suitDark);
  legL.position.set(-0.2, 0.36, 0);
  const legR = legL.clone();
  legR.position.x = 0.2;

  for (const m of [torso, helmet, visor, pack, packTop, antenna, antTip, armL, armR, legL, legR]) {
    m.castShadow = true;
    g.add(m);
  }
  g.userData = { armL, armR, legL, legR, torso, helmet };
  return g;
}
const astronaut = buildAstronaut();
scene.add(astronaut);

// ============================================================
// 8. 系绳桩 + 氧气管网
// ============================================================
const tethers = [];
const TETHER_MAX = 80;
const TETHER_GEO = {
  post: new THREE.CylinderGeometry(0.075, 0.12, 1.5, 7),
  ring: new THREE.TorusGeometry(0.19, 0.055, 7, 16),
  bulb: new THREE.SphereGeometry(0.11, 9, 7),
  foot: new THREE.CylinderGeometry(0.26, 0.32, 0.16, 8)
};
const TETHER_MAT = {
  post: new THREE.MeshLambertMaterial({ color: 0xe8e2d2, flatShading: true }),
  ring: new THREE.MeshLambertMaterial({ color: 0x8d78d6, emissive: 0x584a9e, flatShading: true }),
  bulb: new THREE.MeshLambertMaterial({ color: 0x9be8ff, emissive: 0x9be8ff, flatShading: true }),
  foot: new THREE.MeshLambertMaterial({ color: 0xc9c1ae, flatShading: true })
};
const tetherGroup = new THREE.Group();
scene.add(tetherGroup);
let tetherLine = null;

function placeTether() {
  if (tethers.length >= TETHER_MAX) {
    let idx = 0, far = -1;
    for (let i = 0; i < tethers.length; i++) {
      const t = tethers[i];
      const d = Math.hypot(t.x - player.x, t.z - player.z) + Math.abs(t.w - player.w) * 6;
      if (d > far) { far = d; idx = i; }
    }
    tetherGroup.remove(tethers.splice(idx, 1)[0].group);
    showToast('系绳桩已达上限 · 已回收最远的一根');
  }
  const wPos = player.w;
  const y = terrainHeight(player.x, player.z, wPos);
  const g = new THREE.Group();
  const post = new THREE.Mesh(TETHER_GEO.post, TETHER_MAT.post);
  post.position.y = 0.75;
  const ring = new THREE.Mesh(TETHER_GEO.ring, TETHER_MAT.ring);
  ring.position.y = 1.28;
  ring.rotation.x = Math.PI / 2;
  const bulb = new THREE.Mesh(TETHER_GEO.bulb, TETHER_MAT.bulb);
  bulb.position.y = 1.62;
  const foot = new THREE.Mesh(TETHER_GEO.foot, TETHER_MAT.foot);
  foot.position.y = 0.08;
  for (const m of [post, ring, bulb, foot]) { m.castShadow = true; g.add(m); }
  g.position.set(player.x, y, player.z);
  tetherGroup.add(g);
  tethers.push({ x: player.x, z: player.z, w: wPos, group: g, bulb, ring });

  // 轻脉冲反馈
  spawnPulse(player.x, y + 1.2, player.z, PAL.tetherGlow);
  rebuildTetherLine();
}

function rebuildTetherLine() {
  if (tetherLine) { tetherGroup.remove(tetherLine); tetherLine.geometry.dispose(); tetherLine.material.dispose(); }
  if (tethers.length < 2) return;
  const pts = [];
  for (let i = 0; i < tethers.length - 1; i++) {
    const a = tethers[i], b = tethers[i + 1];
    if (Math.abs(a.w - b.w) > 2.2) continue;
    const mid = new THREE.Vector3((a.x + b.x) / 2, (terrainHeight(a.x, a.z, player.w) + terrainHeight(b.x, b.z, player.w)) / 2 + 1.45, (a.z + b.z) / 2);
    pts.push(new THREE.Vector3(a.x, terrainHeight(a.x, a.z, player.w) + 1.5, a.z));
    pts.push(mid);
    pts.push(new THREE.Vector3(b.x, terrainHeight(b.x, b.z, player.w) + 1.5, b.z));
  }
  if (pts.length < 2) return;
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  tetherLine = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: 0x9be8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  tetherGroup.add(tetherLine);
}

function updateTethers(w, time) {
  for (const t of tethers) {
    const adw = Math.abs(w - t.w);
    const vis = 1 - THREE.MathUtils.smoothstep(adw, 1.6, 3.2);
    t.group.visible = vis > 0.03;
    t.group.scale.setScalar(0.45 + 0.55 * vis);
    t.bulb.material.emissiveIntensity = 0.6 + 0.4 * Math.sin(time * 2.2 + t.x);
    t.ring.rotation.z = time * 0.6;
  }
  if (tetherLine) tetherLine.position.y = Math.sin(time * 1.8) * 0.03;
  // 氧气网络判定：平面距离 17 以内且相位差 < 1.3
  player.inNetwork = tethers.some(t =>
    Math.hypot(t.x - player.x, t.z - player.z) < 17 && Math.abs(w - t.w) < 1.3);
}

// ============================================================
// 9. 粒子（采集光束 / 火花 / 脉冲）
// ============================================================
const PCOUNT = 360;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PCOUNT * 3);
const pCol = new Float32Array(PCOUNT * 3);
const pSize = new Float32Array(PCOUNT);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
pGeo.setAttribute('size', new THREE.BufferAttribute(pSize, 1));
const pMat = new THREE.PointsMaterial({
  size: 0.16, vertexColors: true, transparent: true, opacity: 0.95,
  depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
});
const points = new THREE.Points(pGeo, pMat);
points.frustumCulled = false;
scene.add(points);
const pLife = new Float32Array(PCOUNT);
const pVel = new Float32Array(PCOUNT * 3);
let pCursor = 0;

function spawnBurst(x, y, z, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const k = pCursor = (pCursor + 1) % PCOUNT;
    pPos[k * 3] = x; pPos[k * 3 + 1] = y; pPos[k * 3 + 2] = z;
    pCol[k * 3] = color.r; pCol[k * 3 + 1] = color.g; pCol[k * 3 + 2] = color.b;
    pLife[k] = 0.75 + Math.random() * 0.55;
    const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
    pVel[k * 3] = Math.cos(a) * Math.cos(e) * speed * (0.5 + Math.random());
    pVel[k * 3 + 1] = Math.sin(e) * speed * (0.5 + Math.random()) + speed * 0.45;
    pVel[k * 3 + 2] = Math.sin(a) * Math.cos(e) * speed * (0.5 + Math.random());
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
}
function spawnPulse(x, y, z, color) { spawnBurst(x, y, z, color, 26, 1.6); }

function updateParticles(dt) {
  let any = false;
  for (let k = 0; k < PCOUNT; k++) {
    if (pLife[k] <= 0) continue;
    any = true;
    pLife[k] -= dt;
    pVel[k * 3 + 1] -= dt * 2.1;
    pPos[k * 3] += pVel[k * 3] * dt;
    pPos[k * 3 + 1] += pVel[k * 3 + 1] * dt;
    pPos[k * 3 + 2] += pVel[k * 3 + 2] * dt;
    const f = Math.max(pLife[k], 0);
    pCol[k * 3] *= 0.996; pCol[k * 3 + 1] *= 0.996; pCol[k * 3 + 2] *= 0.996;
    if (f <= 0) pPos[k * 3 + 1] = -9999;
  }
  if (any) {
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }
}

// —— 采集光束 ——
const beam = new THREE.Mesh(
  new THREE.CylinderGeometry(0.035, 0.11, 1, 7, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0xffd9a0, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  })
);
beam.visible = false;
scene.add(beam);
const beamTarget = new THREE.Vector3();

function setBeam(from, to, active, t) {
  if (!active) {
    beam.visible = false;
    beam.material.opacity *= 0.82;
    if (beam.material.opacity < 0.01) beam.visible = false;
    else beam.visible = true;
    return;
  }
  beam.visible = true;
  beam.material.opacity = 0.55 + Math.sin(t * 30) * 0.12;
  _beamDir.copy(to).sub(from);
  const len = _beamDir.length();
  beam.scale.set(1, len, 1);
  beam.position.copy(from).addScaledVector(_beamDir, 0.5);
  beam.quaternion.setFromUnitVectors(_beamUp, _beamDir.normalize());
}

// ============================================================
// 10. 相机（第三人称环绕）
// ============================================================
const camState = {
  theta: 0.65, phi: 1.02, dist: 9.2,
  minPhi: 0.32, maxPhi: 1.46,
  minDist: 4.2, maxDist: 15,
  dragging: false, lastX: 0, lastY: 0,
  pos: new THREE.Vector3(0, 6, 12), look: new THREE.Vector3()
};

canvas.addEventListener('pointerdown', (e) => {
  camState.dragging = true;
  camState.lastX = e.clientX; camState.lastY = e.clientY;
  canvas.classList.add('dragging');
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!camState.dragging) return;
  const dx = e.clientX - camState.lastX, dy = e.clientY - camState.lastY;
  camState.lastX = e.clientX; camState.lastY = e.clientY;
  camState.theta -= dx * 0.0052;
  camState.phi = THREE.MathUtils.clamp(camState.phi - dy * 0.0042, camState.minPhi, camState.maxPhi);
});
window.addEventListener('pointerup', () => {
  camState.dragging = false;
  canvas.classList.remove('dragging');
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  camState.dist = THREE.MathUtils.clamp(camState.dist + e.deltaY * 0.012, camState.minDist, camState.maxDist);
}, { passive: false });

function updateCamera(dt) {
  _targetPos.set(player.x, player.y + 1.55, player.z);
  _off.set(
    Math.sin(camState.theta) * Math.sin(camState.phi),
    Math.cos(camState.phi),
    Math.cos(camState.theta) * Math.sin(camState.phi)
  ).multiplyScalar(camState.dist);
  _desired.copy(_targetPos).add(_off);
  // 不钻进地里
  const gh = terrainHeight(_desired.x, _desired.z, player.w) + 1.15;
  if (_desired.y < gh) _desired.y = gh;
  const k = 1 - Math.exp(-dt * 8.5);
  camState.pos.lerp(_desired, k);
  camState.look.lerp(_targetPos, 1 - Math.exp(-dt * 11));
  camera.position.copy(camState.pos);
  camera.lookAt(camState.look);
}

// ============================================================
// 11. 输入
// ============================================================
const keys = {};
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === 'KeyH') document.getElementById('hint-panel').classList.toggle('collapsed');
  if (e.code === 'KeyF' && gameStarted && !player.dead) {
    placeTether();
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

let harvesting = false;
canvas.addEventListener('pointerdown', (e) => { if (e.button === 0) harvesting = true; });
window.addEventListener('pointerup', (e) => { if (e.button === 0) harvesting = false; });

// ============================================================
// 12. 游戏状态 / HUD
// ============================================================
let gameStarted = false;
const inventory = { compound: 0, resin: 0, quartz: 0, hematite: 0, malachite: 0, astronium: 0 };

const el = {
  hud: document.getElementById('hud'),
  oxyFill: document.getElementById('oxygen-fill'),
  oxyNum: document.getElementById('oxygen-num'),
  hpFill: document.getElementById('health-fill'),
  hpNum: document.getElementById('health-num'),
  oxyState: document.getElementById('oxy-state'),
  wReadout: document.getElementById('w-readout'),
  phaseDots: document.getElementById('phase-dots'),
  phaseCursor: document.getElementById('phase-cursor'),
  invChips: document.getElementById('inv-chips'),
  prompt: document.getElementById('prompt'),
  crosshair: document.getElementById('crosshair'),
  toast: document.getElementById('phase-toast'),
  death: document.getElementById('death')
};

// 背包芯片
for (const [k, t] of Object.entries(RES_TYPES)) {
  const chip = document.createElement('div');
  chip.className = 'inv-chip';
  chip.dataset.type = k;
  chip.innerHTML = `<span class="swatch" style="background:#${t.color.getHexString()}"></span>
                    <span class="nm">${t.name}</span><span class="ct">0</span>`;
  el.invChips.appendChild(chip);
}

let toastTimer = 0;
const DEFAULT_TOAST = el.toast.textContent;
function showToast(text) {
  el.toast.textContent = text || DEFAULT_TOAST;
  toastTimer = 1.6;
  el.toast.classList.add('show');
}
const setText = (node, v) => { if (node.textContent !== v) node.textContent = v; };
const setHTML = (node, v) => { if (node.dataset.sig !== v) { node.innerHTML = v; node.dataset.sig = v; } };

let lastOxy = -1, lastHp = -1, lastWStr = '', lastOxyState = '';
let lastOxyWidth = '', lastHpWidth = '';
function updateHUD() {
  const oxy = Math.round(player.oxygen), hp = Math.round(player.health);
  const oxyW = player.oxygen + '%', hpW = player.health + '%';
  if (oxyW !== lastOxyWidth) { el.oxyFill.style.width = oxyW; lastOxyWidth = oxyW; }
  if (hpW !== lastHpWidth) { el.hpFill.style.width = hpW; lastHpWidth = hpW; }
  if (oxy !== lastOxy) { setText(el.oxyNum, String(oxy)); lastOxy = oxy; }
  if (hp !== lastHp) { setText(el.hpNum, String(hp)); lastHp = hp; }
  el.oxyFill.classList.toggle('low', player.oxygen < 26);
  const state = player.inNetwork ? '氧气供给中 · 系绳网络' : '远离系绳 · 氧气消耗';
  if (state !== lastOxyState) { setText(el.oxyState, state); lastOxyState = state; }
  el.oxyState.classList.toggle('warn', !player.inNetwork);

  const wStr = (player.w >= 0 ? '+' : '') + player.w.toFixed(3);
  if (wStr !== lastWStr) { setText(el.wReadout, wStr); lastWStr = wStr; }

  // 相位标尺：±3.2 范围内的资源 / 系绳落点；坐标与透明度量化，避免每帧重建 DOM
  const RANGE = 3.2;
  let dots = '';
  let n = 0;
  for (const r of resources) {
    if (r.harvested || n >= 15) continue;
    const dw = r.wPos - player.w;
    if (Math.abs(dw) > RANGE) continue;
    const pct = Math.round((50 + (dw / RANGE) * 48) * 2) / 2;
    const vis = Math.round(resourceWindow(Math.abs(dw)) * 20) / 20;
    dots += `<span class="phase-dot res" style="left:${pct}%;opacity:${0.25 + 0.75 * vis}"></span>`;
    n++;
  }
  for (const t of tethers) {
    const dw = t.w - player.w;
    if (Math.abs(dw) > RANGE) continue;
    const pct = Math.round((50 + (dw / RANGE) * 48) * 2) / 2;
    dots += `<span class="phase-dot tether" style="left:${pct}%"></span>`;
  }
  setHTML(el.phaseDots, dots);
}

// ============================================================
// 13. 采集逻辑
// ============================================================
let harvestTarget = null;
let harvestProgress = 0;

function findHarvestTarget() {
  let best = null, bestD = 3.6;
  let fallback = null, fallbackD = 3.6;
  for (const r of resources) {
    if (r.harvested) continue;
    const d = Math.hypot(r.x - player.x, r.z - player.z);
    if (d >= 3.6) continue;
    if (Math.abs(player.w - r.wPos) < 0.55) {
      if (d < bestD) { bestD = d; best = r; }
    } else if (d < fallbackD) { fallbackD = d; fallback = r; }
  }
  return best || fallback;
}

function updateHarvest(dt, time) {
  if (player.dead) return;
  const near = findHarvestTarget();
  const handPos = _handPos.set(
    player.x + Math.sin(player.facing + 0.85) * 0.65,
    player.y + 1.18,
    player.z + Math.cos(player.facing + 0.85) * 0.65
  );

  if (near) {
    const aligned = Math.abs(player.w - near.wPos) < 0.55;
    if (aligned) {
      setHTML(el.prompt, `按住 <b>左键</b> 采集 · ${RES_TYPES[near.type].name}`);
      el.prompt.classList.add('show');
      el.crosshair.classList.add('on');
    } else {
      setHTML(el.prompt, `<b>相位未对齐</b> · 滑移 W 至 ${(near.wPos >= 0 ? '+' : '') + near.wPos.toFixed(2)}`);
      el.prompt.classList.add('show');
      el.crosshair.classList.remove('on');
      if (toastTimer <= 0) showToast();
      harvestTarget = null;
      harvestProgress = 0;
      setBeam(handPos, beamTarget, false, time);
      return;
    }
  } else {
    el.prompt.classList.remove('show');
    el.crosshair.classList.remove('on');
    harvestTarget = null;
    harvestProgress = 0;
    setBeam(handPos, beamTarget, false, time);
    return;
  }

  if (harvesting && near) {
    if (harvestTarget !== near) { harvestTarget = near; harvestProgress = 0; }
    beamTarget.set(near.x, near.mesh.position.y, near.z);
    setBeam(handPos, beamTarget, true, time);
    harvestProgress += dt;
    spawnBurst(near.x, near.mesh.position.y, near.z, RES_TYPES[near.type].color, 2, 0.9);
    if (harvestProgress >= 1.35) {
      inventory[near.type]++;
      near.harvested = true;
      near.respawn = 16 + Math.random() * 26;
      spawnBurst(near.x, near.mesh.position.y, near.z, RES_TYPES[near.type].color, 34, 2.2);
      const chip = el.invChips.querySelector(`[data-type="${near.type}"]`);
      chip.querySelector('.ct').textContent = inventory[near.type];
      chip.classList.remove('bump');
      void chip.offsetWidth;
      chip.classList.add('bump');
      harvestTarget = null;
      harvestProgress = 0;
    }
  } else {
    harvestProgress = Math.max(0, harvestProgress - dt * 2.4);
    setBeam(handPos, beamTarget, false, time);
  }
}

// ============================================================
// 14. 主循环
// ============================================================
const clock = new THREE.Clock();
let elapsed = 0;
let dayTime = 0.18; // 0=清晨 0.5=黄昏
let qualityTier = 2;
let qAcc = 0, qCnt = 0, qWarm = 2.0;
let shadowTick = 0;
function setQuality(t) {
  if (t === qualityTier) return;
  qualityTier = t;
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(t === 0 ? 1 : t === 1 ? Math.min(dpr, 1.25) : Math.min(dpr, 2));
  const size = t === 0 ? 512 : 1024;
  if (sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
}
function updateQuality(rawDt) {
  if (qWarm > 0) { qWarm -= rawDt; return; }
  qAcc += rawDt; qCnt++;
  if (qAcc < 2) return;
  const avg = qAcc / qCnt;
  if (avg > 0.042 && qualityTier > 0) setQuality(qualityTier - 1);
  else if (avg < 0.020 && qualityTier < 2) setQuality(qualityTier + 1);
  qAcc = 0; qCnt = 0;
}

function updateDayCycle(dt) {
  dayTime = (dayTime + dt / 560) % 1;
  // 黄昏系数（正弦呼吸）
  const dusk = THREE.MathUtils.smoothstep(Math.sin(dayTime * Math.PI * 2) * -0.5 + 0.5, 0.42, 0.92);
  skyUniforms.topColor.value.copy(PAL.skyTopDay).lerp(PAL.skyTopDusk, dusk);
  skyUniforms.horizonColor.value.copy(PAL.skyHorDay).lerp(PAL.skyHorDusk, dusk);
  skyUniforms.sunColor.value.copy(PAL.sunDay).lerp(PAL.sunDusk, dusk);
  scene.fog.color.copy(PAL.fogDay).lerp(PAL.fogDusk, dusk);
  hemi.intensity = 0.92 - dusk * 0.34;
  sun.intensity = 1.18 - dusk * 0.52;
  sun.color.copy(PAL.sunDay).lerp(PAL.sunDusk, dusk);
  scene.userData.stars.material.opacity = Math.max(0, dusk * 1.25 - 0.32);
  // 太阳缓慢巡游
  const sa = dayTime * Math.PI * 2 + 0.7;
  _sd.set(Math.cos(sa) * 0.75, 0.42 + Math.sin(sa * 0.5) * 0.28, Math.sin(sa) * 0.75).normalize();
  skyUniforms.sunDir.value.copy(_sd);
  _sunPos.copy(_sd).multiplyScalar(85);
  _sunPos.x += player.x; _sunPos.z += player.z;
  sun.position.copy(_sunPos);
  sun.target.position.set(player.x, player.y, player.z);
}

function updatePlayer(dt) {
  if (player.dead) {
    player.deadTimer -= dt;
    if (player.deadTimer <= 0) respawn();
    return;
  }

  // —— 相位滑移（w 连续变化） ——
  const wInput = (keys['KeyE'] ? 1 : 0) - (keys['KeyQ'] ? 1 : 0);
  const wTarget = wInput * 1.35;
  player.wVel += (wTarget - player.wVel) * (1 - Math.exp(-dt * 6.5));
  player.w += player.wVel * dt;
  let atLimit = false;
  if (player.w > W_LIMIT) { player.w = W_LIMIT; atLimit = true; }
  else if (player.w < -W_LIMIT) { player.w = -W_LIMIT; atLimit = true; }
  if (atLimit) {
    player.wVel = 0;
    if (!wAtLimit) { showToast('已到相位带边界 · 按 Q 反向滑移'); wAtLimit = true; }
  } else wAtLimit = false;

  // —— 移动（相机相对） ——
  _fwd.set(-Math.sin(camState.theta), 0, -Math.cos(camState.theta));
  _right.set(-_fwd.z, 0, _fwd.x);
  _move.set(0, 0, 0);
  if (keys['KeyW'] || keys['ArrowUp']) _move.add(_fwd);
  if (keys['KeyS'] || keys['ArrowDown']) _move.sub(_fwd);
  if (keys['KeyA'] || keys['ArrowLeft']) _move.sub(_right);
  if (keys['KeyD'] || keys['ArrowRight']) _move.add(_right);
  const running = keys['ShiftLeft'] || keys['ShiftRight'];
  const speed = running ? 8.4 : 5.1;
  if (_move.lengthSq() > 0) {
    _move.normalize().multiplyScalar(speed * dt);
    player.x += _move.x;
    player.z += _move.z;
    const targetFacing = Math.atan2(_move.x, _move.z);
    let d = targetFacing - player.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    player.facing += d * (1 - Math.exp(-dt * 12));
  }

  // —— 重力 & 地面（地形是 w 的连续函数） ——
  const gh = terrainHeight(player.x, player.z, player.w);
  if (player.grounded && keys['Space']) {
    player.vy = 7.6;
    player.grounded = false;
    spawnBurst(player.x, player.y + 0.1, player.z, _jumpColor, 8, 1.1);
  }
  player.vy -= 21 * dt;
  player.y += player.vy * dt;
  if (player.y <= gh) {
    player.y = gh;
    player.vy = 0;
    player.grounded = true;
  } else {
    player.grounded = false;
  }

  // —— 氧气 ——
  if (player.inNetwork) {
    player.oxygen = Math.min(100, player.oxygen + 14 * dt);
  } else {
    player.oxygen = Math.max(0, player.oxygen - 2.3 * dt);
  }
  if (player.oxygen <= 0) {
    player.health = Math.max(0, player.health - 8.5 * dt);
    if (player.health <= 0) die();
  } else if (player.health < 100 && player.inNetwork) {
    player.health = Math.min(100, player.health + 2.2 * dt);
  }

  // —— 宇航员姿态 ——
  astronaut.position.set(player.x, player.y, player.z);
  astronaut.rotation.y = player.facing;
  const ud = astronaut.userData;
  const speedFactor = _move.lengthSq() > 0 ? (running ? 1.45 : 1) : 0;
  const t = elapsed * 9 * (0.4 + speedFactor);
  ud.legL.rotation.x = Math.sin(t) * 0.62 * speedFactor;
  ud.legR.rotation.x = -Math.sin(t) * 0.62 * speedFactor;
  ud.armL.rotation.x = -Math.sin(t) * 0.5 * speedFactor;
  ud.armR.rotation.x = Math.sin(t) * 0.5 * speedFactor;
  ud.torso.position.y = 1.02 + Math.abs(Math.sin(t)) * 0.035 * speedFactor;
  if (!player.grounded) {
    ud.legL.rotation.x = -0.42;
    ud.legR.rotation.x = -0.62;
    ud.armL.rotation.x = -0.75;
    ud.armR.rotation.x = -0.75;
  }
}

function die() {
  player.dead = true;
  player.deadTimer = 2.4;
  harvesting = false; harvestTarget = null; harvestProgress = 0;
  el.death.classList.remove('hidden');
}
function respawn() {
  let best = null, bestD = Infinity;
  for (const t of tethers) {
    const d = Math.hypot(t.x - player.x, t.z - player.z) + Math.abs(t.w - player.w) * 6;
    if (d < bestD) { bestD = d; best = t; }
  }
  if (best) {
    player.x = best.x; player.z = best.z;
    player.w = best.w;
    player.y = terrainHeight(best.x, best.z, best.w) + 0.5;
  } else {
    player.x = 0; player.z = 0; player.w = 0;
    player.y = terrainHeight(0, 0, 0) + 0.5;
  }
  player.oxygen = 100;
  player.health = 55;
  player.vy = 0;
  player.dead = false;
  el.death.classList.add('hidden');
  spawnBurst(player.x, player.y + 1, player.z, PAL.tetherGlow, 40, 2.4);
}

// —— 云漂移 & 星空跟随 ——
function updateAmbience(dt) {
  for (const c of cloudGroup.children) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 320) c.position.x = -320;
  }
  sky.position.copy(camera.position);
  scene.userData.stars.position.copy(camera.position);
}

// 主循环
function animate() {
  requestAnimationFrame(animate);
  const rawDt = Math.min(clock.getDelta(), 0.25);
  const dt = Math.min(rawDt, 0.05);
  elapsed += dt;

  updateQuality(rawDt);

  // 标题幕期间只渲染静态世界，不推进玩法状态
  if (gameStarted) updatePlayer(dt);
  updateCamera(dt);
  updateDayCycle(dt);
  updateAmbience(dt);

  // 地形：主切片 + 相位幽灵层（内部按 Δw 与跨格缓存，静止时零开销）
  updateTerrain(mainTerrain, player.w, false);
  updateTerrain(ghostA, player.w, false);
  updateTerrain(ghostB, player.w, false);

  updateDecor(player.w);
  updateResources(player.w, elapsed, gameStarted ? dt : 0);
  updateTethers(player.w, elapsed);

  if (gameStarted) {
    if (!player.dead) updateHarvest(dt, elapsed);
    updateParticles(dt);
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) el.toast.classList.remove('show');
    }
    updateHUD();
  }

  // 阴影贴图隔帧刷新；太阳与玩家移动缓慢，一帧延迟不可见
  if ((shadowTick++ & 1) === 0) renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
}

// ============================================================
// 15. 启动 / 标题幕
// ============================================================
document.getElementById('start-btn').addEventListener('click', () => {
  document.getElementById('title').classList.add('gone');
  el.hud.classList.remove('hidden');
  gameStarted = true;
});
document.getElementById('hint-toggle').addEventListener('click', () => {
  document.getElementById('hint-panel').classList.toggle('collapsed');
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 初始落地
player.y = terrainHeight(0, 0, 0) + 0.2;
updateTerrain(mainTerrain, player.w, true);
updateTerrain(ghostA, player.w, true);
updateTerrain(ghostB, player.w, true);
animate();

// 调试句柄（不影响玩法，便于自动化验证）
window.__astra = { player, resources, tethers, inventory, placeTether, terrainHeight, camState };

})();
