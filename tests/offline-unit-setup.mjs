import assert from 'node:assert/strict';
import { after } from 'node:test';

// Tests must supply fake responses. Never fall through to the real fetch,
// even when application code catches the resulting error.
const attempts = [];
globalThis.fetch = async input => {
  const url = input instanceof Request ? input.url : String(input);
  attempts.push(url);
  throw new Error(`Unmocked network request in unit test: ${url}`);
};
after(() => {
  assert.deepEqual(attempts, [], 'Unit tests attempted unmocked network requests');
});
