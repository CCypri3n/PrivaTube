const test = require('node:test');
const assert = require('node:assert');
const { YouTube } = require('../web/youtube.js');

// --- Handwritten sample data (no real data, no key) ---

function videoResource(id, { duration = 'PT10M', title = `Video ${id}`, description = '', views = '1234', channelId = 'UCchan1' } = {}) {
  return {
    id,
    snippet: {
      title,
      description,
      channelId,
      channelTitle: 'Chan One',
      publishedAt: '2024-05-06T07:08:09Z',
      thumbnails: { medium: { url: `https://img.example/${id}.jpg` } }
    },
    statistics: { viewCount: views },
    contentDetails: { duration }
  };
}

function searchVideo(id) {
  return { id: { kind: 'youtube#video', videoId: id }, snippet: { title: `Video ${id}` } };
}

function searchChannel(id, title = `Channel ${id}`) {
  return {
    id: { kind: 'youtube#channel', channelId: id },
    snippet: { title, thumbnails: { medium: { url: `https://img.example/${id}.jpg` } } }
  };
}

const QUOTA_ERROR = {
  error: { code: 403, message: 'Quota exceeded.', errors: [{ reason: 'quotaExceeded', domain: 'youtube.quota' }] }
};
const INVALID_KEY_ERROR = {
  error: {
    code: 400,
    message: 'API key not valid. Please pass a valid API key.',
    errors: [{ reason: 'badRequest', domain: 'global' }],
    details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }]
  }
};
const NOT_FOUND_ERROR = { error: { code: 404, message: 'Not found.', errors: [{ reason: 'notFound' }] } };
const OTHER_ERROR = { error: { code: 500, message: 'Backend error', errors: [{ reason: 'backendError' }] } };

/**
 * Fake YouTube: serves pages of videos for `videos?chart=mostPopular` and `search`,
 * plus lookups by id. `trendingPages` / `searchPages` are arrays of pages; page i
 * is served for token `p<i>` (page 0 for no token).
 */
function fakeYouTube({ trendingPages = [], searchPages = [], videos = {}, channels = {}, fail = null } = {}) {
  const requests = [];
  async function fetchJson(url) {
    requests.push(url);
    if (fail) {
      if (fail instanceof Error) throw fail;
      return fail;
    }
    const u = new URL(url);
    const p = u.searchParams;
    const endpoint = u.pathname.split('/').pop();
    const pageIndex = token => (token ? Number(token.slice(1)) : 0);
    const paged = (pages, token) => {
      const i = pageIndex(token);
      const body = { items: pages[i] };
      if (i + 1 < pages.length) body.nextPageToken = `p${i + 1}`;
      return body;
    };
    if (endpoint === 'videos' && p.get('chart') === 'mostPopular') {
      return paged(trendingPages, p.get('pageToken'));
    }
    if (endpoint === 'videos') {
      return { items: p.get('id').split(',').filter(id => videos[id]).map(id => videos[id]) };
    }
    if (endpoint === 'search') {
      return paged(searchPages, p.get('pageToken'));
    }
    if (endpoint === 'channels') {
      return {
        items: p.get('id').split(',').filter(id => channels[id])
          .map(id => ({ id, statistics: channels[id] }))
      };
    }
    throw new Error(`unexpected request ${url}`);
  }
  return { fetchJson, requests };
}

function makeModule(config) {
  const fake = fakeYouTube(config);
  return YouTube.create({ apiKey: 'TEST_KEY', fetchJson: fake.fetchJson });
}

function ids(items) {
  return items.map(i => i.id);
}

async function reasonOf(promise) {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof YouTube.Failure, 'rejects with YouTube.Failure');
    return err.reason;
  }
  assert.fail('expected a failure');
}

