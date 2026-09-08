import { useEffect, useRef, useState } from 'react';
import type { DatabaseMode } from '../types';
import { DEFAULT_CATALOG_STATE, parseCatalogUrl, serializeCatalogUrl, stripCatalogUrl, type CatalogUrlState } from './catalogUrlState';

type ViewState = CatalogUrlState & { draft: string; artistLabel?: string };
type StateScope = 'catalog' | 'collection' | 'notes';
const HISTORY_KEY = 'animeCatalogSearch';
const view = (state: CatalogUrlState): ViewState => ({ ...state, draft: state.q });
const isPublic = (mode: DatabaseMode) => mode === 'anisongdb' || mode === 'animethemes';
const historyCatalogState = (): CatalogUrlState | null => {
  const value = window.history.state?.[HISTORY_KEY];
  if (!value || typeof value !== 'object') return null;
  try {
    const url = new URL(window.location.href);
    url.search = '';
    return parseCatalogUrl(serializeCatalogUrl(value as CatalogUrlState, url));
  } catch { return null; }
};

export function useCatalogSearchState(mode: DatabaseMode, onNavigate: (mode: DatabaseMode) => void) {
  const [states, setStates] = useState(() => ({
    catalog: view(historyCatalogState() ?? parseCatalogUrl(new URL(window.location.href))),
    collection: view({ ...DEFAULT_CATALOG_STATE, sortKey: 'id', sortOrder: 'asc' }),
    notes: view(DEFAULT_CATALOG_STATE),
  }));
  const latest = useRef(states);
  const scope: StateScope = isPublic(mode) ? 'catalog' : mode;
  const state = states[scope];
  const store = (key: StateScope, next: ViewState) => {
    latest.current = { ...latest.current, [key]: next };
    setStates(latest.current);
  };
  const writeHistory = (next: ViewState, history: 'push' | 'replace') => {
    const cleanUrl = stripCatalogUrl(new URL(window.location.href));
    const payload = { ...next } as Record<string, unknown>;
    delete payload.draft;
    delete payload.artistLabel;
    window.history[history === 'push' ? 'pushState' : 'replaceState'](
      { ...window.history.state, [HISTORY_KEY]: payload }, '', cleanUrl,
    );
  };
  const update = (patch: Partial<ViewState>, history: 'push' | 'replace' = 'push') => {
    const previous = latest.current[scope];
    const next = { ...previous, q: previous.draft, page: 0, ...patch };
    store(scope, next);
    if (scope === 'catalog') writeHistory(next, history);
  };

  useEffect(() => {
    const initial = latest.current.catalog;
    const payload = { ...initial } as Record<string, unknown>;
    delete payload.draft;
    delete payload.artistLabel;
    window.history.replaceState({ ...window.history.state, [HISTORY_KEY]: payload }, '', window.location.href);
    const navigate = () => {
      const restored = historyCatalogState();
      if (!restored) return;
      store('catalog', view(restored));
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
      if (scope === 'catalog') writeHistory(next, 'replace');
    }, 200);
    return () => window.clearTimeout(timer);
  }, [scope, state.draft, state.q]);

  return {
    state, update,
    typeQuery: (draft: string) => {
      const next = { ...latest.current[scope], draft, artistIds: [], artistLabel: undefined, page: 0 };
      store(scope, next);
      if (scope === 'catalog' && draft === next.q) writeHistory(next, 'replace');
    },
    reset: () => update({ ...DEFAULT_CATALOG_STATE, draft: '', artistLabel: undefined,
      ...(scope === 'collection' ? { sortKey: 'id', sortOrder: 'asc' } : {}) }),
  };
}
