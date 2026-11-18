// Standalone enchantment-light preview (does not touch the app's vite.config.js):
//   node node_modules/vite/bin/vite.js --config tools/game3d-enchant-vfx/preview/vite.config.mjs   -> http://localhost:5196/
//   index.html: contact sheets on the REAL avatar layer runtime (onboarding/customizationRuntime.js)
//               with the fitted armor GLBs, and the real weapon channel (?auto=1 renders them all)
//   live.html:  the real inventory + enchant stores, the roster-slot armor viewer and the
//               Blacksmith preview card (window.liveQA)
// Sheets are saved as PNG to $ENCHANT_PREVIEW_SHOTS (default: tools/game3d-enchant-vfx/preview/shots, git-ignored).
/* global process, Buffer, URL */
import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const shots = process.env.ENCHANT_PREVIEW_SHOTS || path.join(here, 'shots');

const saveShots = {
  name: 'enchant-preview-shots',
  configureServer(server) {
    server.middlewares.use('/__shot', (req, res) => {
      const name = new URL(req.url, 'http://x').searchParams.get('name') || 'shot.png';
      if (req.method !== 'POST' || !/^[\w.-]+\.png$/.test(name)) { res.statusCode = 400; res.end('bad request'); return; }
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        fs.mkdirSync(shots, { recursive: true });
        const b64 = Buffer.concat(chunks).toString('utf8').replace(/^data:image\/png;base64,/, '');
        fs.writeFileSync(path.join(shots, name), Buffer.from(b64, 'base64'));
        res.end(path.join(shots, name));
      });
    });
  },
};

export default defineConfig({
  root: here,
  publicDir: path.join(root, 'public'),
  resolve: { alias: { '@': path.join(root, 'src') } },
  server: { port: 5196, strictPort: true, fs: { allow: [root] } },
  // the app's .jsx files use the automatic JSX runtime (live.html mounts real components)
  esbuild: { jsx: 'automatic' },
  plugins: [saveShots],
  logLevel: 'warn',
});
