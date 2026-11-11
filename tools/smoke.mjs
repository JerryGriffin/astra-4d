/* 开发用冒烟测试：用本地 Chromium 的 CDP 驱动页面，收集报错并截图。
   用法： node tools/smoke.mjs [url] [outDir] */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.argv[2] || 'http://127.0.0.1:8899/';
const OUT = process.argv[3] || 'tools/out';
const CHROME = process.env.CHROME_PATH ||
  `${process.env.HOME || process.env.USERPROFILE}/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe`;
const PORT = 9333;
mkdirSync(OUT, { recursive: true });

const profile = join(process.env.TEMP || '/tmp', 'astra-cdp-' + Date.now());
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--window-size=1440,900', '--hide-scrollbars', '--mute-audio',
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page');
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
  if (msg.method === 'Runtime.consoleAPICalled') {
    const t = msg.params.type;
    if (t === 'error' || t === 'warning') {
      logs.push('[' + t + '] ' + msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
    }
  }
  if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry;
    if (e.level === 'error') logs.push('[log] ' + e.text + ' ' + (e.url || ''));
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

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL }); await sleep(3000);
for (let i = 0; i < 3 && !(await evalJS('!!window.__astra')).value; i++) {
  await evalJS('location.reload()'); await sleep(3500);
}

const report = {};
report.boot = await evalJS(`({ ok: !!window.__astra, modules: __astra.build.modules.length, planet: __astra.world.planet.id, tris: A.renderer.info.render.triangles })`);
await shot('01-title.png');

// 进入游戏
await evalJS(`__astra.start()`);
await sleep(1600);
report.started = await evalJS(`({ started: __astra.started, x: +__astra.player.x.toFixed(2), y: +__astra.player.y.toFixed(2), o2: Math.round(__astra.player.oxygen), inv: __astra.player.inv })`);
await shot('02-game-desktop.png');

// 挖土：模拟按住行动 1.2 秒
await evalJS(`(__astra.input.action = true, 1)`);
await sleep(1200);
await evalJS(`(__astra.input.action = false, 1)`);
await sleep(400);
report.dig = await evalJS(`({ edits: __astra.world.state.edits.size, soil: +__astra.player.soil.toFixed(2), tool: __astra.player.toolMode })`);
await shot('03-after-dig.png');

// 采集：传送到最近的已对齐矿旁边（先对齐相位）
report.harvestSetup = await evalJS(`(() => {
  const A = window.A, r = A.world.nodes.find(n => n.exposed && !n.harvested);
  if (!r) return 'no node';
  A.player.x = r.x + 1.2; A.player.z = r.z + 1.2; A.player.w = r.wPos;
  A.player.y = A.world.height(A.player.x, A.player.z, A.player.w) + 0.4;
  return { type: r.type, dist: 1.7, w: r.wPos };
})()`);
await sleep(500);
await evalJS(`(__astra.input.action = true, 1)`);
await sleep(9000);
await evalJS(`(__astra.input.action = false, 1)`);
report.harvest = await evalJS(`({ inv: __astra.player.inv, nodes: __astra.world.nodes.filter(n=>n.harvested).length })`);

// 放置模块：平台 + 研究舱 + 太阳能板
report.build = await evalJS(`(() => {
  const A = window.A;
  A.player.inv.compound = 20; A.player.inv.resin = 20; A.player.inv.copper = 5; A.player.inv.glass = 5;
  const px = A.player.x, pz = A.player.z;
  const a = A.build.add('platform', px + 3, pz, 0);
  const b = A.build.add('research', px + 5, pz + 1, 0);
  const c = A.build.add('solar_m', px + 3, pz + 3, 0);
  A.build.add('printer_s', px + 1, pz + 4, 0);
  return { modules: A.build.modules.map(m=>m.type), nets: (A.build.nets||[]).length };
})()`);
await sleep(1200);
report.power = await evalJS(`(() => {
  const A = window.A;
  const r = A.build.modules.find(m=>m.type==='research');
  return { powered: r.powered, eff: +r.eff.toFixed(2), env: { sun: +A.env.sun.toFixed(2), wind: +A.env.wind.toFixed(2) } };
})()`);
await shot('04-base.png');

// 面板
await evalJS(`A.ui.openPanel('build')`);
await sleep(400);
await shot('05-panel-build.png');
await evalJS(`A.ui.openPanel('backpack')`);
await sleep(300);
await shot('06-panel-backpack.png');
await evalJS(`A.ui.openPanel('research')`);
await sleep(300);
await shot('07-panel-research.png');
await evalJS(`A.ui.closePanels()`);

// 洪水：制造与研究
report.jobs = await evalJS(`(async () => {
  const A = window.A;
  const sm = A.build.add('smelter', 4.5, 3.5, 0);
  await new Promise(r => setTimeout(r, 500));
  A.player.inv.laterite = 3;
  const started = A.build.startJob(sm, { total: 4, label: '熔炼 红土', out: 'aluminum' });
  A.player.takeItem('laterite', 1);
  return { job: !!sm.job, started, powered: sm.powered, laterite: A.player.inv.laterite };
})()`);
await sleep(16000);
report.smelted = await evalJS(`({ aluminum: __astra.player.inv.aluminum || 0 })`);

// 载具
report.vehicle = await evalJS(`(() => {
  const A = window.A;
  const r = A.build.add('rover', A.player.x - 3, A.player.z, 0);
  const near = A.build.nearest(A.player.x, A.player.z, 5.0);
  const ok = A.player.tryMount();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  return { added: !!r, near: near ? near.type : null, ok, mount: A.player.mount ? A.player.mount.type : null };
})()`);
await sleep(2500);
await evalJS(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))`);
report.drive = await evalJS(`({ speed: +(__astra.player.mount?.speed||0).toFixed(2), x: +__astra.player.x.toFixed(1) })`);
await evalJS(`__astra.player.dismount()`);
await shot('05b-driving.png');

// 星图 / 换行星
await evalJS(`__astra.travel(3)`);
await sleep(2600);
report.travel = await evalJS(`({ planet: __astra.world.planet.id, y: +__astra.player.y.toFixed(2), nodes: __astra.world.nodes.length, mods: __astra.build.modules.length })`);
await shot('08-vesania.png');

// 存档
report.save = await evalJS(`(() => { A.writeSave(true); const raw = localStorage.getItem('astra4d.save.v2'); return raw ? { bytes: raw.length, pi: JSON.parse(raw).pi } : null; })()`);

// 移动端视口
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__forceTouch = 1;` });
await send('Page.navigate', { url: URL });
await sleep(3200);
for (let i = 0; i < 3 && !(await evalJS('!!window.__astra')).value; i++) {
  await evalJS('location.reload()'); await sleep(3500);
}
report.mobile = await evalJS(`({ mobile: A.mobile, touch: document.body.classList.contains('touch'), w: innerWidth, h: innerHeight })`);
await shot('09-mobile-title.png');
await evalJS(`__astra.start()`);
await sleep(1800);
await shot('10-mobile-game.png');
await evalJS(`A.ui.openPanel('build')`);
await sleep(400);
await shot('11-mobile-build.png');
await evalJS(`A.ui.closePanels(); A.ui.openPanel('backpack')`);
await sleep(300);
await shot('12-mobile-backpack.png');

report.logs = logs;
console.log(JSON.stringify(report, null, 2));
ws.close();
chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);
