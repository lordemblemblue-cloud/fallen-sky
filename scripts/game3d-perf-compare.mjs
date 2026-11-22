#!/usr/bin/env node
// Prints Game 3D draw-cost probe results (scripts/game3d-perf-receiver.mjs writes them) as tables.
//
//   node scripts/game3d-perf-compare.mjs <run.json>                     one run: every view, worst per area, toggles
//   node scripts/game3d-perf-compare.mjs <before.json> <after.json>      before/after, matched by viewpoint id
//   node scripts/game3d-perf-compare.mjs a.json,b.json c.json           several files form one side (later files win)
//   options: --md (Markdown tables), --budget browser|desktop|mobile (default browser)
//
// A directory may stand for every .json file in it. Numbers are printed as the probe recorded them: draw calls and
// triangles are the renderer's counters for one frame (player hidden); frame = draw start to GPU finished, frames
// drawn one at a time; gpu = timestamp queries (WebGPU passes / WebGL timer), when the browser offered them.
import fs from 'node:fs';
import path from 'node:path';
import { GAME3D_AREA_BUDGETS } from '../src/components/game3d/performance/Game3DAreaBudget.mjs';
import { PERF_AREAS } from '../src/components/game3d/performance/Game3DPerfViewpoints.mjs';

const argv = process.argv.slice(2);
const md = argv.includes('--md');
const budgetIndex = argv.indexOf('--budget');
const platform = budgetIndex >= 0 ? argv[budgetIndex + 1] : 'browser';
const budget = GAME3D_AREA_BUDGETS[platform] || GAME3D_AREA_BUDGETS.browser;
const sides = argv.filter((a, i) => !a.startsWith('--') && !(budgetIndex >= 0 && i === budgetIndex + 1));
if (!sides.length || sides.length > 2) {
  console.error('usage: node scripts/game3d-perf-compare.mjs <run.json[,more.json]> [<after.json[,more.json]>] [--md] [--budget browser]');
  process.exit(2);
}

function files(spec) {
  return spec.split(',').flatMap((p) => {
    const full = path.resolve(p);
    if (fs.statSync(full).isDirectory()) return fs.readdirSync(full).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(full, f));
    return [full];
  });
}
function load(spec) {
  const runs = files(spec).map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(f, 'utf8')) }));
  const views = new Map(); const toggles = new Map();
  for (const run of runs) {
    for (const v of run.views || []) views.set(v.id, { ...v, backend: run.env?.backend, label: run.label });
    for (const t of run.toggles || []) toggles.set(t.view, { ...t, backend: run.env?.backend });
  }
  return { spec, runs, views, toggles };
}

const n = (v) => (Number.isFinite(v) ? v : null);
const fmt = (v, d = 1) => (n(v) === null ? '-' : Number(v).toFixed(d));
const int = (v) => (n(v) === null ? '-' : Math.round(v).toLocaleString('en-US'));
const mtri = (v) => (n(v) === null ? '-' : (v / 1e6).toFixed(2) + ' M');
const pct = (v) => (n(v) === null ? '-' : Math.round(v * 100) + '%');
const signed = (v, f = int) => (n(v) === null ? '-' : (v > 0 ? '+' : v < 0 ? '−' : '±') + f(Math.abs(v)));
const areaOrder = (a, b) => PERF_AREAS.indexOf(a.area) - PERF_AREAS.indexOf(b.area);

function table(headers, rows) {
  if (md) {
    console.log('| ' + headers.join(' | ') + ' |');
    console.log('|' + headers.map((h, i) => (i ? '---:' : '---')).join('|') + '|');
    for (const r of rows) console.log('| ' + r.join(' | ') + ' |');
    console.log('');
    return;
  }
  const w = headers.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
  const line = (r) => r.map((c, i) => (i ? String(c).padStart(w[i]) : String(c).padEnd(w[i]))).join('  ');
  console.log(line(headers));
  console.log(w.map((x) => '-'.repeat(x)).join('  '));
  for (const r of rows) console.log(line(r));
  console.log('');
}
const heading = (text) => console.log(md ? `#### ${text}\n` : `\n== ${text} ==`);

function describeRuns(side) {
  for (const run of side.runs) {
    const e = run.env || {};
    console.log(`${md ? '- ' : ''}${path.basename(run.file)}: "${run.label}" ${e.backend || '?'}, canvas ${e.canvas?.width}x${e.canvas?.height} @ pixel ratio ${e.pixelRatio}, ink level ${e.inkLevel}, ` +
      `governor ${run.governor?.pinnedTo || '?'}, page ${e.pageVisible}${e.rafPump ? ' (rAF pump)' : ''}, rAF median ${run.rafIntervalMs?.medianMs ?? '-'} ms, ` +
      `commit ${run.received?.commit || '?'}${run.received?.dirty ? ' (+uncommitted)' : ''}, ${run.views?.length || 0} views, ${run.errors?.length || 0} errors`);
  }
  console.log('');
}

