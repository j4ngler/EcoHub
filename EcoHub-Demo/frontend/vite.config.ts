import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const httpsEnabled = env.VITE_HTTPS === 'true';
  const httpsKeyPath = env.VITE_HTTPS_KEY || path.resolve(__dirname, './certs/server.key');
  const httpsCertPath = env.VITE_HTTPS_CERT || path.resolve(__dirname, './certs/server.crt');
  const httpsPfxPath = env.VITE_HTTPS_PFX || path.resolve(__dirname, './certs/server.pfx');
  const httpsPfxPassphrase = env.VITE_HTTPS_PFX_PASSPHRASE || 'ecohub-local-dev';
  const httpsOptions =
    httpsEnabled && fs.existsSync(httpsKeyPath) && fs.existsSync(httpsCertPath)
      ? {
          key: fs.readFileSync(httpsKeyPath),
          cert: fs.readFileSync(httpsCertPath),
        }
      : httpsEnabled && fs.existsSync(httpsPfxPath)
        ? {
            pfx: fs.readFileSync(httpsPfxPath),
            passphrase: httpsPfxPassphrase,
          }
        : undefined;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      emptyOutDir: false,
    },
    server: {
      port: Number(env.VITE_PORT || 5173),
      strictPort: true,
      host: env.VITE_HOST || '127.0.0.1',
      https: httpsOptions,
      hmr: {
        host: env.VITE_PUBLIC_HOST || 'ecohub',
        port: Number(env.VITE_PORT || 5173),
        clientPort: Number(env.VITE_PORT || 5173),
        protocol: httpsOptions ? 'wss' : 'ws',
      },
      proxy: {
        '^/api(?:/|$)': {
          target: env.VITE_PROXY_TARGET || 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
        '/uploads': {
          target: env.VITE_PROXY_TARGET || 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
