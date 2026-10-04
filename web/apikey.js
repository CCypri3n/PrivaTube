/**
 * API key module - the only place that handles the key popup, the check
 * against Google and storage of the key.
 *
 * Public interface: ApiKey.getKey() -> Promise<string>, ApiKey.clearKey().
 * ApiKey.create({ storage, fetchFn, ui, doc }) builds an instance with injected
 * seams (tests use fakes; defaults are localStorage, fetch and the popup).
 *
 * ui seam: open() (show the popup empty, no error; throws if markup is
 * incomplete), ask() -> Promise<string> (resolves with the typed key on Save
 * or Enter), showError(msg), hideError(), close(). doc: optional document.
 */
const ApiKey = (function () {
  const STORAGE_NAME = 'api_key';
  const CHECK_URL = 'https://www.googleapis.com/youtube/v3/videos?part=snippet&id=dQw4w9WgXcQ&key=';
  // Google answers 403 with one of these reasons when the key is fine but out of quota.
  const QUOTA_REASONS = ['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded'];

  // Check a key against Google: 'accepted' | 'rejected' | 'try-again'
  // accepted: Google says the key is valid, or valid but out of quota.
  // rejected: Google says the key is bad (400, or 403 that is not a quota error).
  // try-again: anything else (network failure, 5xx, 429, ...): not the key's fault.
  async function checkKey(fetchFn, key) {
    let resp;
    try {
      resp = await fetchFn(CHECK_URL + encodeURIComponent(key));
    } catch (err) {
      return 'try-again';
    }
    if (resp.ok) return 'accepted';
    if (resp.status !== 400 && resp.status !== 403) return 'try-again';
    if (resp.status === 403) {
      try {
        const body = await resp.json();
        const errors = (body && body.error && body.error.errors) || [];
        if (errors.some(e => QUOTA_REASONS.includes(e.reason))) return 'accepted';
      } catch (err) {
        // unreadable body: a 403 that is not a quota error
      }
    }
    return 'rejected';
  }

  // The popup defined by the identical #api-key-modal markup in both pages.
  // `doc` is injectable for tests (defaults to the global document, resolved lazily).
  function createDomUI(doc) {
    const d = () => doc || document;
    const IDS = ['api-key-modal', 'api-key-input', 'api-key-save-btn', 'api-key-error'];
    const el = id => {
      const node = d().getElementById(id);
      if (!node) throw new Error('API key popup markup is incomplete: missing #' + id);
      return node;
    };
    return {
      // Show the popup fresh: empty input, no error. Throws if markup is incomplete.
      open() {
        IDS.forEach(el);
        el('api-key-input').value = '';
        el('api-key-error').style.display = 'none';
        el('api-key-modal').style.display = 'flex';
      },
      ask() {
        return new Promise(resolve => {
          const input = el('api-key-input');
          const btn = el('api-key-save-btn');
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

  function create({ storage, fetchFn, ui, doc } = {}) {
    // Defaults are resolved lazily so the module loads before the DOM exists.
    const store = () => storage || localStorage;
    const net = (...args) => (fetchFn || fetch)(...args);
    let popup = ui;
    const getUI = () => popup || (popup = createDomUI(doc));
    let pending = null; // the one in-flight popup session, shared by concurrent callers

    async function askUntilAccepted() {
      const view = getUI();
      view.open();
      for (;;) {
        const key = ((await view.ask()) || '').trim();
        if (!key) {
          view.showError('Please enter an API key.');
          continue;
        }
        const result = await checkKey(net, key);
        if (result === 'accepted') {
          store().setItem(STORAGE_NAME, key);
          view.hideError();
          view.close();
          return key;
        }
        view.showError(
          result === 'try-again'
            ? 'Could not check the key right now. Please try again in a moment.'
            : 'Invalid API Key. Please try again.'
        );
      }
    }

    function getKey() {
      const saved = store().getItem(STORAGE_NAME);
      if (saved && saved.trim()) return Promise.resolve(saved.trim());
      if (!pending) {
        pending = askUntilAccepted().finally(() => { pending = null; });
      }
      return pending;
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
