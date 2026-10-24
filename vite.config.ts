/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  // relative base so the build works on GitHub Pages (https://user.github.io/jejak-js/)
  base: './',
  define: { __DEFAULT_LANG__: JSON.stringify(process.env.JEJAK_LANG || 'auto') },
  build: { target: 'es2020', sourcemap: true },
  test: { include: ['test/**/*.test.ts'] },
});
