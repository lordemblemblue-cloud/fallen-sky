// Focused Duelist UI syntax and source-import verification.
// This avoids compiling unrelated Game 3D pages whose build status is tracked
// by the application's separate workflow.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { parse } from 'espree';

const files = [
  'src/components/game2/Game2Menu.jsx',
  'src/components/game2/DuelistModeBrowser.jsx',
  'src/components/game2/DuelistCampaignPanel.jsx',
  'src/components/game2/DuelistPracticePanel.jsx',
  'src/components/duelist/menu/MenuPages.jsx',
  'src/components/duelist/menu/modes.js',
  'src/components/duelist/client/DuelistGame.jsx',
  'src/components/duelist/client/MatchHud.jsx',
  'src/components/duelist/client/controlProps.mjs',
  'src/components/duelist/sim/control.mjs',
  'src/components/duelist/sim/match.mjs',
  'src/components/duelist/net/protocol.mjs',
  'src/pages/DuelistNext.jsx',
  'src/routes/duelist-next.play.jsx',
];
const extensions = ['', '.js', '.jsx', '.mjs', '.css', '/index.js', '/index.jsx', '/index.mjs'];
const errors = [];
for (const file of files) {
  try {
    const code = readFileSync(file, 'utf8');
    const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } });
    const statements = ast.body.filter(node => node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration');
    for (const item of statements) {
      const source = item.source?.value;
      if (!source || (!source.startsWith('.') && !source.startsWith('@/'))) continue;
      const base = source.startsWith('@/') ? resolve('src', source.slice(2)) : resolve(dirname(file), source);
      if (!extensions.some(ext => existsSync(base + ext))) {
        errors.push(`${file}: unresolved relative import ${source}`);
      }
    }
    console.log('Verified', file);
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
  }
}
if (errors.length) {
  for (const problem of errors) console.error('ERROR', problem);
  process.exitCode = 1;
} else {
  console.log(`Verified ${files.length} Duelist UI and rules sources.`);
}
