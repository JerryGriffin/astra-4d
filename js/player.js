/* ============================================================
   ASTRA·4D — 4. player：宇航员 / 相机 / 地形工具 / 采集 / 系绳 / 载具
   ============================================================ */
(function (A) {
'use strict';
const M = A.M;

const W_LIMIT = 6.5;

const player = {
  x: 0, y: 4, z: 0, w: 0, wVel: 0,
  vy: 0, grounded: true, facing: 0,
  oxygen: 100, oxygenMax: 100, health: 100,
  inv: {}, bytes: 0, unlocked: [],
  soil: 6, soilMax: 12,
  tethers: [],
  toolMode: 'dig',
  digging: false, harvesting: false,
  dead: false, deadTimer: 0,
  mount: null,
  inNetwork: false,
  walkPhase: 0,
  moving: false,
  sprinting: false
};

const INK = {
  suit: new THREE.MeshPhongMaterial({ shininess: 4, color: 0xf3efe4, flatShading: true }),
  suit2: new THREE.MeshPhongMaterial({ shininess: 4, color: 0xd6d0c1, flatShading: true }),
  visor: new THREE.MeshPhongMaterial({ color: 0x2c3a52, flatShading: true, shininess: 90, emissive: 0x1a2436 }),
  accent: new THREE.MeshPhongMaterial({ shininess: 4, color: 0xe8853c, flatShading: true }),
  glow: new THREE.MeshPhongMaterial({ shininess: 4, color: 0x9be8ff, emissive: 0x9be8ff, flatShading: true })
};

let astronaut = null, scene = null;
const cam = { theta: 0.65, phi: 1.02, dist: 9.6, minPhi: 0.28, maxPhi: 1.45, minDist: 4.2, maxDist: 17, pos: new THREE.Vector3(0, 8, 14), look: new THREE.Vector3() };
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _move = new THREE.Vector3();
const _jumpCol = new THREE.Color(0xd9c2a2);

function buildAstronaut() {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(A.roundedBox(0.74, 0.88, 0.56, 0.2), INK.suit);
  torso.position.y = 1.02;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.37, 12, 10), INK.suit);
  helmet.position.y = 1.72;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.24, Math.PI * 0.5), INK.visor);
  visor.position.set(0, 1.74, 0.12);
  visor.rotation.y = Math.PI / 2;
  const pack = new THREE.Mesh(A.roundedBox(0.58, 0.66, 0.32, 0.12), INK.suit2);
  pack.position.set(0, 1.12, -0.42);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), INK.glow);
  tank.position.set(-0.2, 1.2, -0.56);
  const tank2 = tank.clone(); tank2.position.x = 0.2;
  const packTop = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), INK.accent);
  packTop.position.set(0.14, 1.46, -0.44);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 5), INK.suit2);
  antenna.position.set(-0.16, 1.62, -0.44);
  const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), INK.glow);
  antTip.position.set(-0.16, 1.9, -0.44);
  const armL = new THREE.Mesh(A.roundedBox(0.2, 0.62, 0.22, 0.09), INK.suit); armL.position.set(-0.52, 1.12, 0);
  const armR = armL.clone(); armR.position.x = 0.52;
  const legL = new THREE.Mesh(A.roundedBox(0.26, 0.66, 0.3, 0.11), INK.suit2); legL.position.set(-0.2, 0.36, 0);
  const legR = legL.clone(); legR.position.x = 0.2;
  for (const m of [torso, helmet, visor, pack, tank, tank2, packTop, antenna, antTip, armL, armR, legL, legR]) {
    m.castShadow = !A.mobile; g.add(m);
  }
  g.userData = { armL, armR, legL, legR, torso, helmet };
  return g;
}

// ---------------- 粒子 ----------------
const PCOUNT = 320;
const pPos = new Float32Array(PCOUNT * 3), pCol = new Float32Array(PCOUNT * 3);
const pLife = new Float32Array(PCOUNT), pVel = new Float32Array(PCOUNT * 3);
let pCursor = 0;
let pGeo, pMat, points;

