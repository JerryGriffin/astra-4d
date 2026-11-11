/* ============================================================
   ASTRA·4D — 6. main：渲染器 / 天空 / 输入 / 放置 / 星图 / 存档 / 主循环
   ============================================================ */
(function (A) {
'use strict';
const M = A.M;
const $ = (id) => document.getElementById(id);

// ---------------- 渲染器 / 场景 ----------------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !A.mobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, A.mobile ? 1.6 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !A.mobile;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf2d6a4, 64, 108);
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 900);
A.scene = scene; A.camera = camera; A.renderer = renderer;

// ---------------- 天空 ----------------
const skyU = {
  topColor: { value: new THREE.Color(0x5f9fd8) },
  horColor: { value: new THREE.Color(0xf6dfb0) },
  sunColor: { value: new THREE.Color(0xfff3dc) },
  sunDir: { value: new THREE.Vector3(0.45, 0.62, 0.32).normalize() },
  night: { value: 0 }
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(430, 28, 16),
  new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `
      uniform vec3 topColor; uniform vec3 horColor; uniform vec3 sunColor; uniform vec3 sunDir; uniform float night;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float t = clamp(d.y * 1.35 + 0.16, 0.0, 1.0);
        vec3 col = mix(horColor, topColor, pow(t, 0.72));
        float ds = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * (pow(ds, 260.0) * 1.2 + pow(ds, 8.0) * 0.20) * (1.0 - night * 0.7);
        gl_FragColor = vec4(col, 1.0);
      }`
  })
);
sky.frustumCulled = false;
scene.add(sky);

let stars;
{
  const pos = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2, y = Math.random() * 2 - 1, r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * r * 390, Math.abs(y) * 350 + 8, Math.sin(a) * r * 390], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff6e8, size: 1.7, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  stars.frustumCulled = false;
  scene.add(stars);
}

// ---------------- 光照 ----------------
const hemi = new THREE.HemisphereLight(0xcfe0f4, 0xd9a76c, 0.92);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2dd, 1.15);
sun.position.set(38, 52, 26);
sun.castShadow = !A.mobile;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 2; sun.shadow.camera.far = 190;
const SC = 52;
sun.shadow.camera.left = -SC; sun.shadow.camera.right = SC;
sun.shadow.camera.top = SC; sun.shadow.camera.bottom = -SC;
sun.shadow.bias = -0.0007;
scene.add(sun); scene.add(sun.target);

// ---------------- 云 ----------------
const cloudGroup = new THREE.Group();
{
  const mat = new THREE.MeshPhongMaterial({ shininess: 4, color: 0xfdf6ea, transparent: true, opacity: 0.9, flatShading: true });
  for (let i = 0; i < (A.mobile ? 7 : 12); i++) {
    const cluster = new THREE.Group();
    const n = 3 + Math.floor(Math.random() * 3);
    for (let j = 0; j < n; j++) {
      const s = 4 + Math.random() * 7;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), mat);
      m.position.set((Math.random() - 0.5) * s * 2.4, (Math.random() - 0.5) * s * 0.5, (Math.random() - 0.5) * s * 2.4);
      m.scale.y = 0.42;
      cluster.add(m);
    }
    const ang = Math.random() * Math.PI * 2, rad = 42 + Math.random() * 130;
    cluster.position.set(Math.cos(ang) * rad, 34 + Math.random() * 24, Math.sin(ang) * rad);
    cluster.userData.speed = 0.22 + Math.random() * 0.35;
    cloudGroup.add(cluster);
  }
  scene.add(cloudGroup);
}

// ---------------- 沙尘暴粒子 ----------------
let stormPoints, stormPos;
{
  const N = A.mobile ? 260 : 520;
  stormPos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    stormPos[i * 3] = (Math.random() - 0.5) * 70;
    stormPos[i * 3 + 1] = Math.random() * 22;
    stormPos[i * 3 + 2] = (Math.random() - 0.5) * 70;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(stormPos, 3));
  stormPoints = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xd9c4a0, size: 0.34, transparent: true, opacity: 0, depthWrite: false }));
  stormPoints.frustumCulled = false;
  scene.add(stormPoints);
}

