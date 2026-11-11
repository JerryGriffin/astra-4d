/* ============================================================
   ASTRA·4D — coop-server.mjs
   零依赖联机房间服务（参照 borderops/server.js 的 HTTP 轮询模型）
   · 同端口同时托管静态站点与 /api/* 房间接口
   · 客户端每 150ms 轮询一次 POST /api/sync，无需 WebSocket
   · 4 位房间码、peer 密钥鉴权、事件游标、掉线 20s 转移房主

   用法：
     node coop-server.mjs              # 默认 8787
     PORT=9000 node coop-server.mjs
   然后浏览器打开 http://localhost:8787/ ，右上角「联机」建房
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const PEER_TIMEOUT = 45000;        // 45s 没 sync 视为掉线（后台标签页可能被节流）
const ROOM_TTL = 5 * 60 * 1000;    // 空房 5 分钟回收
const EVENT_KEEP = 120;            // 每房事件保留条数
const MAX_PEERS = 6;
const MAX_ROOMS = 300;
const MAX_BODY = 64 * 1024;

const ROOMS = new Map();           // code -> room
const RL = new Map();              // 简易速率限制
const now = () => Date.now();

/* ---------------- 工具 ---------------- */
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}
function rate(key, limit, windowMs) {
  const t = now();
  let b = RL.get(key);
  if (!b || t >= b.reset) { b = { n: 0, reset: t + windowMs }; RL.set(key, b); }
  b.n++;
  return b.n <= limit;
}
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  for (let i = 0; i < 500; i++) {
    let c = '';
    for (let k = 0; k < 4; k++) c += ALPH[crypto.randomInt(ALPH.length)];
    if (!ROOMS.has(c)) return c;
  }
  return 'R' + crypto.randomInt(1000, 9999);
}
const newId = () => 'p' + crypto.randomBytes(5).toString('hex');
const newSecret = () => crypto.randomBytes(24).toString('hex');

function cleanName(v) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u001f\u007f<>&"']/g, '')
    .trim().slice(0, 16) || '宇航员';
}
function num(v, min, max, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}
function makeRoom(code) {
  return {
    code, seed: crypto.randomInt(1, 0x7fffffff),
    hostId: null, peers: new Map(), events: [], seq: 0,
    created: now(), touched: now()
  };
}
function pushEvent(r, from, type, data) {
  r.seq++;
  r.events.push({ seq: r.seq, from, type, data: data || null, t: now() });
  while (r.events.length > EVENT_KEEP) r.events.shift();
}
function roomPublic(r) {
  return {
    code: r.code, seed: r.seed, hostId: r.hostId,
    peers: [...r.peers.values()].map((p) => ({
      id: p.id, name: p.name, host: p.id === r.hostId, state: p.state || null
    }))
  };
}
function authPeer(room, body) {
  if (!room) return null;
  const p = room.peers.get(String(body.peerId || ''));
  if (!p || !body.secret || p.secret !== String(body.secret)) return null;
  return p;
}
function sanitizeState(s) {
  if (!s || typeof s !== 'object') return null;
  return {
    p: Math.round(num(s.p, 0, 6, 0)),            // 行星序号
    v: String(s.v || 'xyz').slice(0, 3),          // 空间视图
    x: +num(s.x, -4000, 4000, 0).toFixed(1),
    y: +num(s.y, -200, 400, 0).toFixed(1),
    z: +num(s.z, -4000, 4000, 0).toFixed(1),
    w: +num(s.w, -6.5, 6.5, 0).toFixed(2),        // 相位
    f: +num(s.f, -7, 7, 0).toFixed(2),            // 朝向
    mv: s.mv ? 1 : 0,                            // 是否移动
    hp: Math.round(num(s.hp, 0, 100, 100)),
    o2: Math.round(num(s.o2, 0, 100, 100)),
    al: s.al === false ? 0 : 1
  };
}
function sanitizeEvent(peer, ev) {
  if (!ev || typeof ev !== 'object') return null;
  const t = String(ev.type || '');
  if (t === 'chat') {
    const text = String((ev.data && ev.data.t) || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 80);
    return text ? { type: 'chat', data: { by: peer.name, t: text } } : null;
  }
  return null;
}

/* ---------------- GC ---------------- */
setInterval(() => {
  const t = now();
  for (const [code, r] of ROOMS) {
    for (const [id, p] of r.peers) {
      if (t - p.last > PEER_TIMEOUT) {
        r.peers.delete(id);
        pushEvent(r, id, 'leave', { id, name: p.name });
        if (r.hostId === id) {
          const rest = [...r.peers.keys()];
          r.hostId = rest[0] || null;
          if (r.hostId) pushEvent(r, id, 'host', { id: r.hostId });
        }
      }
    }
    if (!r.peers.size && t - r.touched > ROOM_TTL) ROOMS.delete(code);
  }
  for (const [k, b] of RL) if (t > b.reset + 60000) RL.delete(k);
}, 5000).unref();

