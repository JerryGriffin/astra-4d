/* ============================================================
   ASTRA·4D — 3. build：基地模块 / 电网 / 氧气网络 / 打印与加工
   ============================================================ */
(function (A) {
'use strict';
const M = A.M;

const MAT = {
  cream:  new THREE.MeshPhongMaterial({ shininess: 4, color: 0xf1ece0, flatShading: true }),
  cream2: new THREE.MeshPhongMaterial({ shininess: 4, color: 0xd3ccbd, flatShading: true }),
  orange: new THREE.MeshPhongMaterial({ shininess: 4, color: 0xe8853c, flatShading: true }),
  dark:   new THREE.MeshPhongMaterial({ shininess: 4, color: 0x3b434f, flatShading: true }),
  metal:  new THREE.MeshPhongMaterial({ shininess: 4, color: 0xa7b0b8, flatShading: true }),
  glass:  new THREE.MeshPhongMaterial({ color: 0x9fe0f2, transparent: true, opacity: 0.5, flatShading: true, shininess: 90 }),
  blue:   new THREE.MeshPhongMaterial({ shininess: 4, color: 0x64b8e0, flatShading: true, emissive: 0x123246 }),
  yellow: new THREE.MeshPhongMaterial({ shininess: 4, color: 0xffd166, flatShading: true, emissive: 0x332400 }),
  green:  new THREE.MeshPhongMaterial({ shininess: 4, color: 0x7fd8a8, flatShading: true, emissive: 0x0e2a1e }),
  red:    new THREE.MeshPhongMaterial({ shininess: 4, color: 0xd9624a, flatShading: true }),
  glow:   new THREE.MeshBasicMaterial({ color: 0xffc98f })
};

function box(w, h, d, r) { return A.roundedBox(w, h, d, r === undefined ? Math.min(w, h, d) * 0.22 : r); }
function put(g, geo, mat, x, y, z, rx, ry, rz) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x || 0, y || 0, z || 0);
  if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
  m.castShadow = !A.mobile; m.receiveShadow = true;
  g.add(m); return m;
}

