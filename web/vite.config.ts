/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (/node_modules[\\/](firebase|@firebase)[\\/]/.test(id) ? 'firebase' : undefined),
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
