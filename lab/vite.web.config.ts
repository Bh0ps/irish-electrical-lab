import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const project = fileURLToPath(new URL('./', import.meta.url));
export const WEB_BASE = '/irish-electrical-lab/';

export default defineConfig({
  root: fileURLToPath(new URL('./web/', import.meta.url)),
  base: WEB_BASE,
  plugins: [react()],
  publicDir: fileURLToPath(new URL('./public/', import.meta.url)),
  resolve: { alias: { '@': project }, dedupe: ['react', 'react-dom'] },
  css: { postcss: project },
  server: { fs: { allow: [project] } },
  build: {
    outDir: fileURLToPath(new URL('./dist-web/', import.meta.url)),
    emptyOutDir: true,
    target: 'safari17',
    cssTarget: 'safari17',
  },
  worker: { format: 'es' },
});
