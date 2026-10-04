// Listing for the current home/search mode; "Load More" calls listing.more().
let listing = null;
let currentMode = 'home'; // 'home', 'search', or 'channel'
let lastChannelId = '';
let lastRegionCode = 'FR'; // for trending/homepage

let API_KEY = '';

// The YouTube module (web/youtube.js) is the only code that talks to YouTube for
// trending and search. Built lazily so it picks up the key once it is known.
function getYouTube() {
  return YouTube.create({ apiKey: API_KEY, fetchJson: url => fetch(url).then(r => r.json()) });
}

function messageForFailure(error, fallback) {
  const reason = error && error.reason;
  if (reason === 'quota_exceeded') return "YouTube's daily limit for your API key has been reached. Please try again tomorrow.";
  if (reason === 'invalid_key') return "Your API key is invalid. Please check it and try again.";
  if (reason === 'offline') return "You appear to be offline. Please check your connection and try again.";
  if (reason === 'not_found') return "Not found.";
  return fallback;
}

// Seconds -> "h:mm:ss" or "m:ss".
function formatSeconds(total) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const ss = sec.toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}


// Shorts are shown only when the user switched them on in the settings panel.
function listingOptions() {
  return { includeShorts: Settings.getShowShorts() };
}

// Re-render the current listing from scratch (after a settings change).
function rerenderListing() {
  if (currentMode === 'search') searchVideos();
  else if (currentMode === 'channel') fetchChannelVideos(lastChannelId);
  else showHomepage();
}

// Address updates. Not while re-rendering from Back/Forward (the address is
// already right; pushing would add entries and break Forward), nor on "load more".
let restoringFromHistory = false;
// Bumped by every new (non-"load more") render; an older request that finishes
// after a newer navigation sees a different number and drops its result.
let renderGeneration = 0;
function startRender(loadMore) {
  return loadMore ? renderGeneration : ++renderGeneration;
}

// Region button, header link and tab title follow the region in the address.
function syncRegionUI(region) {
  lastRegionCode = region;
  const btn = document.getElementById('country-code-btn');
  const mainHeader = document.getElementById('main-header-link');
  if (btn) btn.textContent = `${region} ▼`;
  if (mainHeader) mainHeader.href = Route.home({ region });
  document.title = `PrivaTube - ${region}`;
}
// Builder options carrying only the region from the address: never the whole
// parsed route, so `t` (or anything else) can't leak into links.
function currentRegion() {
  return { region: Route.parse(window.location.search).region };
}
// True during the first render at startup: it must replace, not add, an entry.
let initialRender = false;
function pushAddress(href, loadMore) {
  const action = Route.addressChange(window.location.search, href,
    { restoring: restoringFromHistory, loadMore, initial: initialRender });
  if (action === 'push') window.history.pushState({}, '', href);
  else if (action === 'replace') window.history.replaceState({}, '', href);
}

// Back/Forward: render the mode the address now describes, without pushing.
// (The player page is a separate document, so 'video' never lands here.)
function renderFromAddress() {
  // Any navigation invalidates in-flight renders, even one that renders nothing.
  renderGeneration++;
  // Before the key is known (popup showing) there is nothing to render; startup
  // renders from whatever the address is once the key is accepted.
  if (!API_KEY) return;
  const route = Route.parse(window.location.search);
  syncRegionUI(route.region);
  const box = document.getElementById('searchQuery');
  if (box) box.value = route.mode === 'search' ? route.query : '';
  restoringFromHistory = true;
  try {
    if (route.mode === 'search') searchVideos();
    else if (route.mode === 'channel') fetchChannelVideos(route.channelId);
    else if (route.mode === 'home') showHomepage();
  } finally {
    restoringFromHistory = false; // pushes happen synchronously, before the first await
  }
}
window.addEventListener('popstate', renderFromAddress);

// Enter / search button: searchVideos pushes the address itself (deduped), so an
// empty box does nothing and a repeated search adds no entry.
function submitSearch(input) {
  const text = input.value.trim();
  if (text) searchVideos(false, text);
}

async function headerClick() {
  showHomepage();
}

// --- Homepage Trending Videos ---
async function showHomepage(loadMore = false) {
  currentMode = 'home';
  document.getElementById('channel-banner').style.display = 'none';
  syncRegionUI(Route.parse(window.location.search).region);
  pushAddress(Route.home({ region: lastRegionCode }), loadMore);
  const gen = startRender(loadMore);
  const resultsDiv = document.getElementById('results');
  if (!loadMore || !listing) {
    resultsDiv.innerHTML = "<p>Loading trending videos...</p>";
    listing = getYouTube().trending(lastRegionCode, listingOptions());
  }
  try {
    const { items, hasMore } = await listing.more();
    if (gen !== renderGeneration) return;
    displayItems(loadMore, items);
    toggleLoadMoreButton(hasMore);
  } catch (error) {
    if (gen !== renderGeneration) return;
    resultsDiv.innerHTML = `<p>${messageForFailure(error, "Could not load trending videos.")}</p>`;
    toggleLoadMoreButton(false);
    console.error(error);
  }
}