function initParticles() {
  pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  pMat = new THREE.PointsMaterial({ size: 0.17, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
  points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);
  for (let i = 0; i < PCOUNT; i++) pPos[i * 3 + 1] = -9999;
}

function burst(x, y, z, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const k = pCursor = (pCursor + 1) % PCOUNT;
    pPos[k * 3] = x; pPos[k * 3 + 1] = y; pPos[k * 3 + 2] = z;
    pCol[k * 3] = color.r; pCol[k * 3 + 1] = color.g; pCol[k * 3 + 2] = color.b;
    pLife[k] = 0.7 + Math.random() * 0.5;
    const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
    pVel[k * 3] = Math.cos(a) * Math.cos(e) * speed * (0.5 + Math.random());
    pVel[k * 3 + 1] = Math.sin(e) * speed * (0.5 + Math.random()) + speed * 0.4;
    pVel[k * 3 + 2] = Math.sin(a) * Math.cos(e) * speed * (0.5 + Math.random());
  }
}
A.burst = burst;

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
    if (pLife[k] <= 0) pPos[k * 3 + 1] = -9999;
  }
  if (any) { pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true; }
}

// ---------------- 地形工具 / 采集光束 ----------------
let beam, toolRing;
function initTool() {
  beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.13, 1, 7, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  beam.visible = false;
  scene.add(beam);
  toolRing = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.045, 5, 22),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0, depthWrite: false })
  );
  toolRing.rotation.x = Math.PI / 2;
  scene.add(toolRing);
}

const _up = new THREE.Vector3(0, 1, 0);
function setBeam(from, to, active, color) {
  if (!beam) return;
  if (!active) {
    beam.material.opacity *= 0.8;
    if (beam.material.opacity < 0.02) beam.visible = false;
    return;
  }
  beam.visible = true;
  beam.material.opacity = 0.5 + Math.sin(performance.now() * 0.03) * 0.12;
  if (color) beam.material.color.copy(color);
  _v1.copy(to).sub(from);
  const len = _v1.length() || 0.001;
  beam.scale.set(1, len, 1);
  beam.position.copy(from).addScaledVector(_v1, 0.5);
  beam.quaternion.setFromUnitVectors(_up, _v1.normalize());
}

// ---------------- 库存 ----------------
function count(id) { return player.inv[id] || 0; }
function addItem(id, n) {
  player.inv[id] = (player.inv[id] || 0) + (n || 1);
  if (id === 'canister') { player.soilMax += 12 * (n || 1); }
  A.ui && A.ui.refreshInventory(id);
  return true;
}
function takeItem(id, n) {
  n = n || 1;
  if ((player.inv[id] || 0) < n) return false;
  player.inv[id] -= n;
  if (player.inv[id] <= 0) delete player.inv[id];
  if (id === 'canister') player.soilMax = Math.max(12, player.soilMax - 12 * n);
  A.ui && A.ui.refreshInventory(id);
  return true;
}
function canAfford(cost) {
  for (const k in cost) if (count(k) < cost[k]) return false;
  return true;
}
function pay(cost) { for (const k in cost) takeItem(k, cost[k]); }

// ---------------- 系绳 ----------------
const TETHER_MAX = 80;
const TETHER_GEO = {
  post: new THREE.CylinderGeometry(0.075, 0.12, 1.5, 7),
  ring: new THREE.TorusGeometry(0.19, 0.055, 7, 16),
  bulb: new THREE.SphereGeometry(0.11, 9, 7),
  foot: new THREE.CylinderGeometry(0.26, 0.32, 0.16, 8)
};
const TETHER_MAT = {
  post: new THREE.MeshPhongMaterial({ shininess: 4, color: 0xe8e2d2, flatShading: true }),
  ring: new THREE.MeshPhongMaterial({ shininess: 4, color: 0x8d78d6, emissive: 0x584a9e, flatShading: true }),
  bulb: new THREE.MeshPhongMaterial({ shininess: 4, color: 0x9be8ff, emissive: 0x9be8ff, flatShading: true }),
  foot: new THREE.MeshPhongMaterial({ shininess: 4, color: 0xc9c1ae, flatShading: true })
};
const tetherGroup = new THREE.Group();
let tetherLine = null;