// ---------------- 模块外形 ----------------
function meshFor(type) {
  const g = new THREE.Group();
  const spin = [];
  switch (type) {
    case 'habitat': {
      const base = put(g, new THREE.CylinderGeometry(2.5, 2.7, 0.6, 12), MAT.cream2, 0, 0.3, 0);
      const dome = put(g, new THREE.SphereGeometry(2.35, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.cream, 0, 0.6, 0);
      put(g, new THREE.BoxGeometry(0.95, 1.25, 0.3), MAT.orange, 0, 1.1, 2.15);
      put(g, new THREE.CylinderGeometry(0.42, 0.5, 0.5, 8), MAT.cream2, 0, 2.95, 0);
      put(g, new THREE.CylinderGeometry(0.46, 0.46, 0.1, 8), MAT.orange, 0, 3.22, 0);
      const pane = put(g, new THREE.BoxGeometry(1.5, 0.55, 0.2), MAT.glass, 0, 1.9, 1.85, 0.22, 0, 0);
      put(g, new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), MAT.metal, 1.2, 3.6, -0.6);
      put(g, new THREE.SphereGeometry(0.1, 7, 6), MAT.blue, 1.2, 4.4, -0.6);
      break;
    }
    case 'platform': {
      put(g, box(3.3, 0.3, 3.3, 0.1), MAT.cream, 0, 0.42, 0);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        put(g, new THREE.CylinderGeometry(0.1, 0.14, 0.5, 5), MAT.metal, sx * 1.35, 0.2, sz * 1.35);
        put(g, new THREE.CylinderGeometry(0.11, 0.11, 0.1, 8), MAT.yellow, sx * 1.35, 0.6, sz * 1.35);
      }
      break;
    }
    case 'printer_s': {
      put(g, box(1.7, 0.9, 1.6, 0.14), MAT.cream, 0, 0.75, 0);
      put(g, box(1.3, 0.14, 1.2, 0.05), MAT.dark, 0, 1.22, 0);
      put(g, box(1.3, 0.06, 1.2, 0.03), MAT.orange, 0, 1.3, 0);
      const arm = put(g, box(0.18, 0.9, 0.18, 0.06), MAT.metal, 0.55, 1.7, 0);
      spin.push({ obj: arm, axis: 'x', speed: 0.9 });
      put(g, new THREE.CylinderGeometry(0.16, 0.16, 0.28, 8), MAT.glass, 0.55, 2.15, 0);
      break;
    }
    case 'printer_m': {
      put(g, box(2.5, 1.3, 2.2, 0.2), MAT.cream, 0, 0.95, 0);
      put(g, new THREE.SphereGeometry(1.0, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT.cream2, 0, 1.6, 0);
      put(g, new THREE.TorusGeometry(1.05, 0.1, 6, 16), MAT.orange, 0, 1.62, 0, Math.PI / 2, 0, 0);
      const ring = put(g, new THREE.TorusGeometry(0.55, 0.06, 6, 14), MAT.yellow, 0, 2.3, 0, Math.PI / 2, 0, 0);
      spin.push({ obj: ring, axis: 'y', speed: 1.4 });
      put(g, box(1.1, 0.1, 1.0, 0.03), MAT.dark, 0, 0.36, 1.2);
      break;
    }
    case 'research': {
      put(g, new THREE.CylinderGeometry(1.5, 1.6, 0.9, 10), MAT.cream, 0, 0.75, 0);
      put(g, new THREE.CylinderGeometry(1.25, 1.25, 0.25, 12), MAT.dark, 0, 1.25, 0);
      put(g, new THREE.SphereGeometry(1.05, 14, 10), MAT.glass, 0, 2.0, 0);
      const ring = put(g, new THREE.TorusGeometry(1.3, 0.07, 6, 18), MAT.blue, 0, 2.0, 0, Math.PI / 2, 0, 0);
      spin.push({ obj: ring, axis: 'y', speed: 1.1 });
      put(g, new THREE.SphereGeometry(0.22, 8, 6), MAT.green, 0, 2.0, 0);
      break;
    }
    case 'smelter': {
      put(g, new THREE.CylinderGeometry(1.1, 1.25, 1.5, 10), MAT.cream2, 0, 1.0, 0);
      put(g, new THREE.CylinderGeometry(1.12, 1.12, 0.35, 10), MAT.orange, 0, 1.75, 0);
      put(g, new THREE.CylinderGeometry(0.16, 0.2, 1.2, 6), MAT.metal, 0.55, 2.4, 0);
      const core = put(g, new THREE.CylinderGeometry(0.55, 0.55, 0.1, 12), MAT.glow, 0, 1.42, 0.95, Math.PI / 2, 0, 0);
      spin.push({ obj: core, axis: 'z', speed: 0 });
      put(g, new THREE.TorusGeometry(0.6, 0.06, 5, 12), MAT.dark, 0, 1.42, 0.92);
      break;
    }
    case 'chemistry': {
      put(g, box(2.4, 0.55, 1.9, 0.12), MAT.cream2, 0, 0.5, 0);
      put(g, new THREE.CylinderGeometry(0.5, 0.5, 1.7, 10), MAT.glass, -0.65, 1.5, 0);
      put(g, new THREE.CylinderGeometry(0.5, 0.5, 1.7, 10), MAT.glass, 0.65, 1.5, 0);
      put(g, new THREE.CylinderGeometry(0.55, 0.55, 0.16, 10), MAT.orange, -0.65, 2.4, 0);
      put(g, new THREE.CylinderGeometry(0.55, 0.55, 0.16, 10), MAT.orange, 0.65, 2.4, 0);
      put(g, new THREE.CylinderGeometry(0.09, 0.09, 1.4, 6), MAT.metal, 0, 2.2, 0, 0, 0, Math.PI / 2);
      put(g, new THREE.SphereGeometry(0.3, 8, 6), MAT.green, 0, 1.05, 0.8);
      break;
    }
    case 'condenser': {
      put(g, new THREE.CylinderGeometry(0.95, 1.1, 2.6, 12), MAT.cream, 0, 1.5, 0);
      put(g, new THREE.TorusGeometry(1.0, 0.09, 5, 14), MAT.orange, 0, 2.5, 0, Math.PI / 2, 0, 0);
      for (let i = 0; i < 4; i++) put(g, box(0.1, 1.0, 1.7, 0.03), MAT.metal, 0, 0.9 + i * 0.45, 0);
      const fan = put(g, box(1.5, 0.08, 0.3, 0.03), MAT.metal, 0, 2.85, 0);
      spin.push({ obj: fan, axis: 'y', speed: 3.0 });
      put(g, new THREE.CylinderGeometry(0.12, 0.12, 0.6, 6), MAT.blue, 0, 3.1, 0);
      break;
    }
    case 'centrifuge': {
      put(g, new THREE.CylinderGeometry(1.15, 1.35, 0.7, 12), MAT.cream2, 0, 0.6, 0);
      put(g, new THREE.SphereGeometry(0.95, 14, 10), MAT.cream, 0, 1.5, 0);
      const ring = put(g, new THREE.TorusGeometry(1.1, 0.08, 6, 16), MAT.orange, 0, 1.5, 0, Math.PI / 2, 0, 0);
      spin.push({ obj: ring, axis: 'y', speed: 4.5 });
      put(g, new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8), MAT.dark, 0, 2.4, 0);
      break;
    }
    case 'solar_m': {
      put(g, new THREE.CylinderGeometry(0.16, 0.24, 1.5, 6), MAT.metal, 0, 0.75, 0);
      const p = put(g, box(2.6, 0.12, 1.7, 0.04), MAT.dark, 0, 2.0, 0, -0.42, 0, 0);
      for (let i = 0; i < 3; i++) put(g, box(2.2, 0.06, 0.32, 0.02), MAT.blue, 0, 2.06 - i * 0.02, -0.5 + i * 0.5, -0.42, 0, 0);
      put(g, new THREE.CylinderGeometry(0.5, 0.5, 0.1, 10), MAT.yellow, 0, 1.5, 0);
      break;
    }
    case 'wind_m': {
      put(g, new THREE.CylinderGeometry(0.14, 0.26, 3.4, 6), MAT.cream, 0, 1.7, 0);
      const hub = new THREE.Group(); hub.position.set(0, 3.4, 0.3); g.add(hub);
      put(hub, new THREE.SphereGeometry(0.22, 8, 6), MAT.orange, 0, 0, 0);
      for (let i = 0; i < 3; i++) {
        const b = put(hub, box(0.16, 1.5, 0.06, 0.02), MAT.cream, 0, 0.75, 0, 0, 0, 0);
        b.position.set(0, 0, 0);
        b.geometry.translate(0, 0.75, 0);
        b.rotation.z = (i / 3) * Math.PI * 2;
      }
      spin.push({ obj: hub, axis: 'z', speed: 2.4 });
      break;
    }
    case 'battery_m': {
      put(g, box(1.9, 1.5, 1.5, 0.18), MAT.cream, 0, 1.1, 0);
      for (let i = 0; i < 3; i++) put(g, box(1.5, 0.22, 0.08, 0.03), MAT.green, 0, 0.75 + i * 0.38, 0.76);
      put(g, box(1.9, 0.12, 1.5, 0.04), MAT.orange, 0, 1.9, 0);
      put(g, new THREE.CylinderGeometry(0.1, 0.1, 0.4, 6), MAT.metal, 0.6, 2.05, 0);
      break;
    }
    case 'gen_m': {
      put(g, box(2.0, 1.2, 1.6, 0.16), MAT.cream2, 0, 0.95, 0);
      put(g, new THREE.CylinderGeometry(0.5, 0.5, 1.1, 10), MAT.red, -0.4, 1.7, 0, 0, 0, Math.PI / 2);
      put(g, new THREE.CylinderGeometry(0.14, 0.16, 1.0, 6), MAT.dark, 0.7, 1.9, 0);
      put(g, box(0.5, 0.3, 0.06, 0.03), MAT.yellow, 0, 1.15, 0.82);
      break;
    }
    case 'oxygenator': {
      put(g, box(1.7, 1.1, 1.5, 0.16), MAT.cream, 0, 0.8, 0);
      put(g, new THREE.CylinderGeometry(0.42, 0.42, 1.2, 10), MAT.blue, 0.45, 1.6, 0);
      put(g, new THREE.SphereGeometry(0.42, 10, 8), MAT.blue, 0.45, 2.2, 0);
      const fan = put(g, box(1.0, 0.06, 0.22, 0.02), MAT.metal, -0.45, 1.2, 0.8);
      spin.push({ obj: fan, axis: 'z', speed: 6.0 });
      put(g, box(1.2, 0.14, 1.1, 0.04), MAT.glow, -0.45, 1.0, 0.72);
      break;
    }
    case 'rtg': {
      put(g, new THREE.CylinderGeometry(0.7, 0.85, 1.5, 10), MAT.dark, 0, 0.9, 0);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        put(g, box(0.1, 1.2, 0.5, 0.03), MAT.metal, Math.cos(a) * 0.65, 1.1, Math.sin(a) * 0.65, 0, -a, 0);
      }
      put(g, new THREE.SphereGeometry(0.3, 8, 6), MAT.green, 0, 1.85, 0);
      break;
    }
    case 'rover': {
      put(g, box(2.6, 0.55, 1.7, 0.18), MAT.cream, 0, 0.75, 0);
      put(g, box(1.0, 0.5, 1.4, 0.14), MAT.orange, -0.5, 1.1, 0);
      put(g, box(1.1, 0.4, 0.9, 0.1), MAT.dark, 1.0, 1.1, 0);
      put(g, box(0.9, 0.18, 1.5, 0.06), MAT.cream2, 1.0, 1.32, 0);
      put(g, new THREE.SphereGeometry(0.1, 7, 6), MAT.yellow, 1.55, 0.85, 0.6);
      put(g, new THREE.SphereGeometry(0.1, 7, 6), MAT.yellow, 1.55, 0.85, -0.6);
      const wheels = [];
      for (const [wx, wz] of [[0.95, 0.95], [0.95, -0.95], [-0.95, 0.95], [-0.95, -0.95]]) {
        const w = put(g, new THREE.CylinderGeometry(0.48, 0.48, 0.34, 10), MAT.dark, wx, 0.5, wz, Math.PI / 2, 0, 0);
        put(g, new THREE.CylinderGeometry(0.2, 0.2, 0.38, 8), MAT.metal, wx, 0.5, wz, Math.PI / 2, 0, 0);
        wheels.push(w);
      }
      g.userData.wheels = wheels;
      break;
    }
    case 'shuttle': {
      put(g, new THREE.CylinderGeometry(1.05, 1.2, 2.2, 12), MAT.cream, 0, 1.6, 0);
      put(g, new THREE.SphereGeometry(1.05, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.cream, 0, 2.7, 0);
      put(g, new THREE.SphereGeometry(0.62, 12, 8), MAT.glass, 0, 2.55, 0.75);
      put(g, new THREE.TorusGeometry(1.06, 0.1, 6, 16), MAT.orange, 0, 1.5, 0, Math.PI / 2, 0, 0);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        put(g, new THREE.CylinderGeometry(0.09, 0.09, 1.3, 6), MAT.metal, Math.cos(a) * 0.9, 0.6, Math.sin(a) * 0.9, Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25);
      }
      put(g, new THREE.CylinderGeometry(0.5, 0.72, 0.5, 10), MAT.dark, 0, 0.35, 0);
      break;
    }
    default:
      put(g, box(1.2, 1.2, 1.2, 0.2), MAT.cream, 0, 0.7, 0);
  }
  return { group: g, spin };
}