// ---------------- 环境（昼夜 / 风） ----------------
A.env = { sun: 0.8, wind: 0.6, day: 0, storm: 0 };
let dayTime = 0.18;
const PAL_CACHE = {};
function applyPlanetLook() {
  const P = A.world.planet;
  PAL_CACHE.top = new THREE.Color(P.pal.skyTop);
  PAL_CACHE.hor = new THREE.Color(P.pal.skyHor);
  PAL_CACHE.sun = new THREE.Color(P.pal.sun);
  PAL_CACHE.fog = new THREE.Color(P.pal.fog);
  hemi.color.setHex(P.pal.skyHor);
  hemi.groundColor.setHex(P.pal.rock);
  skyU.topColor.value.copy(PAL_CACHE.top);
  skyU.horColor.value.copy(PAL_CACHE.hor);
  skyU.sunColor.value.copy(PAL_CACHE.sun);
  scene.fog.color.copy(PAL_CACHE.fog);
  scene.fog.near = P.fog[0]; scene.fog.far = P.fog[1];
  stormPoints.material.color.setHex(P.pal.rock);
  A.ui.setPlanetChip();
}

function updateEnv(dt, t) {
  dayTime = (dayTime + dt / 520) % 1;
  const s = Math.sin(dayTime * Math.PI * 2);
  const day = M.clamp(s * 0.75 + 0.55, 0, 1);
  const dusk = 1 - M.clamp(Math.abs(s) * 2.2, 0, 1);
  A.env.day = day;
  A.env.sun = day;
  const windNoise = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.13) * Math.cos(t * 0.07 + 1.7));
  A.env.wind = M.clamp(windNoise, 0.15, 1);
  A.env.storm = A.world.storm.intensity || 0;

  const night = 1 - day;
  skyU.night.value = night;
  const top = PAL_CACHE.top.clone().multiplyScalar(0.35 + 0.65 * day);
  const hor = PAL_CACHE.hor.clone().lerp(PAL_CACHE.sun, dusk * 0.4).multiplyScalar(0.45 + 0.55 * day);
  skyU.topColor.value.copy(top);
  skyU.horColor.value.copy(hor);
  stars.material.opacity = night * 0.9;
  hemi.intensity = 0.30 + 0.62 * day;
  sun.intensity = 0.16 + 1.0 * day;
  scene.fog.color.copy(PAL_CACHE.fog).multiplyScalar(0.35 + 0.65 * day);

  const sa = dayTime * Math.PI * 2 + 0.7;
  const sd = new THREE.Vector3(Math.cos(sa) * 0.75, 0.42 + Math.sin(sa * 0.5) * 0.28, Math.sin(sa) * 0.75).normalize();
  skyU.sunDir.value.copy(sd);
  sun.position.set(A.player.x + sd.x * 80, A.player.y + sd.y * 80, A.player.z + sd.z * 80);
  sun.target.position.set(A.player.x, A.player.y, A.player.z);

  for (const c of cloudGroup.children) {
    c.position.x += c.userData.speed * dt * (0.6 + A.env.wind);
    if (c.position.x > 320) c.position.x = -320;
  }
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
}

// ---------------- 输入 ----------------
const keys = {};
const input = { mx: 0, mz: 0, sprint: false, jump: false, action: false, wUp: false, wDown: false };
A.input = input;
let joyVec = { x: 0, y: 0 };

function readKeys() {
  const kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const kz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  input.mx = joyVec.x || kx;
  input.mz = joyVec.y || kz;
  input.sprint = !!(keys.ShiftLeft || keys.ShiftRight);
  input.jump = !!keys.Space;
  input.wUp = !!keys.KeyE;
  input.wDown = !!keys.KeyQ;
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === 'Escape') { A.place.cancel(); A.ui.closePanels(); return; }
  if (e.code === 'KeyB') A.ui.togglePanel('backpack');
  if (e.code === 'KeyC') A.ui.togglePanel('build');
  if (e.code === 'KeyV') A.ui.togglePanel('research');
  if (e.code === 'KeyH') A.ui.togglePanel('help');
  if (e.code === 'KeyG' && gameStarted) A.cycleView();
  if (e.code === 'KeyR') { A.ui.setToolMode(A.player.toolMode === 'dig' ? 'fill' : 'dig'); A.sfx.blip(); }
  if (e.code === 'KeyT' && gameStarted && !A.player.dead) A.player.placeTether();
  if (e.code === 'KeyF' && gameStarted) interact();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

