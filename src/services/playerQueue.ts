import type { QueueItem, QueueSource, SongTrack } from '../types/player';

export interface QueueState {
  items: QueueItem[];
  index: number;
  source: QueueSource;
  nextItemId: number;
  // Changes only for media transitions, including replay of the same occurrence.
  playbackRevision: number;
}

export const initialQueueState: QueueState = {
  items: [], index: -1, source: null, nextItemId: 1, playbackRevision: 0,
};

export type QueueAction =
  | { type: 'replace'; tracks: SongTrack[]; startIndex?: number; source: 'collection' | 'single' }
  | { type: 'append'; tracks: SongTrack[] }
  | { type: 'remove'; queueItemId: string }
  | { type: 'clearUpcoming' }
  // Position is zero-based within upcoming items, excluding current/history.
  | { type: 'moveUpcoming'; queueItemId: string; toIndex: number }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'close' };

export function currentQueueItem(state: QueueState): QueueItem | null {
  return state.items[state.index] ?? null;
}

export function canAdvanceQueue(state: QueueState): boolean {
  return state.index >= 0 && (state.index < state.items.length - 1 ||
    (state.source === 'collection' && state.items.length > 1));
}

function closeQueue(state: QueueState): QueueState {
  if (!state.items.length) return state;
  return { ...state, items: [], index: -1, source: null, playbackRevision: state.playbackRevision + 1 };
}

/** Pure transitions keep queue edits atomic and current media identity stable. */
export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'replace':
    case 'append': {
      if (!action.tracks.length) return state;
      const items = action.tracks.map((track, index) => ({
        queueItemId: `queue:${state.nextItemId + index}`, track,
      }));
      const nextItemId = state.nextItemId + items.length;
      if (action.type === 'append' && state.items.length) {
        return { ...state, items: [...state.items, ...items], source: 'manual', nextItemId };
      }
      const requestedIndex = action.type === 'replace' ? action.startIndex ?? 0 : 0;
      const index = Number.isFinite(requestedIndex)
        ? Math.max(0, Math.min(Math.trunc(requestedIndex), items.length - 1)) : 0;
      return {
        ...state, items, index, nextItemId,
        source: action.type === 'replace' ? action.source : 'manual',
        playbackRevision: state.playbackRevision + 1,
      };
    }
    case 'remove': {
      const removedIndex = state.items.findIndex(item => item.queueItemId === action.queueItemId);
      if (removedIndex < 0) return state;
      // Removing the current tail closes playback, even if history remains.
      if (removedIndex === state.index && state.index === state.items.length - 1) return closeQueue(state);
      const items = state.items.filter(item => item.queueItemId !== action.queueItemId);
      return {
        ...state, items, source: 'manual',
        index: removedIndex < state.index ? state.index - 1 : state.index,
        playbackRevision: state.playbackRevision + (removedIndex === state.index ? 1 : 0),
      };
    }
    case 'clearUpcoming': {
      if (!state.items.length) return state;
      if (state.source === 'manual' && state.index === state.items.length - 1) return state;
      // Also disable collection wrap so cleared items cannot come back.
      return { ...state, items: state.items.slice(0, state.index + 1), source: 'manual' };
    }
    case 'moveUpcoming': {
      const from = state.items.findIndex(item => item.queueItemId === action.queueItemId);
      const upcomingCount = state.items.length - state.index - 1;
      if (from <= state.index || !Number.isInteger(action.toIndex) ||
          action.toIndex < 0 || action.toIndex >= upcomingCount) return state;
      const to = state.index + 1 + action.toIndex;
      if (from === to) return state;
      const items = [...state.items];
      const [item] = items.splice(from, 1);
      items.splice(to, 0, item);
      return { ...state, items, source: 'manual' };
    }
    case 'next': {
      if (!state.items.length) return state;
      if (state.index === state.items.length - 1 && state.source !== 'collection') return state;
      return { ...state, index: (state.index + 1) % state.items.length, playbackRevision: state.playbackRevision + 1 };
    }
    case 'previous': {
      if (!state.items.length) return state;
      const index = state.index > 0 ? state.index - 1
        : state.source === 'collection' ? state.items.length - 1 : 0;
      return { ...state, index, playbackRevision: state.playbackRevision + 1 };
    }
    case 'close': return closeQueue(state);
  }
}