// ---------------- 模块运行时 ----------------
const modules = [];
const connector = new THREE.Group();
let scene = null, cableMesh = null, o2Mesh = null;
let netDirty = true, netTimer = 0;

const LINK = 13;      // 平台/模块自动接线距离
const O2_RADIUS = 24; // 供氧半径

function add(type, x, z, rot, st) {
  const def = A.RECIPES[type] || (type === 'habitat' ? { name: '庇护所', power: 0, gen: { type: 'rtg', a: 1 } } : null);
  if (!def) return null;
  const { group, spin } = meshFor(type);
  group.position.set(x, 0, z);
  group.rotation.y = rot || 0;
  connector.add(group);
  const mod = {
    type, def, mesh: group, spin,
    x, z, rot: rot || 0,
    charge: st && st.ch ? st.ch : 0,
    eff: 1, net: -1,
    job: null, powered: false,
    bob: Math.random() * 6.28
  };
  modules.push(mod);
  netDirty = true;
  return mod;
}

function remove(mod) {
  const i = modules.indexOf(mod);
  if (i < 0) return;
  connector.remove(mod.mesh);
  modules.splice(i, 1);
  netDirty = true;
}

function nearest(x, z, r) {
  let best = null, bd = r || 4.2;
  for (const m of modules) {
    const d = Math.hypot(m.x - x, m.z - z);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

// ---------------- 电网 ----------------
function isGen(m) { return !!(m.def.gen); }
function isLoad(m) { return (m.def.power || 0) > 0; }

function genOutput(m) {
  const g = m.def.gen;
  if (!g) return 0;
  const env = A.env || { sun: 0.5, wind: 0.5 };
  if (g.type === 'solar') return g.a * env.sun * A.world.planet.sun;
  if (g.type === 'wind') return g.a * env.wind * A.world.planet.wind;
  if (g.type === 'rtg') return g.a;
  if (g.type === 'fuel') return (A.player && (A.player.inv.carbon || 0) > 0) ? g.a : 0;
  return g.a;
}

function recomputeNets() {
  for (const m of modules) m.net = -1;
  const nets = [];
  for (const m of modules) {
    if (m.net >= 0) continue;
    const id = nets.length;
    const queue = [m]; m.net = id;
    const list = [];
    while (queue.length) {
      const cur = queue.shift();
      list.push(cur);
      for (const o of modules) {
        if (o.net >= 0) continue;
        if (Math.hypot(o.x - cur.x, o.z - cur.z) <= LINK) { o.net = id; queue.push(o); }
      }
    }
    nets.push(list);
  }
  A.build.nets = nets;
  buildCables(nets);
}

function buildCables(nets) {
  if (cableMesh) { connector.remove(cableMesh); cableMesh.geometry.dispose(); cableMesh = null; }
  if (o2Mesh) { connector.remove(o2Mesh); o2Mesh.geometry.dispose(); o2Mesh = null; }
  const pos = [], o2pos = [];
  for (const net of nets) {
    const hasO2 = net.some((m) => m.type === 'oxygenator' || m.type === 'habitat');
    for (let i = 0; i < net.length; i++) {
      for (let j = i + 1; j < net.length; j++) {
        const a = net[i], b = net[j];
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d > LINK) continue;
        const ya = a.mesh.position.y + 0.55, yb = b.mesh.position.y + 0.55;
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = (ya + yb) / 2 - Math.min(0.9, d * 0.12);
        const N = 6;
        let px = a.x, py = ya, pz = a.z;
        for (let k = 1; k <= N; k++) {
          const t = k / N, it = 1 - t;
          const x = it * it * a.x + 2 * it * t * mx + t * t * b.x;
          const y = it * it * ya + 2 * it * t * my + t * t * yb;
          const z = it * it * a.z + 2 * it * t * mz + t * t * b.z;
          (hasO2 ? o2pos : pos).push(px, py, pz, x, y, z);
          px = x; py = y; pz = z;
        }
      }
    }
  }
  const mk = (arr, color, opacity) => {
    if (!arr.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  };
  cableMesh = mk(pos, 0xffd166, 0.5); if (cableMesh) connector.add(cableMesh);
  o2Mesh = mk(o2pos, 0x8fe0ff, 0.55); if (o2Mesh) connector.add(o2Mesh);
}

// ---------------- 氧气 ----------------
let o2Cache = 0, o2Value = false;
function oxygenAt(x, z, w) {
  const now = performance.now();
  if (now - o2Cache < 200) return o2Value;
  o2Cache = now;
  let ok = false;
  for (const m of modules) {
    if (m.type === 'habitat' || (m.type === 'oxygenator' && m.eff > 0.15)) {
      if (Math.hypot(m.x - x, m.z - z) < O2_RADIUS && Math.abs(w - A.player.w) < 7) { ok = true; break; }
    }
  }
  if (!ok) {
    for (const t of A.player.tethers) {
      if (Math.hypot(t.x - x, t.z - z) > 17) continue;
      if (Math.abs(w - t.w) > 1.3) continue;
      if (t.linked) { ok = true; break; }
    }
  }
  o2Value = ok;
  return ok;
}

// 系绳是否挂在氧气源上：从模块源沿系绳链传播
function updateTetherLinks(tethers, w) {
  for (const t of tethers) t.linked = false;
  for (const t of tethers) {
    for (const m of modules) {
      if (m.type !== 'habitat' && !(m.type === 'oxygenator' && m.eff > 0.15)) continue;
      if (Math.hypot(m.x - t.x, m.z - t.z) < 26 && Math.abs(w - t.w) < 5) { t.linked = true; break; }
    }
  }
  for (let pass = 0; pass < 4; pass++) {
    for (const t of tethers) {
      if (t.linked) continue;
      for (const o of tethers) {
        if (!o.linked) continue;
        if (Math.hypot(o.x - t.x, o.z - t.z) < 24 && Math.abs(o.w - t.w) < 2.2) { t.linked = true; break; }
      }
    }
  }
}

// ---------------- 主更新 ----------------
function update(dt, w, px, pz, windFactor) {
  netTimer -= dt;
  if (netDirty || netTimer <= 0) { recomputeNets(); netDirty = false; netTimer = 0.6; }

  const nets = A.build.nets || [];
  for (const net of nets) {
    let supply = 0, demand = 0, cap = 0, stored = 0;
    for (const m of net) {
      supply += genOutput(m);
      if (m.def.cap) { cap += m.def.cap; stored += m.charge; }
      // 制氧机常开；其他用电器有加工任务时才吃电
      if (isLoad(m) && (m.job || m.type === 'oxygenator')) demand += m.def.power;
    }
    let eff = 1;
    if (demand > 0) {
      eff = Math.min(1, supply / demand);
      if (eff < 1 && stored > 0) {
        const extra = Math.min(stored / Math.max(dt, 1e-3), demand - supply);
        eff = Math.min(1, (supply + extra) / demand);
      }
    }
    const use = demand * eff * dt;
    let netFlow = supply * dt - use;
    if (netFlow > 0 && cap > 0) {
      const room = cap - stored;
      const push = Math.min(netFlow, room);
      // 均摊充入电池
      for (const m of net) if (m.def.cap) m.charge = Math.min(m.def.cap, m.charge + push / Math.max(1, net.filter((x) => x.def.cap).length));
      netFlow -= push;
    } else if (netFlow < 0 && stored > 0) {
      let need = -netFlow;
      for (const m of net) {
        if (!m.def.cap) continue;
        const take = Math.min(m.charge, need);
        m.charge -= take; need -= take;
      }
    }
    for (const m of net) {
      m.eff = isLoad(m) ? eff : 1;
      m.powered = supply > 0.01 || stored > 0.01;
      // 用电器推进加工
      if (m.job) {
        m.job.t += dt * (0.2 + 0.8 * m.eff);
        if (m.job.t >= m.job.total) {
          finishJob(m);
        }
      }
    }
  }

  // 发电机烧碳：每台每 25 秒吃掉一块碳
  for (const m of modules) {
    if (m.def.gen && m.def.gen.type === 'fuel' && genOutput(m) > 0) {
      m.fuelAcc = (m.fuelAcc || 0) + dt;
      if (m.fuelAcc > 25) { m.fuelAcc = 0; A.player.takeItem('carbon', 1); }
    }
  }

  // 模块跟随地形呼吸：每帧只重测一个模块的坐高（按足印四角取最高），其余复用
  if (modules.length) {
    A.build._seat = ((A.build._seat || 0) + 1) % modules.length;
    const mm = modules[A.build._seat];
    const f = mm.type === 'platform' ? 1.6 : mm.type === 'habitat' ? 2.3 : 1.1;
    let gy = A.world.height(mm.x, mm.z, w);
    gy = Math.max(gy,
      A.world.height(mm.x + f, mm.z, w), A.world.height(mm.x - f, mm.z, w),
      A.world.height(mm.x, mm.z + f, w), A.world.height(mm.x, mm.z - f, w));
    mm.gy = gy;
  }
  for (const m of modules) {
    const gy = m.gy === undefined ? m.mesh.position.y : m.gy;
    m.mesh.position.y = M.lerp(m.mesh.position.y || gy, gy, 1 - Math.exp(-dt * 6));
    for (const s of m.spin) {
      if (s.axis === 'y') s.obj.rotation.y += s.speed * dt;
      else if (s.axis === 'x') s.obj.rotation.x += s.speed * dt;
      else if (s.axis === 'z') s.obj.rotation.z += s.speed * dt;
    }
    if (m.type === 'wind_m' && m.spin[0]) m.spin[0].obj.rotation.z += windFactor * 3.4 * dt;
    if (m.type === 'rover' && m.driving) {
      for (const wh of m.mesh.userData.wheels || []) wh.rotation.x += (m.speed || 0) * dt * 2;
    }
  }
  updateTetherLinks(A.player.tethers, w);
  for (const t of A.player.tethers) {
    if (t.bulb) t.bulb.material.emissiveIntensity = t.linked ? 1.2 : 0.35;
  }
}

function finishJob(m) {
  const job = m.job;
  m.job = null;
  if (!job) return;
  if (job.out) A.player.addItem(job.out, job.qty || 1);
  if (job.bytes) { A.player.bytes += job.bytes; A.ui.toast('+' + job.bytes + ' 字节'); }
  if (job.onDone) job.onDone();
  A.sfx.ok();
  A.ui.refreshModule(m);
}

function startJob(m, job) {
  if (m.job) { A.ui.toast('这台模块正在工作'); return false; }
  if (!m.powered && m.def.power > 0) { A.sfx.err(); A.ui.toast('没有电力 · 先接一块太阳能板'); return false; }
  m.job = job;
  m.job.t = 0;
  A.ui.refreshModule(m);
  return true;
}

function serialize() {
  return modules.filter((m) => m.type !== 'habitat').map((m) => ({
    t: m.type, x: +m.x.toFixed(2), z: +m.z.toFixed(2), r: +m.rot.toFixed(3), ch: +m.charge.toFixed(1)
  }));
}

function load(arr) {
  for (let i = modules.length - 1; i >= 0; i--) connector.remove(modules[i].mesh);
  modules.length = 0;
  add('habitat', 0, 0, 0);
  for (const s of arr || []) add(s.t, s.x, s.z, s.r, { ch: s.ch });
  netDirty = true;
}

A.build = {
  modules, MAT, meshFor, nearest, add, remove, startJob, oxygenAt,
  init(s) { scene = s; s.add(connector); },
  update, serialize, load,
  get nets() { return A.build._nets || []; },
  set nets(v) { A.build._nets = v; },
  get habitat() { return modules.find((m) => m.type === 'habitat'); }
};

})(window.A);
