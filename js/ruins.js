/* ============================================================
   ASTRA·4D — 2.5 ruins：遗址（残骸箱 / 探测者 / 星门碎片）
   参照 Astroneer：地表散落的前哨残骸、可搜刮的补给箱、发光的星门环。
   ============================================================ */
(function (A) {
'use strict';
const M = A.M;

const MAT = {
  hull:  new THREE.MeshPhongMaterial({ color: 0xdcd5c6, shininess: 6, flatShading: true }),
  hull2: new THREE.MeshPhongMaterial({ color: 0xb3ab9b, shininess: 4, flatShading: true }),
  rust:  new THREE.MeshPhongMaterial({ color: 0x9c6b52, shininess: 2, flatShading: true }),
  orange:new THREE.MeshPhongMaterial({ color: 0xe8853c, shininess: 10, flatShading: true }),
  dark:  new THREE.MeshPhongMaterial({ color: 0x3b434f, shininess: 12, flatShading: true }),
  gate:  new THREE.MeshPhongMaterial({ color: 0x8d78d6, emissive: 0x2a1f4e, shininess: 60, flatShading: true }),
  core:  new THREE.MeshPhongMaterial({ color: 0x8ef0d0, emissive: 0x2f8f7a, shininess: 60, flatShading: true })
};

const group = new THREE.Group();
const sites = [];
let scene = null;
const _c = new THREE.Color();

function rbox(w, h, d, r) { return A.roundedBox(w, h, d, r === undefined ? Math.min(w, h, d) * 0.18 : r); }
function put(g, geo, mat, x, y, z, rx, ry, rz) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x || 0, y || 0, z || 0);
  if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
  m.castShadow = !A.mobile; m.receiveShadow = true;
  g.add(m); return m;
}

// ---------------- 零件 ----------------
function makeCrate() {
  const g = new THREE.Group();
  const body = put(g, rbox(1.18, 0.82, 1.0, 0.11), MAT.hull, 0, 0.41, 0);
  const band = put(g, rbox(1.22, 0.11, 1.04, 0.03), MAT.orange, 0, 0.66, 0);
  const lid = put(g, rbox(1.2, 0.13, 1.02, 0.04), MAT.hull2, 0, 0.85, -0.5);
  lid.geometry.translate(0, 0, 0.5);
  lid.position.set(0, 0.85, -0.5);
  put(g, rbox(0.18, 0.11, 0.07, 0.02), MAT.dark, 0.38, 0.48, 0.52);
  g.userData = { lid, band, body };
  return g;
}

