import { createCatalogSearchSession } from './catalogSearchSession';
import type { CatalogWorkerRequest, CatalogWorkerResponse } from './catalogWorkerClient';

let search: ReturnType<typeof createCatalogSearchSession>;
globalThis.onmessage = ({ data }: MessageEvent<CatalogWorkerRequest>) => {
  if (data.type === 'init') {
    search = createCatalogSearchSession(data.catalog, data.aliases);
    return;
  }
  try {
    globalThis.postMessage({ id: data.id, result: search(data.params, data.additionalMatches) } satisfies CatalogWorkerResponse);
  } catch {
    globalThis.postMessage({ id: data.id, error: 'Could not search the catalog. Please retry.' } satisfies CatalogWorkerResponse);
  }
};