test('trending', async (t) => {
  await t.test('returns clean video items: numbers are numbers, duration in seconds', async () => {
    const yt = makeModule({ trendingPages: [[videoResource('a', { duration: 'PT1H2M3S', views: '987654' })]] });
    const { items, hasMore } = await yt.trending('FR').more();
    assert.equal(hasMore, false);
    assert.deepEqual(items, [{
      kind: 'video',
      id: 'a',
      title: 'Video a',
      channelId: 'UCchan1',
      channelTitle: 'Chan One',
      thumbnail: 'https://img.example/a.jpg',
      publishedAt: '2024-05-06T07:08:09Z',
      viewCount: 987654,
      duration: 3723
    }]);
    assert.equal(typeof items[0].viewCount, 'number');
  });

  await t.test('hides shorts, livestreams and unavailable videos by default', async () => {
    const yt = makeModule({
      trendingPages: [[
        videoResource('ok'),
        videoResource('short', { duration: 'PT45S' }),
        videoResource('tagged', { duration: 'PT1H', title: 'Hi #shorts' }),
        videoResource('live', { duration: 'P0D' }),
        { id: 'unavailable', snippet: videoResource('x').snippet } // no contentDetails
      ]]
    });
    const { items } = await yt.trending('FR').more();
    assert.deepEqual(ids(items), ['ok']);
  });

  await t.test('includeShorts shows shorts but still hides livestreams and unavailable videos', async () => {
    const yt = makeModule({
      trendingPages: [[
        videoResource('ok'),
        videoResource('short', { duration: 'PT45S' }),
        videoResource('tagged', { duration: 'PT1H', title: 'Hi #shorts' }),
        videoResource('live', { duration: 'P0D' }),
        { id: 'unavailable', snippet: videoResource('x').snippet }
      ]]
    });
    const { items } = await yt.trending('FR', { includeShorts: true }).more();
    assert.deepEqual(ids(items), ['ok', 'short', 'tagged']);
  });

  await t.test('more() continues without duplicates and reports the end', async () => {
    const page = (from, n) => Array.from({ length: n }, (_, i) => videoResource(`v${from + i}`));
    // Page 1 repeats v23 from page 0 (YouTube charts shift between requests).
    const yt = makeModule({ trendingPages: [page(0, 24), page(23, 25), page(48, 5)] });
    const listing = yt.trending('FR');

    const first = await listing.more();
    assert.equal(first.items.length, 24);
    assert.equal(first.hasMore, true);

    const second = await listing.more();
    assert.equal(second.hasMore, true);
    const third = await listing.more();
    assert.equal(third.hasMore, false);

    const all = ids([...first.items, ...second.items, ...third.items]);
    assert.equal(new Set(all).size, all.length, 'no duplicates');
    assert.deepEqual(all, Array.from({ length: 53 }, (_, i) => `v${i}`));

    const after = await listing.more();
    assert.deepEqual(after, { items: [], hasMore: false });
  });

  await t.test('a page that loses items to filtering is refilled to about a full page', async () => {
    const shortsPage = n => Array.from({ length: n }, (_, i) => videoResource(`s${n}-${i}`, { duration: 'PT30S' }));
    const mixed = (tag, good) => [
      ...Array.from({ length: good }, (_, i) => videoResource(`${tag}-${i}`)),
      ...shortsPage(24 - good)
    ];
    const yt = makeModule({ trendingPages: [mixed('a', 10), mixed('b', 10), mixed('c', 10), mixed('d', 10)] });
    const { items, hasMore } = await yt.trending('FR').more();
    assert.ok(items.length >= 24, `expected a full page, got ${items.length}`);
    assert.equal(hasMore, true);
  });

  await t.test('refilling is bounded when nearly everything is filtered out', async () => {
    const onlyShorts = i => Array.from({ length: 24 }, (_, j) => videoResource(`s${i}-${j}`, { duration: 'PT20S' }));
    const pages = Array.from({ length: 50 }, (_, i) => onlyShorts(i));
    const fake = fakeYouTube({ trendingPages: pages });
    const yt = YouTube.create({ apiKey: 'TEST_KEY', fetchJson: fake.fetchJson });
    const { items, hasMore } = await yt.trending('FR').more();
    assert.deepEqual(items, []);
    assert.equal(hasMore, true, 'the listing can still continue');
    assert.ok(fake.requests.length < 50, 'does not walk the whole chart');
  });

  await t.test('does not leak the API key into anything but the request', async () => {
    const yt = makeModule({ trendingPages: [[videoResource('a')]] });
    const { items } = await yt.trending('FR').more();
    assert.ok(!JSON.stringify(items).includes('TEST_KEY'));
  });
});

