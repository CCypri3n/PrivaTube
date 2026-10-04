let currentMode = 'home'; // 'home', 'search', or 'channel'
let lastQuery = '';
let lastChannelId = '';
let lastRegionCode = 'FR'; // for trending/homepage
let currentCommentsVideoId = null;
let currentComments = null;      // the comment Listing for the current video and sort
let currentCommentCount = null;  // comment total of the current video (number or null)
let commentSort = 'relevance'; // Default sort order for comments, time or relevance

let API_KEY = '';

function youtube() {
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

// Load-failure area: one message, with the video details hidden and emptied.
const DETAIL_IDS = ['video-info', 'video-stats', 'comment-action-wrapper'];
const DETAIL_TEXT_IDS = ['video-title', 'video-description', 'view-count', 'video-published-date',
  'channel-name', 'channel-subscribers', 'channel-likes', 'comment-count'];

function clearLoadError({ restoreDetails = false } = {}) {
  const errorDiv = document.getElementById('video-error');
  errorDiv.textContent = '';
  errorDiv.style.display = 'none';
  if (!restoreDetails) return;
  DETAIL_IDS.forEach(id => { document.getElementById(id).style.display = ''; });
  document.getElementById('video-info').style.display = 'block';
}

function showLoadError(error) {
  const message = (error && error.reason === 'not_found')
    ? 'Video not found.'
    : messageForFailure(error, 'Could not load this video.');
  DETAIL_IDS.forEach(id => { document.getElementById(id).style.display = 'none'; });
  DETAIL_TEXT_IDS.forEach(id => { document.getElementById(id).textContent = ''; });
  document.getElementById('video-description').innerHTML = '';
  document.getElementById('channel-avatar').src = '';
  document.getElementById('comment-wrapper').innerHTML = '';
  toggleLoadMoreButton(false);
  currentComments = null;
  currentCommentsVideoId = null;
  const errorDiv = document.getElementById('video-error');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

function commentCountText() {
  return currentCommentCount ? `${currentCommentCount.toLocaleString('en-EN')} Comments` : 'N/A Comments';
}



async function headerClick() {
  closePlayer();
  showHomepage();
}

async function showHomepage() {
    // GO TO index.html in the same tab, keeping the region
    lastRegionCode = Route.parse(window.location.search).region;
    window.location.href = Route.home({ region: lastRegionCode });
}


async function searchVideos(query) {
    // Search happens on the browse page: go there with the query in the URL
    closePlayer();
    const queryFromField = document.getElementById('searchQuery').value.trim();
    window.location.href = Route.search(queryFromField, Route.parse(window.location.search));
}


document.addEventListener('DOMContentLoaded', () => { // Ensure player is closed on page load
  const input = document.getElementById('searchQuery');
  const btn = document.getElementById('country-code-btn');
  const list = document.getElementById('country-list');
  const mainHeader = document.getElementById('main-header-link');
  const copyBtn = document.getElementById('copy-share-link-btn');
  const startRoute = Route.parse(window.location.search);
  const videoId = startRoute.videoId;
  const searchBtn = document.getElementById('search-btn');
  const shareBtn = document.getElementById('share-btn');
  const shareModal = document.getElementById('share-modal');
  const shareLink = document.getElementById('share-link');
  const shareCloseBtn = document.getElementById('share-close-btn');
  const commentSortBtn = document.getElementById('comment-sort-btn');
  const commentList = document.getElementById('comment-list');


  closePlayer(); // Close player on page load
    if (input) {
        input.value = ''; // Clear search input
    }

  input.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
      searchVideos();
    }
  });

  document.addEventListener('keydown', function(event) {
  if (event.key === "Escape" && shareModal && shareModal.style.display === 'flex') {
    shareModal.style.display = 'none';
  }
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    list.style.display = (list.style.display === 'block') ? 'none' : 'block';
    btn.classList.toggle('active');
  });

  commentSortBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    commentList.style.display = (commentList.style.display === 'block') ? 'none' : 'block';
    commentSortBtn.classList.toggle('active');
  });

  // Hide dropdown when clicking outside
  document.addEventListener('click', () => {
    list.style.display = 'none';
    btn.classList.remove('active');
    commentList.style.display = 'none';
    commentSortBtn.classList.remove('active');
  });

  lastRegionCode = startRoute.region;
  mainHeader.href = Route.home({ region: lastRegionCode }); // Update header link to include region code
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
    const route = { ...Route.parse(window.location.search), region: lastRegionCode };
    // Stay on the player page: rebuild the video href (a page without ?v= would parse as home).
    if (route.videoId) window.history.replaceState({}, '', Route.video(route.videoId, route));
    mainHeader.href = Route.home({ region: lastRegionCode }); // Update header link to include region code
    });
 });
  // Handle sort selection
  commentList.querySelectorAll('div').forEach(item => {
    item.addEventListener('click', (e) => {
      const code = item.getAttribute('data-code');
      commentSort = code === 'recent' ? 'time' : 'relevance';
      commentList.style.display = 'none';
      commentSortBtn.classList.remove('active');
      // Reload comments with new sort order
      if (currentCommentsVideoId) {
        displayComments(currentCommentsVideoId);
        document.getElementById("comment-count").textContent = commentCountText();
      }
    });
  });
  
  // The player page has no listings, so the Shorts setting needs no action here.
  Settings.bindPanel({
    onForgetKey: () => {
      ApiKey.clearKey();
      API_KEY = '';
      ApiKey.getKey().then(key => {
        API_KEY = key;
        if (lastPlayedVideoId) playVideo(lastPlayedVideoId);
      }).catch(err => console.error("API Key error:", err));
    }
  });

  ApiKey.getKey().then(key => {
  if (key && videoId) {
    API_KEY = key;
    playVideo(videoId)
  } else {
    closePlayer();
    }
  // If key is missing/invalid, ApiKey.getKey() keeps showing the popup until a key is accepted
  }).catch(err => {
    // Optional: log error, but don't show homepage
    console.error("API Key error:", err);
  });

  if (searchBtn) {
    searchBtn.addEventListener('click', function() {
      searchVideos();
    });
  }

  
  if (shareBtn && shareModal && shareLink && shareCloseBtn) {
    shareBtn.onclick = function() {
      if (!lastPlayedVideoId) return;
      shareLink.value = Route.share(lastPlayedVideoId, { t: Route.parse(window.location.search).t });
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
  if (copyBtn && shareLink) {
    copyBtn.onclick = function() {
      shareLink.select();
      document.execCommand('copy');
      copyBtn.textContent = "Copied!";
      setTimeout(() => { copyBtn.textContent = "Copy"; }, 1200);
    };
  }

});