// --- Search Videos ---
async function searchVideos(loadMore = false, typedText = '') {
  const route = Route.parse(window.location.search);
  // The typed text, from the address (set by the caller) or else the search box.
  const query = typedText || route.query || document.getElementById('searchQuery').value.trim();
  document.getElementById('channel-banner').style.display = 'none';
  if (!query.trim()) return;
  pushAddress(Route.search(query, currentRegion()), loadMore);
  const gen = startRender(loadMore);
  currentMode = 'search';
  const resultsDiv = document.getElementById('results');
  if (!loadMore || !listing) {
    resultsDiv.innerHTML = "<p>Searching...</p>";
    listing = getYouTube().search(query, listingOptions());
  }
  try {
    const { items, hasMore } = await listing.more();
    if (gen !== renderGeneration) return;
    displayItems(loadMore, items);
    toggleLoadMoreButton(hasMore);
  } catch (error) {
    if (gen !== renderGeneration) return;
    resultsDiv.innerHTML = `<p>${messageForFailure(error, "Error searching videos.")}</p>`;
    toggleLoadMoreButton(false);
    console.error('Error:', error);
  }
  if (gen === renderGeneration) document.title = `PrivaTube - Browsing...`;
}

// --- Fetch Channel Videos ---
async function fetchChannelVideos(channelId, loadMore = false) {
  window.scrollTo(0, 0);
  currentMode = 'channel';
  lastChannelId = channelId;
  pushAddress(Route.channel(channelId, currentRegion()), loadMore);
  const gen = startRender(loadMore);
  const resultsDiv = document.getElementById('results');
  const bannerDiv = document.getElementById('channel-banner');
  const yt = getYouTube();
  if (!loadMore || !listing) {
    resultsDiv.innerHTML = "<p>Loading channel videos...</p>";
    listing = null;
    // One channels request: info (banner, name) and the uploads playlist id.
    // Its failure reason (not found, quota, key, offline) decides what is shown.
    try {
      const channel = await yt.channel(channelId);
      if (gen !== renderGeneration) return;
      listing = yt.channelUploads(channelId, { ...listingOptions(), uploadsPlaylistId: channel.uploadsPlaylistId });
      document.title = `PrivaTube - Checking out "${channel.title}"`;
      bannerDiv.style.display = 'block';
      bannerDiv.innerHTML = `
          <div class="channel-banner-inner">
          ${Safe.url(channel.banner) ? `<img class="channel-banner-img" src="${Safe.urlAttr(channel.banner)}" alt="">` : ''}
          <div class="channel-banner-title">${Safe.escape(channel.title)}</div>
          </div>
      `;
    } catch (error) {
      if (gen !== renderGeneration) return;
      bannerDiv.style.display = 'none';
      resultsDiv.innerHTML = `<p>${error && error.reason === 'not_found'
        ? 'Channel not found.'
        : messageForFailure(error, "Could not load channel videos.")}</p>`;
      toggleLoadMoreButton(false);
      console.error(error);
      return;
    }
  }

  try {
    const { items, hasMore } = await listing.more();
    if (gen !== renderGeneration) return;
    displayItems(loadMore, items);
    toggleLoadMoreButton(hasMore);
  } catch (error) {
    if (gen !== renderGeneration) return;
    resultsDiv.innerHTML = `<p>${error && error.reason === 'not_found'
      ? 'Channel not found.'
      : messageForFailure(error, "Could not load channel videos.")}</p>`;
    toggleLoadMoreButton(false);
    console.error(error);
  }
}

// --- Results Rendering Helpers ---
// Renders YouTube module items (video / channel). Stats are already joined.
function displayItems(append, items) {
  const resultsDiv = document.getElementById('results');
  if (!items || items.length === 0) {
    if (!append) resultsDiv.innerHTML = "<p>No results found.</p>";
    return;
  }
  const html = items.map(renderItem).join('');
  if (append) {
    resultsDiv.innerHTML += html;
  } else {
    resultsDiv.innerHTML = html;
  }
}

