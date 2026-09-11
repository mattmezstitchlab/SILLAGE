import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

// PORT is only consumed by the dev/preview servers. Replit injects it at
// runtime, but static hosts (Vercel, CI, a plain local `vite build`) never do,
// so its absence must not abort config resolution — `vite build` does not need
// a port at all. An explicitly provided but unusable value still throws.
const DEFAULT_PORT = 3000;

const rawPort = process.env.PORT;

const port = rawPort === undefined ? DEFAULT_PORT : Number(rawPort);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(
    rawPort === undefined
      ? `Invalid default PORT value: "${DEFAULT_PORT}"`
      : `Invalid PORT value: "${rawPort}"`,
  );
}

// BASE_PATH lets Replit serve the app under a generated sub-path. Anywhere
// else (Vercel, Netlify, a static server) the app is served from the domain
// root, so '/' is the correct default.
const basePath = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
