/**
 * Build jejak.js as ONE self-contained HTML file (all JS + CSS inlined).
 * Useful for hosting anywhere, or for embedding in tools that accept a single page.
 *
 *   npm run build:single               -> dist-single/jejak.html (full document)
 *   npm run build:single -- --fragment -> page body only (no <html>/<head> wrapper)
 *   JEJAK_LANG=id npm run build:single -> default UI language Indonesian
 */
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const fragment = process.argv.includes('--fragment');
const out = path.resolve('dist-single');
await build({
  logLevel: 'warn',
  build: {
    outDir: out, emptyOutDir: true, sourcemap: false, cssCodeSplit: false, modulePreload: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true, entryFileNames: 'app.js', assetFileNames: '[name][extname]' } },
  },
});

const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const css = fs.readdirSync(out).filter(f => f.endsWith('.css')).map(f => fs.readFileSync(path.join(out, f), 'utf8')).join('\n');
const js = fs.readFileSync(path.join(out, 'app.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const fonts = (html.match(/<link rel="(?:preconnect|stylesheet)" href="https:\/\/fonts[^>]+>/g) || []).join('\n');
const body = html.split(/<body[^>]*>/)[1].split('</body>')[0]
  .replace(/<script[\s\S]*?<\/script>/g, '').trim();
const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || 'jejak.js';

const page = fragment
  ? `<title>Jejak JS</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${fonts}\n<style>\n${css}\n</style>\n${body}\n<script>\n${js}\n</script>\n`
  : `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<title>${title}</title>\n${fonts}\n<style>\n${css}\n</style>\n</head>\n<body>\n${body}\n<script>\n${js}\n</script>\n</body>\n</html>\n`;
fs.writeFileSync(path.join(out, 'jejak.html'), page);
console.log(`dist-single/jejak.html  ${(page.length / 1024).toFixed(0)} kB`);
