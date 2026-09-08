import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { packCatalog } from '../src/services/catalogPayload';

/** Always derive the transport file from the canonical catalog, including in dev. */
export function catalogAsset(): Plugin {
  const source = resolve('public/data/anime_catalog.json');
  let stamp = -1;
  let payload = '';
  let isBuild = false;
  const generate = () => {
    const modified = statSync(source).mtimeMs;
    if (modified !== stamp) {
      payload = JSON.stringify(packCatalog(JSON.parse(readFileSync(source, 'utf8'))));
      stamp = modified;
    }
    return payload;
  };
  return {
    name: 'compact-catalog',
    configResolved(config) { isBuild = config.command === 'build'; },
    buildStart() {
      this.addWatchFile(source);
      if (isBuild) this.emitFile({ type: 'asset', fileName: 'data/catalog.compact.json', source: generate() });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/data/catalog.compact.json') return next();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(generate());
      });
    },
  };
}