function makeWreck(rand) {
  const g = new THREE.Group();
  // 半塌的平台
  const slab = put(g, rbox(3.6, 0.26, 3.2, 0.08), MAT.hull2, 0, 0.42, 0);
  slab.rotation.z = (rand() - 0.5) * 0.42;
  slab.rotation.x = (rand() - 0.5) * 0.28;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const h = 0.3 + rand() * 0.35;
    put(g, new THREE.CylinderGeometry(0.1, 0.14, h, 5), MAT.rust, sx * 1.45, h / 2, sz * 1.35,
        (rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3);
  }
  // 倾倒的立柱与塌掉的穹顶
  put(g, new THREE.CylinderGeometry(0.14, 0.18, 2.4, 6), MAT.hull, -1.9, 0.9, 0.6, 0.5, 0, 0.35);
  put(g, rbox(0.5, 0.5, 0.5, 0.1), MAT.orange, -2.3, 1.7, 1.3, 0.4, 0.7, 0.2);
  const dome = put(g, new THREE.SphereGeometry(1.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT.hull2, 2.5, 0.15, -1.6, 0.22, 0.4, -0.3);
  dome.material = MAT.hull2;
  put(g, rbox(1.1, 0.12, 0.9, 0.04), MAT.rust, 1.4, 0.08, 2.2, 0.06, 0.5, 0.5);
  put(g, rbox(0.8, 0.1, 1.2, 0.03), MAT.hull2, -2.6, 0.06, -1.4, -0.05, 1.1, 0.2);
  put(g, new THREE.CylinderGeometry(0.09, 0.09, 1.1, 5), MAT.rust, 2.9, 0.5, 1.9, 0.9, 0.6, 0);
  return g;
}

function makeProbe(rand) {
  const g = new THREE.Group();
  const hull = put(g, new THREE.CylinderGeometry(1.0, 1.15, 2.2, 10), MAT.hull, 0, 0.9, 0);
  hull.rotation.z = 1.15 + (rand() - 0.5) * 0.2;
  put(g, new THREE.SphereGeometry(1.0, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT.hull2, -1.05, 1.5, 0, 0, 0, 1.15);
  put(g, new THREE.CylinderGeometry(0.06, 0.06, 1.8, 5), MAT.rust, 0.7, 1.5, 0.4, 0.3, 0, -0.5);
  put(g, new THREE.SphereGeometry(0.13, 8, 6), MAT.core, 1.55, 2.1, 0.55);
  put(g, new THREE.TorusGeometry(0.7, 0.07, 5, 14), MAT.rust, 0.2, 0.35, 0, Math.PI / 2, 0, 0);
  return g;
}

function makeGate() {
  const g = new THREE.Group();
  const ring = put(g, new THREE.TorusGeometry(4.4, 0.36, 7, 26, Math.PI * 1.25), MAT.gate, 0, 3.2, 0, 0, 0, -0.35);
  put(g, new THREE.TorusGeometry(3.1, 0.11, 5, 22, Math.PI * 1.25), MAT.hull2, 0, 3.2, 0.1, 0, 0, -0.35);
  put(g, rbox(1.1, 0.9, 1.1, 0.14), MAT.dark, 3.3, 0.5, 0);
  put(g, rbox(1.1, 0.9, 1.1, 0.14), MAT.dark, -4.2, 0.5, 0);
  put(g, new THREE.CylinderGeometry(0.5, 0.7, 0.4, 8), MAT.gate, 0, 0.2, 0);
  g.userData = { ring };
  return g;
}

// ---------------- 站位 ----------------
function tooClose(x, z, list, min) {
  if (Math.hypot(x, z) < 30) return true;
  return list.some((s) => Math.hypot(s.x - x, s.z - z) < min);
}

function spawn() {
  for (const s of sites) group.remove(s.group);
  sites.length = 0;
  const P = A.world.planet;
  const rand = A.rng((A.world.state.seed ^ 0x51f3) + P.seed);
  const total = A.mobile ? 7 : 11;
  const spots = [];
  let guard = 0;
  while (spots.length < total && guard++ < 400) {
    const ang = rand() * Math.PI * 2;
    const rad = 46 + Math.sqrt(rand()) * 160;
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    if (tooClose(x, z, spots, 34)) continue;
    spots.push({ x, z });
  }
  spots.forEach((s, i) => {
    const roll = rand();
    const kind = roll < 0.42 ? 'wreck' : roll < 0.74 ? 'probe' : 'gate';
    const g = new THREE.Group();
    let parts;
    const crateCount = kind === 'wreck' ? 2 : 1;
    if (kind === 'wreck') parts = makeWreck(rand);
    else if (kind === 'probe') parts = makeProbe(rand);
    else parts = makeGate();
    g.add(parts);
    const site = {
      id: i, kind, x: s.x, z: s.z, y: 0, rot: rand() * Math.PI * 2,
      group: g, entries: [], ring: parts.userData && parts.userData.ring
    };
    // 补给箱
    for (let c = 0; c < crateCount; c++) {
      const crate = makeCrate();
      const a = rand() * Math.PI * 2, r = 2.2 + rand() * 1.6;
      crate.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      crate.rotation.y = rand() * Math.PI * 2;
      crate.rotation.z = (rand() - 0.5) * 0.16;
      g.add(crate);
      site.entries.push({ kind: 'crate', mesh: crate, looted: false, label: '补给箱' });
    }
    // 数据核心（星门 / 探测者各一半概率）
    if (kind !== 'wreck' || rand() < 0.4) {
      const core = new THREE.Group();
      put(core, new THREE.OctahedronGeometry(0.34, 0), MAT.core, 0, 0.5, 0);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0x8ef0d0, transparent: true, opacity: 0.14, depthWrite: false }));
      halo.position.y = 0.5;
      core.add(halo);
      core.position.set((rand() - 0.5) * 3.4, 0, (rand() - 0.5) * 3.4);
      g.add(core);
      site.entries.push({ kind: 'core', mesh: core, looted: false, label: '数据核心', bytes: 160 + Math.floor(rand() * 340) });
    }
    g.position.set(s.x, A.world.height(s.x, s.z, A.player ? A.player.w : 0), s.z);
    g.rotation.y = site.rot;
    group.add(g);
    sites.push(site);
  });
  scene && scene.add(group);
  applyLooted((A.save && A.save.planets && A.save.planets[P.id] && A.save.planets[P.id].ruins) || []);
}

