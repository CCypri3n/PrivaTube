/**
 * Shell module - the code behind the top bar that both pages share: failure
 * messages, the YouTube helper for the current key, the region dropdown, the
 * search box and start-up. Each page passes in only what differs, as callbacks.
 * Loaded after apikey.js, route.js and youtube.js (it uses them at call time),
 * before the page script.
 *
 * Shell.messageForFailure(error, fallback)  pure: failure -> user message
 * Shell.youtube(apiKey)                     YouTube module for that key
 * Shell.showRegion(region, { title })       button, header link (and tab title)
 * Shell.bindRegion({ onPick(code) })        dropdown open/close and picking
 * Shell.bindSearch({ onSearch(text) })      Enter and button, trimmed text
 * Shell.start(onKey)                        wait for the key, then onKey(key)
 */
const Shell = (() => {
  function messageForFailure(error, fallback) {
    const reason = error && error.reason;
    if (reason === 'quota_exceeded') return "YouTube's daily limit for your API key has been reached. Please try again tomorrow.";
    if (reason === 'invalid_key') return "Your API key is invalid. Please check it and try again.";
    if (reason === 'offline') return "You appear to be offline. Please check your connection and try again.";
    if (reason === 'not_found') return "Not found.";
    return fallback;
  }

  function youtube(apiKey) {
    return YouTube.create({ apiKey, fetchJson: url => fetch(url).then(r => r.json()) });
  }

  // Region button and header link follow the region; `title: true` also sets
  // the tab title (the browse page does, the player page keeps its own).
  function showRegion(region, { title = false } = {}) {
    const btn = document.getElementById('country-code-btn');
    const mainHeader = document.getElementById('main-header-link');
    if (btn) btn.textContent = `${region} ▼`;
    if (mainHeader) mainHeader.href = Route.home({ region });
    if (title) document.title = `PrivaTube - ${region}`;
  }

  function bindRegion({ onPick }) {
    const btn = document.getElementById('country-code-btn');
    const list = document.getElementById('country-list');
    const close = () => {
      list.style.display = 'none';
      btn.classList.remove('active');
    };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      list.style.display = (list.style.display === 'block') ? 'none' : 'block';
      btn.classList.toggle('active');
    });
    document.addEventListener('click', close); // click outside
    list.querySelectorAll('div').forEach(item => {
      item.addEventListener('click', () => {
        close();
        onPick(item.getAttribute('data-code'));
      });
    });
  }

  function bindSearch({ onSearch }) {
    const input = document.getElementById('searchQuery');
    const searchBtn = document.getElementById('search-btn');
    const submit = () => onSearch(input.value.trim());
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit();
    });
    if (searchBtn) searchBtn.addEventListener('click', submit);
  }

  // ApiKey.getKey() keeps showing its popup until a key is accepted.
  function start(onKey) {
    ApiKey.getKey().then(key => {
      if (key) onKey(key);
    }).catch(err => console.error("API Key error:", err));
  }

  return { messageForFailure, youtube, showRegion, bindRegion, bindSearch, start };
})();

// Export for Node.js (when running tests)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Shell };
}