// --- Video Player Logic ---

// Show video info based on videoId (Description, Title, Channel Info)
async function videoInfoShow(videoId) {
  if (videoId) {
    let video = null;
    try {
      video = await youtube().video(videoId);
      clearLoadError({ restoreDetails: true });
      document.getElementById('video-title').textContent = video.title;
      document.getElementById('video-description').innerHTML = Safe.description(video.description, { videoId, region: Route.parse(window.location.search).region });
      document.getElementById('view-count').innerHTML = video.viewCount
          ? `<img src="web/icons/views-96.svg" alt="Views" class="description-view-icon" style="width:16px;height:16px;vertical-align:middle;margin-left:8px;margin-right:4px;">${Safe.escape(video.viewCount.toLocaleString('de-DE'))}`
          : '';
      const publishedDate = new Date(video.publishedAt);
      document.getElementById('video-published-date').textContent =
        publishedDate
          ? publishedDate.toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' })
          : '';
      currentCommentsVideoId = videoId;
      currentCommentCount = video.commentCount;
      displayComments(videoId); // Load comments for the video
      document.getElementById("comment-count").textContent = commentCountText();
    } catch (err) {
      console.error("Error fetching video info:", err);
      showLoadError(err);
      return;
    }

    if (video && video.channel) {
      const channel = video.channel;
      document.getElementById('channel-name').textContent = channel.title;
      document.getElementById('channel-name').style.cursor = "pointer";
      const likeCount = video.likeCount ? video.likeCount.toLocaleString() : '';
      document.getElementById('channel-likes').innerHTML = likeCount
        ? `<img src="web/icons/like-96.svg" alt="Likes" class="channel-like-icon" style="width:16px;height:16px;vertical-align:middle;margin-left:8px;margin-right:4px;">${Safe.escape(likeCount)}`
        : '';
      document.getElementById('channel-avatar').src = Safe.url(channel.avatar, '');
      document.getElementById('channel-avatar').alt = channel.title;
      document.getElementById('channel-avatar').style.cursor = "pointer";
      document.getElementById('channel-link').href = Route.channel(channel.id, Route.parse(window.location.search));
      document.getElementById('channel-subscribers').textContent =
        channel.subscriberCount
          ? `${channel.subscriberCount.toLocaleString()} subscribers`
          : '';
      document.title = `PrivaTube - Watching "${channel.title}"`;
    } else if (video) {
      document.getElementById('channel-avatar').src = '';
      document.getElementById('channel-avatar').alt = '';
      document.getElementById('channel-avatar').style.cursor = "default";
      document.getElementById('channel-name').textContent = 'Channel Name';
      document.getElementById('channel-name').style.cursor = "default";
      document.getElementById('channel-subscribers').textContent = 'Channel Subscribers: N/A';
    } else {
      document.getElementById('channel-avatar').src = '';
      document.getElementById('channel-avatar').alt = '';
      document.getElementById('channel-name').textContent = '';
      document.getElementById('channel-subscribers').textContent = '';
    }
  } else {
    clearLoadError();
    document.getElementById('video-title').textContent = "";
    document.getElementById('video-description').textContent = "";
    document.getElementById('video-description').innerHTML = "";
    document.getElementById('view-count').textContent = "";
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
  const route = Route.parse(window.location.search);
  // Update the URL without reloading
  window.history.replaceState({}, '', Route.video(videoId, route));
  let videoUrl = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;
  if (route.t !== null) {
    videoUrl += `?start=${route.t}`;
  }
  const playerDiv = document.getElementById('video');
  const resultsDiv = document.getElementById('results');
  const bannerDiv = document.getElementById('channel-banner');
  const videoInfoDiv = document.getElementById('video-info');
  // Built with DOM calls: videoId comes from the address bar, so it must never be parsed as HTML.
  const iframe = document.createElement('iframe');
  iframe.className = 'video-embed';
  iframe.src = videoUrl;
  iframe.title = 'PrivaTube Video Player';
  iframe.setAttribute('allow', 'web-share');
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.allowFullscreen = true;
  playerDiv.replaceChildren(iframe);
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
}

// (Re)starts the comment list for a video with the current sort order.
function displayComments(videoId) {
  const commentWrapper = document.getElementById('comment-wrapper');
  if (!commentWrapper) {
    console.error('No comment element found in html:', commentWrapper);
    return;
  }
  commentWrapper.innerHTML = ''; // Clear previous comments
  toggleLoadMoreButton(false);
  if (!videoId) {
    currentComments = null;
    commentWrapper.textContent = 'No video selected.';
    return;
  }
  currentComments = youtube().comments(videoId, { order: commentSort });
  loadMoreComments(true);
}

async function loadMoreComments(first = false) {
  const commentWrapper = document.getElementById('comment-wrapper');
  const list = currentComments;
  if (!list) return;
  let batch;
  try {
    batch = await list.more();
  } catch (err) {
    if (list !== currentComments) return; // sort changed meanwhile
    console.error("Error fetching comments:", err);
    if (first) {
      commentWrapper.innerHTML = '';
      const msg = document.createElement('div');
      msg.className = 'video-error';
      msg.textContent = messageForFailure(err, 'Error loading comments.');
      commentWrapper.appendChild(msg);
    }
    else toggleLoadMoreButton(true); // allow retry
    return;
  }
  if (list !== currentComments) return; // sort changed meanwhile: drop stale batch
  if (first && batch.items.length === 0) {
    commentWrapper.textContent = 'No comments available.';
    toggleLoadMoreButton(false);
    return;
  }
  batch.items.forEach(comment => {
    const commentDiv = document.createElement('div');
    const channelUrl = comment.authorChannelId ? Route.channel(comment.authorChannelId, Route.parse(window.location.search)) : '';
    const rawText = comment.text;
    if (!rawText) {
      console.warn("Comment text is empty, skipping:", comment);
      return; // Skip empty comments
    }
    const text = Safe.comment(rawText, { region: Route.parse(window.location.search).region });
    const likeCount = comment.likeCount ? comment.likeCount.toLocaleString() : '';
    commentDiv.className = 'comment';
    commentDiv.innerHTML = `
      <a href="${Safe.escape(channelUrl)}" class="comment-avatar-link">
        <img src="${Safe.urlAttr(comment.authorAvatar, 'web/icons/unavailableAvatar-96.svg')}" alt=" " class="comment-avatar"
          onerror="this.onerror=null;this.src='web/icons/unavailableAvatar-96.svg';">
      </a>
      <div class="comment-main">
        <div class="comment-header">
        ${comment.authorChannelId ? `<a href="${Safe.escape(channelUrl)}" class="comment-author-link"><label class="comment-author">${Safe.escape(comment.authorName)}</label></a>` : `<strong class="comment-author">${Safe.escape(comment.authorName)}</strong>`}
          <span class="comment-date">${Safe.escape(
          new Date(comment.publishedAt).toLocaleString(undefined, {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
          })
        )}</span>
        </div>
        <div class="comment-text">${text}</div>
         <div class="comment-likes">
            ${likeCount ? `<img src="web/icons/like-96.svg" alt="Likes" class="comment-like-icon" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;">${Safe.escape(likeCount)}` : ''}
          </div>
      </div>
    `;
    commentWrapper.appendChild(commentDiv);
  });
  toggleLoadMoreButton(batch.hasMore);
}

document.getElementById('load-more-btn').onclick = function() {
  loadMoreComments();
};

function toggleLoadMoreButton(show) {
  document.getElementById('load-more-btn').style.display = show ? 'block' : 'none';
}
