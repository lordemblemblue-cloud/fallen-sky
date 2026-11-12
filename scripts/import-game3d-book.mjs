#!/usr/bin/env node
// Reproducible, source-faithful migration of Game 3D / Book (Adam and Eve).
// Run on a clean gitsync-pro migration branch: node scripts/import-game3d-book.mjs --apply
// Requires an authenticated GitHub CLI for the private Atom X Eve source repo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const target = process.cwd();
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const index = args.indexOf('--source-dir');
const local = index === -1 ? null : args[index + 1];
const sourceRepo = 'marcusflow1-arch/atom-x-eve-os';
const sourceCommitPin = 'c073fc3be90b7013b1b5dae2da7f802b902675e2';
const protectedPaths = new Set([
  'src/server.js','src/start.js','src/router.jsx','src/routeTree.gen.ts',
  'src/api/base44Client.js','src/lib/AuthContext.jsx',
  'src/lib/auth-middleware.js','src/lib/error-capture.js','src/lib/error-capture.server.js',
  'src/routes/__root.jsx','src/routes/_authed.jsx','src/routes/_authed/index.jsx',
  'src/lib/query-client.js','src/lib/server-fns.js',
  'base44/entities/User.jsonc','package.json','package-lock.json',
  'vite.config.js','wrangler.jsonc'
]);
if (!fs.existsSync(path.join(target,'AGENTS.md')) ||
    !fs.readFileSync(path.join(target,'AGENTS.md'),'utf8').includes('TanStack Start')) {
  throw Error('This script only operates inside the gitsync-pro TanStack Start repository.');
}
if (apply && execFileSync('git',['status','--porcelain'],{cwd:target,encoding:'utf8'}).trim())
  throw Error('Commit or stash local changes before applying the migration.');

