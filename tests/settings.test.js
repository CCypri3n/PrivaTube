const test = require('node:test');
const assert = require('node:assert');
const { Settings } = require('../web/settings.js');

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; }
  };
}

const brokenStorage = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
  removeItem() { throw new Error('denied'); }
};

test('Shorts are hidden by default', () => {
  assert.strictEqual(Settings.create({ storage: fakeStorage() }).getShowShorts(), false);
});

test('the choice is saved and read back, also by a new instance', () => {
  const storage = fakeStorage();
  const a = Settings.create({ storage });
  a.setShowShorts(true);
  assert.strictEqual(a.getShowShorts(), true);
  assert.strictEqual(Settings.create({ storage }).getShowShorts(), true);
  a.setShowShorts(false);
  assert.strictEqual(Settings.create({ storage }).getShowShorts(), false);
});

test('setShowShorts coerces to a boolean', () => {
  const s = Settings.create({ storage: fakeStorage() });
  s.setShowShorts('yes');
  assert.strictEqual(s.getShowShorts(), true);
  s.setShowShorts(0);
  assert.strictEqual(s.getShowShorts(), false);
});

test('invalid stored values fall back to the default (off)', () => {
  for (const bad of ['', 'maybe', '1', 'TRUE', 'null', '{}']) {
    const s = Settings.create({ storage: fakeStorage({ show_shorts: bad }) });
    assert.strictEqual(s.getShowShorts(), false, JSON.stringify(bad));
  }
});

test('broken storage: reads give the default, writes do not throw and still apply this session', () => {
  const s = Settings.create({ storage: brokenStorage });
  assert.strictEqual(s.getShowShorts(), false);
  assert.doesNotThrow(() => s.setShowShorts(true));
  assert.strictEqual(s.getShowShorts(), true);
});

test('missing storage (null) behaves like broken storage', () => {
  const s = Settings.create({ storage: null });
  assert.strictEqual(s.getShowShorts(), false);
  s.setShowShorts(true);
  assert.strictEqual(s.getShowShorts(), true);
});

test('a stored value wins over the session fallback', () => {
  const storage = fakeStorage();
  const s = Settings.create({ storage });
  s.setShowShorts(true);
  storage.data.show_shorts = 'false';
  assert.strictEqual(s.getShowShorts(), false);
});
