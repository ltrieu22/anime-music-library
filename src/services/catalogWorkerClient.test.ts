import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogWorkerClient, type CatalogWorkerRequest, type CatalogWorkerResponse } from './catalogWorkerClient';

class FakeWorker {
  messages: CatalogWorkerRequest[] = [];
  onmessage: Worker['onmessage'];
  onerror: Worker['onerror'];
  onmessageerror: Worker['onmessageerror'];
  terminated = false;
  postMessage(message: CatalogWorkerRequest) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  reply(data: CatalogWorkerResponse) { this.onmessage?.call(null, { data } as MessageEvent); }
}
const result = { data: [], total: 0, limit: 100, offset: 0, hasMore: false };

test('worker request IDs preserve independent out-of-order results and initialize once', async () => {
  const worker = new FakeWorker();
  const search = createCatalogWorkerClient(() => worker);
  const first = search([], {}, { q: 'first' });
  const second = search([], {}, { q: 'second' });
  worker.reply({ id: 2, result: { ...result, total: 2 } });
  worker.reply({ id: 1, result: { ...result, total: 1 } });
  assert.equal((await first).total, 1);
  assert.equal((await second).total, 2);
  assert.equal(worker.messages.filter(m => m.type === 'init').length, 1);
});

test('aborted requests ignore late replies without canceling other consumers', async () => {
  const worker = new FakeWorker();
  const search = createCatalogWorkerClient(() => worker);
  const controller = new AbortController();
  const aborted = search([], {}, {}, [], controller.signal);
  const rejected = assert.rejects(aborted, { name: 'AbortError' });
  const current = search([], {}, {});
  controller.abort();
  worker.reply({ id: 1, result });
  worker.reply({ id: 2, result });
  await rejected;
  assert.deepEqual(await current, result);
  await assert.rejects(search([], {}, {}, [], controller.signal), { name: 'AbortError' });
  assert.equal(worker.messages.length, 3);
});

test('worker failures reject pending work and a later Retry creates a fresh worker', async () => {
  const workers: FakeWorker[] = [];
  const search = createCatalogWorkerClient(() => { const worker = new FakeWorker(); workers.push(worker); return worker; });
  const failed = assert.rejects(search([], {}, {}), /Please retry/);
  workers[0].onerror.call(null, {} as ErrorEvent);
  await failed;
  assert.equal(workers[0].terminated, true);
  const retry = search([], {}, {});
  workers[1].reply({ id: 2, result });
  assert.deepEqual(await retry, result);
  const badResult = assert.rejects(search([], {}, {}), /Invalid search/);
  workers[1].reply({ id: 3, error: 'Invalid search' });
  await badResult;
});

test('worker constructor and serialization failures remain retryable', async () => {
  const search = createCatalogWorkerClient(() => { throw new Error('CSP blocked'); });
  await assert.rejects(search([], {}, {}), /Please retry/);
  await assert.rejects(search([], {}, {}), /Please retry/);
  const worker = new FakeWorker();
  worker.postMessage = () => { throw new DOMException('Cannot clone', 'DataCloneError'); };
  await assert.rejects(createCatalogWorkerClient(() => worker)([], {}, {}), /Please retry/);
  assert.equal(worker.terminated, true);
});