function placeTether() {
  if (count('tether') <= 0) { A.sfx.err(); A.ui.toast('背包里没有系绳桩 · 用背包打印机制造'); return; }
  if (player.tethers.length >= TETHER_MAX) {
    let idx = 0, far = -1;
    for (let i = 0; i < player.tethers.length; i++) {
      const t = player.tethers[i];
      const d = Math.hypot(t.x - player.x, t.z - player.z) + Math.abs(t.w - player.w) * 6;
      if (d > far) { far = d; idx = i; }
    }
    tetherGroup.remove(player.tethers.splice(idx, 1)[0].group);
    A.ui.toast('系绳桩已达上限 · 已回收最远的一根');
  }
  const wPos = player.w;
  const y = A.world.height(player.x, player.z, wPos);
  const g = new THREE.Group();
  const post = new THREE.Mesh(TETHER_GEO.post, TETHER_MAT.post); post.position.y = 0.75;
  const ring = new THREE.Mesh(TETHER_GEO.ring, TETHER_MAT.ring); ring.position.y = 1.28; ring.rotation.x = Math.PI / 2;
  const bulb = new THREE.Mesh(TETHER_GEO.bulb, TETHER_MAT.bulb); bulb.position.y = 1.62;
  const foot = new THREE.Mesh(TETHER_GEO.foot, TETHER_MAT.foot); foot.position.y = 0.08;
  for (const m of [post, ring, bulb, foot]) { m.castShadow = !A.mobile; g.add(m); }
  g.position.set(player.x, y, player.z);
  tetherGroup.add(g);
  player.tethers.push({ x: player.x, z: player.z, w: wPos, group: g, bulb, ring, linked: false });
  takeItem('tether', 1);
  burst(player.x, y + 1.2, player.z, new THREE.Color(0x9be8ff), 22, 1.6);
  rebuildTetherLine();
  A.sfx.blip();
}

function rebuildTetherLine() {
  if (tetherLine) { tetherGroup.remove(tetherLine); tetherLine.geometry.dispose(); tetherLine.material.dispose(); tetherLine = null; }
  if (player.tethers.length < 2) return;
  const pts = [];
  for (let i = 0; i < player.tethers.length - 1; i++) {
    const a = player.tethers[i], b = player.tethers[i + 1];
    if (Math.abs(a.w - b.w) > 2.2) continue;
    if (Math.hypot(a.x - b.x, a.z - b.z) > 26) continue;
    const ya = A.world.height(a.x, a.z, player.w) + 1.45;
    const yb = A.world.height(b.x, b.z, player.w) + 1.45;
    pts.push(new THREE.Vector3(a.x, ya, a.z));
    pts.push(new THREE.Vector3((a.x + b.x) / 2, (ya + yb) / 2 + 0.35, (a.z + b.z) / 2));
    pts.push(new THREE.Vector3(b.x, yb, b.z));
  }
  if (pts.length < 2) return;
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  tetherLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9be8ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  tetherGroup.add(tetherLine);
}

function updateTethers(w, time) {
  for (const t of player.tethers) {
    const adw = Math.abs(w - t.w);
    const vis = 1 - M.smoothstep(adw, 1.6, 3.2);
    t.group.visible = vis > 0.03;
    t.group.scale.setScalar(0.45 + 0.55 * vis);
    t.ring.rotation.z = time * 0.6;
    t.group.position.y = A.world.height(t.x, t.z, w);
  }
  if (tetherLine) tetherLine.position.y = Math.sin(time * 1.8) * 0.03;
}

// ---------------- 相机 ----------------
function updateCamera(dt) {
  const target = player.mount ? player.mount.mesh.position : _v2.set(player.x, player.y + 1.55, player.z);
  const ty = player.mount ? player.mount.mesh.position.y + 1.5 : player.y + 1.55;
  _v3.set(target.x, ty, target.z);
  _v1.set(
    Math.sin(cam.theta) * Math.sin(cam.phi),
    Math.cos(cam.phi),
    Math.cos(cam.theta) * Math.sin(cam.phi)
  ).multiplyScalar(cam.dist);
  const desired = _v2.copy(_v3).add(_v1);
  const gh = A.world.height(desired.x, desired.z, player.w) + 1.5;
  if (desired.y < gh) desired.y = gh;
  cam.pos.lerp(desired, 1 - Math.exp(-dt * 8.5));
  cam.look.lerp(_v3, 1 - Math.exp(-dt * 11));
  A.camera.position.copy(cam.pos);
  A.camera.lookAt(cam.look);
}

