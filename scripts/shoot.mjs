/**
 * Headless screenshots for the isolated demo harness.
 *
 * The demo loads the real built client.js with React UMD and a fake native
 * agentTeam projection. These are real browser renders of the panel component,
 * not production DSH desktop screenshots.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, 'docs', 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

const chromeCandidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const chrome = chromeCandidates.find((item) => fs.existsSync(item));
if (!chrome) throw new Error('Chrome/Edge not found');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};
const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end('forbidden'); return; }
    if (url.pathname === '/') file = path.join(root, 'demo', 'index.html');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { response.writeHead(404); response.end('not found'); return; }
    response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(response);
  } catch (error) {
    response.writeHead(500); response.end(String(error && error.message ? error.message : error));
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const shots = [
  ['panel-overview.png', 'overview', 1440, 940],
  ['panel-bundled.png', 'bundled', 1440, 940],
  ['panel-expanded.png', 'expanded', 1440, 940],
  ['panel-new-task.png', 'new-task', 1440, 940],
  ['panel-spawn.png', 'spawn', 1440, 940],
  ['panel-member.png', 'member', 1440, 940],
];

function runShot(name, query, width, height) {
  return new Promise((resolve, reject) => {
    const out = path.join(outDir, name);
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'atp-chrome-'));
    const url = 'http://127.0.0.1:' + port + '/demo/index.html?state=' + encodeURIComponent(query) + '&t=' + Date.now();
    const args = [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--window-size=' + width + ',' + height,
      '--virtual-time-budget=4000', '--user-data-dir=' + profile,
      '--screenshot=' + out, url,
    ];
    const child = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('exit', (code) => {
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
      if (code === 0 && fs.existsSync(out)) resolve(out);
      else reject(new Error('chrome exit ' + code + ' for ' + name + ': ' + stderr.slice(-500)));
    });
  });
}

try {
  for (const [name, query, width, height] of shots) {
    const file = await runShot(name, query, width, height);
    console.log('shot', path.relative(root, file), fs.statSync(file).size, 'bytes');
  }
} finally {
  server.close();
}
