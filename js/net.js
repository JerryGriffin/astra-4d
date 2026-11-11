/* ============================================================
   ASTRA·4D — 8. net：联机（Co-op）
   参照 borderops/src/net.js 的 HTTP 轮询模型：
   · 150ms 一次 POST /api/sync，不需要 WebSocket
   · 只同步「玩家位置 / 朝向 / 行星 / 视图 / 聊天」，世界与基地各自本地
   · 房间码 4 位；房主只决定种子，不做权威模拟（本作没有 AI 单位）
   ============================================================ */
(function (A) {
'use strict';
const M = A.M;

const SYNC_MS = 150;
const COLORS = [0x5fd0ff, 0x8ce0a0, 0xffd166, 0xc08aff, 0xff8f6a, 0x7fe8e0];

const net = {
  online: false,
  url: '',
  code: '',
  peerId: '',
  secret: '',
  name: '',
  isHost: false,
  seed: 0,
  cursor: 0,
  peers: new Map(),      // id -> { id, name, host, state, av, label }
  log: [],               // { by, t, sys }
  lastSync: 0,
  inflight: false,
  fails: 0,
  err: '',
  outbox: [],
  scene: null,
  avGroup: null,

  /* ---------------- 连接 ---------------- */
  defaultUrl() {
    if (location.protocol === 'http:' || location.protocol === 'https:') return location.origin;
    return 'http://localhost:8787';
  },

  async _post(path, body, timeout) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeout || 6000);
    try {
      const r = await fetch(this.url.replace(/\/$/, '') + path, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}), signal: ctl.signal, cache: 'no-store'
      });
      return await r.json();
    } finally { clearTimeout(to); }
  },

  async create(name, url) {
    this.name = (name || '宇航员').slice(0, 16);
    this.url = (url || this.defaultUrl()).trim();
    this.err = '';
    try {
      const r = await this._post('/api/create', { name: this.name, seed: A.save ? A.save.seed : 0 });
      if (!r.ok) { this.err = r.msg || '创建失败'; return r; }
      this._attach(r);
      this._sys('房间已创建 · 把房号 ' + r.code + ' 发给队友');
      return r;
    } catch (e) {
      this.err = '连不上联机服务（检查地址与 coop-server 是否在跑）';
      return { ok: false, msg: this.err };
    }
  },

  async join(code, name, url) {
    this.name = (name || '宇航员').slice(0, 16);
    this.url = (url || this.defaultUrl()).trim();
    this.err = '';
    try {
      const r = await this._post('/api/join', { code: String(code || '').toUpperCase(), name: this.name });
      if (!r.ok) { this.err = r.msg || '加入失败'; return r; }
      this._attach(r);
      this._sys('已加入房间 ' + r.code);
      if (r.seed && A.save && r.seed !== A.save.seed) {
        A.ui.toast('房主世界种子不同 · 地形可能与队友不一致');
      }
      return r;
    } catch (e) {
      this.err = '连不上联机服务（检查地址与 coop-server 是否在跑）';
      return { ok: false, msg: this.err };
    }
  },

  _attach(r) {
    this.online = true;
    this.code = r.code; this.peerId = r.peerId; this.secret = r.secret;
    this.isHost = !!r.host; this.seed = r.seed || 0;
    this.cursor = 0; this.fails = 0; this.inflight = false;
    this.outbox = [];
    this.peers.clear();
    this._applyPeers(r.room && r.room.peers);
    this.lastSync = 0;
    // 用定时器驱动轮询：rAF 在后台标签页会被浏览器节流到 0 帧，导致队友状态冻结
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this.sync(false), SYNC_MS);
  },

  async leave(quiet) {
    const was = this.online;
    this.online = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this.code && this.peerId) {
      try { await this._post('/api/leave', { code: this.code, peerId: this.peerId, secret: this.secret }, 3000); } catch (e) {}
    }
    this.code = ''; this.peerId = ''; this.secret = ''; this.isHost = false;
    this.cursor = 0; this.fails = 0; this.outbox = [];
    for (const p of this.peers.values()) this._removeAvatar(p);
    this.peers.clear();
    if (was && !quiet) A.ui.toast('已离开联机房间');
    if (A.ui && A.ui.renderNet) A.ui.renderNet();
  },

  /* ---------------- 同步 ---------------- */
  state() {
    const p = A.player;
    return {
      p: A.world.state.pi, v: A.view.id,
      x: p.x, y: p.y, z: p.z, w: p.w, f: p.facing,
      mv: p.moving ? 1 : 0, hp: p.health, o2: p.oxygen, al: !p.dead
    };
  },

  async sync(force) {
    if (!this.online) return;
    const t = performance.now();
    if (!force && (this.inflight || t - this.lastSync < SYNC_MS)) return;
    this.lastSync = t; this.inflight = true;
    const events = this.outbox.splice(0, 8);
    let r = null;
    try {
      r = await this._post('/api/sync', {
        code: this.code, peerId: this.peerId, secret: this.secret,
        name: this.name, state: this.state(), cursor: this.cursor, events
      });
    } catch (e) {
      this.inflight = false;
      this.fails++;
      if (events.length) this.outbox = events.concat(this.outbox).slice(0, 20);
      if (this.fails === 3) A.ui.toast('联机同步中断，正在重试…');
      if (this.fails > 12) { this.online = false; A.ui.toast('与联机服务断开'); }
      return;
    }
    this.inflight = false;
    if (!r || !r.ok) {
      if (events.length) this.outbox = events.concat(this.outbox).slice(0, 20);
      this.fails++;
      if (r && r.auth === false) {
        this.online = false;
        A.ui.toast('联机身份已失效 · 请重新加入房间');
      }
      return;
    }
    this.fails = 0;
    this.isHost = !!r.host;
    this.cursor = r.cursor || this.cursor;
    this._applyPeers(r.room && r.room.peers);
    if (Array.isArray(r.events)) for (const ev of r.events) this._onEvent(ev);
    if (A.ui && A.ui.renderNet && A.ui.openName === 'net') A.ui.renderNet();
  },

  _onEvent(ev) {
    const d = ev.data || {};
    if (ev.type === 'chat') {
      this._push(d.by || '队友', d.t || '');
    } else if (ev.type === 'join') {
      if (ev.from !== this.peerId) this._sys((d.name || '玩家') + ' 加入了房间');
    } else if (ev.type === 'leave') {
      this._sys((d.name || '玩家') + ' 离开了房间');
    } else if (ev.type === 'host') {
      this.isHost = d.id === this.peerId;
      this._sys(this.isHost ? '你成为了房主' : '房主已移交');
    }
  },

  say(text) {
    const t = String(text || '').trim().slice(0, 80);
    if (!t) return false;
    if (!this.online) { A.ui.toast('还没连上房间'); return false; }
    this.outbox.push({ type: 'chat', data: { t } });
    this._push(this.name, t);
    this.sync(true);
    return true;
  },

  _push(by, t) {
    this.log.push({ by, t, sys: false, at: Date.now() });
    if (this.log.length > 60) this.log.shift();
    if (A.ui && A.ui.renderNet && A.ui.openName === 'net') A.ui.renderNet();
  },
  _sys(t) {
    this.log.push({ by: '', t, sys: true, at: Date.now() });
    if (this.log.length > 60) this.log.shift();
    A.ui.toast(t);
    if (A.ui && A.ui.renderNet && A.ui.openName === 'net') A.ui.renderNet();
  },

  /* ---------------- 远端玩家 ---------------- */
  _applyPeers(list) {
    if (!Array.isArray(list)) return;
    const seen = new Set();
    let i = 0;
    for (const p of list) {
      if (!p) continue;
      if (p.id === this.peerId) { seen.add(p.id); continue; }
      seen.add(p.id);
      let pr = this.peers.get(p.id);
      if (!pr) {
        pr = { id: p.id, name: p.name, host: p.host, state: null, av: null, label: null, color: COLORS[i % COLORS.length], init: false, phase: 0, lastX: 0, lastZ: 0 };
        this.peers.set(p.id, pr);
        this._makeAvatar(pr);
      }
      i++;
      pr.name = p.name; pr.host = !!p.host;
      if (p.state) pr.state = p.state;
    }
    for (const [id, pr] of [...this.peers]) {
      if (seen.has(id)) continue;
      this._removeAvatar(pr);
      this.peers.delete(id);
    }
  },

  _makeAvatar(pr) {
    if (!this.scene) return;
    const g = (A.player.buildAstronaut || (() => new THREE.Group()))();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.06, 6, 18),
      new THREE.MeshBasicMaterial({ color: pr.color, transparent: true, opacity: 0.75, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);
    // 名牌
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(12,18,26,0.66)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillStyle = '#' + pr.color.toString(16).padStart(6, '0');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pr.name.slice(0, 10), 128, 34);
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    label.scale.set(2.2, 0.55, 1);
    label.position.y = 2.55;
    g.add(label);
    g.visible = false;
    this.avGroup.add(g);
    pr.av = g; pr.label = label;
  },

  _removeAvatar(pr) {
    if (pr.av && this.avGroup) {
      this.avGroup.remove(pr.av);
      pr.av.traverse((o) => {
        if (o.geometry && o.geometry.dispose) o.geometry.dispose();
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          if (o.material.dispose) o.material.dispose();
        }
      });
    }
    pr.av = null; pr.label = null;
  },

  init(scene) {
    this.scene = scene;
    this.avGroup = new THREE.Group();
    scene.add(this.avGroup);
  },

  // 每帧：只做远端位置插值（轮询由定时器驱动，见 _attach）
  tick(dt) {
    if (!this.online) return;
    const p = A.player;
    for (const pr of this.peers.values()) {
      const st = pr.state;
      const av = pr.av;
      if (!av || !st) continue;
      const sameWorld = st.p === A.world.state.pi && st.v === A.view.id;
      const vis = sameWorld && Math.abs(st.w - p.w) < 2.4 && Math.hypot(st.x - p.x, st.z - p.z) < 260;
      av.visible = vis;
      if (!vis) continue;
      const k = Math.min(1, dt * 11);
      if (!pr.init) {
        av.position.set(st.x, st.y, st.z);
        pr.init = true; pr.lastX = st.x; pr.lastZ = st.z;
      } else {
        av.position.x += (st.x - av.position.x) * k;
        av.position.y += (st.y - av.position.y) * k;
        av.position.z += (st.z - av.position.z) * k;
      }
      // 最短路径角度插值
      const target = st.f || 0;
      let diff = ((target - av.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      av.rotation.y += diff * Math.min(1, k * 1.6);
      // 走路的简易摆动
      const moved = Math.hypot(av.position.x - pr.lastX, av.position.z - pr.lastZ);
      pr.lastX = av.position.x; pr.lastZ = av.position.z;
      pr.phase += moved * 1.6;
      const ud = av.userData || {};
      const sw = st.mv ? Math.sin(pr.phase) * 0.42 : 0;
      if (ud.legL) ud.legL.rotation.x = sw;
      if (ud.legR) ud.legR.rotation.x = -sw;
      if (ud.armL) ud.armL.rotation.x = -sw * 0.8;
      if (ud.armR) ud.armR.rotation.x = sw * 0.8;
      // 死亡显示
      av.scale.setScalar(st.al ? 1 : 0.75);
    }
  },

  // 面板展示用：队友状态行
  peerRows() {
    const out = [];
    for (const pr of this.peers.values()) {
      const st = pr.state;
      let where = '未同步';
      if (st) {
        const sameView = st.v === A.view.id;
        const planet = (A.PLANETS[st.p] && A.PLANETS[st.p].name) || '未知';
        where = planet + ' · ' + String(st.v || '').toUpperCase() + (sameView ? '' : '（不同切片）');
      }
      out.push({ name: pr.name, host: pr.host, where, hp: st ? st.hp : null });
    }
    return out;
  }
};

A.net = net;

})(window.A);