function interact() {
  if (A.player.mount) {
    if (A.player.mount.type === 'shuttle') { A.ui.openPanel('travel'); return; }
    A.player.dismount(); return;
  }
  const m = A.build.nearest(A.player.x, A.player.z, 5.0);
  if (!m) return;
  if (m.type === 'rover' || m.type === 'shuttle') { A.player.mount = m; m.driving = false; A.player.cam.dist = 12; A.sfx.ok(); A.ui.toast(m.type === 'rover' ? '已登上漫游车 · WASD 驾驶，F 下车' : '穿梭机 · 按 F 打开星图'); return; }
  A.ui.openPanel('module', m);
}

// ---------------- 相机手势 ----------------
const pointers = new Map();
let dragging = false, lastX = 0, lastY = 0, pinchStart = 0, pinchDist = 0, moved = 0;

canvas.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
    pinchDist = A.player.cam.dist;
    dragging = false;
    return;
  }
  if (A.place.active) { A.place.tryPlace(); return; }
  dragging = true; moved = 0;
  lastX = e.clientX; lastY = e.clientY;
  input.action = true;
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchStart > 0) {
      A.player.cam.dist = M.clamp(pinchDist * (pinchStart / Math.max(d, 1)), A.player.cam.minDist, A.player.cam.maxDist);
    }
    return;
  }
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  moved += Math.abs(dx) + Math.abs(dy);
  A.player.cam.theta -= dx * (A.mobile ? 0.0075 : 0.0052);
  A.player.cam.phi = M.clamp(A.player.cam.phi - dy * 0.0042, A.player.cam.minPhi, A.player.cam.maxPhi);
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStart = 0;
  if (pointers.size === 0) {
    dragging = false;
    input.action = false;
    canvas.classList.remove('dragging');
  }
}
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const c = A.player.cam;
  c.dist = M.clamp(c.dist + e.deltaY * 0.012, c.minDist, c.maxDist);
}, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------- 移动端控件 ----------------
function initTouch() {
  if (!A.touch && !A.mobile) return;
  document.body.classList.add('touch');
  const joy = $('joy'), knob = $('joy-knob');
  let jid = null, cx = 0, cy = 0, R = 46;
  const start = (e) => {
    const r = joy.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2; R = r.width * 0.42;
    jid = e.pointerId; joy.setPointerCapture(e.pointerId);
    move(e);
  };
  const move = (e) => {
    if (jid !== e.pointerId) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / R);
    dx = dx / d * k; dy = dy / d * k;
    joyVec.x = dx; joyVec.y = -dy;
    knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
  };
  const end = (e) => {
    if (jid !== e.pointerId) return;
    jid = null; joyVec.x = 0; joyVec.y = 0;
    knob.style.transform = 'translate(0,0)';
  };
  joy.addEventListener('pointerdown', start);
  joy.addEventListener('pointermove', move);
  joy.addEventListener('pointerup', end);
  joy.addEventListener('pointercancel', end);

  const holdBtn = (id, on, off) => {
    const b = $(id);
    if (!b) return;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('on'); on(); });
    b.addEventListener('pointerup', (e) => { e.preventDefault(); b.classList.remove('on'); off && off(); });
    b.addEventListener('pointercancel', () => { b.classList.remove('on'); off && off(); });
    b.addEventListener('pointerleave', () => { b.classList.remove('on'); off && off(); });
  };
  holdBtn('btn-action', () => { input.action = true; }, () => { input.action = false; });
  holdBtn('btn-jump', () => { input.jump = true; }, () => { input.jump = false; });
  holdBtn('btn-wup', () => { input.wUp = true; }, () => { input.wUp = false; });
  holdBtn('btn-wdown', () => { input.wDown = true; }, () => { input.wDown = false; });
  $('btn-tether').addEventListener('click', () => A.player.placeTether());
  $('btn-interact').addEventListener('click', () => interact());
  $('btn-mode').addEventListener('click', () => {
    A.ui.setToolMode(A.player.toolMode === 'dig' ? 'fill' : 'dig');
    A.sfx.blip();
  });
}

