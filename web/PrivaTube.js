const BASE_URL = 'https://www.googleapis.com/youtube/v3/search';

let nextPageToken = null;
let currentMode = 'home'; // 'home', 'search', or 'channel'
let lastChannelId = '';
let lastRegionCode = 'FR'; // for trending/homepage

let API_KEY = '';

function parseDurationToVisual(duration) {
    // Regular expression to parse the duration
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

    if (!match) {
        return "Invalid duration format";
    }

    // Extract hours, minutes, and seconds
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;

    // Format to hh:mm:ss or mm:ss based on whether hours are present
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

// Keep only listable videos (see isListable in shorts.js). Videos absent from the
// `videos` response (private/deleted) are dropped silently.
async function filterOutShorts(videoItems) {
  if (!videoItems.length) return [];
  const ids = videoItems.map(item => item.id.videoId || item.id).join(',');
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${ids}&key=${API_KEY}`
  );
  const data = await response.json();
  const allowedIds = new Set((data.items || [])
    .filter(v => isListable({
      duration: v.contentDetails.duration,
      title: v.snippet.title,
      description: v.snippet.description
    }))
    .map(v => v.id));
  return videoItems.filter(item => allowedIds.has(item.id.videoId || item.id));
}

// Fetch pages until ~PAGE_SIZE items survive filtering or no pages remain.
// fetchPage(token) -> { items (already filtered), nextPageToken }.
const PAGE_SIZE = 24;
const MAX_REFILL_PAGES = 5;
async function collectPages(fetchPage, startToken) {
  let items = [];
  let token = startToken;
  for (let i = 0; i < MAX_REFILL_PAGES; i++) {
    const page = await fetchPage(token);
    items = items.concat(page.items);
    token = page.nextPageToken || null;
    if (!token || items.length >= PAGE_SIZE) break;
  }
  return { items, nextPageToken: token };
}

// --- API Key Modal Logic ---
function fetchApiKey() {
  const storedKey = localStorage.getItem('api_key');
  if (storedKey) {
    return Promise.resolve(storedKey.trim());
  }

  return new Promise((resolve, reject) => {
    // Show modal and set up event listener for save button
    const modal = document.getElementById('api-key-modal');
    const errorDiv = document.getElementById('api-key-error');
    modal.style.display = 'flex';
    document.getElementById('api-key-input').focus();

    const onSave = async () => {
      const api_key = document.getElementById('api-key-input').value.trim();
      if (!api_key) {
        errorDiv.textContent = "Please enter an API key.";
        errorDiv.style.display = 'block';
        return;
      }
      try {
        const testResp = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=dQw4w9WgXcQ&key=${api_key}`
        );
        if (!testResp.ok) {
          errorDiv.textContent = "Invalid API Key. Please try again.";
          errorDiv.style.display = 'block';
          return;
        }
        localStorage.setItem('api_key', api_key);
        API_KEY = api_key;
        modal.style.display = 'none';
        document.getElementById('api-key-save-btn').removeEventListener('click', onSave);
        resolve(api_key);
      } catch (err) {
        errorDiv.textContent = "Network error. Please try again.";
        errorDiv.style.display = 'block';
      }
    };

    document.getElementById('api-key-save-btn').addEventListener('click', onSave);
  });
}


async function headerClick() {
  showHomepage();
}

