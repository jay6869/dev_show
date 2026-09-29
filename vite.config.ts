import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import glsl from 'vite-plugin-glsl';
import compression from 'vite-plugin-compression';
import { renderMovements, renderNavItems, renderSolmization } from './src/content/render';
import { SOLMIZATION } from './src/content/copy';

/** Injects the semantic skeleton (rendered from typed copy) into the HTML at build + dev time. */
const skeleton = (): Plugin => ({
  name: 'hexachord-skeleton',
  transformIndexHtml(html) {
    return html
      .replace('<!--movements-->', renderMovements())
      .replace('<!--nav-items-->', renderNavItems())
      .replace('<!--solmization-->', renderSolmization(SOLMIZATION));
  },
});

export default defineConfig({
  plugins: [
    skeleton(),
    glsl({
      include: ['**/*.glsl', '**/*.vert', '**/*.frag'],
      minify: true,
      watch: true,
      removeDuplicatedImports: true,
      warnDuplicatedImports: false,
    }),
    // Pre-gzipped assets for static hosts. (A second brotli instance of this plugin silently emits
    // nothing: its instances share state. Most CDNs brotli at the edge, so gzip is the portable floor.)
    compression({ algorithm: 'gzip', ext: '.gz', threshold: 1024 }),
  ],
  build: {
    target: 'es2022',
    cssMinify: true,
    modulePreload: { polyfill: false },
    reportCompressedSize: true,
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        notFound: resolve(import.meta.dirname, '404.html'),
      },
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/, priority: 3 },
            { name: 'gsap', test: /node_modules[\\/]gsap[\\/]/, priority: 2 },
            {
              name: 'tone',
              test: /node_modules[\\/](tone|standardized-audio-context|automation-events|tslib)[\\/]/,
              priority: 2,
            },
          ],
        },
      },
    },
  },
});
