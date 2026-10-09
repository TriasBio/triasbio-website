import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// index.html is a shell. `<!-- include:name -->` pulls in partials/name.html at
// build and serve time, so every section ships as static HTML (crawlers, link
// previews and screen readers see real text) while each lives in its own file.
const PARTIALS = resolve(import.meta.dirname, 'partials');
const INCLUDE = /<!--\s*include:([\w-]+)\s*-->/g;

function inline(html, depth = 0) {
  if (depth > 4) return html;
  return html.replace(INCLUDE, (_, name) => inline(readFileSync(resolve(PARTIALS, `${name}.html`), 'utf8'), depth + 1));
}

function partials() {
  return {
    name: 'trias-partials',
    transformIndexHtml: { order: 'pre', handler: html => inline(html) },
    configureServer(server) {
      server.watcher.add(PARTIALS);
      server.watcher.on('change', file => {
        if (file.startsWith(PARTIALS)) server.ws.send({ type: 'full-reload' });
      });
    },
  };
}

export default defineConfig({
  plugins: [partials()],
  build: { target: 'es2022' },
});
