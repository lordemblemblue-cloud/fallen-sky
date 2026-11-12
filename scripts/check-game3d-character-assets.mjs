#!/usr/bin/env node
// Preflight for the Game 3D / Book character viewer in a cloned destination.
// The migration's "922 / 922" source-file figure does not include public GLB models.
import {existsSync, openSync, readSync, closeSync, statSync} from 'node:fs';
import {join} from 'node:path';

const required = [
 ['Adam creator', 'public/models/characters/fused/Male_Fused_v1.glb'],
 ['Eve creator', 'public/models/characters/fused/Female_Fused_v1.glb'],
 ['Adam world', 'public/models/characters/fused/Male_Fused_v2.glb'],
 ['Eve world', 'public/models/characters/fused/Female_Fused_v2.glb'],
 ['Getsuga v5', 'public/models/characters/Getsuga_Tensho_Character_v5.glb'],
 ['Artemis v5', 'public/models/characters/Artemis_Character_v5.glb'],
];
let failures = 0;
for (const [label, file] of required) {
 const path = join(process.cwd(), file);
 let ok = existsSync(path) && statSync(path).isFile() && statSync(path).size > 20;
 if (ok) {
  const fd = openSync(path, 'r');
  const header = Buffer.alloc(4);
  try { ok = readSync(fd, header, 0, 4, 0) === 4 && header.toString('ascii') === 'glTF'; }
  finally { closeSync(fd); }
 }
 if (!ok) {
  failures++;
  console.error('MISSING/INVALID  ' + label + '  ' + file);
 } else console.log('OK  ' + label + '  ' + file);
}
if (failures) {
 console.error('\n' + failures + ' core character GLB(s) are missing or invalid. Import binary assets before publishing Game 3D.');
 process.exitCode = 1;
} else console.log('\nAll core Game 3D character model files are present (runtime playback still requires testing).');
