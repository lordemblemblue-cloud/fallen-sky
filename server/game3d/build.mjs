import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Use esbuild to compile the SAME shared AXE TypeScript combat formula that
// GameWorld3D and Base44's duelSystem import; no divergent damage copy.
await build({
  entryPoints: [fileURLToPath(new URL('./index.mjs', import.meta.url))],
  outfile: fileURLToPath(new URL('./dist/index.mjs', import.meta.url)),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: ['node20'],
  external: ['ws','pg'],
  logLevel: 'info',
});
