const test = require('node:test');
const assert = require('node:assert');
const { ApiKey } = require('../web/apikey.js');

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; }
  };
}

// Fake UI: `entries` are the keys the "user" types, one per prompt.
// When the user has nothing left to type, ask() throws, which ends getKey().
function fakeUI(entries) {
  const ui = {
    asked: 0,
    error: null, // currently displayed error message, null when hidden
    errors: [],
    closed: false,
    async ask() {
      ui.asked++;
      if (!entries.length) throw new Error('user has no more keys to type');
      return entries.shift();
    },
    showError(msg) { ui.error = msg; ui.errors.push(msg); },
    hideError() { ui.error = null; },
    close() { ui.closed = true; }
  };
  return ui;
}

const ok = () => ({ ok: true, status: 200, json: async () => ({ items: [] }) });
const apiError = (status, reason) => () => ({
  ok: false, status, json: async () => ({ error: { code: status, errors: [{ reason }] } })
});
// Fake network keyed by the key in the request URL.
function fakeFetch(byKey) {
  const calls = [];
  const f = async url => {
    const key = new URL(url).searchParams.get('key');
    calls.push(url);
    const r = byKey[key];
    if (r instanceof Error) throw r;
    return r();
  };
  f.calls = calls;
  return f;
}

test('returns a saved key without showing the popup or hitting the network', async () => {
  const storage = fakeStorage({ api_key: 'saved' });
  const ui = fakeUI([]);
  const fetch = fakeFetch({});
  const api = ApiKey.create({ storage, fetch, ui });
  assert.strictEqual(await api.getKey(), 'saved');
  assert.strictEqual(ui.asked, 0);
  assert.strictEqual(fetch.calls.length, 0);
});

test('accepted key is returned and saved under api_key', async () => {
  const storage = fakeStorage();
  const ui = fakeUI(['  good  ']);
  const api = ApiKey.create({ storage, fetch: fakeFetch({ good: ok }), ui });
  assert.strictEqual(await api.getKey(), 'good');
  assert.strictEqual(storage.data.api_key, 'good');
  assert.strictEqual(ui.closed, true);
});

test('rejected key shows invalid message, is not saved, popup asks again', async () => {
  const storage = fakeStorage();
  const ui = fakeUI(['bad', 'good']);
  const api = ApiKey.create({
    storage, ui,
    fetch: fakeFetch({ bad: apiError(400, 'keyInvalid'), good: ok })
  });
  assert.strictEqual(await api.getKey(), 'good');
  assert.match(ui.errors[0], /invalid/i);
  assert.strictEqual(storage.data.api_key, 'good');
});

test('rejected key alone is never saved', async () => {
  const storage = fakeStorage();
  const ui = fakeUI(['bad']);
  const api = ApiKey.create({ storage, ui, fetch: fakeFetch({ bad: apiError(400, 'keyInvalid') }) });
  await assert.rejects(api.getKey());
  assert.strictEqual(storage.data.api_key, undefined);
});

test('other non-OK answers are treated as invalid', async () => {
  const storage = fakeStorage();
  const ui = fakeUI(['odd']);
  const api = ApiKey.create({ storage, ui, fetch: fakeFetch({ odd: apiError(403, 'forbidden') }) });
  await assert.rejects(api.getKey());
  assert.match(ui.errors[0], /invalid/i);
  assert.strictEqual(storage.data.api_key, undefined);
});

test('network error shows network message and is not saved', async () => {
  const storage = fakeStorage();
  const ui = fakeUI(['k']);
  const api = ApiKey.create({ storage, ui, fetch: fakeFetch({ k: new TypeError('offline') }) });
  await assert.rejects(api.getKey());
  assert.match(ui.errors[0], /network/i);
  assert.strictEqual(storage.data.api_key, undefined);
});

test('quota exceeded means the key is valid: accepted and saved', async () => {
  const storage = fakeStorage();
  const ui = fakeUI(['q']);
  const api = ApiKey.create({ storage, ui, fetch: fakeFetch({ q: apiError(403, 'quotaExceeded') }) });
  assert.strictEqual(await api.getKey(), 'q');
  assert.strictEqual(storage.data.api_key, 'q');
  assert.strictEqual(ui.errors.length, 0);
});

test('clearKey removes the saved key and the next getKey shows the popup again', async () => {
  const storage = fakeStorage({ api_key: 'old' });
  const ui = fakeUI(['new']);
  const api = ApiKey.create({ storage, ui, fetch: fakeFetch({ new: ok }) });
  assert.strictEqual(await api.getKey(), 'old');
  api.clearKey();
  assert.strictEqual(storage.data.api_key, undefined);
  assert.strictEqual(await api.getKey(), 'new');
  assert.strictEqual(ui.asked, 1);
});

test('error message is hidden again when a later attempt succeeds', async () => {
  const ui = fakeUI(['bad', 'good']);
  const api = ApiKey.create({
    storage: fakeStorage(), ui,
    fetch: fakeFetch({ bad: apiError(400, 'keyInvalid'), good: ok })
  });
  await api.getKey();
  assert.strictEqual(ui.errors.length, 1);
  assert.strictEqual(ui.error, null);
});

test('empty input asks again without hitting the network', async () => {
  const ui = fakeUI(['   ', 'good']);
  const fetch = fakeFetch({ good: ok });
  const api = ApiKey.create({ storage: fakeStorage(), ui, fetch });
  assert.strictEqual(await api.getKey(), 'good');
  assert.strictEqual(fetch.calls.length, 1);
  assert.ok(ui.errors.length >= 1);
});