function single(side) {
  heading(`Every view (${platform} budget: ${budget.drawCalls} calls, ${budget.triangles / 1e6} M triangles; scenery share ${budget.sceneryDrawCalls} / ${budget.sceneryTriangles / 1e6} M)`);
  const views = [...side.views.values()].sort(areaOrder);
  table(['view', 'calls', 'triangles', 'cpu submit', 'gpu med', 'gpu p95', 'game loop', 'wall med', 'wall p95', 'calls/budget', 'tris/budget', 'pipelines +'],
    views.map((v) => [v.id, int(v.counts?.drawCalls), mtri(v.counts?.triangles), fmt(v.cpuSubmit?.medianMs),
      fmt(v.gpu?.medianMs), fmt(v.gpu?.p95Ms), fmt(v.gameTicks?.medianMs), fmt(v.frame?.medianMs), fmt(v.frame?.p95Ms), pct((v.counts?.drawCalls ?? 0) / budget.drawCalls), pct((v.counts?.triangles ?? 0) / budget.triangles),
      int((v.pipelines?.after ?? 0) - (v.pipelines?.before ?? 0))]));
  heading('Worst view per area and headroom to the scenery share of the budget');
  const rows = [];
  for (const area of PERF_AREAS) {
    const list = views.filter((v) => v.area === area && v.counts);
    if (!list.length) continue;
    const byCalls = list.reduce((a, b) => ((b.counts.drawCalls > a.counts.drawCalls) ? b : a));
    const byTris = list.reduce((a, b) => ((b.counts.triangles > a.counts.triangles) ? b : a));
    const byFrame = list.reduce((a, b) => (((b.gpu?.medianMs ?? b.frame?.medianMs ?? 0) > (a.gpu?.medianMs ?? a.frame?.medianMs ?? 0)) ? b : a));
    rows.push([area, `${int(byCalls.counts.drawCalls)} (${byCalls.id.split('.').slice(1).join('.')})`, int(budget.sceneryDrawCalls - byCalls.counts.drawCalls),
      `${mtri(byTris.counts.triangles)} (${byTris.id.split('.').slice(1).join('.')})`, mtri(budget.sceneryTriangles - byTris.counts.triangles),
      `${fmt(byFrame.frame?.medianMs)} / ${fmt(byFrame.gpu?.medianMs)} (${byFrame.id.split('.').slice(1).join('.')})`]);
  }
  table(['area', 'most calls', 'calls left', 'most triangles', 'triangles left', 'slowest frame / gpu ms'], rows);
  for (const t of [...side.toggles.values()].sort(areaOrder)) {
    heading(`Groups switched off one at a time at ${t.view}`);
    table(['group', 'meshes', 'calls', 'Δ calls', 'triangles', 'Δ triangles', 'frame med', 'Δ frame', 'gpu med', 'Δ gpu'],
      t.rows.map((r) => [r.id, r.meshesHidden ?? r.lights ?? '', int(r.counts?.drawCalls), r.delta ? signed(r.delta.drawCalls) : '', mtri(r.counts?.triangles),
        r.delta ? signed(r.delta.triangles, mtri) : '', fmt(r.frame?.medianMs), r.delta ? signed(r.delta.frameMedianMs, (x) => fmt(x)) : '',
        fmt(r.gpu?.medianMs), r.delta ? signed(r.delta.gpuMedianMs, (x) => fmt(x)) : '']));
  }
}

function compare(a, b) {
  heading(`Before ${a.spec}  →  after ${b.spec}`);
  const ids = [...new Set([...a.views.keys(), ...b.views.keys()])].sort((x, y) => PERF_AREAS.indexOf(x.split('.')[0]) - PERF_AREAS.indexOf(y.split('.')[0]));
  const rel = (x, y) => (n(x) && n(y) ? signed(((y - x) / x) * 100, (v) => v.toFixed(0) + '%') : '-');
  table(['view', 'calls', 'Δ', 'triangles', 'Δ', 'cpu submit ms', 'Δ', 'gpu ms', 'Δ', 'game loop ms', 'Δ', 'wall ms', 'Δ'], ids.map((id) => {
    const x = a.views.get(id); const y = b.views.get(id);
    return [id, `${int(x?.counts?.drawCalls)} → ${int(y?.counts?.drawCalls)}`, signed((y?.counts?.drawCalls ?? NaN) - (x?.counts?.drawCalls ?? NaN)),
      `${mtri(x?.counts?.triangles)} → ${mtri(y?.counts?.triangles)}`, signed((y?.counts?.triangles ?? NaN) - (x?.counts?.triangles ?? NaN), mtri),
      `${fmt(x?.cpuSubmit?.medianMs)} → ${fmt(y?.cpuSubmit?.medianMs)}`, rel(x?.cpuSubmit?.medianMs, y?.cpuSubmit?.medianMs),
      `${fmt(x?.gpu?.medianMs)} → ${fmt(y?.gpu?.medianMs)}`, rel(x?.gpu?.medianMs, y?.gpu?.medianMs),
      `${fmt(x?.gameTicks?.medianMs)} → ${fmt(y?.gameTicks?.medianMs)}`, rel(x?.gameTicks?.medianMs, y?.gameTicks?.medianMs),
      `${fmt(x?.frame?.medianMs)} → ${fmt(y?.frame?.medianMs)}`, rel(x?.frame?.medianMs, y?.frame?.medianMs)];
  }));
}

const left = load(sides[0]);
describeRuns(left);
if (sides.length === 1) single(left);
else { const right = load(sides[1]); describeRuns(right); compare(left, right); }
