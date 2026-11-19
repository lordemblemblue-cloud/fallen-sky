// Standalone player + mount animation preview (does not touch the app's vite.config.js or its Base44 plugin):
//   node node_modules/vite/bin/vite.js --config tools/game3d-anim-preview/vite.config.mjs   -> http://localhost:5193/
// It runs the real Game 3D player modules (clip library, controller, dodge profiles, locomotion sync, mount
// animation bank, seated rider pose, mount flight, skill/level-up effects) on the real GLBs, without a Base44
// sign-in: the only stub is the Base44 client (no admin AnimationFBX rows). Screenshots POSTed to /__shot land
// in tools/game3d-anim-preview/shots (git-ignored) or $ANIM_PREVIEW_SHOTS.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const shots = process.env.ANIM_PREVIEW_SHOTS || path.join(here, 'shots');

const saveShots = {
  name: 'anim-preview-shots',
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
  resolve: { alias: [
    { find: '@/api/base44Client', replacement: path.join(here, 'base44ClientStub.js') },
    { find: '@', replacement: path.join(root, 'src') },
  ] },
  server: { port: 5193, strictPort: true, fs: { allow: [root, fs.realpathSync(path.join(root, 'node_modules'))] } },
  plugins: [saveShots],
  logLevel: 'warn',
});