// 移动端：按住方向键一样的 w 滑移按钮
function syncMobilePhase() {
  if (!A.touch) return;
  const up = $('btn-wup'), dn = $('btn-wdown');
  if (up) up.classList.toggle('on', input.wUp);
  if (dn) dn.classList.toggle('on', input.wDown);
}

// ---------------- 放置 ----------------
let ghost = null, ghostType = null, ghostValid = false;
A.place = {
  active: false,
  start(id) {
    this.cancel();
    const r = A.RECIPES[id];
    if (!r) return;
    const made = A.build.meshFor(id);
    ghost = made.group;
    ghost.traverse((o) => {
      if (o.material) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.6;
        o.material.depthWrite = false;
      }
    });
    ghostType = id;
    scene.add(ghost);
    this.active = true;
    A.ui.hoverBuild = true;
    A.ui.toast('放置 ' + r.name + ' · 点地面确认，Esc 取消');
  },
  cancel() {
    if (ghost) { scene.remove(ghost); ghost = null; }
    ghostType = null; this.active = false; A.ui.hoverBuild = false;
  },
  update() {
    if (!this.active || !ghost) return;
    const tx = A.player.x - Math.sin(A.player.cam.theta) * 4.6;
    const tz = A.player.z - Math.cos(A.player.cam.theta) * 4.6;
    const ty = A.world.height(tx, tz, A.player.w);
    ghost.position.set(tx, ty, tz);
    ghost.rotation.y = A.player.facing;
    ghostType && (ghost.userData.x = tx);
    // 碰撞检查：和别的模块靠太近就不许放
    const near = A.build.nearest(tx, tz, 2.5);
    ghostValid = !near;
    const tint = ghostValid ? 0x8fe0b0 : 0xd9624a;
    ghost.traverse((o) => { if (o.material && o.material.emissive) o.material.emissive.setHex(tint).multiplyScalar(0.12); });
  },
  tryPlace() {
    if (!this.active || !ghostType) return;
    if (!ghostValid) { A.sfx.err(); A.ui.toast('这里放不下 · 换个位置'); return; }
    const id = ghostType;
    const r = A.RECIPES[id];
    if (!A.player.canAfford(r.cost)) { A.sfx.err(); A.ui.toast('材料不够'); return; }
    A.player.pay(r.cost);
    const pos = ghost.position.clone();
    this.cancel();
    const mod = A.build.add(id, pos.x, pos.z, A.player.facing);
    A.build.netDirty = true;
    A.sfx.ok();
    A.ui.toast(r.name + ' 已部署');
    A.burst(pos.x, pos.y + 1, pos.z, new THREE.Color(0x9be8ff), 24, 1.8);
  }
};

// ---------------- 存档 ----------------
const SAVE_KEY = 'astra4d.save.v2';
let save = { v: 2, seed: 1, pi: 0, dayTime: 0.18, view: 'xyz', player: null, planets: {} };
A.save = save;

function planetState(pid) {
  if (!save.planets[pid]) save.planets[pid] = { edits: [], modules: [], tethers: [], x: 0, z: 0 };
  return save.planets[pid];
}
function capturePlanet() {
  const p = A.world.planet;
  const st = planetState(p.id);
  st.edits = A.world.serializeEdits();
  st.modules = A.build.serialize();
  st.tethers = A.player.tethers.map((t) => ({ x: +t.x.toFixed(2), z: +t.z.toFixed(2), w: +t.w.toFixed(3) }));
  st.x = +A.player.x.toFixed(2);
  st.z = +A.player.z.toFixed(2);
  save.player = A.player.serialize();
}
function writeSave(silent) {
  try {
    capturePlanet();
    save.pi = A.world.state.pi;
    save.dayTime = dayTime;
    save.view = A.view.id;
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    if (!silent) A.ui.toast('已保存');
    return true;
  } catch (e) { return false; }
}
A.writeSave = writeSave;