test('search', async (t) => {
  const videos = {
    v1: videoResource('v1', { views: '10' }),
    v2: videoResource('v2', { duration: 'PT30S' }),
    v3: videoResource('v3', { duration: 'PT2H' })
    // vgone: absent -> private/deleted
  };
  const channels = { UCa: { subscriberCount: '4200' } };
  const searchPages = [[
    searchVideo('v1'), searchChannel('UCa', 'Alpha'), searchVideo('v2'), searchVideo('vgone'), searchVideo('v3')
  ]];

  await t.test('returns videos and channels with stats joined, in result order', async () => {
    const yt = makeModule({ searchPages, videos, channels });
    const { items, hasMore } = await yt.search('cats').more();
    assert.equal(hasMore, false);
    assert.deepEqual(items.map(i => `${i.kind}:${i.id}`), ['video:v1', 'channel:UCa', 'video:v3']);
    assert.equal(items[0].viewCount, 10);
    assert.equal(items[0].duration, 600);
    assert.deepEqual(items[1], {
      kind: 'channel',
      id: 'UCa',
      title: 'Alpha',
      thumbnail: 'https://img.example/UCa.jpg',
      subscriberCount: 4200
    });
  });

  await t.test('includeShorts shows shorts, still hides unavailable videos', async () => {
    const yt = makeModule({ searchPages, videos, channels });
    const { items } = await yt.search('cats', { includeShorts: true }).more();
    assert.deepEqual(ids(items), ['v1', 'UCa', 'v2', 'v3']);
  });

  await t.test('livestreams are hidden even with includeShorts', async () => {
    const yt = makeModule({
      searchPages: [[searchVideo('live')]],
      videos: { live: videoResource('live', { duration: 'P0D' }) }
    });
    const { items } = await yt.search('x', { includeShorts: true }).more();
    assert.deepEqual(items, []);
  });

  await t.test('channel with hidden subscriber count has null count', async () => {
    const yt = makeModule({ searchPages: [[searchChannel('UCb')]], channels: { UCb: { hiddenSubscriberCount: true } } });
    const { items } = await yt.search('x').more();
    assert.equal(items[0].subscriberCount, null);
  });

  await t.test('more() continues without duplicates and reports the end', async () => {
    const many = {};
    const page = (from, n) => Array.from({ length: n }, (_, i) => {
      many[`s${from + i}`] = videoResource(`s${from + i}`);
      return searchVideo(`s${from + i}`);
    });
    const yt = makeModule({ searchPages: [page(0, 24), page(24, 24), page(48, 3)], videos: many });
    const listing = yt.search('q');
    const a = await listing.more();
    const b = await listing.more();
    const c = await listing.more();
    assert.deepEqual([a.hasMore, b.hasMore, c.hasMore], [true, true, false]);
    const all = ids([...a.items, ...b.items, ...c.items]);
    assert.equal(new Set(all).size, 51);
  });

  await t.test('only videos count toward the page target, channels do not', async () => {
    const vids = {};
    const mixedPage = (tag) => {
      const entries = [];
      for (let i = 0; i < 12; i++) entries.push(searchChannel(`${tag}c${i}`));
      for (let i = 0; i < 12; i++) {
        vids[`${tag}v${i}`] = videoResource(`${tag}v${i}`);
        entries.push(searchVideo(`${tag}v${i}`));
      }
      return entries;
    };
    const yt = makeModule({ searchPages: [mixedPage('a'), mixedPage('b'), mixedPage('c')], videos: vids });
    const { items } = await yt.search('q').more();
    assert.ok(items.filter(i => i.kind === 'video').length >= 24);
  });
});

test('failures carry a specific reason', async (t) => {
  await t.test('quota exceeded', async () => {
    const yt = makeModule({ fail: QUOTA_ERROR });
    assert.equal(await reasonOf(yt.trending('FR').more()), 'quota_exceeded');
    assert.equal(await reasonOf(yt.search('x').more()), 'quota_exceeded');
  });

  await t.test('invalid key', async () => {
    const yt = makeModule({ fail: INVALID_KEY_ERROR });
    assert.equal(await reasonOf(yt.trending('FR').more()), 'invalid_key');
    assert.equal(await reasonOf(yt.search('x').more()), 'invalid_key');
  });

  await t.test('offline (fetch rejects)', async () => {
    const yt = makeModule({ fail: new TypeError('Failed to fetch') });
    assert.equal(await reasonOf(yt.trending('FR').more()), 'offline');
  });

  await t.test('not found', async () => {
    const yt = makeModule({ fail: NOT_FOUND_ERROR });
    assert.equal(await reasonOf(yt.search('x').more()), 'not_found');
  });

  await t.test('other', async () => {
    const yt = makeModule({ fail: OTHER_ERROR });
    assert.equal(await reasonOf(yt.trending('FR').more()), 'other');
  });

  await t.test('a failed more() can be retried and picks up where it left off', async () => {
    const good = Array.from({ length: 24 }, (_, i) => videoResource(`g${i}`));
    const more = [videoResource('last')];
    let failNext = false;
    const inner = fakeYouTube({ trendingPages: [good, more] });
    const yt = YouTube.create({
      apiKey: 'TEST_KEY',
      fetchJson: async url => {
        if (failNext) { failNext = false; throw new TypeError('offline'); }
        return inner.fetchJson(url);
      }
    });
    const listing = yt.trending('FR');
    const first = await listing.more();
    assert.equal(first.items.length, 24);
    failNext = true;
    assert.equal(await reasonOf(listing.more()), 'offline');
    const retry = await listing.more();
    assert.deepEqual(ids(retry.items), ['last']);
    assert.equal(retry.hasMore, false);
  });
});

test('listings keep their own position', async () => {
  const page = (tag) => Array.from({ length: 24 }, (_, i) => videoResource(`${tag}${i}`));
  const yt = makeModule({ trendingPages: [page('a'), page('b'), [videoResource('z')]] });
  const one = yt.trending('FR');
  const two = yt.trending('DE');
  await one.more();
  const secondOfOne = await one.more();
  const firstOfTwo = await two.more();
  assert.equal(secondOfOne.items[0].id, 'b0');
  assert.equal(firstOfTwo.items[0].id, 'a0');
});
