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
    opened: 0,
    open() { ui.opened++; },
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
  const fetchFn = fakeFetch({});
  const api = ApiKey.create({ storage, fetchFn, ui });
  assert.strictEqual(await api.getKey(), 'saved');
  assert.strictEqual(ui.asked, 0);
  assert.strictEqual(fetchFn.calls.length, 0);
});

test('accepted key is returned and saved under api_key', async () => {
  const storage = fakeStorage();
  const ui = fakeUI(['  good  ']);
  const api = ApiKey.create({ storage, fetchFn: fakeFetch({ good: ok }), ui });
  assert.strictEqual(await api.getKey(), 'good');
  assert.strictEqual(storage.data.api_key, 'good');
  assert.strictEqual(ui.closed, true);
});

test('rejected key shows invalid message, is not saved, popup asks again', async () => {
  const storage = fakeStorage();
  const ui = fakeUI(['bad', 'good']);
  const api = ApiKey.create({
    storage, ui,
    fetchFn: fakeFetch({ bad: apiError(400, 'keyInvalid'), good: ok })
  });
  assert.strictEqual(await api.getKey(), 'good');
  assert.match(ui.errors[0], /invalid/i);
  assert.strictEqual(storage.data.api_key, 'good');
});

test('rejected key alone is never saved', async () => {
  const storage = fakeStorage();
  const ui = fakeUI(['bad']);
  const api = ApiKey.create({ storage, ui, fetchFn: fakeFetch({ bad: apiError(400, 'keyInvalid') }) });
  await assert.rejects(api.getKey());
  assert.strictEqual(storage.data.api_key, undefined);
});

test('other non-OK answers are treated as invalid', async () => {
  const storage = fakeStorage();
  const ui = fakeUI(['odd']);
  const api = ApiKey.create({ storage, ui, fetchFn: fakeFetch({ odd: apiError(403, 'forbidden') }) });
  await assert.rejects(api.getKey());
  assert.match(ui.errors[0], /invalid/i);
  assert.strictEqual(storage.data.api_key, undefined);
});

test('network error shows try-again message and is not saved', async () => {
  const storage = fakeStorage();
  const ui = fakeUI(['k']);
  const api = ApiKey.create({ storage, ui, fetchFn: fakeFetch({ k: new TypeError('offline') }) });
  await assert.rejects(api.getKey());
  assert.match(ui.errors[0], /try again in a moment/i);
  assert.strictEqual(storage.data.api_key, undefined);
});

test('quota exceeded means the key is valid: accepted and saved', async () => {
  const storage = fakeStorage();
  const ui = fakeUI(['q']);
  const api = ApiKey.create({ storage, ui, fetchFn: fakeFetch({ q: apiError(403, 'quotaExceeded') }) });
  assert.strictEqual(await api.getKey(), 'q');
  assert.strictEqual(storage.data.api_key, 'q');
  assert.strictEqual(ui.errors.length, 0);
});

test('clearKey removes the saved key and the next getKey shows the popup again', async () => {
  const storage = fakeStorage({ api_key: 'old' });
  const ui = fakeUI(['new']);
  const api = ApiKey.create({ storage, ui, fetchFn: fakeFetch({ new: ok }) });
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
    fetchFn: fakeFetch({ bad: apiError(400, 'keyInvalid'), good: ok })
  });
  await api.getKey();
  assert.strictEqual(ui.errors.length, 1);
  assert.strictEqual(ui.error, null);
});

test('empty input asks again without hitting the network', async () => {
  const ui = fakeUI(['   ', 'good']);
  const fetchFn = fakeFetch({ good: ok });
  const api = ApiKey.create({ storage: fakeStorage(), ui, fetchFn });
  assert.strictEqual(await api.getKey(), 'good');
  assert.strictEqual(fetchFn.calls.length, 1);
  assert.ok(ui.errors.length >= 1);
});

// ---- follow-ups (#19) ----

test('5xx and 429 answers show a try-again message, are not saved, popup asks again', async () => {
  for (const status of [500, 503, 429]) {
    const storage = fakeStorage();
    const ui = fakeUI(['k', 'good']);
    const api = ApiKey.create({
      storage, ui,
      fetchFn: fakeFetch({ k: apiError(status, 'backendError'), good: ok })
    });
    assert.strictEqual(await api.getKey(), 'good');
    assert.match(ui.errors[0], /try again in a moment/i, `status ${status}`);
    assert.doesNotMatch(ui.errors[0], /invalid/i, `status ${status}`);
    assert.strictEqual(storage.data.api_key, 'good');
  }
});

test('a try-again answer alone is never saved', async () => {
  const storage = fakeStorage();
  const ui = fakeUI(['k']);
  const api = ApiKey.create({ storage, ui, fetchFn: fakeFetch({ k: apiError(503, 'backendError') }) });
  await assert.rejects(api.getKey());
  assert.strictEqual(storage.data.api_key, undefined);
});

