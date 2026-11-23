#!/usr/bin/env node
// Receives Game 3D draw-cost probe results (src/components/game3d/performance/Game3DPerfProbe.mjs) and writes each
// one to a JSON file. Local only: listens on 127.0.0.1.
//
//   node scripts/game3d-perf-receiver.mjs [--port 5395] [--out docs/game3d/three-empires/research/perf-runs]
//
// Then open the game on the dev server with ?perfProbe=1&perfPost=http://127.0.0.1:5395/ (see
// docs/game3d/three-empires/research/PERF_BASELINE_WEBGPU.md). Each POST becomes <out>/<date>-<label>.json, with the
// git commit of this checkout added under `received`.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const port = Number(opt('port', 5395));
const out = path.resolve(opt('out', 'docs/game3d/three-empires/research/perf-runs'));
const once = args.includes('--once');
fs.mkdirSync(out, { recursive: true });

function gitState() {
  let commit = null; let branch = null; let dirty = null;
try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
try { branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
try { dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim().length > 0; } catch { /* ignore */ }
  return { commit, branch, dirty };
}

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  if (req.method !== 'POST') { res.writeHead(200, { ...cors, 'content-type': 'text/plain' }); res.end('game3d perf receiver: POST a probe result here\n'); return; }
  const chunks = [];
  let size = 0;
  req.on('data', (c) => { size += c.length; if (size > 20 * 1024 * 1024) req.destroy(); else chunks.push(c); });
  req.on('end', () => {
    let result;
    try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch (error) { res.writeHead(400, cors); res.end(`not JSON: ${error.message}`); return; }
    if (!String(result?.schema || '').startsWith('game3d-perf-probe/')) { res.writeHead(400, cors); res.end('not a game3d perf probe result'); return; }
    result.received = { at: new Date().toISOString(), ...gitState() };
    const label = String(result.label || 'run').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 60);
    const stamp = (result.startedAt || new Date().toISOString()).replace(/[:]/g, '').replace(/\.\d+Z$/, 'Z');
    const file = path.join(out, `${stamp}-${label}.json`);
    fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
    console.log(`saved ${file} (${result.views?.length ?? 0} views, ${result.toggles?.length ?? 0} toggle sweeps, ${result.errors?.length ?? 0} errors)`);
    res.writeHead(200, { ...cors, 'content-type': 'text/plain' });
    res.end(file);
    if (once) setTimeout(() => process.exit(0), 100);
  });
});
server.listen(port, '127.0.0.1', () => console.log(`game3d perf receiver on http://127.0.0.1:${port}/ -> ${out}`));
