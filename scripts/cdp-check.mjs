/**
 * Real-browser interaction check for the isolated demo harness.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const chromeCandidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const chrome = chromeCandidates.find((item) => fs.existsSync(item));
if (!chrome) throw new Error('Chrome/Edge not found');

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end('forbidden'); return; }
    if (url.pathname === '/') file = path.join(root, 'demo', 'index.html');
    if (!fs.existsSync(file)) { response.writeHead(404); response.end('not found'); return; }
    response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(response);
  } catch (error) { response.writeHead(500); response.end(String(error)); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'atp-cdp-'));
const debugPort = 9337;
const pageUrl = 'http://127.0.0.1:' + port + '/demo/index.html?state=bundled';
const child = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--remote-debugging-port=' + debugPort, '--user-data-dir=' + profile,
  '--window-size=1440,940', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeErr = '';
child.stderr.on('data', (chunk) => { chromeErr += String(chunk); });

async function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function getTargets() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:' + debugPort + '/json/list');
      if (response.ok) return await response.json();
    } catch { /* not ready */ }
    await sleep(100);
  }
  throw new Error('Chrome debug endpoint did not start: ' + chromeErr.slice(-500));
}

let ws;
let nextId = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error('page eval failed: ' + JSON.stringify(result.exceptionDetails));
  return result.result ? result.result.value : undefined;
}

let result = { ok: false, checks: [], screenshot: null };
try {
  const targets = await getTargets();
  const page = targets.find((item) => item.type === 'page') || targets[0];
  if (!page) throw new Error('no page target');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: pageUrl });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await sleep(100);
    const ready = await evaluate('document.body.dataset.harnessReady === "1"');
    if (ready === true) break;
  }
  const mounted = await evaluate('Boolean(document.querySelector("[data-agent-team-panel]"))');
  result.checks.push({ name: 'panel mounts', ok: mounted === true });
  const before = await evaluate('(() => { const all = Array.from(document.querySelectorAll("[data-atp-node]")); const node = all.find(function (n) { return n.getAttribute("data-atp-node") === "task:task-2"; }); const rect = node ? node.getBoundingClientRect() : null; return { left: node ? node.style.left : null, top: node ? node.style.top : null, pathCount: document.querySelectorAll("path").length, roles: Array.from(document.querySelectorAll("path")).map(function (p) { return p.getAttribute("data-edge-role"); }), paths: Array.from(document.querySelectorAll("path")).filter(function (p) { return p.getAttribute("data-edge-role") === "branch"; }).map(function (p) { return p.getAttribute("d"); }), x: rect ? rect.left + rect.width / 2 : null, y: rect ? rect.top + rect.height / 2 : null }; })()');
  result.debug = await evaluate('(() => ({ state: window.__DEMO__ && window.__DEMO__.fixture ? window.__DEMO__.fixture.state : null, nodes: Array.from(document.querySelectorAll("[data-atp-node]")).map(function (n) { return { id: n.getAttribute("data-atp-node"), left: n.style.left, top: n.style.top, text: (n.innerText || "").slice(0, 40) }; }), paths: Array.from(document.querySelectorAll("path")).map(function (p) { return { role: p.getAttribute("data-edge-role"), bundle: p.getAttribute("data-edge-bundle"), d: p.getAttribute("d"), width: p.style.strokeWidth }; }) }))()');
  if (!before.x) throw new Error('task-2 header not found');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: before.x, y: before.y, button: 'left', clickCount: 1 });
  for (let step = 1; step <= 6; step += 1) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: before.x + step * 20, y: before.y + step * 8, button: 'left', buttons: 1 });
    await sleep(30);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: before.x + 120, y: before.y + 48, button: 'left', clickCount: 1 });
  await sleep(300);
  const after = await evaluate('(() => { const all = Array.from(document.querySelectorAll("[data-atp-node]")); const node = all.find(function (n) { return n.getAttribute("data-atp-node") === "task:task-2"; }); return { left: node ? node.style.left : null, top: node ? node.style.top : null, paths: Array.from(document.querySelectorAll("path")).filter(function (p) { return p.getAttribute("data-edge-role") === "branch"; }).map(function (p) { return p.getAttribute("d"); }) }; })()');
  result.checks.push({ name: 'drag moves node', ok: after.left !== before.left || after.top !== before.top, before: { left: before.left, top: before.top }, after: { left: after.left, top: after.top } });
  const pathChanged = Array.isArray(after.paths) && Array.isArray(before.paths) && after.paths.length > 0 && after.paths.some((value, index) => value !== before.paths[index]);
  result.checks.push({ name: 'blockedBy branch follows drag', ok: pathChanged, pathCount: before.pathCount, roles: before.roles, before: before.paths, after: after.paths });

  const live = await evaluate('(() => { const demo = window.__DEMO__; if (!demo || !demo.sessions || !demo.fixture) return { ok: false, reason: "demo fixture not exposed" }; const fixture = JSON.parse(JSON.stringify(demo.fixture)); fixture.view.tasks[1].subject = "实时推送后的任务标题"; demo.sessions.update(fixture); return { ok: true }; })()');
  await sleep(300);
  const liveText = await evaluate('document.body.innerText.includes("实时推送后的任务标题")');
  const continuity = await evaluate('(() => { const all = Array.from(document.querySelectorAll("path")); const trunk = all.find(function (p) { return p.getAttribute("data-edge-role") === "trunk"; }); const branches = all.filter(function (p) { return p.getAttribute("data-edge-role") === "branch"; }); if (!trunk || branches.length === 0) return { ok: false, reason: "no bundle" }; const d = trunk.getAttribute("d"); const end = d.slice(d.lastIndexOf("L ") + 2); const starts = branches.map(function (p) {const value = p.getAttribute("d"); return value.slice(value.indexOf("M ") + 2, value.indexOf(" L "));}); return { ok: starts.every(function (start) { return start === end; }), end: end, starts: starts }; })()');
  result.checks.push({ name: 'trunk end equals every branch start', ok: continuity.ok === true, continuity });
  result.checks.push({ name: 'projection push updates DOM without reload', ok: live.ok === true && liveText === true, live });

  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  const out = path.join(root, 'docs', 'screenshots', 'panel-dragged-live.png');
  fs.writeFileSync(out, Buffer.from(screenshot.data, 'base64'));
  result.screenshot = path.relative(root, out);
  result.ok = result.checks.every((item) => item.ok);
} catch (error) {
  result.error = String(error && error.stack ? error.stack : error);
} finally {
  try { if (ws) { ws.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } } catch { /* ignore */ }
  try { child.kill(); } catch { /* ignore */ }
  try { server.close(); } catch { /* ignore */ }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
}
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
