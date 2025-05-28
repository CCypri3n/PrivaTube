const BASE_URL = 'https://www.googleapis.com/youtube/v3/search';

let nextPageToken = null;
let currentMode = 'home'; // 'home', 'search', or 'channel'
let lastQuery = '';
let lastChannelId = '';
let lastRegionCode = 'FR'; // for trending/homepage

let API_KEY = '';

// Helper to parse ISO 8601 duration (e.g., PT45S, PT1M2S)
function parseDuration(isoDuration) {
  const match = isoDuration.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
  const minutes = parseInt(match && match[1] ? match[1] : '0', 10);
  const seconds = parseInt(match && match[2] ? match[2] : '0', 10);
  return minutes * 60 + seconds;
}

// Filter shorts from a list of video items using duration and #shorts in title/description
// Filter shorts from a list of video items using duration and #shorts in title/description
async function filterOutShorts(videoItems) {
  if (!videoItems.length) return [];
  const ids = videoItems.map(item => item.id.videoId || item.id).join(',');
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${ids}&key=${API_KEY}`
  );
  const data = await response.json();
  const allowedIds = data.items
    .filter(v => {
      // Filter by duration
      const isLong = parseDuration(v.contentDetails.duration) > 60;
      // Filter by #shorts in title or description
      const title = v.snippet.title || '';
      const desc = v.snippet.description || '';
      const hasShortsTag = /#shorts/i.test(title) || /#shorts/i.test(desc);
      return isLong && !hasShortsTag;
    })
    .map(v => v.id);

  // Return only videos that pass both filters
  return videoItems.filter(item => allowedIds.includes(item.id.videoId || item.id));
}


// --- Fetch API Key from Key.txt ---
// --- API Key Modal Logic ---
function promptForApiKey() {
  const modal = document.getElementById('api-key-modal');
  modal.style.display = 'flex';
  document.getElementById('api-key-input').focus();

  document.getElementById('api-key-save-btn').onclick = function() {
    const key = document.getElementById('api-key-input').value.trim();
    if (key) {
      localStorage.setItem('YOUTUBE_API_KEY', key);
      API_KEY = key;
      modal.style.display = 'none';
      showHomepage();
    }
  };
}

// --- Fetch API Key from localStorage or Key.txt ---
async function fetchApiKey() {
  // Always prompt for API key on GitHub Pages
  promptForApiKey();
  // Return a promise that never resolves, to halt further init until key is set
  return new Promise(() => {});
}


// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  // ... your dropdown and load more logic ...

  fetchApiKey().then(key => {
    API_KEY = key;
    showHomepage();
  }).catch(err => {
    console.error("Failed to load API Key:", err);
  });
});


// --- Homepage Trending Videos ---
async function showHomepage(loadMore = false) {
  document.getElementById('channel-banner').style.display = 'none';
  currentMode = 'home';
  const resultsDiv = document.getElementById('results');
  if (!loadMore) {
    resultsDiv.innerHTML = "<p>Loading trending videos...</p>";
    nextPageToken = null;
  }
  try {
    let url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&chart=mostPopular&regionCode=${lastRegionCode}&maxResults=24&key=${API_KEY}`;
    if (nextPageToken) url += `&pageToken=${nextPageToken}`;
    const response = await fetch(url);
    const data = await response.json();
    nextPageToken = data.nextPageToken || null;
    // Filter out Shorts directly (contentDetails is already present)
    const items = data.items.filter(item => parseDuration(item.contentDetails.duration) > 60)
      .map(item => ({
        id: { kind: "youtube#video", videoId: item.id },
        snippet: item.snippet
      }));
    if (loadMore) {
      appendResults(items);
    } else {
      displayResults(items);
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
  document.getElementById('channel-banner').style.display = 'none';
  const query = document.getElementById('searchQuery').value;
  if (!query.trim()) return;
  currentMode = 'search';
  lastQuery = query;
  const resultsDiv = document.getElementById('results');
  if (!loadMore) {
    resultsDiv.innerHTML = "<p>Searching...</p>";
    nextPageToken = null;
  }
  try {
    let url = `${BASE_URL}?part=snippet&q=${encodeURIComponent(query)}&type=video,channel&key=${API_KEY}&maxResults=24`;
    if (nextPageToken) url += `&pageToken=${nextPageToken}`;
    const response = await fetch(url);
    const data = await response.json();
    nextPageToken = data.nextPageToken || null;
    // Separate videos and channels
    const videoItems = data.items.filter(item => item.id.kind === "youtube#video");
    const channelItems = data.items.filter(item => item.id.kind === "youtube#channel");
    // Filter out Shorts from videos
    const filteredVideos = await filterOutShorts(videoItems);
    const finalItems = [...filteredVideos, ...channelItems];
    if (loadMore) {
      appendResults(finalItems);
    } else {
      displayResults(finalItems);
    }
    toggleLoadMoreButton(!!nextPageToken);
  } catch (error) {
    resultsDiv.innerHTML = "<p>Error searching videos.</p>";
    toggleLoadMoreButton(false);
    console.error('Error:', error);
  }
}

// --- Fetch Channel Videos ---

async function fetchChannelVideos(channelId, loadMore = false) {
  currentMode = 'channel';
  lastChannelId = channelId;
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
        bannerDiv.style.display = 'block';
        bannerDiv.innerHTML = `
            <div class="channel-banner-inner">
            ${bannerUrl ? `<img class="channel-banner-img" src="${bannerUrl}" alt="Channel Banner">` : ''}
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

  // ... rest of your code for fetching and displaying channel videos ...
  try {
    // Get uploads playlist ID (only on first load or if channel changed)
    let uploadsPlaylistId = fetchChannelVideos.uploadsPlaylistId;
    if (!uploadsPlaylistId || lastChannelId !== fetchChannelVideos.lastChannelId) {
      const channelResp = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${API_KEY}`
      );
      const channelData = await channelResp.json();
      uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;
      fetchChannelVideos.uploadsPlaylistId = uploadsPlaylistId;
      fetchChannelVideos.lastChannelId = channelId;
    }

    let filteredVideos = [];
    let attempts = 0;
    let localPageToken = nextPageToken;
    // Try up to 5 pages to collect enough non-Shorts
    while (filteredVideos.length < 24 && attempts < 5) {
      let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=24&key=${API_KEY}`;
      if (localPageToken) url += `&pageToken=${localPageToken}`;
      const playlistResp = await fetch(url);
      const playlistData = await playlistResp.json();
      localPageToken = playlistData.nextPageToken || null;
      const videoItems = playlistData.items.map(item => ({
        id: { kind: "youtube#video", videoId: item.snippet.resourceId.videoId },
        snippet: item.snippet
      }));
      const nonShorts = await filterOutShorts(videoItems);
      filteredVideos = filteredVideos.concat(nonShorts);
      // If there are no more pages, break early
      if (!localPageToken) break;
      attempts++;
    }
    // Set the global nextPageToken for "Load More"
    nextPageToken = localPageToken;

    // Only show up to 24 videos per page
    const videosToShow = filteredVideos.slice(0, 24);

    if (loadMore) {
      appendResults(videosToShow);
    } else {
      displayResults(videosToShow);
    }
    toggleLoadMoreButton(!!nextPageToken);
  } catch (err) {
    resultsDiv.innerHTML = '<p>Could not load channel videos.</p>';
    toggleLoadMoreButton(false);
    console.error(err);
  }
}




// --- Results Rendering Helpers ---
function displayResults(items) {
  const resultsDiv = document.getElementById('results');
  if (!items || items.length === 0) {
    resultsDiv.innerHTML = "<p>No results found.</p>";
    toggleLoadMoreButton(false);
    return;
  }
  resultsDiv.innerHTML = items.map(renderResultItem).join('');
}

function appendResults(items) {
  const resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML += items.map(renderResultItem).join('');
}

function renderResultItem(item) {
  if (item.id.kind === "youtube#video") {
    // Format date as "YYYY-MM-DD" or any other style you prefer
    const dateStr = item.snippet.publishedAt
      ? new Date(item.snippet.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : '';
    return `
        <div class="video-item">
            <a href="https://www.youtube-nocookie.com/embed/${item.id.videoId}"  rel="noopener">
            <img src="${item.snippet.thumbnails.medium.url}" alt="${item.snippet.title}" />
            </a>
            <h3>${item.snippet.title}</h3>
            <div class="video-meta">
            <span class="video-date">${dateStr}</span>
            <span class="video-meta-sep">&nbsp;•&nbsp;</span>
            <a href="#" class="channel-link" onclick="fetchChannelVideos('${item.snippet.channelId}'); return false;">
                ${item.snippet.channelTitle}
            </a>
            </div>
        </div>
        `;
  } else if (item.id.kind === "youtube#channel") {
    return `
      <div class="channel-item" data-channel-id="${item.id.channelId}" onclick="fetchChannelVideos('${item.id.channelId}')">
        <img src="${item.snippet.thumbnails.medium.url}" alt="${item.snippet.title}" />
        <h3>${item.snippet.title}</h3>
        <p class="attention">Click to view channel videos</p>
      </div>
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
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('searchQuery');
  input.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
      searchVideos();
    }
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
  fetchApiKey().then(key => {
    API_KEY = key;
    showHomepage();
  }).catch(err => {
    console.error("Failed to load API Key:", err);
  });
});
