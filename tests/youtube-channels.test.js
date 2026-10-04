const test = require('node:test');
const assert = require('node:assert');
const { YouTube } = require('../web/youtube.js');

// --- Handwritten sample data (no real data, no key) ---

function videoResource(id, { duration = 'PT10M', title = `Video ${id}`, views = '500' } = {}) {
  return {
    id,
    snippet: {
      title,
      description: '',
      channelId: 'UCchan1',
      channelTitle: 'Chan One',
      publishedAt: '2024-05-06T07:08:09Z',
      thumbnails: { medium: { url: `https://img.example/${id}.jpg` } }
    },
    statistics: { viewCount: views },
    contentDetails: { duration }
  };
}

const CHANNEL = {
  id: 'UCchan1',
  snippet: { title: 'Chan One', thumbnails: { medium: { url: 'https://img.example/chan1.jpg' } } },
  statistics: { subscriberCount: '12345' },
  brandingSettings: { image: { bannerExternalUrl: 'https://img.example/banner.jpg' } },
  contentDetails: { relatedPlaylists: { uploads: 'UUchan1' } }
};

const QUOTA_ERROR = {
  error: { code: 403, message: 'Quota exceeded.', errors: [{ reason: 'quotaExceeded' }] }
};

/**
 * Fake YouTube for channels. `uploadPages` is an array of pages, each an array of
 * video ids; page i is served for token `p<i>`. `videos` maps id -> videos resource.
 */
function fakeChannelApi({ channels = { UCchan1: CHANNEL }, uploadPages = [], videos = {}, fail = null } = {}) {
  async function fetchJson(url) {
    if (fail) {
      if (fail instanceof Error) throw fail;
      return fail;
    }
    const u = new URL(url);
    const p = u.searchParams;
    const endpoint = u.pathname.split('/').pop();
    if (endpoint === 'channels') {
      return { items: p.get('id').split(',').filter(id => channels[id]).map(id => channels[id]) };
    }
    if (endpoint === 'playlistItems') {
      assert.strictEqual(p.get('playlistId'), 'UUchan1');
      const token = p.get('pageToken');
      const i = token ? Number(token.slice(1)) : 0;
      const body = {
        items: uploadPages[i].map(id => ({ snippet: { resourceId: { kind: 'youtube#video', videoId: id } } }))
      };
      if (i + 1 < uploadPages.length) body.nextPageToken = `p${i + 1}`;
      return body;
    }
    if (endpoint === 'videos') {
      return { items: p.get('id').split(',').filter(id => videos[id]).map(id => videos[id]) };
    }
    throw new Error(`unexpected request ${url}`);
  }
  return fetchJson;
}

function make(options) {
  return YouTube.create({ apiKey: 'TESTKEY', fetchJson: fakeChannelApi(options) });
}

function videosOf(ids, opts = {}) {
  const videos = {};
  ids.forEach(id => { videos[id] = videoResource(id, opts[id] || {}); });
  return videos;
}

const range = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

// --- Channel info ---

test('channel() returns title, banner, thumbnail and subscriberCount as a number', async () => {
  const info = await make().channel('UCchan1');
  assert.deepStrictEqual(info, {
    id: 'UCchan1',
    title: 'Chan One',
    banner: 'https://img.example/banner.jpg',
    thumbnail: 'https://img.example/chan1.jpg',
    subscriberCount: 12345,
    uploadsPlaylistId: 'UUchan1'
  });
});

test('channel() copes with no banner and hidden subscribers', async () => {
  const bare = {
    id: 'UCbare',
    snippet: { title: 'Bare' },
    statistics: { hiddenSubscriberCount: true }
  };
  const info = await make({ channels: { UCbare: bare } }).channel('UCbare');
  assert.strictEqual(info.banner, '');
  assert.strictEqual(info.subscriberCount, null);
});

test('channel() on an unknown channel fails with not_found', async () => {
  await assert.rejects(make().channel('UCnope'), err =>
    err instanceof YouTube.Failure && err.reason === 'not_found');
});

test('channel() maps other failures to their reason', async () => {
  await assert.rejects(make({ fail: QUOTA_ERROR }).channel('UCchan1'), err => err.reason === 'quota_exceeded');
  await assert.rejects(make({ fail: new TypeError('Failed to fetch') }).channel('UCchan1'), err => err.reason === 'offline');
});

// --- Uploads listing ---