let tmp = null;
let source = local ? path.resolve(local) : null;
try {
  if (!source) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(),'game3d-book-'));
    source = path.join(tmp,'source');
    execFileSync('gh',['repo','clone',sourceRepo,source,'--','--depth=1'],{stdio:'inherit'});
    // A moving source main can silently change the migration inventory.
    execFileSync('git',['fetch','--depth=1','origin',sourceCommitPin],{cwd:source,stdio:'inherit'});
    execFileSync('git',['checkout','--detach',sourceCommitPin],{cwd:source,stdio:'inherit'});
  }
  const exists = p => fs.existsSync(path.join(source,p));
  if (!exists('src/pages/GameView.jsx') || !exists('server/game3d'))
    throw Error('Invalid source: expected original GameView and server/game3d.');
  const sourceCommit = execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim();
  if (sourceCommit !== sourceCommitPin)
    throw Error('Source checkout must be pinned to '+sourceCommitPin+'; found '+sourceCommit);
  const files = new Set();
  const omitted = new Set();
  const add = p => {
    p = p.replaceAll('\\','/');
    if (p.startsWith('../') || path.isAbsolute(p) || protectedPaths.has(p)) return;
    if (exists(p) && fs.statSync(path.join(source,p)).isFile()) files.add(p);
  };
  const directory = d => {
    if (!exists(d)) return;
    const stack = [d];
    while (stack.length) {
      const parent = stack.pop();
      for (const entry of fs.readdirSync(path.join(source,parent),{withFileTypes:true})) {
        if (entry.name==='.git' || entry.name==='node_modules' || entry.name.startsWith('.env')) continue;
        const child = path.posix.join(parent,entry.name);
        if (entry.isDirectory()) stack.push(child);
        else if (entry.isFile()) add(child);
      }
    }
  };
  add('src/pages/GameView.jsx');
  for (const p of ['src/components/game3d','server/game3d','public/game3d',
      'public/models/characters','public/getsuga']) directory(p);

  // Import transitive React/Three.js modules. Keep unrelated app pages excluded.
  const ext = ['','.jsx','.js','.mjs','.cjs','.tsx','.ts','.json','.css','.svg'];
  const find = (parent, specifier) => {
    let base;
    if (specifier.startsWith('@/')) base = 'src/' + specifier.slice(2);
    else if (specifier.startsWith('./') || specifier.startsWith('../'))
      base = path.posix.normalize(path.posix.join(path.posix.dirname(parent),specifier));
    else return null;
    for (const e of ext) {
      for (const p of [base+e,base+'/index'+e]) {
        if (exists(p) && fs.statSync(path.join(source,p)).isFile()) return p;
      }
    }
    return null;
  };
  const regex = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g;
  const seen = new Set();
  const queue = [...files].filter(p=>p.startsWith('src/'));
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(jsx?|mjs|cjs|tsx?|css)$/.test(file)) continue;
    const code = fs.readFileSync(path.join(source,file),'utf8');
    for (const m of code.matchAll(regex)) {
      const p = find(file,m[1]);
      if (!p) continue;
      if (/^src\/pages\/(?!GameView\.jsx)/.test(p) ||
          ['src/App.jsx','src/main.jsx','src/Layout.jsx'].includes(p)) {
        omitted.add(file+' -> '+p);
        continue;
      }
      if (!files.has(p)) add(p);
      if (!seen.has(p)) queue.push(p);
    }
  }

  // Keep domain backend code and schemas while excluding unrelated platform pages.
  const domain = /game3d|game-world|world|character|companion|mount|skill|quest|combat|duel|guild|clan|party|trade|faction|player|avatar|inventory|item|loot|reward|progress|equipment/i;
  for (const parent of ['base44/functions','base44/entities']) {
    if (!exists(parent)) continue;
    for (const name of fs.readdirSync(path.join(source,parent))) {
      if (!domain.test(name)) continue;
      const sub = parent+'/'+name;
      if (fs.statSync(path.join(source,sub)).isDirectory()) directory(sub);
      else add(sub);
    }
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(target,'package.json'),'utf8'));
  const upstream = JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
  const preserve = new Set(['react','react-dom','vite','@vitejs/plugin-react','@base44/sdk',
    '@base44/vite-plugin','@tanstack/react-router','@tanstack/react-start','@tanstack/react-query']);
  const dependenciesAdded=[];
  for (const [name,version] of Object.entries(upstream.dependencies||{})) {
    if (preserve.has(name) || pkg.dependencies[name]) continue;
    pkg.dependencies[name]=version;
    dependenciesAdded.push(name);
  }
  if (!pkg.dependencies['react-router-dom']) {
    pkg.dependencies['react-router-dom']='^7.9.4';
    dependenciesAdded.push('react-router-dom');
  }

  const homepage = [
    "import { lazy, Suspense } from 'react';",
    "import { createFileRoute } from '@tanstack/react-router';",
    "import { MemoryRouter } from 'react-router-dom';",
    "const GameView = lazy(() => import('@/pages/GameView'));",
    "export const Route = createFileRoute('/_authed/')({ ssr: false,",
    "  head: () => ({meta:[{title:'Game 3D / Book · Atom × Eve'}]}),",
    "  component: () => <MemoryRouter><Suspense fallback={<main role='status' style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#070d15',color:'#dff6ff'}}>Entering Game 3D / Book…</main>}><GameView/></Suspense></MemoryRouter>",
    "});", ""
  ].join('\n');
  const layout = [
    "import { createFileRoute, Outlet } from '@tanstack/react-router';",
    "import { AuthGateError, requireSignedIn } from '@/components/auth/AuthGate';",
    "export const Route = createFileRoute('/_authed')({",
    "  ssr:false, beforeLoad:requireSignedIn, errorComponent:AuthGateError,",
    "  component:()=> <Outlet/>",
    "});",""
  ].join('\n');
  const report={sourceRepo,sourceCommit,target:'marcusflow1-arch/gitsync-pro',fileCount:files.size,
    dependenciesAdded,omittedCrossAppImports:[...omitted].sort(),
    note:'Code, local game models and sound are copied, but live player records, secrets, server deployment and Base44 app binding are not automatically migrated.'};
  console.log(JSON.stringify({sourceCommit,files:files.size,dependenciesAdded:dependenciesAdded.length,
    omittedImports:omitted.size,mode:apply?'apply':'dry-run'},null,2));
  if (apply) {
    const preservedDivergentPaths=[];
    let newlyCopied=0;
    for (const p of files) {
      const destination=path.join(target,p);
      const origin=path.join(source,p);
      if (fs.existsSync(destination)) {
        if (!fs.readFileSync(destination).equals(fs.readFileSync(origin)))
          preservedDivergentPaths.push(p);
        continue; // Preserve destination edits, including newer gameplay patches.
      }
      fs.mkdirSync(path.dirname(destination),{recursive:true});
      fs.copyFileSync(origin,destination); // Byte-for-byte, including .glb/.mp3.
      newlyCopied++;
    }
    if (dependenciesAdded.length)
      fs.writeFileSync(path.join(target,'package.json'),JSON.stringify(pkg,null,2)+'\n');
    // Do not rewrite existing TanStack/Cloudflare routes on a repeated import.
    for (const [p,body] of [['src/routes/_authed/index.jsx',homepage],
      ['src/routes/_authed.jsx',layout]]) {
      if (!fs.existsSync(path.join(target,p))) {
        fs.mkdirSync(path.dirname(path.join(target,p)),{recursive:true});
        fs.writeFileSync(path.join(target,p),body);
      }
    }
    report.newlyCopied=newlyCopied;
    report.preservedDivergentPaths=preservedDivergentPaths;
    fs.mkdirSync(path.join(target,'docs'),{recursive:true});
    fs.writeFileSync(path.join(target,'docs/game3d-source-snapshot.json'),
      JSON.stringify(report,null,2)+'\n');
    console.log('Copied '+newlyCopied+' missing files; preserved '+preservedDivergentPaths.length+' divergent existing files.');
    console.log('Run npm install, npm run build, and signed-in game and multiplayer tests BEFORE merging to main.');
  } else console.log('Dry run. Use --apply to transfer the full Game 3D files and replace GitSync-only pages.');
} finally {
  if (tmp) fs.rmSync(tmp,{recursive:true,force:true});
}