// --- Homepage Trending Videos ---
async function showHomepage(loadMore = false) {
  currentMode = 'home';
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
  if (!loadMore) {
    resultsDiv.innerHTML = "<p>Loading trending videos...</p>";
    nextPageToken = null;
  }
  try {
    const result = await collectPages(async token => {
      let url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&chart=mostPopular&regionCode=${lastRegionCode}&maxResults=${PAGE_SIZE}&key=${API_KEY}`;
      if (token) url += `&pageToken=${token}`;
      const data = await (await fetch(url)).json();
      return {
        nextPageToken: data.nextPageToken,
        items: data.items
          .filter(item => isListable({
            duration: item.contentDetails.duration,
            title: item.snippet.title,
            description: item.snippet.description
          }))
          .map(item => ({ id: { kind: "youtube#video", videoId: item.id }, snippet: item.snippet }))
      };
    }, nextPageToken);
    nextPageToken = result.nextPageToken;
    const items = result.items;
    if (loadMore) {
      displayResults(true, items);
    } else {
      displayResults(false, items);
    }
    toggleLoadMoreButton(!!nextPageToken);
  } catch (error) {
    resultsDiv.innerHTML = "<p>Could not load trending videos.</p>";
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
  const query = url.searchParams.get('q')
  console.log("Search query from URL:", query);
  if (!query) {
    queryFromField = document.getElementById('searchQuery').value.trim();
    console.log("Search query from field:", queryFromField);
    url.searchParams.set('q', queryFromField);
    window.history.replaceState({}, '', url);
    query = url.searchParams.get('q');
    console.log("Search query from URL:", query);
  }
  if (!query.trim()) return;
  currentMode = 'search';
  const resultsDiv = document.getElementById('results');
  if (!loadMore) {
    resultsDiv.innerHTML = "<p>Searching...</p>";
    nextPageToken = null;
  }
  try {
    let channelStats = {};
    const result = await collectPages(async token => {
      let url = `${BASE_URL}?part=snippet&q=${query}&type=video,channel&key=${API_KEY}&maxResults=${PAGE_SIZE}`;
      if (token) url += `&pageToken=${token}`;
      const data = await (await fetch(url)).json();
      const videoItems = data.items.filter(item => item.id.kind === "youtube#video");
      const channelItems = data.items.filter(item => item.id.kind === "youtube#channel");
      const channelIds = channelItems.map(item => item.id.channelId).join(',');
      if (channelIds) {
        const statsData = await (await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelIds}&key=${API_KEY}`
        )).json();
        statsData.items.forEach(ch => {
          channelStats[ch.id] = ch.statistics.subscriberCount;
        });
      }
      const filteredVideos = await filterOutShorts(videoItems);
      return { nextPageToken: data.nextPageToken, items: [...filteredVideos, ...channelItems] };
    }, nextPageToken);
    nextPageToken = result.nextPageToken;
    const finalItems = result.items;
    if (loadMore) {
      displayResults(true, finalItems, channelStats);
    } else {
      displayResults(false, finalItems, channelStats);
    }
    toggleLoadMoreButton(!!nextPageToken);
  } catch (error) {
    resultsDiv.innerHTML = "<p>Error searching videos.</p>";
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
  if (!loadMore) {
    resultsDiv.innerHTML = "<p>Loading channel videos...</p>";
    nextPageToken = null;
    fetchChannelVideos.uploadsPlaylistId = null;
    fetchChannelVideos.lastChannelId = null;
    // Fetch and display channel banner and name
    try {
      const channelInfoResp = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,brandingSettings&id=${channelId}&key=${API_KEY}`
      );
      const channelInfoData = await channelInfoResp.json();
      if (channelInfoData.items && channelInfoData.items.length > 0) {
        const channel = channelInfoData.items[0];
        const bannerUrl = channel.brandingSettings?.image?.bannerExternalUrl;
        const channelName = channel.snippet?.title || '';
        document.title = `PrivaTube - Checking out "${channel.snippet.title}"`;
        bannerDiv.style.display = 'block';
        bannerDiv.innerHTML = `
            <div class="channel-banner-inner">
            ${bannerUrl ? `<img class="channel-banner-img" src="${bannerUrl}" alt="">` : ''}
            <div class="channel-banner-title">${channelName}</div>
            </div>
        `;
        } else {
        bannerDiv.style.display = 'none';
        }

    } catch (e) {
      bannerDiv.style.display = 'none';
    }
  }

  try {
    // Get uploads playlist ID (only on first load or if channel changed)
    let uploadsPlaylistId = fetchChannelVideos.uploadsPlaylistId;
    if (!uploadsPlaylistId || lastChannelId !== fetchChannelVideos.lastChannelId) {
      const channelResp = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${API_KEY}`
      );
      const channelData = await channelResp.json();
      if (!channelData.items || !channelData.items.length) {
        resultsDiv.innerHTML = '<p>Channel not found.</p>';
        toggleLoadMoreButton(false);
        return;
      }
      uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;
      fetchChannelVideos.uploadsPlaylistId = uploadsPlaylistId;
      fetchChannelVideos.lastChannelId = channelId;
    }

    const result = await collectPages(async token => {
      let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${PAGE_SIZE}&key=${API_KEY}`;
      if (token) url += `&pageToken=${token}`;
      const playlistData = await (await fetch(url)).json();
      const videoItems = playlistData.items.map(item => ({
        id: { kind: "youtube#video", videoId: item.snippet.resourceId.videoId },
        snippet: item.snippet
      }));
      return { nextPageToken: playlistData.nextPageToken, items: await filterOutShorts(videoItems) };
    }, nextPageToken);
    const filteredVideos = result.items;
    nextPageToken = result.nextPageToken;

    const videosToShow = filteredVideos; // not sliced: the page token has already advanced past these

if (loadMore) {
      displayResults(true, videosToShow);
    } else {
      displayResults(false, videosToShow);
    }
    toggleLoadMoreButton(!!nextPageToken);
  } catch (err) {
    resultsDiv.innerHTML = '<p>Could not load channel videos.</p>';
    toggleLoadMoreButton(false);
    console.error(err);
  }
}




// --- Results Rendering Helpers ---
async function displayResults(append, items, channelStats = {}) {
  const resultsDiv = document.getElementById('results');
  if (!items || items.length === 0) {
    resultsDiv.innerHTML = "<p>No results found.</p>";
    toggleLoadMoreButton(false);
    return;
  }
  const videoItems = items.filter(item => item.id.kind === "youtube#video");
  const videoIds = videoItems.map(item => item.id.videoId).join(',');
  let videoStats = {};
  if (videoIds) {
    const statsResp = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${videoIds}&key=${API_KEY}`
    );
    const statsData = await statsResp.json();
    statsData.items.forEach(v => {
      videoStats[v.id] = v;
    });
  }
  if (append) {
    resultsDiv.innerHTML += items.map(item => renderResultItem(item, channelStats, videoStats)).join('');
  }
  else {
    resultsDiv.innerHTML = items.map(item => renderResultItem(item, channelStats, videoStats)).join('');
  }
}