test('uploads are normalized video items, including videos of an hour or longer', async () => {
  const videos = videosOf(['a', 'long'], { long: { duration: 'PT1H5M3S', views: '42' } });
  const yt = make({ uploadPages: [['a', 'long']], videos });
  const { items, hasMore } = await yt.channelUploads('UCchan1').more();
  assert.deepStrictEqual(items.map(i => i.id), ['a', 'long']);
  assert.strictEqual(hasMore, false);
  const long = items[1];
  assert.strictEqual(long.kind, 'video');
  assert.strictEqual(long.duration, 3903);
  assert.strictEqual(long.viewCount, 42);
  assert.strictEqual(long.channelTitle, 'Chan One');
  assert.strictEqual(long.thumbnail, 'https://img.example/long.jpg');
});

test('Shorts, livestreams and unavailable uploads are hidden by default', async () => {
  const videos = videosOf(['ok', 'short', 'tagged', 'live'], {
    short: { duration: 'PT45S' },
    tagged: { duration: 'PT5M', title: 'fun #shorts' },
    live: { duration: 'P0D' }
  });
  const yt = make({ uploadPages: [['ok', 'short', 'tagged', 'live', 'private']], videos });
  const { items } = await yt.channelUploads('UCchan1').more();
  assert.deepStrictEqual(items.map(i => i.id), ['ok']);
});

test('includeShorts shows Shorts but still hides livestreams and unavailable videos', async () => {
  const videos = videosOf(['ok', 'short', 'tagged', 'live'], {
    short: { duration: 'PT45S' },
    tagged: { duration: 'PT5M', title: 'fun #shorts' },
    live: { duration: 'P0D' }
  });
  const yt = make({ uploadPages: [['ok', 'short', 'tagged', 'live', 'private']], videos });
  const { items } = await yt.channelUploads('UCchan1', { includeShorts: true }).more();
  assert.deepStrictEqual(items.map(i => i.id), ['ok', 'short', 'tagged']);
});

test('a batch refills across pages when filtering leaves it short', async () => {
  const shortIds = range('s', 30);
  const longIds = range('v', 30);
  const videos = {
    ...videosOf(shortIds, Object.fromEntries(shortIds.map(id => [id, { duration: 'PT30S' }]))),
    ...videosOf(longIds)
  };
  const yt = make({
    uploadPages: [shortIds.slice(0, 24), shortIds.slice(24).concat(longIds.slice(0, 18)), longIds.slice(18)],
    videos
  });
  const { items } = await yt.channelUploads('UCchan1').more();
  assert.ok(items.length >= 24, `got ${items.length}`);
  assert.ok(items.every(i => i.id.startsWith('v')));
});

test('more() continues without duplicates and reports the end', async () => {
  const ids = range('v', 60);
  const yt = make({ uploadPages: [ids.slice(0, 24), ids.slice(24, 48), ids.slice(48)], videos: videosOf(ids) });
  const listing = yt.channelUploads('UCchan1');
  const seen = [];
  let last;
  let guard = 0;
  do {
    last = await listing.more();
    seen.push(...last.items.map(i => i.id));
  } while (last.hasMore && ++guard < 10);
  assert.strictEqual(last.hasMore, false);
  assert.strictEqual(new Set(seen).size, seen.length);
  assert.deepStrictEqual(seen, ids);
  assert.deepStrictEqual(await listing.more(), { items: [], hasMore: false });
});

test('a video repeated across pages is listed once', async () => {
  const yt = make({ uploadPages: [range('v', 24), ['v23', 'x']], videos: videosOf([...range('v', 24), 'x']) });
  const listing = yt.channelUploads('UCchan1');
  const first = await listing.more();
  const second = await listing.more();
  const all = first.items.concat(second.items).map(i => i.id);
  assert.strictEqual(new Set(all).size, all.length);
});

test('uploads of an unknown channel fail with not_found', async () => {
  const listing = make().channelUploads('UCnope');
  await assert.rejects(listing.more(), err => err instanceof YouTube.Failure && err.reason === 'not_found');
});

test('uploads surface quota and offline failures', async () => {
  await assert.rejects(make({ fail: QUOTA_ERROR }).channelUploads('UCchan1').more(), err => err.reason === 'quota_exceeded');
  await assert.rejects(make({ fail: new TypeError('Failed to fetch') }).channelUploads('UCchan1').more(), err => err.reason === 'offline');
});
