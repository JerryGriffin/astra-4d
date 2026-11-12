/* v1.1.0 四维演算冒烟测试：CDP 驱动本地页面，断言真实 4D 场、世界线、
   地形起伏、图形化 UI 与零报错。
   用法： node tools/smoke-4d.mjs [url] [outDir] */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.argv[2] || 'http://127.0.0.1:8899/';
const OUT = process.argv[3] || 'tools/out';
const CHROME = process.env.CHROME_PATH ||
  `${process.env.HOME || process.env.USERPROFILE}/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe`;
const PORT = 9335;
mkdirSync(OUT, { recursive: true });

const profile = join(process.env.TEMP || '/tmp', 'astra-cdp-4d-' + Date.now());
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--window-size=1440,900', '--hide-scrollbars', '--mute-audio', 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const page = (await r.json()).find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error('CDP 未就绪');
}
const ws = new WebSocket(await getTarget());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
const logs = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    logs.push('[exception] ' + (d.exception?.description || d.text) + ' @' + (d.url || '') + ':' + (d.lineNumber ?? ''));
  }
  if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
    logs.push('[' + msg.params.type + '] ' + msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    logs.push('[log] ' + msg.params.entry.text + ' ' + (msg.params.entry.url || ''));
  }
});
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((r) => pending.set(id, r));
}
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { err: r.result.exceptionDetails.exception?.description || 'eval error' };
  return { value: r.result?.result?.value };
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  if (r.result?.data) writeFileSync(join(OUT, name), Buffer.from(r.result.data, 'base64'));
}

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(3200);
for (let i = 0; i < 3 && !(await evalJS('!!window.__astra')).value; i++) {
  await evalJS('location.reload()'); await sleep(3200);
}

// ---------- 1. 启动与伪视图移除 ----------
const boot = (await evalJS(`(() => ({
  ok: !!window.__astra, f4: !!window.A && !!A.F4, viz: !!window.A && !!A.viz,
  goals: !!window.A && !!A.goals, view: window.A && A.view.id,
  slice4: typeof (window.A && A.slice4), noiseS: typeof (window.A && A.noiseS),
  parseView: typeof (window.A && A.parseView), tris: window.A && A.renderer.info.render.triangles
}))()`)).value;
check('启动 + 新模块全部就绪', boot && boot.ok && boot.f4 && boot.viz && boot.goals, boot);
check('伪空间视图机制已移除', boot && boot.view === 'xyz' && boot.slice4 === 'undefined' &&
  boot.noiseS === 'undefined' && boot.parseView === 'undefined', boot);
await shot('01-title.png');

// ---------- 2. 真实 4D 场：等值面残差 ----------
const field = (await evalJS(`(() => {
  const pts = [[0,0,0],[17,-23,0.5],[-42,68,1],[5,5,3.5],[80,-100,6],[-9,11,5.8]];
  return pts.map(([x,z,w]) => A.F4.probe(x,z,w));
})()`)).value;
check('F=0 等值面求根收敛（残差 < 0.01）', field && field.every((q) => Math.abs(q.residual) < 0.01), field);
check('四个轴都进入场（4D 坐标有效）', field && field.every((q) => q.point4.length === 4 && q.point4.every(Number.isFinite)), field && field.map(q => q.point4));

// ---------- 3. 七行星插值 ----------
const blend = (await evalJS(`(() => {
  const at = (w) => { const P = A.F4.at(w); return { grav:P.grav, sun:P.sun, wind:P.wind, fog:P.fog[0], pal:P.pal.mid, name:P.shortName, rad:P.radiation }; };
  return { p0:at(0), p1:at(1), p6:at(6), half:at(0.5), src:[A.PLANETS[0].grav,A.PLANETS[1].grav,A.PLANETS[6].grav] };
})()`)).value;
check('锚点参数精确等于行星表', blend && Math.abs(blend.p0.grav - blend.src[0]) < 1e-6 &&
  Math.abs(blend.p1.grav - blend.src[1]) < 1e-6 && Math.abs(blend.p6.grav - blend.src[2]) < 1e-6, blend);
check('中间态为连续插值（重力/配色/辐射）', blend && blend.half.grav > Math.min(blend.src[0], blend.src[1]) &&
  blend.half.grav < Math.max(blend.src[0], blend.src[1]) && blend.p0.rad === 0 && blend.p6.rad > 0.9, blend);