/* ---------------- HTTP ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json'
};

function json(req, res, obj, code = 200) {
  const body = Buffer.from(JSON.stringify(obj));
  const h = {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  };
  if (process.env.CORS_ORIGIN) {
    h['access-control-allow-origin'] = process.env.CORS_ORIGIN;
    h['access-control-allow-headers'] = 'content-type';
    h['access-control-allow-methods'] = 'GET,POST,OPTIONS';
  }
  res.writeHead(code, h);
  res.end(req.method === 'HEAD' ? undefined : body);
}

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { req.destroy(); resolve(null); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

function serveStatic(req, res, urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  let rel = clean === '/' ? '/index.html' : clean;
  const abs = path.normalize(path.join(ROOT, rel));
  if (!abs.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('not found');
    }
    const ext = path.extname(abs).toLowerCase();
    const headers = {
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-length': st.size,
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
      'x-content-type-options': 'nosniff'
    };
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(abs).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': process.env.CORS_ORIGIN || '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS'
    });
    return res.end();
  }

  if (!p.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, p);
  }

  const ip = clientIp(req);
  if (!rate(ip + ':api', 12000, 60000)) return json(req, res, { ok: false, msg: '请求过于频繁' }, 429);

  if (p === '/api/ping') {
    return json(req, res, { ok: true, t: now(), rooms: ROOMS.size, ver: 1 });
  }

  if (req.method !== 'POST') return json(req, res, { ok: false, msg: '只支持 POST' }, 405);
  const body = await readBody(req);
  if (!body) return json(req, res, { ok: false, msg: '请求体无效' }, 400);

  if (p === '/api/create') {
    if (!rate(ip + ':create', 12, 60000)) return json(req, res, { ok: false, msg: '建房太频繁' }, 429);
    if (ROOMS.size >= MAX_ROOMS) return json(req, res, { ok: false, msg: '服务器房间已满' }, 503);
    const peer = { id: newId(), name: cleanName(body.name), secret: newSecret(), state: null, last: now() };
    // 房主携带自己的种子（客户端已有世界时保持同一片地形）
    const code = newCode();
    const room = makeRoom(code);
    if (Number.isFinite(Number(body.seed)) && Number(body.seed) > 0) room.seed = Number(body.seed) | 0;
    room.hostId = peer.id;
    room.peers.set(peer.id, peer);
    ROOMS.set(code, room);
    pushEvent(room, peer.id, 'join', { id: peer.id, name: peer.name });
    console.log('[room] create ' + code + ' by ' + peer.name + ' seed=' + room.seed);
    return json(req, res, { ok: true, code, peerId: peer.id, secret: peer.secret, seed: room.seed, host: true, room: roomPublic(room) });
  }

  if (p === '/api/join') {
    if (!rate(ip + ':join', 60, 60000)) return json(req, res, { ok: false, msg: '加入太频繁' }, 429);
    const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    const room = ROOMS.get(code);
    if (!room) return json(req, res, { ok: false, msg: '房间不存在或已解散' }, 404);
    if (room.peers.size >= MAX_PEERS) return json(req, res, { ok: false, msg: '房间已满（最多 ' + MAX_PEERS + ' 人）' }, 409);
    const peer = { id: newId(), name: cleanName(body.name), secret: newSecret(), state: null, last: now() };
    room.peers.set(peer.id, peer);
    room.touched = now();
    pushEvent(room, peer.id, 'join', { id: peer.id, name: peer.name });
    console.log('[room] join ' + code + ' by ' + peer.name + ' (' + room.peers.size + ')');
    return json(req, res, { ok: true, code, peerId: peer.id, secret: peer.secret, seed: room.seed, host: room.hostId === peer.id, room: roomPublic(room) });
  }

  if (p === '/api/sync') {
    const code = String(body.code || '').toUpperCase();
    const room = ROOMS.get(code);
    const peer = authPeer(room, body);
    if (!peer) return json(req, res, { ok: false, auth: false, msg: '身份已失效，请重新加入' }, 403);
    peer.last = now();
    peer.name = cleanName(body.name || peer.name);
    if (body.state) peer.state = sanitizeState(body.state);
    if (Array.isArray(body.events)) {
      for (const ev of body.events.slice(0, 8)) {
        const s = sanitizeEvent(peer, ev);
        if (s) pushEvent(room, peer.id, s.type, s.data);
      }
    }
    const cursor = Math.max(0, Math.min(room.seq, Number(body.cursor) || 0));
    const events = room.events.filter((e) => e.seq > cursor);
    room.touched = now();
    return json(req, res, {
      ok: true, seed: room.seed, host: room.hostId === peer.id,
      cursor: room.seq, room: roomPublic(room), events
    });
  }

  if (p === '/api/leave') {
    const room = ROOMS.get(String(body.code || '').toUpperCase());
    const peer = authPeer(room, body);
    if (!peer) return json(req, res, { ok: true });
    room.peers.delete(peer.id);
    pushEvent(room, peer.id, 'leave', { id: peer.id, name: peer.name });
    if (room.hostId === peer.id) {
      const rest = [...room.peers.keys()];
      room.hostId = rest[0] || null;
      if (room.hostId) pushEvent(room, peer.id, 'host', { id: room.hostId });
    }
    return json(req, res, { ok: true });
  }

  return json(req, res, { ok: false, msg: '未知接口' }, 404);
});

server.listen(PORT, () => {
  console.log('ASTRA·4D 联机服务已启动：http://localhost:' + PORT + '/');
  console.log('房间码 4 位，同端口托管游戏静态文件；Ctrl+C 结束。');
});
