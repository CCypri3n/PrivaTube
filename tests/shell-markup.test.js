const test = require('node:test');
const assert = require('node:assert');
const { ShellMarkup } = require('../web/shell-markup.js');

const html = ShellMarkup.markup();
const count = (re) => (html.match(re) || []).length;

test('every shared element id appears exactly once', () => {
  const ids = [
    'main-header-link', 'country-dropdown', 'country-code-btn', 'country-list',
    'settings-btn', 'searchQuery', 'search-btn',
    'api-key-modal', 'api-key-error', 'api-key-input', 'api-key-save-btn',
    'settings-modal', 'settings-title', 'settings-close-btn',
    'settings-shorts-toggle', 'settings-forget-key-btn',
  ];
  for (const id of ids) {
    assert.equal(count(new RegExp(`\\bid="${id}"`, 'g')), 1, id);
  }
});

test('page-unique ids are not in the shared markup', () => {
  for (const id of ['share-modal', 'results', 'video', 'load-more-btn', 'channel-banner']) {
    assert.equal(count(new RegExp(`\\bid="${id}"`, 'g')), 0, id);
  }
});

test('the five countries, in order, defined once', () => {
  assert.deepEqual(ShellMarkup.COUNTRIES.map(c => c.code), ['FR', 'DE', 'GB', 'ES', 'US']);
  const items = [...html.matchAll(/<div data-code="([A-Z]{2})">([^<]*)<\/div>/g)];
  assert.deepEqual(items.map(m => m[1]), ['FR', 'DE', 'GB', 'ES', 'US']);
  assert.deepEqual(items.map(m => m[2]), [
    '🇫🇷 France', '🇩🇪 Germany', '🇬🇧 Britain', '🇪🇸 Spain', '🇺🇸 USA',
  ]);
});

test('the API key input is a password field', () => {
  assert.match(html, /<input type="password" id="api-key-input"/);
});

test('accessibility attributes are kept', () => {
  assert.match(html, /id="settings-btn"[^>]*aria-haspopup="dialog"[^>]*aria-expanded="false"/);
  assert.match(html, /id="settings-modal"[^>]*role="dialog" aria-modal="true" aria-labelledby="settings-title"/);
  assert.match(html, /role="switch" id="settings-shorts-toggle"/);
});

test('the region button starts on the first country', () => {
  assert.match(html, /<button id="country-code-btn">FR ▼<\/button>/);
});
