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
  const url = new URL(window.location);
  url.searchParams.delete('ch');
  url.searchParams.delete('v'); // Remove video param when going to homepage
  url.searchParams.delete('q'); // Remove search param when going to homepage
  window.history.pushState({}, '', url);
  const params = new URLSearchParams(window.location.search);
  const lang = params.get('lang');
  if (!lang) {
    lastRegionCode = 'FR';
    const url = new URL(window.location);
    url.searchParams.set('lang', lastRegionCode);
    window.history.replaceState({}, '', url); // Use replaceState to avoid history spam
  } else {
    lastRegionCode = lang;
  }
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
  const url = new URL(window.location);
  url.searchParams.delete('ch');
  url.searchParams.delete('v'); // Remove video param when going to homepage
  url.searchParams.delete('t'); // Remove time param when going to search
  window.history.pushState({}, '', url);
  document.getElementById('channel-banner').style.display = 'none';
  let query = url.searchParams.get('q');
  console.log("Search query from URL:", query);
  if (!query) {
    const queryFromField = document.getElementById('searchQuery').value.trim();
    console.log("Search query from field:", queryFromField);
    url.searchParams.set('q', queryFromField);
    window.history.replaceState({}, '', url);
    query = url.searchParams.get('q');
    console.log("Search query from URL:", query);
  }
  if (!query || !query.trim()) return;
  currentMode = 'search';
  const resultsDiv = document.getElementById('results');
  if (!loadMore || !listing) {
    resultsDiv.innerHTML = "<p>Searching...</p>";
    // The q param holds an already-encoded string; the module encodes it itself.
    let text = query;
    try { text = decodeURIComponent(query); } catch (e) { /* use as typed */ }
    listing = getYouTube().search(text);
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
  const url = new URL(window.location);
  url.searchParams.set('ch', channelId);
  url.searchParams.delete('v'); // Remove video param when going to channel
  window.history.pushState({}, '', url);
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
          ${channel.banner ? `<img class="channel-banner-img" src="${channel.banner}" alt="">` : ''}
          <div class="channel-banner-title">${channel.title}</div>
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
            <a href="${createVideoUrl(item.id)}" target="_self">
              <div class="video-thumb-container">
                <img src="${item.thumbnail}" alt="${item.title}" />
                <span class="video-duration">${formatSeconds(item.duration)}</span>
              </div>
            </a>
            <h3>${item.title}</h3>
            <div class="video-meta">
            <span class="video-date">${dateStr}</span>
            <span class="video-meta-sep">&nbsp;•&nbsp;</span>
            <a href="${createChannelUrl(item.channelId)}" class="channel-link" target="_self">
                ${item.channelTitle}
            </a>
            <span class="video-meta-sep">&nbsp;•&nbsp;</span>
            <span class="video-views-render">
                ${item.viewCount !== null ? item.viewCount.toLocaleString() : 'N/A'} views
            </span>
            </div>
        </div>
        `;
  } else if (item.kind === 'channel') {
    return `
    <a href="${createChannelUrl(item.id)}" target="_self">
      <div class="channel-item" data-channel-id="${item.id}" onclick="fetchChannelVideos('${item.id}')">
        <img src="${item.thumbnail}" alt="${item.title}" />
        <h3>${item.title}</h3>
        <p class="attention">Click to view channel videos</p>
        <p class="subs">${item.subscriberCount !== null ? `${item.subscriberCount.toLocaleString()} subscribers` : ''}</p>
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
      const url = new URL(window.location);
      url.searchParams.set('q', encodeURIComponent(input.value.trim()));
      window.history.pushState({}, '', url);
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

  const params = new URLSearchParams(window.location.search);
  const lang = params.get('lang');
  if (lang) {
    lastRegionCode = lang;
  } mainHeader.href = "index.html?lang=" + lastRegionCode; // Update header link to include region code
  document.title = `PrivaTube - ${lastRegionCode}`;
  // Update the button display
  if (btn) {
    btn.innerHTML = `${lastRegionCode} ▼`;
  }

  // Handle country selection
  list.querySelectorAll('div').forEach(item => {
  item.addEventListener('click', (e) => {
    const code = item.getAttribute('data-code');
    btn.innerHTML = `${code} ▼`;
    list.style.display = 'none';
    btn.classList.remove('active');
    lastRegionCode = code;
    const url = new URL(window.location);
    url.searchParams.set('lang', lastRegionCode);
    mainHeader.href = "index.html?lang=" + lastRegionCode; // Update header link to include region code
    document.title = `PrivaTube - ${lastRegionCode}`;
    // Go to the correct mode based on URL parameters
    if (!url.searchParams.get('ch') && !url.searchParams.get('v') && !url.searchParams.get('q')) {
      window.history.replaceState({}, '', url);
      showHomepage();
    } else {
      window.history.pushState({}, '', url);
      if (url.searchParams.get('v')) {
        playVideo(url.searchParams.get('v'));
      } else if (url.searchParams.get('q')) {
        searchVideos();
      } else if (url.searchParams.get('ch')) {
        fetchChannelVideos(url.searchParams.get('ch'));
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
  const videoId = params.get('v');
  const channel = params.get('ch');
  const query = params.get('q');
  ApiKey.getKey().then(key => {
  if (key) {
    API_KEY = key;
    if (videoId) {
      playVideo(videoId);
    } else if (query) {
      searchVideos(false)
    } else if (channel) {
      fetchChannelVideos(channel);
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
      const url = new URL(window.location);
      url.searchParams.set('q', encodeURIComponent(input.value.trim()));
      window.history.pushState({}, '', url);
      searchVideos();
    });
  }

});

async function playVideo(videoId) {
  window.scrollTo(0, 0);
  const url = new URL(window.location);
  const lang = url.searchParams.get('lang') || "FR";
  let params = new URLSearchParams();
  params.set('v', videoId);
  params.set('lang', lang);
  // Add t param if present
  const t = url.searchParams.get('t');
  if (t) params.set('t', t);
  window.location.href = "video.html?" + params.toString();
}

function createVideoUrl(videoId) {
  const url = new URL(window.location);
  const lang = url.searchParams.get('lang') || "FR";
  let params = new URLSearchParams();
  params.set('v', videoId);
  params.set('lang', lang);
  // Add t param if present
  const t = url.searchParams.get('t');
  if (t) params.set('t', t);
  console.log("Video URL with params:", params.toString());
  videoUrl = "video.html?" + params.toString();
  return(videoUrl);
}

function createChannelUrl(channelId) {
  const url = new URL(window.location);
  const lang = url.searchParams.get('lang') || "FR";
  let params = new URLSearchParams();
  params.set('ch', channelId);
  params.set('lang', lang);
  console.log("Channel URL with params:", params.toString());
  channelUrl = "index.html?" + params.toString();
  return(channelUrl);
}
