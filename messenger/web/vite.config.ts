import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const target = process.env.API_URL ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target, ws: true, changeOrigin: false } },
  },
  build: { outDir: 'dist', sourcemap: false, target: 'es2022' },
});
