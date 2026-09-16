import type { AnimeSongEntry } from '../types';
import { LOCAL_STORAGE_KEY } from './api';

import { restoreRemovedItem, type RemovedItem } from './songOrder';

type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;
function readSaved(storage: StorageAccess): AnimeSongEntry[] {
  try {
    const entries = JSON.parse(storage.getItem(LOCAL_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(entries) || entries.some(entry => !entry || !Number.isFinite(entry.id))) throw new Error();
    return entries;
  } catch { throw new Error('Could not read Saved Songs. Existing data has been kept.'); }
}
function writeSaved(entries: AnimeSongEntry[], storage: StorageAccess) {
  try { storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries)); }
  catch { throw new Error('Could not save Saved Songs. Allow site storage and try again.'); }
}
export function removeSavedSong(id: number, storage: StorageAccess = localStorage) {
  const entries = readSaved(storage);
  const item = entries.find(entry => entry.id === id);
  if (!item) throw new Error('This song is no longer in Saved Songs.');
  const removed = { item: structuredClone(item), order: entries.map(entry => String(entry.id)) };
  const next = entries.filter(entry => entry.id !== id);
  writeSaved(next, storage);
  return { removed, entries: next };
}
export function restoreSavedSong(removed: RemovedItem<AnimeSongEntry>, storage: StorageAccess = localStorage) {
  const entries = readSaved(storage);
  const sameId = entries.find(entry => entry.id === removed.item.id);
  if (sameId && JSON.stringify(sameId) !== JSON.stringify(removed.item)) {
    throw new Error('This saved number is now used by another song. Undo cannot overwrite it.');
  }
  if (entries.some(entry => entry.id !== removed.item.id && (
    (removed.item.source_song_id !== undefined && entry.source_song_id === removed.item.source_song_id) ||
    (removed.item.local_song_id && entry.local_song_id === removed.item.local_song_id)
  ))) throw new Error('This song was saved again. Remove that copy before retrying Undo.');
  const next = restoreRemovedItem(entries, removed, entry => String(entry.id));
  writeSaved(next, storage);
  return next;
}
