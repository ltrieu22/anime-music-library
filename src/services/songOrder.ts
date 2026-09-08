/** Reorder only the supplied songs, leaving filtered-out songs in their slots. */
export function reorderSongSubset<T>(items: T[], keys: string[], keyOf: (item: T) => string): T[] {
  const byKey = new Map(items.map(item => [keyOf(item), item]));
  const selected = new Set(keys);
  if (selected.size !== keys.length || keys.some(key => !byKey.has(key))) {
    throw new Error('These songs changed or were removed. Refresh the collection and try again.');
  }
  let index = 0;
  return items.map(item => selected.has(keyOf(item)) ? byKey.get(keys[index++])! : item);
}
