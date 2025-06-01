const BASE_URL = 'https://www.googleapis.com/youtube/v3/search';

let nextPageToken = null;
let currentMode = 'home'; // 'home', 'search', or 'channel'
let lastQuery = '';
let lastChannelId = '';
let lastRegionCode = 'FR'; // for trending/homepage

let API_KEY = '';


// --- API Key Modal Logic ---
function promptForApiKey(errorMsg = "") {
  const modal = document.getElementById('api-key-modal');
  const errorDiv = document.getElementById('api-key-error');
  if (errorMsg) {
    errorDiv.textContent = errorMsg;
    errorDiv.style.display = 'block';
  } else {
    errorDiv.textContent = "";
    errorDiv.style.display = 'none';
  }
  modal.style.display = 'flex';
  document.getElementById('api-key-input').focus();

  document.getElementById('api-key-save-btn').onclick = async function() {
    const api_key = document.getElementById('api-key-input').value.trim();
    if (api_key) {
      // Validate the API key by making a test request
      try {
        const testResp = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=dQw4w9WgXcQ&key=${api_key}`);
        if (!testResp.ok) {
          errorDiv.textContent = "Invalid API Key. Please try again.";
          errorDiv.style.display = 'block';
          return;
        }
        // Save only if valid
        localStorage.setItem('api_key', api_key);
        API_KEY = api_key;
        modal.style.display = 'none';
        showHomepage(); // <-- Show homepage immediately, no reload
      } catch (err) {
        errorDiv.textContent = "Network error. Please try again.";
        errorDiv.style.display = 'block';
      }
    }
  };
}

async function fetchApiKey() {
  API_KEY = localStorage.getItem('api_key') || '';
  if (API_KEY) {
    return API_KEY.trim();
  } else {
    promptForApiKey();
    return null;
  }
}

async function headerClick() {
  closePlayer();
  showHomepage();
}

async function showHomepage() {
    // GO TO index.html with updated URL
    const url = new URL(window.location);
    url.searchParams.delete('ch');
    url.searchParams.delete('v');
    url.searchParams.delete('t');
    const lang = url.searchParams.get('lang');
    if (!lang) {
        lastRegionCode = 'FR';
        const url = new URL(window.location);
        url.searchParams.set('lang', lastRegionCode);
        window.history.replaceState({}, '', url); // Use replaceState to avoid history spam
        // Open URL in same tab
        window.location.href = "index.html?" + url.searchParams.toString();
    } else {
        lastRegionCode = lang;
    }
    // Set the region code in the button
    // Open URL in same tab
  window.location.href = "index.html?" + url.searchParams.toString();
    }


async function searchVideos(query) {
    // Implement search logic with search args in URL
    pass
}


async function fetchChannelVideos(channelId, loadMore = false) {
    // Implement channel video fetching logic (URL)
    pass
  }

document.addEventListener('DOMContentLoaded', () => { // Ensure player is closed on page load
  const input = document.getElementById('searchQuery');
  const btn = document.getElementById('country-code-btn');
  const list = document.getElementById('country-list');
  const dropdown = document.getElementById('country-dropdown');

  input.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
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
  const videoId = params.get('v');
  if (lang) {
    lastRegionCode = lang;
  }
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
    window.history.pushState({}, '', url);
    showHomepage();
    });
 });

  // Only start app after API key is loaded!
  if (!videoId) {
    closePlayer();
  }
  
  fetchApiKey().then(key => {
  if (key) {
    API_KEY = key;
    playVideo(videoId)
  } else {
    showHomepage();
    }
  // If key is missing/invalid, promptForApiKey() is already called inside fetchApiKey()
  }).catch(err => {
    // Optional: log error, but don't show homepage
    console.error("API Key error:", err);
  });

  const searchBtn = document.getElementById('search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', function() {
      searchVideos();
    });
  }

  const shareBtn = document.getElementById('share-btn');
  const shareModal = document.getElementById('share-modal');
  const shareLink = document.getElementById('share-link');
  const shareCloseBtn = document.getElementById('share-close-btn');

  if (shareBtn && shareModal && shareLink && shareCloseBtn) {
    shareBtn.onclick = function() {
      if (!lastPlayedVideoId) return;
      const shareUrl = `https://ccypri3n.github.io/PrivaTube/?v=${lastPlayedVideoId}`;
      shareLink.value = shareUrl;
      shareModal.style.display = 'flex';
      shareLink.select();
    };
    shareCloseBtn.onclick = function() {
      shareModal.style.display = 'none';
    };
    // Optional: close modal when clicking backdrop
    shareModal.querySelector('.api-key-modal-backdrop').onclick = function() {
      shareModal.style.display = 'none';
    };
  }
// Copy share link functionality
  const copyBtn = document.getElementById('copy-share-link-btn');
  if (copyBtn && shareLink) {
    copyBtn.onclick = function() {
      shareLink.select();
      document.execCommand('copy');
      copyBtn.textContent = "Copied!";
      setTimeout(() => { copyBtn.textContent = "Copy"; }, 1200);
    };
  }

});

function linkify(text) {
  // Regex to match URLs (http/https)
  return text.replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}

// --- Video Player Logic ---

