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


async function headerClick() {
  showHomepage();
}

// --- Homepage Trending Videos ---
async function showHomepage(loadMore = false) {
  currentMode = 'home';
  document.getElementById('channel-banner').style.display = 'none';
  lastRegionCode = Route.parse(window.location.search).region;
  window.history.pushState({}, '', Route.home({ region: lastRegionCode }));
  const resultsDiv = document.getElementById('results');
  if (!loadMore || !listing) {
    resultsDiv.innerHTML = "<p>Loading trending videos...</p>";
    listing = getYouTube().trending(lastRegionCode);
  }
  try {
    const { items, hasMore } = await listing.more();
    displayItems(loadMore, items);
    toggleLoadMoreButton(hasMore);
  } catch (error) {
    resultsDiv.innerHTML = `<p>${messageForFailure(error, "Could not load trending videos.")}</p>`;
    toggleLoadMoreButton(false);
    console.error(error);
  }
}

// --- Search Videos ---
async function searchVideos(loadMore = false) {
  const route = Route.parse(window.location.search);
  // The typed text, from the address (set by the caller) or else the search box.
  const query = route.query || document.getElementById('searchQuery').value.trim();
  document.getElementById('channel-banner').style.display = 'none';
  if (!query.trim()) return;
  window.history.pushState({}, '', Route.search(query, route));
  currentMode = 'search';
  const resultsDiv = document.getElementById('results');
  if (!loadMore || !listing) {
    resultsDiv.innerHTML = "<p>Searching...</p>";
    listing = getYouTube().search(query);
  }
  try {
    const { items, hasMore } = await listing.more();
    displayItems(loadMore, items);
    toggleLoadMoreButton(hasMore);
  } catch (error) {
    resultsDiv.innerHTML = `<p>${messageForFailure(error, "Error searching videos.")}</p>`;
    toggleLoadMoreButton(false);
    console.error('Error:', error);
  }
  document.title = `PrivaTube - Browsing...`;
}

// --- Fetch Channel Videos ---
async function fetchChannelVideos(channelId, loadMore = false) {
  window.scrollTo(0, 0);
  currentMode = 'channel';
  lastChannelId = channelId;
  window.history.pushState({}, '', Route.channel(channelId, Route.parse(window.location.search)));
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
      listing = yt.channelUploads(channelId, { uploadsPlaylistId: channel.uploadsPlaylistId });
      document.title = `PrivaTube - Checking out "${channel.title}"`;
      bannerDiv.style.display = 'block';
      bannerDiv.innerHTML = `
          <div class="channel-banner-inner">
          ${Safe.url(channel.banner) ? `<img class="channel-banner-img" src="${Safe.urlAttr(channel.banner)}" alt="">` : ''}
          <div class="channel-banner-title">${Safe.escape(channel.title)}</div>
          </div>
      `;
    } catch (error) {
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
    displayItems(loadMore, items);
    toggleLoadMoreButton(hasMore);
  } catch (error) {
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
            <a href="${Safe.escape(Route.video(item.id, Route.parse(window.location.search)))}" target="_self">
              <div class="video-thumb-container">
                <img src="${Safe.urlAttr(item.thumbnail)}" alt="${Safe.escape(item.title)}" />
                <span class="video-duration">${Safe.escape(formatSeconds(item.duration))}</span>
              </div>
            </a>
            <h3>${Safe.escape(item.title)}</h3>
            <div class="video-meta">
            <span class="video-date">${Safe.escape(dateStr)}</span>
            <span class="video-meta-sep">&nbsp;•&nbsp;</span>
            <a href="${Safe.escape(Route.channel(item.channelId, Route.parse(window.location.search)))}" class="channel-link" target="_self">
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
    <a href="${Safe.escape(Route.channel(item.id, Route.parse(window.location.search)))}" target="_self">
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
      window.history.pushState({}, '', Route.search(input.value.trim(), Route.parse(window.location.search)));
      searchVideos();
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
  mainHeader.href = Route.home({ region: lastRegionCode }); // Update header link to include region code
  document.title = `PrivaTube - ${lastRegionCode}`;
  // Update the button display
  if (btn) {
    btn.textContent = `${lastRegionCode} ▼`;
  }

  // Handle country selection
  list.querySelectorAll('div').forEach(item => {
  item.addEventListener('click', (e) => {
    const code = item.getAttribute('data-code');
    btn.textContent = `${code} ▼`;
    list.style.display = 'none';
    btn.classList.remove('active');
    lastRegionCode = code;
    const route = { ...Route.parse(window.location.search), region: code };
    mainHeader.href = Route.home({ region: code }); // Update header link to include region code
    document.title = `PrivaTube - ${lastRegionCode}`;
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

  // Only start app after API key is loaded!
  ApiKey.getKey().then(key => {
  if (key) {
    API_KEY = key;
    if (startRoute.mode === 'video') {
      playVideo(startRoute.videoId);
    } else if (startRoute.mode === 'search') {
      searchVideos(false)
    } else if (startRoute.mode === 'channel') {
      fetchChannelVideos(startRoute.channelId);
    } else {
    showHomepage();
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
      window.history.pushState({}, '', Route.search(input.value.trim(), Route.parse(window.location.search)));
      searchVideos();
    });
  }

});

async function playVideo(videoId) {
  window.scrollTo(0, 0);
  window.location.href = Route.video(videoId, Route.parse(window.location.search));
}
