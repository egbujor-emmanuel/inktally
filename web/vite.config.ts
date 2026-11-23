/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const ONE_YEAR_S = 365 * 24 * 3600;
const BUILD_ID = new Date().toISOString();

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Service worker: the whole app (every route chunk, icons, fonts) is cached on the first online visit,
    // so a teacher can open and reload InkTally with no connection at all.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered from main.tsx (no inline script, so the CSP stays strict)
      manifest: false, // public/manifest.webmanifest is used as-is
      workbox: {
        globPatterns: ['**/*.{js,css,svg,png,webmanifest}'],
        // index.html is re-fetched on every build: its cached copy carries the security headers (CSP), so a header-only
        // change (e.g. allowing data: for on-device image reads) must still reach devices that already installed the app.
        additionalManifestEntries: [{ url: '/index.html', revision: BUILD_ID }],
        maximumFileSizeToCacheInBytes: 6_000_000,
        navigateFallback: '/index.html',
        // /__/: Firebase Hosting's reserved paths. /trial/: printable PDFs for the teacher trial, opened directly.
        navigateFallbackDenylist: [/^\/__\//, /^\/trial\//, /^\/llms\.txt$/],
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
