import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        // When running Vite inside Docker, proxy to the backend service name
        target: 'http://backend:3000',
        changeOrigin: true,
      },
      // Allow playing uploaded videos via `/uploads/<file>` while using Vite dev server
      '/uploads': {
        target: 'http://backend:3000',
        changeOrigin: true,
      },
    },
  },
});
