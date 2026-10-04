/**
 * API key module - the only place that handles the key popup, the check
 * against Google and storage of the key.
 *
 * Public interface: ApiKey.getKey() -> Promise<string>, ApiKey.clearKey().
 * ApiKey.create({ storage, fetch, ui }) builds an instance with injected
 * seams (tests use fakes; defaults are localStorage, fetch and the popup).
 *
 * ui seam: ask() -> Promise<string> (shows the popup, resolves with the typed
 * key on Save), showError(msg), hideError(), close().
 */
const ApiKey = (function () {
  const STORAGE_NAME = 'api_key';
  const CHECK_URL = 'https://www.googleapis.com/youtube/v3/videos?part=snippet&id=dQw4w9WgXcQ&key=';
  // Google answers 403 with one of these reasons when the key is fine but out of quota.
  const QUOTA_REASONS = ['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded'];

  // Check a key against Google: 'valid' | 'quota' | 'invalid' | 'network'
  async function checkKey(fetchFn, key) {
    let resp;
    try {
      resp = await fetchFn(CHECK_URL + encodeURIComponent(key));
    } catch (err) {
      return 'network';
    }
    if (resp.ok) return 'valid';
    try {
      const body = await resp.json();
      const errors = (body && body.error && body.error.errors) || [];
      if (errors.some(e => QUOTA_REASONS.includes(e.reason))) return 'quota';
    } catch (err) {
      // unreadable body: fall through to invalid
    }
    return 'invalid';
  }

  // The popup defined by the identical #api-key-modal markup in both pages.
  function createDomUI() {
    const el = id => document.getElementById(id);
    return {
      ask() {
        return new Promise(resolve => {
          const input = el('api-key-input');
          const btn = el('api-key-save-btn');
          el('api-key-modal').style.display = 'flex';
          input.focus();
          const done = () => {
            btn.removeEventListener('click', done);
            input.removeEventListener('keydown', onKey);
            resolve(input.value);
          };
          const onKey = e => { if (e.key === 'Enter') done(); };
          btn.addEventListener('click', done);
          input.addEventListener('keydown', onKey);
        });
      },
      showError(msg) {
        const err = el('api-key-error');
        err.textContent = msg;
        err.style.display = 'block';
      },
      hideError() {
        el('api-key-error').style.display = 'none';
      },
      close() {
        el('api-key-modal').style.display = 'none';
      }
    };
  }

  function create({ storage, fetch: fetchFn, ui } = {}) {
    // Defaults are resolved lazily so the module loads before the DOM exists.
    const store = () => storage || localStorage;
    const net = (...args) => (fetchFn || fetch)(...args);
    let popup = ui;
    const getUI = () => popup || (popup = createDomUI());

    async function getKey() {
      const saved = store().getItem(STORAGE_NAME);
      if (saved && saved.trim()) return saved.trim();

      const view = getUI();
      for (;;) {
        const key = ((await view.ask()) || '').trim();
        if (!key) {
          view.showError('Please enter an API key.');
          continue;
        }
        const result = await checkKey(net, key);
        if (result === 'valid' || result === 'quota') {
          store().setItem(STORAGE_NAME, key);
          view.hideError();
          view.close();
          return key;
        }
        view.showError(
          result === 'network'
            ? 'Network error. Please try again.'
            : 'Invalid API Key. Please try again.'
        );
      }
    }

    function clearKey() {
      store().removeItem(STORAGE_NAME);
    }

    return { getKey, clearKey };
  }

  return { create, ...create() };
})();

// Export for Node.js (when running tests)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ApiKey };
}
