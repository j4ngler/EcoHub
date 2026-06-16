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
    port: Number(process.env.VITE_PORT || 5173),
    strictPort: true,
    host: process.env.VITE_HOST || '127.0.0.1',
    hmr: {
      host: process.env.VITE_PUBLIC_HOST || 'ecohub',
      port: Number(process.env.VITE_PORT || 5173),
      clientPort: Number(process.env.VITE_PORT || 5173),
      protocol: 'ws',
    },
    proxy: {
      '^/api(?:/|$)': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
