/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const ONE_YEAR_S = 365 * 24 * 3600;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Service worker: the whole app (every route chunk, icons, fonts) is cached on the first online visit,
    // so a teacher can open and reload REDPEN with no connection at all.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered from main.tsx (no inline script, so the CSP stays strict)
      manifest: false, // public/manifest.webmanifest is used as-is
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6_000_000,
        navigateFallback: '/index.html',
        // Firebase Hosting's reserved paths (Auth redirect handler, init.json) must always hit the network.
        navigateFallbackDenylist: [/^\/__\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-files', cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 30, maxAgeSeconds: ONE_YEAR_S } },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (/node_modules[\\/](firebase|@firebase)[\\/]/.test(id) ? 'firebase' : undefined),
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
