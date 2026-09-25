import { defineConfig } from 'vite';
export default defineConfig({
  root: 'web', build: { outDir: '../dist/web', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:3000', '/shots': 'http://localhost:3000', '/add': 'http://localhost:3000' } },
});
