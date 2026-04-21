import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // COOP/COEP headers enable SharedArrayBuffer → FFmpeg.wasm multi-thread mode.
    // Single-threaded fallback works even without these, but they don't hurt.
    headers: {
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/api':       'http://localhost:3002',
      '/outputs':   'http://localhost:3002',
      '/uploads':   'http://localhost:3002',
      '/templates': 'http://localhost:3002',
    },
  },
  optimizeDeps: {
    // FFmpeg.wasm manages its own worker/WASM loading; exclude from Vite pre-bundling.
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
});
