// Standalone weapon-grip preview (does not touch the app's vite.config.js):
//   node node_modules/vite/bin/vite.js --config tools/game3d-weapons/preview/vite.config.mjs   -> http://localhost:5191/
// Finished grids are saved as PNG to $WEAPON_PREVIEW_SHOTS (default: tools/game3d-weapons/preview/shots, git-ignored).
import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const shots = process.env.WEAPON_PREVIEW_SHOTS || path.join(here, 'shots');

const saveShots = {
  name: 'weapon-preview-shots',
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
  server: { port: 5191, strictPort: true, fs: { allow: [root] } },
  plugins: [saveShots],
  logLevel: 'warn',
});
