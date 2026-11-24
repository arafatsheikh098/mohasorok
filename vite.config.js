import { defineConfig } from 'vite';

// relative base so the game works from any sub-path (e.g. https://<user>.github.io/mohasorok/)
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500, assetsInlineLimit: 0 },
});