// Show video info based on videoId (Description, Title, Channel Info)
async function videoInfoShow(videoId) {
  if (videoId) {
    let video = null;
    try {
      const resp = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}&key=${API_KEY}`);
      const data = await resp.json();
      if (data.items && data.items.length > 0) {
        video = data.items[0];
        document.getElementById('video-title').textContent = video.snippet.title;
        document.getElementById('video-description').innerHTML = linkify(video.snippet.description);
        document.getElementById('view-count').textContent = `${Number(video.statistics.viewCount).toLocaleString()} views`;
        document.getElementById('like-count').textContent = `${video.statistics.likeCount ? Number(video.statistics.likeCount).toLocaleString()+" likes": ''}`;
      } else {
        throw new Error("No video data");
      }
    } catch (err) {
      document.getElementById('video-title').textContent = 'Video Title';
      document.getElementById('video-description').textContent = 'Video description will appear here.';
      document.getElementById('view-count').textContent = 'Views: N/A';
      document.getElementById('like-count').textContent = 'Likes: N/A';
      video = null;
    }

    // Only fetch channel info if video was found
    if (video) {
      try {
        const channelID = video.snippet.channelId;
        const channelResp = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelID}&key=${API_KEY}`);
        const channelData = await channelResp.json();
        if (channelData.items && channelData.items.length > 0) {
          const channel = channelData.items[0];
          // After fetching channel info:
          document.getElementById('channel-name').textContent = channel.snippet.title;
          document.getElementById('channel-name').style.cursor = "pointer";
          document.getElementById('channel-name').onclick = () => fetchChannelVideos(channelID);

          document.getElementById('channel-avatar').src = channel.snippet.thumbnails.default.url;
          document.getElementById('channel-avatar').alt = channel.snippet.title;
          document.getElementById('channel-avatar').style.cursor = "pointer";
          document.getElementById('channel-avatar').onclick = () => fetchChannelVideos(channelID);
          document.getElementById('channel-subscribers').textContent =
            channel.statistics.subscriberCount
              ? `${Number(channel.statistics.subscriberCount).toLocaleString()} subscribers`
              : '';
        }
      } catch (err) {
        console.error("Error fetching channel info:", err);
        document.getElementById('channel-avatar').src = '';
        document.getElementById('channel-avatar').alt = '';
        document.getElementById('channel-avatar').style.cursor = "default";
        document.getElementById('channel-name').textContent = 'Channel Name';
        document.getElementById('channel-name').style.cursor = "default";
        document.getElementById('channel-subscribers').textContent = 'Channel Subscribers: N/A';
      }
    } else {
      document.getElementById('channel-avatar').src = '';
      document.getElementById('channel-avatar').alt = '';
      document.getElementById('channel-name').textContent = '';
      document.getElementById('channel-subscribers').textContent = '';
    }
  } else {
    document.getElementById('video-title').textContent = "";
    document.getElementById('video-description').textContent = "";
    document.getElementById('video-description').innerHTML = "";
    document.getElementById('view-count').textContent = "";
    document.getElementById('like-count').textContent = "";
    document.getElementById('channel-avatar').src = '';
    document.getElementById('channel-avatar').alt = '';
    document.getElementById('channel-avatar').style.cursor = "default";
    document.getElementById('channel-name').textContent = '';
    document.getElementById('channel-name').style.cursor = "default";
    document.getElementById('channel-subscribers').textContent = '';
  }
}

let lastPlayedVideoId = null;

async function playVideo(videoId) {
  window.scrollTo(0, 0);
  lastPlayedVideoId = videoId; // Track for sharing
  document.body.classList.add('video-playing');
  const url = new URL(window.location);
  url.searchParams.delete('ch');
  url.searchParams.set('v', videoId);
  const time = url.searchParams.get('t');
  // Use pushState to update URL without reloading
  window.history.pushState({}, '', url);
  let videoUrl = `https://www.youtube-nocookie.com/embed/${videoId}`;
  if (time && !isNaN(Number(time))) {
    videoUrl += `?start=${Number(time)}`;
  }
  const playerDiv = document.getElementById('video');
  const resultsDiv = document.getElementById('results');
  const bannerDiv = document.getElementById('channel-banner');
  const videoInfoDiv = document.getElementById('video-info');
  playerDiv.innerHTML = `<iframe
      class="video-embed"
      src="${videoUrl}"
      title="PrivaTube Video Player"
      allow="web-share"
      referrerpolicy="strict-origin-when-cross-origin"
      allowfullscreen>
    </iframe>`;
  playerDiv.style.display = 'block';
  if (resultsDiv) resultsDiv.style.display = 'none';
  if (bannerDiv) bannerDiv.style.display = 'none';
  if (videoInfoDiv) videoInfoDiv.style.display = 'block'; // <-- Show info
  videoInfoShow(videoId);
  
}

function closePlayer() {
  document.body.classList.remove('video-playing');
  const playerDiv = document.getElementById('video');
  const resultsDiv = document.getElementById('results');
  const bannerDiv = document.getElementById('channel-banner');
  const videoInfoDiv = document.getElementById('video-info');
  playerDiv.innerHTML = '';
  playerDiv.style.display = 'none';
  if (resultsDiv) resultsDiv.style.display = '';
  if (bannerDiv) bannerDiv.style.display = '';
  if (videoInfoDiv) videoInfoDiv.style.display = 'none'; // <-- Hide info
  videoInfoShow(false);
  const url = new URL(window.location);
  url.searchParams.delete('v');
  window.history.pushState({}, '', url);
}