import type { AnimeSongItem } from '../types';
import type { CatalogParams, searchCatalogResults } from './catalogResults';

export type CatalogResult = ReturnType<typeof searchCatalogResults>;
export type CatalogWorkerRequest =
  | { type: 'init'; catalog: AnimeSongItem[]; aliases: Record<string, string[]> }
  | { type: 'search'; id: number; params: CatalogParams; additionalMatches: AnimeSongItem[] };
export type CatalogWorkerResponse = { id: number } & ({ result: CatalogResult } | { error: string });
type WorkerPort = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'>;

/** Request IDs keep concurrent consumers independent; abort releases obsolete UI requests. */
export function createCatalogWorkerClient(createWorker: () => WorkerPort) {
  let worker: WorkerPort | undefined;
  let sequence = 0;
  const pending = new Map<number, { resolve: (result: CatalogResult) => void; reject: (error: Error) => void }>();
  const fail = () => {
    worker?.terminate();
    worker = undefined;
    for (const request of pending.values()) request.reject(new Error('Catalog search stopped. Please retry.'));
    pending.clear();
  };
  return (catalog: AnimeSongItem[], aliases: Record<string, string[]>, params: CatalogParams,
    additionalMatches: AnimeSongItem[] = [], signal?: AbortSignal): Promise<CatalogResult> => {
    if (signal?.aborted) return Promise.reject(new DOMException('Search canceled', 'AbortError'));
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const cleanup = () => { pending.delete(id); signal?.removeEventListener('abort', abort); };
      const abort = () => { cleanup(); reject(new DOMException('Search canceled', 'AbortError')); };
      pending.set(id, {
        resolve: result => { cleanup(); resolve(result); },
        reject: error => { cleanup(); reject(error); },
      });
      signal?.addEventListener('abort', abort, { once: true });
      try {
        if (!worker) {
          worker = createWorker();
          worker.onmessage = ({ data }: MessageEvent<CatalogWorkerResponse>) => {
            const request = pending.get(data.id);
            if ('error' in data) request?.reject(new Error(data.error));
            else request?.resolve(data.result);
          };
          worker.onerror = fail;
          worker.onmessageerror = fail;
          // Clone once. Later requests send only controls/note snapshots and return one page.
          worker.postMessage({ type: 'init', catalog, aliases } satisfies CatalogWorkerRequest);
        }
        worker.postMessage({ type: 'search', id, params, additionalMatches } satisfies CatalogWorkerRequest);
      } catch { fail(); }
    });
  };
}
