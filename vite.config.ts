import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  optimizeDeps: {
    // pdfjs-dist ships its worker as an .mjs we'll import via ?url
    exclude: ['pdfjs-dist'],
  },
  server: {
    port: 5173,
  },
});
