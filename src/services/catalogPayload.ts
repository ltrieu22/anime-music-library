import type { AnimeSongItem } from '../types';

/** Lossless dictionary encoding of existing fields; -1 preserves absent properties. */
export interface CatalogPayload {
  version: 1;
  fields: string[];
  values: unknown[][];
  rows: number[][];
}

export function packCatalog(songs: AnimeSongItem[]): CatalogPayload {
  const fields = [...new Set(songs.flatMap(Object.keys))];
  const values: unknown[][] = fields.map(() => []);
  const indexes = fields.map(() => new Map<string, number>());
  const rows = songs.map(song => fields.map((field, column) => {
    const value = (song as unknown as Record<string, unknown>)[field];
    if (value === undefined) return -1;
    const key = JSON.stringify(value);
    let index = indexes[column].get(key);
    if (index === undefined) {
      index = values[column].length;
      indexes[column].set(key, index);
      values[column].push(value);
    }
    return index;
  }));
  return { version: 1, fields, values, rows };
}

export function unpackCatalog(input: unknown): AnimeSongItem[] {
  const invalid = () => { throw new Error('The catalog data is invalid. Please retry.'); };
  if (!input || typeof input !== 'object') return invalid();
  const { version, fields, values, rows } = input as CatalogPayload;
  if (version !== 1 || !Array.isArray(fields) || !Array.isArray(values) || !Array.isArray(rows)
    || fields.length !== values.length || new Set(fields).size !== fields.length
    || !fields.every(field => typeof field === 'string' && !['__proto__', 'constructor', 'prototype'].includes(field))
    || !values.every(Array.isArray)) return invalid();
  const ids = new Set<string>();
  return rows.map(row => {
    if (!Array.isArray(row) || row.length !== fields.length) return invalid();
    const song: Record<string, unknown> = {};
    for (let column = 0; column < fields.length; column++) {
      const index = row[column];
      if (!Number.isInteger(index) || index < -1 || index >= values[column].length) return invalid();
      if (index !== -1) song[fields[column]] = values[column][index];
    }
    if ((typeof song.id !== 'string' && typeof song.id !== 'number')
      || ids.has(String(song.id)) || typeof song.anime_name !== 'string'
      || typeof song.anime_year !== 'number' || typeof song.artist !== 'string'
      || typeof song.song_name !== 'string') return invalid();
    ids.add(String(song.id));
    return song as unknown as AnimeSongItem;
  });
}