// ---------------- 地形工具 ----------------
let toolTarget = new THREE.Vector3();
function updateTool(dt, input) {
  const playing = !player.dead && !player.mount;
  if (!playing) { setBeam(_v1, _v1, false); if (toolRing) toolRing.material.opacity = 0; return; }

  // 目标点：相机朝向在地面上的落点
  const yaw = cam.theta;
  const tx = player.x - Math.sin(yaw) * 3.3;
  const tz = player.z - Math.cos(yaw) * 3.3;
  const gy = A.world.height(tx, tz, player.w);
  toolTarget.set(tx, gy, tz);

  const nearNode = bestNode();
  const canPick = !!(nearNode && Math.abs(player.w - nearNode.wPos) < 0.55);
  const active = !!(input && input.action) && !canPick;
  const aug = A.player.augment || {};
  const radius = (aug.wide ? 3.0 : 2.2);
  const rate = (aug.boost ? 5.2 : 2.6);

  if (active) {
    if (player.toolMode === 'dig') {
      A.world.deform(tx, tz, player.w, radius, -rate * dt);
      player.soil = Math.min(player.soilMax, player.soil + dt * 2.0);
      burst(tx, gy + 0.1, tz, new THREE.Color(0x9a7a58), 1, 1.2);
      if (Math.random() < 0.08) A.sfx.digit();
    } else {
      if (player.soil > 0.05) {
        A.world.deform(tx, tz, player.w, radius, rate * 0.85 * dt);
        player.soil = Math.max(0, player.soil - dt * 2.2);
      } else if (Math.random() < 0.02) A.ui.toast('没有土壤 · 先挖一点');
    }
    player.digging = true;
  } else {
    player.digging = false;
  }

  const hand = _v1.set(
    player.x + Math.sin(player.facing + 0.7) * 0.6,
    player.y + 1.15,
    player.z + Math.cos(player.facing + 0.7) * 0.6
  );
  setBeam(hand, _v2.copy(toolTarget).setY(toolTarget.y + 0.2), active, player.toolMode === 'dig' ? null : new THREE.Color(0xffc98f));

  if (toolRing) {
    const show = active ? 0.55 : (A.ui.hoverBuild ? 0.3 : 0);
    toolRing.material.opacity += (show - toolRing.material.opacity) * 0.2;
    toolRing.visible = toolRing.material.opacity > 0.02;
    toolRing.position.copy(toolTarget).setY(toolTarget.y + 0.15);
    toolRing.scale.setScalar(radius * 0.85);
  }
}

// ---------------- 采集 ----------------
let harvestTarget = null, harvestProgress = 0;

function bestNode() {
  let best = null, bestD = 3.8, fallback = null, fallbackD = 3.8;
  for (const r of A.world.nodes) {
    if (r.harvested || !r.exposed) continue;
    const d = Math.hypot(r.x - player.x, r.z - player.z);
    if (d >= 3.8) continue;
    if (Math.abs(player.w - r.wPos) < 0.55) {
      if (d < bestD) { bestD = d; best = r; }
    } else if (d < fallbackD) { fallbackD = d; fallback = r; }
  }
  return best || fallback;
}