function bootPlanet(pi, edits, spawnAt) {
  const seed = save.seed + pi * 7919;
  A.world.setPlanet(pi, seed, edits);
  applyPlanetLook();
  if (spawnAt) { A.player.x = spawnAt.x; A.player.z = spawnAt.z; }
  else {
    const hab = A.build.habitat;
    A.player.x = hab ? hab.x + 4.5 : 4.5;
    A.player.z = hab ? hab.z + 4.5 : 4.5;
  }
  A.player.w = 0;
  A.player.y = A.world.height(A.player.x, A.player.z, 0) + 0.6;
  A.player.vy = 0;
  A.world.update(A.player.w, A.player.x, A.player.z, false);
  writeSave(true);
}

A.travel = function (pi) {
  if (pi === A.world.state.pi) return;
  capturePlanet();
  const fade = $('fx-fade');
  fade.classList.add('show');
  A.sfx.blip();
  setTimeout(() => {
    const st = planetState(A.PLANETS[pi].id);
    A.build.load(st.modules);
    A.world.setPlanet(pi, save.seed + pi * 7919, st.edits);
    applyPlanetLook();
    A.player.x = st.x || 4.5;
    A.player.z = st.z || 4.5;
    A.player.w = 0;
    A.player.y = A.world.height(A.player.x, A.player.z, 0) + 0.6;
    A.player.mount = null;
    A.player.setTethers(st.tethers || []);
    A.player.oxygen = A.player.oxygenMax;
    A.world.update(A.player.w, A.player.x, A.player.z, false);
    setTimeout(() => fade.classList.remove('show'), 160);
    A.ui.toast('降落 · ' + A.PLANETS[pi].name);
    writeSave(true);
  }, 420);
};

// ---------------- 空间视图 ----------------
A.setView = function (id, silent) {
  const v = A.parseView(id);
  A.view = v;
  A.world.rebuild();
  A.player.y = A.world.height(A.player.x, A.player.z, A.player.w) + 1.1;
  A.player.vy = 0;
  A.player.grounded = false;
  save.view = v.id;
  A.ui.setViewLabel();
  if (!silent) {
    A.sfx.ok();
    A.ui.toast('空间视图 ' + v.id.toUpperCase() + ' · 现在滑移 ' + v.phase.toUpperCase() + ' 轴');
    A.burst(A.player.x, A.player.y + 1, A.player.z, new THREE.Color(0x8d78d6), 34, 3.4);
  }
  if (gameStarted) writeSave(true);
};
A.cycleView = function () {
  const i = A.VIEW_IDS.indexOf(A.view.id);
  A.setView(A.VIEW_IDS[(i + 1) % A.VIEW_IDS.length]);
};

// ---------------- 新游戏 / 继续 ----------------
let gameStarted = false;
function startNew() {
  save = { v: 2, seed: Math.floor(Math.random() * 900000) + 1000, pi: 0, dayTime: 0.18, player: null, planets: {} };
  A.save = save;
  A.build.load([]);
  bootPlanet(0, [], { x: 5.5, z: 5.5 });
  A.player.inv = { compound: 3, resin: 3, organic: 2 };
  A.player.bytes = 0;
  A.player.unlocked = [];
  A.player.soil = 8;
  A.player.soilMax = 12;
  A.player.oxygen = 100;
  A.player.oxygenMax = 100;
  A.player.health = 100;
  A.setView('xyz', true);
  begin();
}
function continueGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { startNew(); return; }
    const s = JSON.parse(raw);
    save = Object.assign({ v: 2, planets: {} }, s);
    A.save = save;
    const pi = save.pi || 0;
    const st = planetState(A.PLANETS[pi].id);
    A.build.load(st.modules || []);
    A.world.setPlanet(pi, save.seed + pi * 7919, st.edits || []);
    applyPlanetLook();
    if (save.player) A.player.loadState(save.player);
    else bootPlanet(pi, st.edits || []);
    dayTime = save.dayTime || 0.18;
    A.setView(save.view || 'xyz', true);
    A.world.update(A.player.w, A.player.x, A.player.z, false);
    begin();
  } catch (e) { startNew(); }
}
function begin() {
  $('title').classList.add('gone');
  $('hud').classList.remove('hidden');
  gameStarted = true;
  A.ui.setToolMode('dig');
  A.ui.refreshHUD();
  A.sfx.ok();
}