// ---------- 4. w 连续 & 地形起伏 ----------
const terrain = (await evalJS(`(() => {
  const x = 12.5, z = -7.25, hs = [];
  for (let w = 0; w <= 6.0001; w += 0.02) hs.push(A.F4.surface(x, z, w, A.F4.at(w)));
  let maxJump = 0;
  for (let i=1;i<hs.length;i++) maxJump = Math.max(maxJump, Math.abs(hs[i]-hs[i-1]));
  let lo = 1e9, hi = -1e9;
  for (let j=0;j<26;j++) for (let i=0;i<26;i++) {
    const h = A.F4.surface((i-13)*10, (j-13)*10, 0, A.F4.at(0));
    if (h<lo) lo=h; if (h>hi) hi=h;
  }
  return { samples: hs.length, maxJump:+maxJump.toFixed(4), lo:+lo.toFixed(2), hi:+hi.toFixed(2), relief:+(hi-lo).toFixed(2) };
})()`)).value;
check('沿 w 连续（Δw=0.02 时高度跳变 < 1.5m）', terrain && terrain.maxJump < 1.5, terrain);
check('地形不是平原（260m 范围落差 > 15m）', terrain && terrain.relief > 15, terrain);

// ---------- 5. 进入游戏、网格与高度一致 ----------
await evalJS(`__astra.start()`);
await sleep(1800);
const started = (await evalJS(`(() => {
  const A = window.A, y = A.world.main.geometry.attributes.position.array;
  let lo=1e9, hi=-1e9;
  for (let i=1;i<y.length;i+=3) { if(y[i]<lo)lo=y[i]; if(y[i]>hi)hi=y[i]; }
  const d1 = Math.abs(A.world.height(A.player.x, A.player.z, A.player.w) - A.F4.surface(A.player.x, A.player.z, A.player.w, A.F4.cur));
  return { started:__astra.started, w:A.player.w, meshRelief:+(hi-lo).toFixed(2), heightDelta:+d1.toFixed(3), nodes:A.world.nodes.length };
})()`)).value;
check('开局成功 + 网格真实起伏', started && started.started && started.meshRelief > 8, started);
check('玩家高度与网格一致', started && started.heightDelta < 1.5, started);
await shot('02-game.png');

// ---------- 6. 图形化 UI ----------
await sleep(900);
const gfx = (await evalJS(`(() => {
  const painted = (id) => { const c=document.getElementById(id); if(!c) return -1;
    const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0;
    for(let i=3;i<d.length;i+=4) if(d[i]>0) n++; return n; };
  return { planets: document.querySelectorAll('#wl-planets [data-w]').length,
    cursor: !!document.getElementById('wl-cursor'), map: painted('viz-map'),
    profile: painted('viz-profile'), rings: painted('viz-rings'),
    fieldCanvas: !!document.getElementById('field-canvas') };
})()`)).value;
check('世界线轨道 7 颗行星 + 指针', gfx && gfx.planets === 7 && gfx.cursor, gfx);
check('小地图 / 剖面 / 环形表已绘制', gfx && gfx.map > 1000 && gfx.profile > 1000 && gfx.rings > 100, gfx);

// ---------- 7. 四维场面板 ----------
await evalJS(`A.ui.openPanel('field')`);
await sleep(900);
const fpanel = (await evalJS(`(() => {
  const c=document.getElementById('field-canvas');
  const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0;
  for(let i=3;i<d.length;i+=4) if(d[i]>0) n++;
  return { pixels:n, probe:(document.getElementById('field-probe').textContent||'').length,
    axis:(document.getElementById('field-axis').textContent||'').length, mode:A.viz.mode };
})()`)).value;
check('四维场切片与实时探针渲染', fpanel && fpanel.pixels > 1000 && fpanel.probe > 40 && fpanel.axis > 5, fpanel);
await shot('03-field-panel.png');
await evalJS(`A.viz.setMode('YW'); A.viz.drawField();`);
await sleep(400);
check('投影切换不重建世界', (await evalJS(`A.viz.mode === 'YW' && A.view.id === 'xyz'`)).value === true);
await shot('04-field-yw.png');
await evalJS(`A.viz.setMode('XZ'); A.ui.closePanels()`);

