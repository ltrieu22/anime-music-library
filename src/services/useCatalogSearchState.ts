import { useEffect, useRef, useState } from 'react';
import type { DatabaseMode } from '../types';
import { DEFAULT_CATALOG_STATE, parseCatalogUrl, serializeCatalogUrl, type CatalogUrlState } from './catalogUrlState';

type ViewState = CatalogUrlState & { draft: string; artistLabel?: string };
const view = (state: CatalogUrlState): ViewState => ({ ...state, draft: state.q });
const isPublic = (mode: DatabaseMode) => mode === 'anisongdb' || mode === 'animethemes';

export function useCatalogSearchState(mode: DatabaseMode, onNavigate: (mode: DatabaseMode) => void) {
  const [states, setStates] = useState(() => ({
    catalog: view(parseCatalogUrl(new URL(window.location.href))),
    collection: view({ ...DEFAULT_CATALOG_STATE, sortKey: 'id', sortOrder: 'asc' }),
    notes: view(DEFAULT_CATALOG_STATE),
  }));
  const latest = useRef(states);
  const scope = isPublic(mode) ? 'catalog' : mode;
  const state = states[scope];
  const write = (next: CatalogUrlState, history: 'push' | 'replace') => {
    const url = serializeCatalogUrl(next, new URL(window.location.href));
    if (url.href !== window.location.href) window.history[history === 'push' ? 'pushState' : 'replaceState'](window.history.state, '', url);
  };
  const store = (key: typeof scope, next: ViewState) => {
    latest.current = { ...latest.current, [key]: next };
    setStates(latest.current);
  };
  const update = (patch: Partial<ViewState>, history: 'push' | 'replace' = 'push') => {
    const previous = latest.current[scope];
    const next = { ...previous, q: previous.draft, page: 0, ...patch };
    store(scope, next);
    if (scope === 'catalog') write(next, history);
  };

  useEffect(() => {
    write(latest.current.catalog, 'replace');
    const navigate = () => {
      store('catalog', view(parseCatalogUrl(new URL(window.location.href))));
      onNavigate('anisongdb');
    };
    window.addEventListener('popstate', navigate);
    return () => window.removeEventListener('popstate', navigate);
  }, [onNavigate]);

  useEffect(() => {
    if (state.draft === state.q) return;
    const timer = window.setTimeout(() => {
      const previous = latest.current[scope];
      const next = { ...previous, q: previous.draft, page: 0 };
      store(scope, next);
      if (scope === 'catalog') write(next, 'replace');
    }, 200);
    return () => window.clearTimeout(timer);
  }, [scope, state.draft, state.q]);

  return {
    state, update,
    typeQuery: (draft: string) => {
      const next = { ...latest.current[scope], draft, artistIds: [], artistLabel: undefined, page: 0 };
      store(scope, next);
      if (scope === 'catalog' && draft === next.q) write(next, 'replace');
    },
    reset: () => update({ ...DEFAULT_CATALOG_STATE, draft: '', artistLabel: undefined,
      ...(scope === 'collection' ? { sortKey: 'id', sortOrder: 'asc' } : {}) }),
  };
}
