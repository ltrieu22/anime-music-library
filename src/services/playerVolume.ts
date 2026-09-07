// Shared master-volume preference for the bottom player.
//
// The preference stores the last *unmuted* volume (0–1, including a valid
// zero). Mute state is transient and never persisted: the player always
// starts unmuted at the remembered gain, and unmuting restores it. This is a
// gain control only — it does not normalize loudness between songs with
// different masterings.

export const PLAYER_VOLUME_STORAGE_KEY = 'anime-db:player-volume-v1';
export const PLAYER_VOLUME_SCHEMA_VERSION = 1;
export const PLAYER_VOLUME_DEFAULT = 0.4;

interface StoredPlayerVolume {
  version: number;
  volume: number;
}

/** Clamp a finite gain to [0, 1]; return null for non-finite or non-numeric input. */
export function sanitizePlayerVolume(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

/**
 * Read the remembered volume. Falls back to the 40% default when storage is
 * unavailable, the payload is missing, corrupted, or from an unsupported
 * schema version. Invalid stored payloads are left in place.
 */
export function readStoredPlayerVolume(): number {
  const storage = globalThis.localStorage;
  if (!storage) return PLAYER_VOLUME_DEFAULT;
  try {
    const raw = storage.getItem(PLAYER_VOLUME_STORAGE_KEY);
    if (raw === null) return PLAYER_VOLUME_DEFAULT;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return PLAYER_VOLUME_DEFAULT;
    const record = parsed as Partial<StoredPlayerVolume>;
    if (record.version !== PLAYER_VOLUME_SCHEMA_VERSION) return PLAYER_VOLUME_DEFAULT;
    return sanitizePlayerVolume(record.volume) ?? PLAYER_VOLUME_DEFAULT;
  } catch {
    return PLAYER_VOLUME_DEFAULT;
  }
}

/**
 * Persist the remembered volume. Returns false when storage is unavailable or
 * rejects the write, so callers can keep the previous preference considered
 * stored and retry on a later change.
 */
export function writeStoredPlayerVolume(volume: number): boolean {
  const sanitized = sanitizePlayerVolume(volume);
  if (sanitized === null) return false;
  const storage = globalThis.localStorage;
  if (!storage) return false;
  try {
    const payload: StoredPlayerVolume = { version: PLAYER_VOLUME_SCHEMA_VERSION, volume: sanitized };
    storage.setItem(PLAYER_VOLUME_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}
