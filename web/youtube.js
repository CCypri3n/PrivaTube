/**
 * YouTube module: the single place that talks to the YouTube Data API v3 for
 * trending, search, channel, video and comment data.
 *
 * Plain script, no imports. Exposes one global, `YouTube`. No DOM, no localStorage.
 *
 *   const yt = YouTube.create({ apiKey, fetchJson });   // fetchJson(url) -> Promise<parsed JSON>
 *   const listing = yt.trending('FR', { includeShorts: false });
 *   const { items, hasMore } = await listing.more();
 *
 * Failures are thrown as `YouTube.Failure` with a `reason`:
 *   'invalid_key' | 'quota_exceeded' | 'offline' | 'not_found' | 'other'
 *
 * Needs web/shorts.js (loaded before this script in the browser).
 */
const YouTube = (function () {
  const shorts = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
    ? require('./shorts.js')
    : { parseDuration, isListable };

  const API = 'https://www.googleapis.com/youtube/v3';
  const PAGE_SIZE = 24;          // target number of items per batch
  const MAX_REFILL_REQUESTS = 5; // max pages fetched per batch

  class Failure extends Error {
    constructor(reason, message) {
      super(message || reason);
      this.name = 'YouTubeFailure';
      this.reason = reason;
    }
  }

  const QUOTA_REASONS = ['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded', 'userRateLimitExceeded'];
  const KEY_REASONS = ['keyInvalid', 'keyExpired', 'API_KEY_INVALID', 'API_KEY_HTTP_REFERRER_BLOCKED',
    'ipRefererBlocked', 'accessNotConfigured', 'forbidden'];

  // Maps Google's `{ error: {...} }` answer to a Failure.
  function failureFromAnswer(error) {
    const reasons = [];
    (error.errors || []).forEach(e => e && e.reason && reasons.push(e.reason));
    (error.details || []).forEach(d => d && d.reason && reasons.push(d.reason));
    const message = error.message || 'YouTube API error';
    if (reasons.some(r => QUOTA_REASONS.includes(r))) return new Failure('quota_exceeded', message);
    if (reasons.some(r => KEY_REASONS.includes(r)) || /api key not valid/i.test(message)) {
      return new Failure('invalid_key', message);
    }
    if (error.code === 404 || reasons.includes('notFound')) return new Failure('not_found', message);
    return new Failure('other', message);
  }

  function create({ apiKey, fetchJson }) {
    async function call(endpoint, params) {
      const query = Object.keys(params)
        .filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '')
        .map(k => `${k}=${encodeURIComponent(params[k])}`)
        .join('&');
      const url = `${API}/${endpoint}?${query}&key=${encodeURIComponent(apiKey)}`;
      let data;
      try {
        data = await fetchJson(url);
      } catch (err) {
        if (err instanceof Failure) throw err;
        // A body that is not JSON is an odd answer, anything else is a network problem.
        throw new Failure(err instanceof SyntaxError ? 'other' : 'offline', err && err.message);
      }
      if (!data || typeof data !== 'object') throw new Failure('other', 'Empty answer');
      if (data.error) throw failureFromAnswer(data.error);
      return data;
    }

    function thumbnailOf(snippet) {
      const t = (snippet && snippet.thumbnails) || {};
      return (t.medium || t.high || t.default || {}).url || '';
    }

    function toNumber(value) {
      if (value === undefined || value === null || value === '') return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }

    // `resource` is a `videos` resource with snippet + statistics + contentDetails.
    function videoItem(resource) {
      const snippet = resource.snippet || {};
      return {
        kind: 'video',
        id: resource.id,
        title: snippet.title || '',
        channelId: snippet.channelId || '',
        channelTitle: snippet.channelTitle || '',
        thumbnail: thumbnailOf(snippet),
        publishedAt: snippet.publishedAt || '',
        viewCount: toNumber(resource.statistics && resource.statistics.viewCount),
        duration: shorts.parseDuration(resource.contentDetails && resource.contentDetails.duration)
      };
    }

    function channelItem(searchItem, statsById) {
      const id = searchItem.id.channelId;
      const stats = statsById[id];
      return {
        kind: 'channel',
        id,
        title: (searchItem.snippet && searchItem.snippet.title) || '',
        thumbnail: thumbnailOf(searchItem.snippet),
        subscriberCount: toNumber(stats && stats.subscriberCount)
      };
    }

    // Shorts rules from shorts.js. includeShorts bypasses only the Shorts rule:
    // livestreams/upcoming (no duration) and unavailable videos stay hidden.
    function isShown(resource, includeShorts) {
      if (!resource.contentDetails || !resource.snippet) return false;
      const video = {
        duration: resource.contentDetails.duration,
        title: resource.snippet.title,
        description: resource.snippet.description
      };
      if (includeShorts) return shorts.parseDuration(video.duration) > 0;
      return shorts.isListable(video);
    }

    /**
     * Builds a Listing from a page source.
     * fetchPage(token) -> Promise<{ items, nextPageToken }> with items already
     * normalized and filtered. Only items for which `isCounted` is true count
     * toward the page target. `maxRequests` bounds the pages fetched per batch.
     */
    function makeListing(fetchPage, isCounted, maxRequests = MAX_REFILL_REQUESTS) {
      let token = null;
      let done = false;
      const seen = new Set();
      let busy = null;

      async function nextBatch() {
        if (done) return { items: [], hasMore: false };
        const items = [];
        const batchSeen = new Set();
        let nextToken = token;
        for (let i = 0; i < maxRequests; i++) {
          const page = await fetchPage(nextToken);
          for (const item of page.items) {
            const key = `${item.kind}:${item.id}`;
            if (seen.has(key) || batchSeen.has(key)) continue;
            batchSeen.add(key);
            items.push(item);
          }
          nextToken = page.nextPageToken || null;
          if (!nextToken || items.filter(isCounted).length >= PAGE_SIZE) break;
        }
        // Commit position only once the whole batch succeeded.
        batchSeen.forEach(k => seen.add(k));
        token = nextToken;
        done = !nextToken;
        return { items, hasMore: !done };
      }

      return {
        // Next batch and whether more exist. Overlapping calls share one request.
        more() {
          if (!busy) busy = nextBatch().finally(() => { busy = null; });
          return busy;
        }
      };
    }

    const countVideos = item => item.kind === 'video';

    function trending(regionCode, { includeShorts = false } = {}) {
      return makeListing(async pageToken => {
        const data = await call('videos', {
          part: 'snippet,statistics,contentDetails',
          chart: 'mostPopular',
          regionCode,
          maxResults: PAGE_SIZE,
          pageToken
        });
        return {
          nextPageToken: data.nextPageToken,
          items: (data.items || []).filter(r => isShown(r, includeShorts)).map(videoItem)
        };
      }, countVideos);
    }

    function search(query, { includeShorts = false } = {}) {
      return makeListing(async pageToken => {
        const data = await call('search', {
          part: 'snippet',
          q: query,
          type: 'video,channel',
          maxResults: PAGE_SIZE,
          pageToken
        });
        const found = data.items || [];
        const videoIds = found.filter(i => i.id && i.id.kind === 'youtube#video').map(i => i.id.videoId);
        const channelIds = found.filter(i => i.id && i.id.kind === 'youtube#channel').map(i => i.id.channelId);

        const videosById = {};
        if (videoIds.length) {
          const v = await call('videos', {
            part: 'snippet,statistics,contentDetails',
            id: videoIds.join(',')
          });
          (v.items || []).forEach(r => { videosById[r.id] = r; });
        }
        const channelStats = {};
        if (channelIds.length) {
          const c = await call('channels', { part: 'statistics', id: channelIds.join(',') });
          (c.items || []).forEach(r => { channelStats[r.id] = r.statistics; });
        }

        // Keep the order YouTube returned (relevance), videos and channels mixed.
        const items = [];
        for (const entry of found) {
          if (!entry.id) continue;
          if (entry.id.kind === 'youtube#video') {
            const resource = videosById[entry.id.videoId];
            // Absent from the `videos` answer = private/deleted: dropped silently.
            if (resource && isShown(resource, includeShorts)) items.push(videoItem(resource));
          } else if (entry.id.kind === 'youtube#channel') {
            items.push(channelItem(entry, channelStats));
          }
        }
        return { nextPageToken: data.nextPageToken, items };
      }, countVideos);
    }

    // --- Channels (step 2 of #10) ---

    // Looks up one channel; unknown id -> Failure 'not_found'.
    async function fetchChannelResource(channelId, part) {
      const data = await call('channels', { part, id: channelId });
      const resource = (data.items || [])[0];
      if (!resource) throw new Failure('not_found', 'Channel not found');
      return resource;
    }

    // Channel info: { id, title, banner, thumbnail, subscriberCount }.
    // banner is '' when the channel has none; subscriberCount is null when hidden.
    async function channel(channelId) {
      const r = await fetchChannelResource(channelId, 'snippet,statistics,brandingSettings');
      const stats = r.statistics || {};
      return {
        id: r.id,
        title: (r.snippet && r.snippet.title) || '',
        banner: (r.brandingSettings && r.brandingSettings.image && r.brandingSettings.image.bannerExternalUrl) || '',
        thumbnail: thumbnailOf(r.snippet),
        subscriberCount: stats.hiddenSubscriberCount ? null : toNumber(stats.subscriberCount)
      };
    }

    // A channel's uploads as a Listing of video items (newest first). An unknown
    // channel makes the first more() throw Failure 'not_found'.
    function channelUploads(channelId, { includeShorts = false } = {}) {
      let uploadsPlaylistId = null;
      return makeListing(async pageToken => {
        if (!uploadsPlaylistId) {
          const r = await fetchChannelResource(channelId, 'contentDetails');
          uploadsPlaylistId = r.contentDetails && r.contentDetails.relatedPlaylists &&
            r.contentDetails.relatedPlaylists.uploads;
          if (!uploadsPlaylistId) throw new Failure('not_found', 'Channel has no uploads playlist');
        }
        const data = await call('playlistItems', {
          part: 'snippet',
          playlistId: uploadsPlaylistId,
          maxResults: PAGE_SIZE,
          pageToken
        });
        const ids = (data.items || [])
          .map(i => i.snippet && i.snippet.resourceId && i.snippet.resourceId.videoId)
          .filter(Boolean);
        const byId = {};
        if (ids.length) {
          const v = await call('videos', { part: 'snippet,statistics,contentDetails', id: ids.join(',') });
          (v.items || []).forEach(r => { byId[r.id] = r; });
        }
        // Absent from the `videos` answer = private/deleted: dropped silently.
        const items = ids.map(id => byId[id]).filter(r => r && isShown(r, includeShorts)).map(videoItem);
        return { nextPageToken: data.nextPageToken, items };
      }, countVideos);
    }

    // One video with its channel. Unknown video => Failure('not_found').
    // channel is null when YouTube returns no such channel.
    async function video(videoId) {
      const v = await call('videos', { part: 'snippet,statistics', id: videoId });
      const resource = (v.items || [])[0];
      if (!resource || !resource.snippet) throw new Failure('not_found', 'Video not found');
      const stats = resource.statistics || {};
      const channelId = resource.snippet.channelId;
      let channel = null;
      if (channelId) {
        const c = await call('channels', { part: 'snippet,statistics', id: channelId });
        const cr = (c.items || [])[0];
        if (cr) {
          const cs = cr.snippet || {};
          const avatar = cs.thumbnails && (cs.thumbnails.default || cs.thumbnails.medium || cs.thumbnails.high);
          channel = {
            id: channelId,
            title: cs.title || '',
            avatar: (avatar && avatar.url) || '',
            subscriberCount: toNumber(cr.statistics && cr.statistics.subscriberCount)
          };
        }
      }
      return {
        id: resource.id,
        title: resource.snippet.title || '',
        description: resource.snippet.description || '',
        publishedAt: resource.snippet.publishedAt || '',
        viewCount: toNumber(stats.viewCount),
        likeCount: toNumber(stats.likeCount),
        commentCount: toNumber(stats.commentCount),
        channel
      };
    }

    function commentItem(thread) {
      const c = thread.snippet.topLevelComment.snippet;
      return {
        kind: 'comment',
        id: thread.id,
        text: c.textDisplay || c.textOriginal || '',
        authorName: c.authorDisplayName || '',
        authorChannelId: (c.authorChannelId && c.authorChannelId.value) || '',
        authorAvatar: c.authorProfileImageUrl || '',
        publishedAt: c.publishedAt || '',
        likeCount: toNumber(c.likeCount)
      };
    }

    // Comments of a video as a Listing; order is 'relevance' (default) or 'time'.
    // Each call returns a list with its own position.
    function comments(videoId, { order = 'relevance' } = {}) {
      return makeListing(async pageToken => {
        const data = await call('commentThreads', {
          part: 'snippet',
          videoId,
          order,
          maxResults: PAGE_SIZE,
          pageToken
        });
        return {
          nextPageToken: data.nextPageToken,
          items: (data.items || []).filter(t => t && t.snippet && t.snippet.topLevelComment).map(commentItem)
        };
      }, () => true, 1); // nothing is filtered out, so one request per batch
    }

    return { trending, search, channel, channelUploads, video, comments };
  }

  return { create, Failure };
})();

// Export for Node.js (when running tests)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { YouTube };
}
