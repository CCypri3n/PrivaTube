const test = require('node:test');
const assert = require('node:assert');
const { YouTube } = require('../web/youtube.js');

// Gap-filling tests for #18. The other two cases from the issue (includeShorts on
// channelUploads, comment order reaching the request) are already covered in
// youtube-channels.test.js and youtube-video.test.js.

function videoResource(id, { duration = 'PT10M' } = {}) {
  return {
    id,
    snippet: { title: `Video ${id}`, description: '', channelId: 'UCchan1', channelTitle: 'Chan One', publishedAt: '2024-05-06T07:08:09Z' },
    statistics: { viewCount: '100' },
    contentDetails: { duration }
  };
}

// Every page holds one normal video and 23 Shorts, so a batch can never reach
// a full page and must stop on the refill bound while pages remain.
const PAGES = 50;
const pageOf = i => [
  videoResource(`good${i}`),
  ...Array.from({ length: 23 }, (_, j) => videoResource(`s${i}-${j}`, { duration: 'PT20S' }))
];
const ALL = {};
for (let i = 0; i < PAGES; i++) pageOf(i).forEach(r => { ALL[r.id] = r; });

function pageIndex(params) {
  const token = params.get('pageToken');
  return token ? Number(token.slice(1)) : 0;
}

function fakeApi() {
  const requests = [];
  async function fetchJson(url) {
    requests.push(url);
    const u = new URL(url);
    const p = u.searchParams;
    const endpoint = u.pathname.split('/').pop();
    if (endpoint === 'channels') {
      return { items: [{ id: 'UCchan1', contentDetails: { relatedPlaylists: { uploads: 'UUchan1' } } }] };
    }
    if (endpoint === 'playlistItems') {
      const i = pageIndex(p);
      return {
        items: pageOf(i).map(r => ({ snippet: { resourceId: { videoId: r.id } } })),
        nextPageToken: i + 1 < PAGES ? `p${i + 1}` : undefined
      };
    }
    if (endpoint === 'videos' && p.get('chart') === 'mostPopular') {
      const i = pageIndex(p);
      return { items: pageOf(i), nextPageToken: i + 1 < PAGES ? `p${i + 1}` : undefined };
    }
    if (endpoint === 'videos') {
      return { items: p.get('id').split(',').filter(id => ALL[id]).map(id => ALL[id]) };
    }
    throw new Error(`unexpected request ${url}`);
  }
  return { fetchJson, requests };
}

test('refill bound reached with more videos still existing: returns what it has and hasMore', async (t) => {
  await t.test('trending', async () => {
    const fake = fakeApi();
    const yt = YouTube.create({ apiKey: 'TEST_KEY', fetchJson: fake.fetchJson });
    const listing = yt.trending('FR');
    const { items, hasMore } = await listing.more();
    assert.ok(items.length > 0 && items.length < 24, `partial batch, got ${items.length}`);
    assert.ok(items.every(i => i.id.startsWith('good')));
    assert.equal(hasMore, true);
    assert.ok(fake.requests.length < PAGES, 'stopped on the bound');
    // The listing carries on from where the bound stopped it, without repeats.
    const next = await listing.more();
    assert.ok(next.items.length > 0);
    assert.ok(next.items.every(i => !items.some(j => j.id === i.id)));
  });

  await t.test('channelUploads', async () => {
    const fake = fakeApi();
    const yt = YouTube.create({ apiKey: 'TEST_KEY', fetchJson: fake.fetchJson });
    const { items, hasMore } = await yt.channelUploads('UCchan1').more();
    assert.ok(items.length > 0 && items.length < 24, `partial batch, got ${items.length}`);
    assert.ok(items.every(i => i.id.startsWith('good')));
    assert.equal(hasMore, true);
    assert.ok(fake.requests.length < PAGES, 'stopped on the bound');
  });
});