function reanchor(w) {
  for (const s of sites) {
    s.group.position.y = A.world.height(s.x, s.z, w);
  }
}

function markLooted(entry) {
  entry.looted = true;
  const m = entry.mesh;
  if (entry.kind === 'crate') {
    const ud = m.userData || {};
    if (ud.lid) { ud.lid.rotation.x = -1.1; ud.lid.position.y = 0.74; }
    if (ud.band) ud.band.material = MAT.dark;
    m.traverse((o) => { if (o.material && o.material.emissive) o.material.emissive.setHex(0x000000); });
  } else {
    m.visible = false;
  }
}

function applyLooted(list) {
  const set = new Set(list || []);
  for (const s of sites) {
    for (let i = 0; i < s.entries.length; i++) {
      const key = s.id + ':' + i;
      if (set.has(key)) markLooted(s.entries[i]);
      else { /* 保持已生成状态 */ }
    }
  }
}

function serialize() {
  const out = [];
  for (const s of sites) for (let i = 0; i < s.entries.length; i++) if (s.entries[i].looted) out.push(s.id + ':' + i);
  return out;
}

function nearest(x, z, r) {
  let best = null, bd = r || 4.5;
  for (const s of sites) {
    for (const e of s.entries) {
      if (e.looted) continue;
      const wx = s.x + e.mesh.position.x * Math.cos(s.rot) + e.mesh.position.z * Math.sin(s.rot);
      const wz = s.z - e.mesh.position.x * Math.sin(s.rot) + e.mesh.position.z * Math.cos(s.rot);
      const dd = Math.hypot(wx - x, wz - z);
      if (dd < bd) { bd = dd; best = { site: s, entry: e, dist: dd, x: wx, z: wz }; }
    }
  }
  return best;
}

const REFINED = ['aluminum', 'copper', 'zinc', 'glass', 'ceramic'];
function loot(target) {
  const e = target.entry;
  if (e.looted) return null;
  markLooted(e);
  if (e.kind === 'core') {
    A.player.bytes += e.bytes;
    return { bytes: e.bytes, text: '数据核心 · +' + e.bytes + ' 字节' };
  }
  const scrap = 1 + Math.floor(Math.random() * 3);
  A.player.addItem('scrap', scrap);
  let text = '金属碎料 ×' + scrap;
  if (Math.random() < 0.5) {
    const r = REFINED[Math.floor(Math.random() * REFINED.length)];
    A.player.addItem(r, 1);
    text += ' · ' + A.item(r).name + ' ×1';
  }
  return { scrap, text };
}

A.ruins = {
  sites, spawn, reanchor, nearest, loot, serialize, applyLooted,
  init(s) { scene = s; s.add(group); },
  update(w, time) {
    for (const s of sites) {
      if (s.ring) s.ring.rotation.z = -0.35 + Math.sin(time * 0.5 + s.id) * 0.03;
    }
  },
  get group() { return group; }
};

})(window.A);
