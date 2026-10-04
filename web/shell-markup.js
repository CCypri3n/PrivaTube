/**
 * ShellMarkup - the markup both pages share, defined once: the top bar (title
 * link, country dropdown, settings gear, search box), the API key popup and the
 * settings popup. Page-unique markup stays in each HTML file.
 *
 * ShellMarkup.COUNTRIES   the five regions: { code, flag, name }
 * ShellMarkup.markup()    pure: the markup as one string
 * ShellMarkup.insert(doc) writes it at the current parse position (a classic
 *                         synchronous script at the top of <body> calls this
 *                         once, so the bar exists before first paint and before
 *                         the rest of the page is parsed); falls back to
 *                         inserting at the start of <body> if the page has
 *                         already finished parsing.
 *
 * The popups are placed with the bar (top of body) rather than at the end of
 * the body as before; they are position: fixed, z-index 10000, hidden until
 * used, so stacking and look are unchanged.
 */
const ShellMarkup = (() => {
  const COUNTRIES = [
    { code: 'FR', flag: '🇫🇷', name: 'France' },
    { code: 'DE', flag: '🇩🇪', name: 'Germany' },
    { code: 'GB', flag: '🇬🇧', name: 'Britain' },
    { code: 'ES', flag: '🇪🇸', name: 'Spain' },
    { code: 'US', flag: '🇺🇸', name: 'USA' },
  ];

  function markup() {
    const countryItems = COUNTRIES
      .map(c => `        <div data-code="${c.code}">${c.flag} ${c.name}</div>`)
      .join('\n');
    return `    <a href="" id="main-header-link">
    <header class="main-header" style="cursor:pointer;">
        <h1>PrivaTube</h1>
        <h5>by YoutubeSwapper</h5>
    </header>
    </a>

    <div class="country-dropdown" id="country-dropdown">
    <button id="country-code-btn">${COUNTRIES[0].code} ▼</button>
    <div class="country-list" id="country-list">
${countryItems}
    </div>
    </div>


    <button id="settings-btn" class="settings-btn" title="Settings" aria-label="Settings" aria-haspopup="dialog" aria-expanded="false">&#9881;</button>

    <div class="search-bar-wrapper">
        <div class="search-container">
            <input type="text" id="searchQuery" class="search-input" placeholder="Type to search...">
            <button class="search-btn" id="search-btn">
              <img src="web/icons/search-96.svg" alt="Search" style="width:24px;height:24px;">
            </button>
        </div>
    </div>

    <div id="api-key-modal" style="display:none;">
    <div class="api-key-modal-backdrop"></div>
    <div class="api-key-modal-content">
        <h2>Enter your YouTube API Key</h2>
        <div id="api-key-error" style="color:crimson; margin-bottom:10px; display:none;"></div>
        <input type="password" id="api-key-input" placeholder="Paste your API key here">
        <button id="api-key-save-btn">Save</button>
        <p class="attention" style="margin-top:8px;">Your key is stored only in your browser.</p>
    </div>
    </div>

    <div id="settings-modal" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <div class="api-key-modal-backdrop"></div>
    <div class="api-key-modal-content settings-card">
        <div class="settings-head">
            <h2 id="settings-title">Settings</h2>
            <button id="settings-close-btn" class="settings-close" type="button" aria-label="Close settings" title="Close">&times;</button>
        </div>
        <div class="settings-group">
            <label class="settings-row" for="settings-shorts-toggle">
                <span class="settings-text">
                    <span class="settings-label">Show Shorts</span>
                    <span class="settings-hint">Include short vertical videos in lists</span>
                </span>
                <span class="switch">
                    <input type="checkbox" role="switch" id="settings-shorts-toggle">
                    <span class="switch-track" aria-hidden="true"></span>
                </span>
            </label>
            <div class="settings-row">
                <span class="settings-text">
                    <span class="settings-label">API key</span>
                    <span class="settings-hint">Stored only in this browser</span>
                </span>
                <button id="settings-forget-key-btn" class="settings-forget" type="button">Forget</button>
            </div>
        </div>
    </div>
    </div>
`;
  }

  function insert(doc) {
    doc = doc || document;
    if (doc.readyState === 'loading') doc.write(markup());
    else doc.body.insertAdjacentHTML('afterbegin', markup());
  }

  return { COUNTRIES, markup, insert };
})();

// Export for Node.js (when running tests)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ShellMarkup };
}