function renderItem(item) {
  if (item.kind === 'video') {
    const dateStr = item.publishedAt
      ? new Date(item.publishedAt).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' })
      : '';
    return `
        <div class="video-item">
            <a href="${Safe.escape(Route.video(item.id, currentRegion()))}" target="_self">
              <div class="video-thumb-container">
                <img src="${Safe.urlAttr(item.thumbnail)}" alt="${Safe.escape(item.title)}" />
                <span class="video-duration">${Safe.escape(formatSeconds(item.duration))}</span>
              </div>
            </a>
            <h3>${Safe.escape(item.title)}</h3>
            <div class="video-meta">
            <span class="video-date">${Safe.escape(dateStr)}</span>
            <span class="video-meta-sep">&nbsp;•&nbsp;</span>
            <a href="${Safe.escape(Route.channel(item.channelId, currentRegion()))}" class="channel-link" target="_self">
                ${Safe.escape(item.channelTitle)}
            </a>
            <span class="video-meta-sep">&nbsp;•&nbsp;</span>
            <span class="video-views-render">
                ${Safe.escape(item.viewCount !== null ? item.viewCount.toLocaleString() : 'N/A')} views
            </span>
            </div>
        </div>
        `;
  } else if (item.kind === 'channel') {
    return `
    <a href="${Safe.escape(Route.channel(item.id, currentRegion()))}" target="_self">
      <div class="channel-item" data-channel-id="${Safe.escape(item.id)}">
        <img src="${Safe.urlAttr(item.thumbnail)}" alt="${Safe.escape(item.title)}" />
        <h3>${Safe.escape(item.title)}</h3>
        <p class="attention">Click to view channel videos</p>
        <p class="subs">${Safe.escape(item.subscriberCount !== null ? `${item.subscriberCount.toLocaleString()} subscribers` : '')}</p>
      </div>
    </a>
    `;
  }
  return '';
}

// --- Show/hide Load More button ---
function toggleLoadMoreButton(show) {
  document.getElementById('load-more-btn').style.display = show ? 'block' : 'none';
}

// --- Load More Button Handler & Enter-to-Search ---
document.addEventListener('DOMContentLoaded', () => { // Ensure player is closed on page load
  const input = document.getElementById('searchQuery');
  const btn = document.getElementById('country-code-btn');
  const list = document.getElementById('country-list');
  const dropdown = document.getElementById('country-dropdown');
  const mainHeader = document.getElementById('main-header-link');
  document.title = `PrivaTube`;


  input.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
      submitSearch(input);
    }
  });



  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    list.style.display = (list.style.display === 'block') ? 'none' : 'block';
    btn.classList.toggle('active');
  });

  // Hide dropdown when clicking outside
  document.addEventListener('click', () => {
    list.style.display = 'none';
    btn.classList.remove('active');
  });

  const startRoute = Route.parse(window.location.search);
  lastRegionCode = startRoute.region;
  syncRegionUI(startRoute.region);

  // Handle country selection
  list.querySelectorAll('div').forEach(item => {
  item.addEventListener('click', (e) => {
    const code = item.getAttribute('data-code');
    list.style.display = 'none';
    btn.classList.remove('active');
    const route = { ...Route.parse(window.location.search), region: code };
    syncRegionUI(code);
    // Go to the correct mode based on URL parameters
    if (route.mode === 'home') {
      window.history.replaceState({}, '', Route.href(route));
      showHomepage();
    } else {
      window.history.pushState({}, '', Route.href(route));
      if (route.mode === 'video') {
        playVideo(route.videoId);
      } else if (route.mode === 'search') {
        searchVideos();
      } else if (route.mode === 'channel') {
        fetchChannelVideos(route.channelId);
      }
  }});
  });

  document.getElementById('load-more-btn').addEventListener('click', () => {
    if (currentMode === 'home') {
      showHomepage(true);
    } else if (currentMode === 'search') {
      searchVideos(true);
    } else if (currentMode === 'channel') {
      fetchChannelVideos(lastChannelId, true);
    }
  });

  Settings.bindPanel({
    onShortsChange: rerenderListing,
    onForgetKey: () => {
      ApiKey.clearKey();
      API_KEY = '';
      ApiKey.getKey().then(key => {
        API_KEY = key;
        rerenderListing();
      }).catch(err => console.error("API Key error:", err));
    }
  });

  // Only start app after API key is loaded!
  ApiKey.getKey().then(key => {
  if (key) {
    API_KEY = key;
    // Read the address now: Back/Forward may have moved it while the popup was up.
    const route = Route.parse(window.location.search);
    syncRegionUI(route.region);
    initialRender = true; // pushes are synchronous, before the first await
    try {
      if (route.mode === 'video') {
        playVideo(route.videoId, { t: route.t }); // shared link: keep its timecode
      } else if (route.mode === 'search') {
        searchVideos(false)
      } else if (route.mode === 'channel') {
        fetchChannelVideos(route.channelId);
      } else {
        showHomepage();
      }
    } finally {
      initialRender = false;
    }
  }
  // If key is missing/invalid, ApiKey.getKey() keeps showing the popup until a key is accepted
  }).catch(err => {
    // Optional: log error, but don't show homepage
    console.error("API Key error:", err);
  });

  const searchBtn = document.getElementById('search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', function() {
      submitSearch(input);
    });
  }

});

// `t` only when a caller passes one (the startup redirect of a shared link).
async function playVideo(videoId, { t = null } = {}) {
  window.scrollTo(0, 0);
  window.location.href = Route.video(videoId, { ...currentRegion(), t });
}