function updateHarvest(dt, input, time) {
  if (player.dead || player.mount) return;
  const near = bestNode();
  const hand = _v1.set(player.x + Math.sin(player.facing + 0.85) * 0.6, player.y + 1.18, player.z + Math.cos(player.facing + 0.85) * 0.6);
  if (!near) {
    A.ui.setPrompt('');
    harvestTarget = null; harvestProgress = 0;
    if (!player.digging) setBeam(hand, hand, false);
    return;
  }
  const aligned = Math.abs(player.w - near.wPos) < 0.55;
  if (!aligned) {
    A.ui.setPrompt('<b>相位未对齐</b> · 滑移 W 到 ' + (near.wPos >= 0 ? '+' : '') + near.wPos.toFixed(2));
    harvestTarget = null; harvestProgress = 0;
    return;
  }
  A.ui.setPrompt('按住 <b>采集</b> 拾取 · ' + A.item(near.type).name);
  if (input && input.action) {
    if (harvestTarget !== near) { harvestTarget = near; harvestProgress = 0; }
    const pos = near.mesh.position;
    setBeam(hand, _v2.copy(pos), true, new THREE.Color(A.item(near.type).color));
    harvestProgress += dt;
    if (Math.random() < 0.4) burst(pos.x, pos.y, pos.z, new THREE.Color(A.item(near.type).color), 1, 0.8);
    if (harvestProgress >= 1.15) {
      addItem(near.type, 1);
      near.harvested = true;
      near.respawn = 30 + Math.random() * 40;
      burst(pos.x, pos.y, pos.z, new THREE.Color(A.item(near.type).color), 26, 2.0);
      A.sfx.harvest();
      harvestTarget = null; harvestProgress = 0;
    }
  } else {
    harvestProgress = Math.max(0, harvestProgress - dt * 2.4);
    if (!player.digging) setBeam(hand, hand, false);
  }
}

// ---------------- 载具 ----------------
function tryMount() {
  const m = A.build.nearest(player.x, player.z, 5.0);
  if (!m) return false;
  if (m.type !== 'rover' && m.type !== 'shuttle') return false;
  player.mount = m;
  m.driving = false;
  cam.dist = 12;
  A.ui.toast(m.type === 'rover' ? '已登上漫游车 · WASD 驾驶，F 下车' : '已登上穿梭机 · 按 F 打开星图');
  A.sfx.ok();
  return true;
}
function dismount() {
  if (!player.mount) return;
  const m = player.mount;
  player.mount = null;
  m.driving = false; m.speed = 0;
  player.x = m.x + Math.sin(m.rot + Math.PI / 2) * 2.6;
  player.z = m.z + Math.cos(m.rot + Math.PI / 2) * 2.6;
  player.y = A.world.height(player.x, player.z, player.w) + 0.2;
  cam.dist = 9.6;
  A.ui.toast('已下车');
}

function driveVehicle(dt, input) {
  const m = player.mount;
  const fwd = input.mz || 0;
  const steer = input.mx || 0;
  const accel = 14;
  const maxSpeed = input.sprint ? 15 : 9;
  m.speed = m.speed || 0;
  m.speed += fwd * accel * dt;
  m.speed *= 1 - Math.min(1, dt * 1.4);
  m.speed = M.clamp(m.speed, -maxSpeed * 0.55, maxSpeed);
  if (Math.abs(m.speed) > 0.05) {
    m.driving = true;
    m.rot += steer * dt * 1.6 * Math.sign(m.speed || 1);
    const nx = m.x + Math.sin(m.rot) * m.speed * dt;
    const nz = m.z + Math.cos(m.rot) * m.speed * dt;
    const gy = A.world.height(nx, nz, player.w);
    if (Math.abs(gy - m.mesh.position.y) < 3.2) { m.x = nx; m.z = nz; }
    m.mesh.rotation.y = m.rot;
    m.mesh.position.x = m.x; m.mesh.position.z = m.z;
    // 车辙尘土
    if (Math.random() < 0.3) burst(m.x, m.mesh.position.y + 0.3, m.z, new THREE.Color(0xc9b28c), 1, 1.2);
  } else m.driving = false;
  player.x = m.x; player.z = m.z;
  player.y = m.mesh.position.y + 0.55;
  cam.theta = M.lerp(cam.theta, m.rot + Math.PI, 1 - Math.exp(-dt * 2.2));
}

