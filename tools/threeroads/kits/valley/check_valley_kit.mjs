#!/usr/bin/env node
/* global process */
// node tools/threeroads/kits/valley/check_valley_kit.mjs [path/to/valley.glb]
// The same as: node tools/threeroads/kits/common/check_kit.mjs valley [path]
process.argv.splice(2, 0, 'valley');
await import('../common/check_kit.mjs');
