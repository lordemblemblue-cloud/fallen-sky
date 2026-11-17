import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Standalone preview of the cave exterior. Not part of the game build.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: { host: '127.0.0.1', port: 5199, strictPort: true },
});
