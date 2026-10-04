/**
 * Settings module - browser-only preferences (not part of the URL).
 *
 * Public interface: Settings.getShowShorts() -> boolean (default false),
 * Settings.setShowShorts(bool). Settings.create({ storage }) builds an instance
 * with an injected storage (getItem/setItem); the default is localStorage,
 * resolved lazily. Pass storage: null for "no storage".
 *
 * Tolerant by design: a missing or throwing storage never throws out of here
 * (reads give the default, writes keep the value for this page session), and any
 * stored value other than "true" / "false" counts as the default.
 *
 * Settings.bindPanel({ doc, onForgetKey, onShortsChange }) wires the settings
 * panel markup shared by both pages (DOM only; not unit-tested).
 */
const Settings = (function () {
  const SHORTS_NAME = 'show_shorts';
  const SHORTS_DEFAULT = false;

  function create({ storage } = {}) {
    const store = () => {
      if (storage !== undefined) return storage;
      try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (err) { return null; }
    };
    let sessionShorts = null; // last value set, used while storage cannot save it

    function getShowShorts() {
      try {
        const s = store();
        if (s) {
          const raw = s.getItem(SHORTS_NAME);
          if (raw === 'true') return true;
          if (raw === 'false') return false;
          if (raw !== null && raw !== undefined) return SHORTS_DEFAULT; // invalid value
        }
      } catch (err) {
        // unreadable storage: fall through
      }
      return sessionShorts === null ? SHORTS_DEFAULT : sessionShorts;
    }

    function setShowShorts(value) {
      sessionShorts = Boolean(value);
      try {
        const s = store();
        if (s) s.setItem(SHORTS_NAME, String(sessionShorts));
      } catch (err) {
        // quota / private mode: the session value still applies
      }
    }

    return { getShowShorts, setShowShorts };
  }

  // Panel markup (identical in both pages): #settings-btn, #settings-modal,
  // #settings-forget-key-btn, #settings-shorts-toggle, #settings-close-btn.
  // onForgetKey() is called after the panel closes; onShortsChange(bool) after a toggle.
  function bindPanel({ doc, onForgetKey, onShortsChange, settings } = {}) {
    const d = doc || document;
    const api = settings || defaultInstance;
    const btn = d.getElementById('settings-btn');
    const modal = d.getElementById('settings-modal');
    const forgetBtn = d.getElementById('settings-forget-key-btn');
    const toggle = d.getElementById('settings-shorts-toggle');
    const closeBtn = d.getElementById('settings-close-btn');
    if (!btn || !modal || !forgetBtn || !toggle || !closeBtn) return;

    const open = () => {
      toggle.checked = api.getShowShorts();
      modal.style.display = 'flex';
      toggle.focus();
    };
    const close = () => {
      if (modal.style.display === 'none') return;
      modal.style.display = 'none';
      btn.focus();
    };

    btn.addEventListener('click', e => { e.stopPropagation(); open(); });
    closeBtn.addEventListener('click', close);
    modal.querySelector('.api-key-modal-backdrop').addEventListener('click', close);
    d.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.style.display !== 'none') close();
    });
    toggle.addEventListener('change', () => {
      api.setShowShorts(toggle.checked);
      if (onShortsChange) onShortsChange(api.getShowShorts());
    });
    forgetBtn.addEventListener('click', () => {
      modal.style.display = 'none'; // the key popup takes over; focus goes to its input
      if (onForgetKey) onForgetKey();
    });
  }

  const defaultInstance = create();
  return { create, bindPanel, ...defaultInstance };
})();

// Export for Node.js (when running tests)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Settings };
}
