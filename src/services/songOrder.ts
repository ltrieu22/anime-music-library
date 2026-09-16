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

export interface RemovedItem<T> { item: T; order: string[] }

/** Insert relative to surviving neighbors, preserving all intervening edits. */
export function restoreRemovedItem<T>(items: T[], removed: RemovedItem<T>, keyOf: (item: T) => string): T[] {
  const key = keyOf(removed.item);
  if (items.some(item => keyOf(item) === key)) return items;
  const index = removed.order.indexOf(key);
  const following = removed.order.slice(index + 1).find(key => items.some(item => keyOf(item) === key));
  const preceding = removed.order.slice(0, index).reverse().find(key => items.some(item => keyOf(item) === key));
  const at = following !== undefined ? items.findIndex(item => keyOf(item) === following)
    : preceding !== undefined ? items.findIndex(item => keyOf(item) === preceding) + 1 : Math.min(index, items.length);
  const next = [...items];
  next.splice(Math.max(0, at), 0, structuredClone(removed.item));
  return next;
}
