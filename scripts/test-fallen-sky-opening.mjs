/* global URL, console, process */
// Run only the isolated Fallen Sky opening fixture tests, not the application.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const suites = [
  "tests/fallenSkyNpcDraftRegistry.test.mjs",
  "tests/fallenSkyOpeningQuestAdapter.test.mjs",
  "tests/fallenSkyOpeningRegion.test.mjs",
  "tests/fallenSkyM01MerchantBridge.test.mjs",
  "tests/fallenSkyM02ClearingBridge.test.mjs",
  "tests/fallenSkyM03Encounter.test.mjs",
  "tests/fallenSkyOriginalRealityBridge.test.mjs",
  "tests/fallenSkyWolfveilBridge.test.mjs"
];
const result = spawnSync(process.execPath, ['--test', ...suites.map(path => resolve(root, path))], { cwd: root, stdio: 'inherit', shell: false });
if (result.error) {
  console.error(result.error.message);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
