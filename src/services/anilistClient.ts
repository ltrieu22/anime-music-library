const ENDPOINT = 'https://graphql.anilist.co';
const STATE_KEY = 'anilist_request_pacing_v1';
const INTERVAL_MS = 2500; // At most 24 request starts/minute per queue.
const COOLDOWN_MS = 60_000;

type Pacing = { nextStart: number; cooldownUntil: number };
type Options = {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  readState?: () => Partial<Pacing>;
  writeState?: (state: Pacing) => void;
  runExclusive?: (work: () => Promise<Response>) => Promise<Response>;
};

function unavailable(until: number, now: number) {
  return new Response(JSON.stringify({ errors: [{ message: 'AniList requests temporarily paused' }] }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.max(1, Math.ceil((until - now) / 1000))) },
  });
}

// Shared by browser searches/artwork and by both Express proxy endpoints.
// Cooldowns discard queued work; only a later user action starts a new attempt.
export function createAniListClient(options: Options = {}) {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  let state: Pacing = { nextStart: 0, cooldownUntil: 0 };
  let tail = Promise.resolve();
  const pending = new Map<string, Promise<Response>>();

  function read() {
    try {
      const saved = options.readState?.();
      for (const key of ['nextStart', 'cooldownUntil'] as const) {
        if (Number.isFinite(saved?.[key])) state[key] = Math.max(state[key], saved![key]!);
      }
    } catch { /* Memory pacing still applies if storage is unavailable. */ }
  }
  function save() {
    try { options.writeState?.({ ...state }); } catch { /* Keep memory pacing. */ }
  }
  function pause(response?: Response) {
    const time = now();
    const retry = response?.headers.get('Retry-After');
    const retryTime = retry ? (/^\d+(\.\d+)?$/.test(retry) ? time + Number(retry) * 1000 : Date.parse(retry)) : 0;
    const reset = Number(response?.headers.get('X-RateLimit-Reset')) * 1000;
    state.cooldownUntil = Math.max(state.cooldownUntil, time + COOLDOWN_MS,
      Number.isFinite(retryTime) ? retryTime : 0, Number.isFinite(reset) ? reset : 0);
    save();
  }

  async function perform(init: RequestInit) {
    read();
    if (state.cooldownUntil > now()) return unavailable(state.cooldownUntil, now());
    while (state.nextStart > now()) {
      await sleep(state.nextStart - now());
      read();
      if (state.cooldownUntil > now()) return unavailable(state.cooldownUntil, now());
    }
    state.nextStart = now() + INTERVAL_MS;
    save();
    try {
      const response = await (options.fetch ?? globalThis.fetch)(ENDPOINT, {
        ...init, signal: AbortSignal.timeout(10_000),
      });
      // GraphQL may report a provider failure inside an HTTP 200 response.
      let graphStatus = 0;
      try {
        const body = await response.clone().json();
        graphStatus = Math.max(0, ...(Array.isArray(body?.errors) ? body.errors : [])
          .map((error: { status?: number }) => Number(error?.status) || 0));
      } catch { if (response.ok) graphStatus = 503; }
      if (response.status === 429 || response.status === 403 || response.status >= 500 ||
          graphStatus === 429 || graphStatus === 403 || graphStatus >= 500 ||
          response.headers.get('X-RateLimit-Remaining') === '0') pause(response);
      return response;
    } catch {
      pause();
      return unavailable(state.cooldownUntil, now());
    }
  }

  return (init: RequestInit): Promise<Response> => {
    const key = String(init.body ?? '');
    const existing = pending.get(key);
    if (existing) return existing.then(response => response.clone());
    // Bound memory and stale work when someone sweeps through a large queue.
    if (pending.size >= 20) return Promise.resolve(unavailable(now() + COOLDOWN_MS, now()));
    const request = tail.then(() => options.runExclusive ? options.runExclusive(() => perform(init)) : perform(init));
    pending.set(key, request);
    tail = request.then(() => {}, () => {});
    void request.finally(() => pending.delete(key)).catch(() => {});
    return request.then(response => response.clone());
  };
}

const client = createAniListClient({
  readState: () => JSON.parse(localStorage.getItem(STATE_KEY) || '{}'),
  writeState: state => localStorage.setItem(STATE_KEY, JSON.stringify(state)),
  runExclusive: work => {
    // Coordinate pacing across same-origin tabs when Web Locks are supported.
    if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request('anime-db-anilist', work);
    return work();
  },
});

export function fetchAniList(init: RequestInit) {
  return client(init);
}