function renderResultItem(item, channelStats = {}, videoStats = {}) {
  if (item.id.kind === "youtube#video") {
    const stats = videoStats[item.id.videoId];
    // Format date as "YYYY-MM-DD" or any other style you prefer
    const dateStr = item.snippet.publishedAt
      ? new Date(item.snippet.publishedAt).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' })
      : '';
    const videoUrl = createVideoUrl(item.id.videoId);
    const channelUrl = createChannelUrl(item.snippet.channelId);
    const duration = stats && stats.contentDetails ? parseDurationToVisual(stats.contentDetails.duration) : 'N/A';
    return `
        <div class="video-item">
            <a href="${videoUrl}" target="_self">
              <div class="video-thumb-container">
                <img src="${item.snippet.thumbnails.medium.url}" alt="${item.snippet.title}" />
                <span class="video-duration">${duration}</span>
              </div>
            </a>
            <h3>${item.snippet.title}</h3>
            <div class="video-meta">
            <span class="video-date">${dateStr}</span>
            <span class="video-meta-sep">&nbsp;•&nbsp;</span>
            <a href="${channelUrl}" class="channel-link" target="_self">
                ${item.snippet.channelTitle}
            </a>
            <span class="video-meta-sep">&nbsp;•&nbsp;</span>
            <span class="video-views-render">
                ${stats && stats.statistics.viewCount ? Number(stats.statistics.viewCount).toLocaleString() : 'N/A'} views
            </span>
            </div>
        </div>
        `
  } else if (item.id.kind === "youtube#channel") {
    const subs = channelStats[item.id.channelId];
    const channelUrl = createChannelUrl(item.id.channelId);
    return `
    <a href="${channelUrl}" target="_self">
      <div class="channel-item" data-channel-id="${item.id.channelId}" onclick="fetchChannelVideos('${item.id.channelId}')">
        <img src="${item.snippet.thumbnails.medium.url}" alt="${item.snippet.title}" />
        <h3>${item.snippet.title}</h3>
        <p class="attention">Click to view channel videos</p>
        <p class="subs">${subs ? `${Number(subs).toLocaleString()} subscribers` : ''}</p>
      </div>
    </a>
    `;
  } else {
    return '';
  }
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
  fetchApiKey().then(key => {
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
  // If key is missing/invalid, promptForApiKey() is already called inside fetchApiKey()
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