// ---------------- 主更新 ----------------
function update(dt, input, time) {
  if (player.dead) {
    player.deadTimer -= dt;
    if (player.deadTimer <= 0) respawn();
    return;
  }

  if (player.mount) {
    driveVehicle(dt, input);
  } else {
    // 相位滑移
    const wIn = (input && input.wUp ? 1 : 0) - (input && input.wDown ? 1 : 0);
    player.wVel += (wIn * 1.35 - player.wVel) * (1 - Math.exp(-dt * 6.5));
    player.w += player.wVel * dt;
    if (player.w > W_LIMIT) { player.w = W_LIMIT; player.wVel = 0; }
    if (player.w < -W_LIMIT) { player.w = -W_LIMIT; player.wVel = 0; }

    _fwd.set(-Math.sin(cam.theta), 0, -Math.cos(cam.theta));
    _right.set(-_fwd.z, 0, _fwd.x);
    _move.set(0, 0, 0);
    const mx = input ? input.mx : 0, mz = input ? input.mz : 0;
    if (mz) _move.addScaledVector(_fwd, mz);
    if (mx) _move.addScaledVector(_right, mx * -1);
    player.sprinting = !!(input && input.sprint);
    const speed = player.sprinting ? 8.6 : 5.2;
    player.moving = _move.lengthSq() > 0.0001;
    if (player.moving) {
      _move.normalize().multiplyScalar(speed * dt);
      player.x += _move.x; player.z += _move.z;
      const targetFacing = Math.atan2(_move.x, _move.z);
      let d = targetFacing - player.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      player.facing += d * (1 - Math.exp(-dt * 12));
    }

    const gh = A.world.height(player.x, player.z, player.w);
    if (player.grounded && input && input.jump) {
      player.vy = 7.4 / Math.sqrt(A.world.planet.grav);
      player.grounded = false;
      burst(player.x, player.y + 0.1, player.z, _jumpCol, 8, 1.1);
      A.sfx.blip();
    }
    player.vy -= 21 * A.world.planet.grav * dt;
    player.y += player.vy * dt;
    if (player.y <= gh) { player.y = gh; player.vy = 0; player.grounded = true; }
    else player.grounded = false;
  }

  // 氧气
  player.inNetwork = A.build.oxygenAt(player.x, player.z, player.w);
  if (player.inNetwork) player.oxygen = Math.min(player.oxygenMax, player.oxygen + 16 * dt);
  else player.oxygen = Math.max(0, player.oxygen - 2.1 * dt);
  if (player.oxygen <= 0) {
    player.health = Math.max(0, player.health - 9 * dt);
    if (player.health <= 0) die();
  } else if (player.health < 100 && player.inNetwork) {
    player.health = Math.min(100, player.health + 2.4 * dt);
  }

  // 宇航员
  if (!player.mount) {
    astronaut.visible = true;
    astronaut.position.set(player.x, player.y, player.z);
    astronaut.rotation.y = player.facing;
    const ud = astronaut.userData;
    const sf = player.moving ? (player.sprinting ? 1.5 : 1) : 0;
    player.walkPhase += dt * 9 * (0.4 + sf);
    const t = player.walkPhase;
    ud.legL.rotation.x = Math.sin(t) * 0.6 * sf;
    ud.legR.rotation.x = -Math.sin(t) * 0.6 * sf;
    ud.armL.rotation.x = -Math.sin(t) * 0.5 * sf;
    ud.armR.rotation.x = Math.sin(t) * 0.5 * sf;
    if (player.digging) { ud.armR.rotation.x = -1.1 + Math.sin(t * 3) * 0.2; ud.armL.rotation.x = -0.9; }
    if (!player.grounded) { ud.legL.rotation.x = -0.4; ud.legR.rotation.x = -0.6; ud.armL.rotation.x = -0.7; ud.armR.rotation.x = -0.7; }
  } else {
    astronaut.visible = false;
  }

  updateTool(dt, input);
  updateHarvest(dt, input, time);
  updateTethers(player.w, time);
  updateParticles(dt);
}

function die() {
  player.dead = true;
  player.deadTimer = 2.6;
  player.digging = false; player.harvesting = false;
  player.mount = null;
  A.ui.showDeath();
}
function respawn() {
  let best = null, bestD = Infinity;
  for (const t of player.tethers) {
    const d = Math.hypot(t.x - player.x, t.z - player.z) + Math.abs(t.w - player.w) * 6;
    if (d < bestD) { bestD = d; best = t; }
  }
  const hab = A.build.habitat;
  if (!best && hab) { player.x = hab.x + 3.4; player.z = hab.z + 3.4; player.w = 0; }
  else if (best) { player.x = best.x; player.z = best.z; player.w = best.w; }
  else { player.x = 3; player.z = 3; player.w = 0; }
  player.y = A.world.height(player.x, player.z, player.w) + 0.6;
  player.oxygen = player.oxygenMax;
  player.health = 60;
  player.vy = 0; player.dead = false;
  A.ui.hideDeath();
  burst(player.x, player.y + 1, player.z, new THREE.Color(0x9be8ff), 36, 2.4);
}