// ---------- 8. 平滑滑移（不瞬移） ----------
await evalJS(`__astra.travel(3)`);
await sleep(900);
const mid = (await evalJS(`({ w:+A.player.w.toFixed(3), target:A.player.wTarget, name:A.F4.cur.shortName })`)).value;
check('航线缓动：0 < w < 3，不瞬移', mid && mid.w > 0.05 && mid.w < 2.98, mid);
await evalJS(`__astra.setW(3)`);
await sleep(400);
const at3 = (await evalJS(`({ w:+A.player.w.toFixed(2), grav:A.F4.cur.grav, name:A.F4.cur.shortName, expect:A.PLANETS[3].name })`)).value;
check('w=3 落在第 4 颗行星锚点', at3 && at3.w === 3 && at3.name === at3.expect, at3);
await shot('05-worldline-3.png');

// ---------- 9. 玩法 ----------
const play = (await evalJS(`(() => {
  const an = A.world.nodes.filter(n=>n.band==='anomaly');
  const t0 = A.viz.time;
  A.world.scanPulse(t0);
  return { anomaly:an.length, bands:[...new Set(an.map(n=>+n.wPos.toFixed(2)))].sort((a,b)=>a-b),
    goals:A.goals.list().length, scan:A.world.scanning > t0, items:!!A.item('anomaly').bytes };
})()`)).value;
check('相位结晶只长在 6 个过渡带', play && play.anomaly === 12 && play.bands.join(',') === '0.5,1.5,2.5,3.5,4.5,5.5', play);
check('里程碑 13 项 + 扫描生效 + 结晶可研究', play && play.goals === 13 && play.scan && play.items && play.items > 0, play);
await evalJS(`A.ui.openPanel('goals')`);
await sleep(500);
check('里程碑面板已渲染', (await evalJS(`(document.getElementById('goals-list').textContent||'').length > 100`)).value === true);
await shot('06-goals.png');
await evalJS(`A.ui.closePanels()`);

// ---------- 10. 存档 v3 ----------
await evalJS(`A.writeSave(true)`);
const save = (await evalJS(`(() => { const s=JSON.parse(localStorage.getItem('astra4d.save.v3'));
  return { v:s.v, w:+s.w.toFixed(2), edits:Array.isArray(s.world.edits), modules:Array.isArray(s.world.modules), goals:!!s.goals }; })()`)).value;
check('存档 v3 单一连续世界', save && save.v === 3 && save.edits && save.modules && save.goals, save);

// ---------- 11. 报错 ----------
const realLogs = logs.filter((l) => !/\[warning\].*(WebGL|SwiftShader|deprecated|GPU stall)/i.test(l));
check('控制台零报错', realLogs.length === 0, realLogs.slice(0, 8));

// ---------- 12. 移动端（390×844 + touch） ----------
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await evalJS('location.reload()');
await sleep(3400);
await evalJS(`__astra.start()`);
await sleep(1600);
const mob = (await evalJS(`(() => {
  const R = (id) => { const e=document.getElementById(id); if(!e) return null;
    const b=e.getBoundingClientRect(); return {x:Math.round(b.left),y:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height)}; };
  const c=document.getElementById('viz-map'); const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  let n=0; for(let i=3;i<d.length;i+=4) if(d[i]>0) n++;
  return { touch:document.body.classList.contains('touch'), planets:document.querySelectorAll('#wl-planets [data-w]').length,
    wl:R('worldline'), map:R('viz-map'), joy:R('joy'),
    nav:(()=>{ const b=document.querySelector('.hud-tr').getBoundingClientRect();
      return {x:Math.round(b.left),y:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height)}; })(),
    vitalsTop:Math.round(document.querySelector('.vitals').getBoundingClientRect().top),
    vw:innerWidth, vh:innerHeight, painted:n };
})()`)).value;
check('移动端：触摸模式 + 世界线 7 星球 + 小地图且不溢出',
  mob && mob.touch && mob.planets === 7 && mob.painted > 1000 &&
  mob.wl.x >= 0 && mob.wl.x + mob.wl.w <= mob.vw + 2 && mob.wl.y + mob.wl.h < mob.vh, mob);
check('移动端：顶部导航单行且不压住生命面板',
  mob && mob.nav && mob.nav.h < 54 && mob.nav.y + mob.nav.h <= mob.vitalsTop + 3,
  mob && { nav: mob.nav, vitalsTop: mob.vitalsTop });
await shot('07-mobile.png');

const pass = checks.filter((c) => c.ok).length;
const report = { url: URL, at: new Date().toISOString(), pass, total: checks.length, checks, logs: realLogs };
writeFileSync(join(OUT, 'smoke-4d-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`\n== ${pass}/${checks.length} PASS ==`);
ws.close();
chrome.kill();
process.exit(pass === checks.length ? 0 : 1);
