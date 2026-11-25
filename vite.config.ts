import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 3000,
    host: true,
    open: true
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0
  }
});