function serialize() {
  return {
    x: +player.x.toFixed(2), z: +player.z.toFixed(2), y: +player.y.toFixed(2), w: +player.w.toFixed(3),
    o2: Math.round(player.oxygen), hp: Math.round(player.health),
    inv: player.inv, bytes: player.bytes, unlocked: player.unlocked,
    soil: player.soil, soilMax: player.soilMax,
    tethers: player.tethers.map((t) => ({ x: +t.x.toFixed(2), z: +t.z.toFixed(2), w: +t.w.toFixed(3) }))
  };
}

function loadState(s) {
  player.x = s.x; player.z = s.z; player.y = s.y; player.w = s.w || 0;
  player.oxygen = s.o2; player.health = s.hp;
  player.inv = s.inv || {};
  player.bytes = s.bytes || 0;
  player.unlocked = s.unlocked || [];
  player.soil = s.soil || 0;
  player.soilMax = s.soilMax || 12;
  for (const t of player.tethers) tetherGroup.remove(t.group);
  player.tethers.length = 0;
  for (const t of s.tethers || []) {
    const y = A.world.height(t.x, t.z, t.w);
    const g = new THREE.Group();
    const post = new THREE.Mesh(TETHER_GEO.post, TETHER_MAT.post); post.position.y = 0.75;
    const ring = new THREE.Mesh(TETHER_GEO.ring, TETHER_MAT.ring); ring.position.y = 1.28; ring.rotation.x = Math.PI / 2;
    const bulb = new THREE.Mesh(TETHER_GEO.bulb, TETHER_MAT.bulb); bulb.position.y = 1.62;
    const foot = new THREE.Mesh(TETHER_GEO.foot, TETHER_MAT.foot); foot.position.y = 0.08;
    for (const m of [post, ring, bulb, foot]) g.add(m);
    g.position.set(t.x, y, t.z);
    tetherGroup.add(g);
    player.tethers.push({ x: t.x, z: t.z, w: t.w, group: g, bulb, ring, linked: false });
  }
  rebuildTetherLine();
  player.y = A.world.height(player.x, player.z, player.w) + 0.4;
}

function setTethers(list) {
  for (const t of player.tethers) tetherGroup.remove(t.group);
  player.tethers.length = 0;
  for (const t of list || []) {
    const y = A.world.height(t.x, t.z, t.w);
    const g = new THREE.Group();
    const post = new THREE.Mesh(TETHER_GEO.post, TETHER_MAT.post); post.position.y = 0.75;
    const ring = new THREE.Mesh(TETHER_GEO.ring, TETHER_MAT.ring); ring.position.y = 1.28; ring.rotation.x = Math.PI / 2;
    const bulb = new THREE.Mesh(TETHER_GEO.bulb, TETHER_MAT.bulb); bulb.position.y = 1.62;
    const foot = new THREE.Mesh(TETHER_GEO.foot, TETHER_MAT.foot); foot.position.y = 0.08;
    for (const m of [post, ring, bulb, foot]) g.add(m);
    g.position.set(t.x, y, t.z);
    tetherGroup.add(g);
    player.tethers.push({ x: t.x, z: t.z, w: t.w, group: g, bulb, ring, linked: false });
  }
  rebuildTetherLine();
}

Object.defineProperties(player, {
  toolTarget: { get: () => toolTarget },
  harvestProgress: { get: () => harvestProgress }
});

A.player = Object.assign(player, {
  cam, buildAstronaut, update, updateCamera, placeTether, tryMount, dismount, setTethers,
  addItem, takeItem, count, canAfford, pay, serialize, loadState, die, respawn,
  bestNode,
  init(s) {
    scene = s;
    astronaut = buildAstronaut();
    scene.add(astronaut);
    scene.add(tetherGroup);
    initParticles();
    initTool();
  },
});

})(window.A);