// ---------------- 主循环 ----------------
const clock = new THREE.Clock();
let elapsed = 0, shadowTick = 0, saveTick = 0;

function animate() {
  requestAnimationFrame(animate);
  const rawDt = Math.min(clock.getDelta(), 0.25);
  const dt = Math.min(rawDt, 0.05);
  elapsed += dt;
  readKeys();
  syncMobilePhase();

  if (gameStarted) {
    A.player.update(dt, input, elapsed);
    A.place.update();
  }
  A.player.updateCamera(dt);
  updateEnv(dt, elapsed);

  A.world.update(A.player.w, A.player.x, A.player.z, A.world.state.dirty);
  A.world.state.dirty = false;

  const shelter = A.build.habitat ? Math.hypot(A.build.habitat.x - A.player.x, A.build.habitat.z - A.player.z) < 10 : false;
  const si = A.world.updateStorm(dt, shelter);
  stormPoints.material.opacity = si * 0.55;
  document.body.style.setProperty('--storm', si.toFixed(2));
  if (si > 0.02) {
    for (let i = 0; i < stormPos.length; i += 3) {
      stormPos[i] += dt * (26 + si * 22);
      stormPos[i + 1] += Math.sin(elapsed * 3 + i) * dt * 1.2;
      if (stormPos[i] > 35) { stormPos[i] = -35; stormPos[i + 1] = Math.random() * 22; stormPos[i + 2] = (Math.random() - 0.5) * 70; }
    }
    stormPoints.geometry.attributes.position.needsUpdate = true;
    stormPoints.position.set(A.player.x, A.player.y - 4, A.player.z);
  }

  if (gameStarted) {
    A.build.update(dt, A.player.w, A.player.x, A.player.z, A.env.wind);
    A.world.updateNodes(A.player.w, elapsed, dt, A.player.x, A.player.z);
    A.world.updateSamples(A.player.w, elapsed, dt, A.player.x, A.player.z);
    A.ui.update(dt);

    saveTick += dt;
    if (saveTick > 20) { saveTick = 0; writeSave(true); }
  }

  if ((shadowTick++ & 1) === 0) renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
}

// ---------------- 启动 ----------------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  document.documentElement.style.setProperty('--vh', h * 0.01 + 'px');
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 240));
document.addEventListener('visibilitychange', () => { if (document.hidden && gameStarted) writeSave(true); });

A.world.init(scene);
A.build.init(scene);
A.player.init(scene);
A.ui.init();
A.world.setPlanet(0, 1337, []);
A.build.load([]);
applyPlanetLook();
A.player.x = 5.5; A.player.z = 5.5;
A.player.y = A.world.height(5.5, 5.5, 0) + 0.6;
A.setView(save.view || 'xyz', true);
A.world.update(0, 5.5, 5.5, false);
initTouch();
resize();
animate();

$('start-btn').addEventListener('click', startNew);
$('continue-btn').addEventListener('click', continueGame);
const hasSave = !!localStorage.getItem(SAVE_KEY);
$('continue-btn').classList.toggle('hidden', !hasSave);

window.__astra = {
  A, player: A.player, world: A.world, build: A.build, input,
  start: () => { startNew(); }, continue: () => continueGame(),
  travel: (i) => A.travel(i), place: (id) => A.place.start(id),
  get started() { return gameStarted; }
};

})(window.A);