test('concurrent getKey calls share one popup, one check and one result', async () => {
  const storage = fakeStorage();
  const ui = fakeUI(['good', 'good']);
  const fetchFn = fakeFetch({ good: ok });
  const api = ApiKey.create({ storage, ui, fetchFn });
  const a = api.getKey();
  const b = api.getKey();
  assert.strictEqual(a, b);
  assert.deepStrictEqual(await Promise.all([a, b]), ['good', 'good']);
  assert.strictEqual(ui.asked, 1);
  assert.strictEqual(fetchFn.calls.length, 1);
});

test('a settled getKey does not keep returning the old promise', async () => {
  const storage = fakeStorage();
  const ui = fakeUI(['one', 'two']);
  const api = ApiKey.create({ storage, ui, fetchFn: fakeFetch({ one: ok, two: ok }) });
  assert.strictEqual(await api.getKey(), 'one');
  api.clearKey();
  assert.strictEqual(await api.getKey(), 'two');
  assert.strictEqual(ui.asked, 2);
});

test('whitespace-only saved value counts as missing', async () => {
  const ui = fakeUI(['good']);
  const api = ApiKey.create({ storage: fakeStorage({ api_key: '   ' }), ui, fetchFn: fakeFetch({ good: ok }) });
  assert.strictEqual(await api.getKey(), 'good');
  assert.strictEqual(ui.asked, 1);
});

test('padded saved value is returned trimmed without the popup', async () => {
  const ui = fakeUI([]);
  const api = ApiKey.create({ storage: fakeStorage({ api_key: '  saved \n' }), ui, fetchFn: fakeFetch({}) });
  assert.strictEqual(await api.getKey(), 'saved');
  assert.strictEqual(ui.asked, 0);
});

// Tiny fake document for the real popup UI.
function fakeDoc(missing = []) {
  const make = () => {
    const listeners = {};
    return {
      style: { display: 'none' },
      value: '',
      textContent: '',
      focused: false,
      focus() { this.focused = true; },
      listeners,
      addEventListener(type, fn) { (listeners[type] = listeners[type] || new Set()).add(fn); },
      removeEventListener(type, fn) { if (listeners[type]) listeners[type].delete(fn); },
      fire(type, ev = {}) { [...(listeners[type] || [])].forEach(fn => fn(ev)); },
      count(type) { return listeners[type] ? listeners[type].size : 0; }
    };
  };
  const els = {};
  for (const id of ['api-key-modal', 'api-key-input', 'api-key-save-btn', 'api-key-error']) {
    if (!missing.includes(id)) els[id] = make();
  }
  return { els, getElementById: id => els[id] || null };
}

test('popup: Enter submits, other keys do not, listeners are removed afterwards', async () => {
  const doc = fakeDoc();
  const { 'api-key-input': input, 'api-key-save-btn': btn, 'api-key-modal': modal } = doc.els;
  const api = ApiKey.create({ storage: fakeStorage(), doc, fetchFn: fakeFetch({ good: ok }) });
  const p = api.getKey();
  assert.strictEqual(modal.style.display, 'flex');
  assert.strictEqual(input.focused, true);
  input.value = 'good';
  input.fire('keydown', { key: 'a' });
  input.fire('keydown', { key: 'Enter' });
  assert.strictEqual(await p, 'good');
  assert.strictEqual(input.count('keydown'), 0);
  assert.strictEqual(btn.count('click'), 0);
  assert.strictEqual(modal.style.display, 'none');
});

test('popup: Save click submits and removes listeners', async () => {
  const doc = fakeDoc();
  const { 'api-key-input': input, 'api-key-save-btn': btn } = doc.els;
  const api = ApiKey.create({ storage: fakeStorage(), doc, fetchFn: fakeFetch({ good: ok }) });
  const p = api.getKey();
  input.value = 'good';
  btn.fire('click');
  assert.strictEqual(await p, 'good');
  assert.strictEqual(input.count('keydown'), 0);
  assert.strictEqual(btn.count('click'), 0);
});

test('popup opens with empty input and hidden error each time, errors persist between retries', async () => {
  const doc = fakeDoc();
  const { 'api-key-input': input, 'api-key-save-btn': btn, 'api-key-error': err } = doc.els;
  const api = ApiKey.create({
    storage: fakeStorage(), doc,
    fetchFn: fakeFetch({ bad: apiError(400, 'keyInvalid'), good: ok })
  });
  const settle = () => new Promise(r => setTimeout(r, 0));
  const p1 = api.getKey();
  input.value = 'bad';
  btn.fire('click');
  await settle();
  await settle();
  assert.strictEqual(err.style.display, 'block'); // retry keeps the message visible
  input.value = 'good';
  btn.fire('click');
  assert.strictEqual(await p1, 'good');
  // after "forget", the next popup starts clean
  api.clearKey();
  input.value = 'leftover';
  err.style.display = 'block';
  const p2 = api.getKey();
  assert.strictEqual(input.value, '');
  assert.strictEqual(err.style.display, 'none');
  input.value = 'good';
  btn.fire('click');
  await p2;
});

test('incomplete popup markup makes getKey reject with a clear error', async () => {
  for (const id of ['api-key-modal', 'api-key-input', 'api-key-save-btn', 'api-key-error']) {
    const api = ApiKey.create({ storage: fakeStorage(), doc: fakeDoc([id]), fetchFn: fakeFetch({}) });
    await assert.rejects(api.getKey(), err => err.message.includes(id), id);
  }
});
