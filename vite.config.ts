/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  // relative base so the build works on GitHub Pages (https://user.github.io/jejak-js/)
  base: './',
  build: { target: 'es2020', sourcemap: true },
  test: { include: ['test/**/*.test.ts'] },
});
