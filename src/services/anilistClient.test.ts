import assert from 'node:assert/strict';
import test from 'node:test';
import { createAniListClient } from './anilistClient';

const query = (id: number) => ({ method: 'POST', body: JSON.stringify({ query: 'query', variables: { id } }) });
const ok = () => Response.json({ data: { Media: { id: 1 } } });

test('AniList serializes distinct requests, spaces starts and deduplicates concurrent queries', async () => {
  let clock = 100_000;
  const starts: number[] = [];
  let active = 0;
  const client = createAniListClient({
    now: () => clock,
    sleep: async ms => { clock += ms; },
    fetch: async () => {
      assert.equal(active++, 0);
      starts.push(clock);
      await Promise.resolve();
      active--;
      return ok();
    },
  });
  const responses = await Promise.all([client(query(1)), client(query(1)), client(query(2)), client(query(3))]);
  assert.deepEqual(starts, [100_000, 102_500, 105_000]);
  // Deduplicated callers can independently consume their response bodies.
  for (const response of responses) assert.equal((await response.json()).data.Media.id, 1);
});

test('429 honors the later Retry-After/reset time, drops queued work, and persists across client reloads', async () => {
  let clock = 100_000;
  let saved = {};
  let calls = 0;
  const options = {
    now: () => clock,
    sleep: async (ms: number) => { clock += ms; },
    readState: () => saved,
    writeState: (state: object) => { saved = { ...state }; },
    fetch: async () => {
      calls++;
      return calls === 1 ? Response.json({ errors: [{ status: 429 }] }, {
        status: 429, headers: { 'Retry-After': '120', 'X-RateLimit-Reset': '250' },
      }) : ok();
    },
  };
  const client = createAniListClient(options);
  const responses = await Promise.all([client(query(1)), client(query(2)), client(query(3))]);
  assert.deepEqual(responses.map(r => r.status), [429, 503, 503]);
  assert.equal(calls, 1);
  const reloaded = createAniListClient(options);
  clock = 249_999;
  assert.equal((await reloaded(query(4))).status, 503);
  assert.equal(calls, 1);
  clock = 250_000;
  assert.equal((await reloaded(query(4))).status, 200);
  assert.equal(calls, 2);
});

test('HTTP-date retry headers and exhausted successful responses stop further requests', async () => {
  let clock = 100_000;
  let calls = 0;
  const client = createAniListClient({
    now: () => clock,
    fetch: async () => {
      calls++;
      return Response.json({ data: {} }, { headers: {
        'X-RateLimit-Remaining': '0', 'Retry-After': new Date(300_000).toUTCString(),
      } });
    },
  });
  assert.equal((await client(query(1))).status, 200);
  clock = 299_999;
  assert.equal((await client(query(2))).status, 503);
  assert.equal(calls, 1);
});

test('outages, GraphQL errors, malformed replies and network failures open a cooldown without retries', async () => {
  for (const fail of [
    () => Response.json({}, { status: 503 }),
    () => Response.json({}, { status: 403 }),
    () => Response.json({ errors: [{ status: 429 }] }),
    () => Response.json({ errors: [{ status: 403 }] }),
    () => Response.json({ errors: [{ status: 500 }] }),
    () => new Response('<html>Unavailable</html>'),
    () => { throw new TypeError('Offline'); },
  ]) {
    let calls = 0;
    const client = createAniListClient({ now: () => 100_000, fetch: async () => { calls++; return fail(); } });
    await client(query(1));
    assert.equal((await client(query(2))).status, 503);
    assert.equal(calls, 1);
  }
});

test('404 is not a provider outage and bursts have a bounded pending queue', async () => {
  let clock = 100_000;
  let calls = 0;
  const client = createAniListClient({
    now: () => clock, sleep: async ms => { clock += ms; },
    fetch: async () => { calls++; return Response.json({}, { status: 404 }); },
  });
  const requests = Array.from({ length: 25 }, (_, id) => client(query(id)));
  const responses = await Promise.all(requests);
  assert.equal(calls, 20);
  assert.equal(responses.filter(r => r.status === 503).length, 5);
});

test('inaccessible storage does not disable pacing', async () => {
  let clock = 100_000;
  const starts: number[] = [];
  const client = createAniListClient({
    now: () => clock, sleep: async ms => { clock += ms; },
    readState: () => { throw new Error('Storage blocked'); },
    writeState: () => { throw new Error('Storage blocked'); },
    fetch: async () => { starts.push(clock); return ok(); },
  });
  await Promise.all([client(query(1)), client(query(2))]);
  assert.deepEqual(starts, [100_000, 102_500]);
});
