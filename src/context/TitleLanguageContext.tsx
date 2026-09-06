import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AnimeTitleMetadata } from '../types';
import { getAnimeDisplayTitle, getSearchableAnimeTitles, readTitleLanguage, resolveAnimeTitles, TITLE_LANGUAGE_STORAGE_KEY, type TitleLanguage, type TitleSource } from '../services/animeTitles';
import { loadStaticCatalog } from '../services/catalogEngine';

const TitleLanguageContext = createContext<{
  language: TitleLanguage;
  setLanguage: (language: TitleLanguage) => void;
  storageError: boolean;
  displayTitle: (song: TitleSource) => string;
  searchTitles: (song: TitleSource) => string[];
} | null>(null);

export function TitleLanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, updateLanguage] = useState(readTitleLanguage);
  const [storageError, setStorageError] = useState(false);
  const [catalog, setCatalog] = useState<ReadonlyMap<string, AnimeTitleMetadata>>(new Map());
  useEffect(() => {
    let active = true;
    loadStaticCatalog().then(([songs]) => {
      if (active) setCatalog(new Map(songs.map((song) => [String(song.id), song])));
    });
    const sync = (event: StorageEvent) => {
      if (event.key === TITLE_LANGUAGE_STORAGE_KEY || event.key === null) {
        updateLanguage(readTitleLanguage());
        setStorageError(false);
      }
    };
    window.addEventListener('storage', sync);
    return () => { active = false; window.removeEventListener('storage', sync); };
  }, []);
  const setLanguage = useCallback((next: TitleLanguage) => {
    updateLanguage(next);
    try {
      localStorage.setItem(TITLE_LANGUAGE_STORAGE_KEY, next);
      setStorageError(false);
    } catch { setStorageError(true); }
  }, []);
  const displayTitle = useCallback((song: TitleSource) => getAnimeDisplayTitle(resolveAnimeTitles(song, catalog), language), [catalog, language]);
  const searchTitles = useCallback((song: TitleSource) => getSearchableAnimeTitles(resolveAnimeTitles(song, catalog)), [catalog]);
  const value = useMemo(() => ({ language, setLanguage, storageError, displayTitle, searchTitles }), [language, setLanguage, storageError, displayTitle, searchTitles]);
  return <TitleLanguageContext.Provider value={value}>{children}</TitleLanguageContext.Provider>;
}

export function useTitleLanguage() {
  const value = useContext(TitleLanguageContext);
  if (!value) throw new Error('TitleLanguageProvider is required');
  return value;
}
