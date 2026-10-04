const test = require('node:test');
const assert = require('node:assert');
const { YouTube } = require('../web/youtube.js');

// Opening a channel page = channel(id) then channelUploads(id, { uploadsPlaylistId }).
// These tests pin the request count and the failure reasons (#15).

const CHANNEL = {
  id: 'UCchan1',
  snippet: { title: 'Chan One' },
  statistics: { subscriberCount: '10' },
  contentDetails: { relatedPlaylists: { uploads: 'UUchan1' } }
};
const VIDEO = {
  id: 'a',
  snippet: { title: 'A', channelId: 'UCchan1', channelTitle: 'Chan One', publishedAt: '2024-01-01T00:00:00Z' },
  statistics: { viewCount: '5' },
  contentDetails: { duration: 'PT10M' }
};
const QUOTA_ERROR = { error: { code: 403, message: 'q', errors: [{ reason: 'quotaExceeded' }] } };
const KEY_ERROR = { error: { code: 400, message: 'k', errors: [{ reason: 'keyInvalid' }] } };

function fake({ channels = { UCchan1: CHANNEL }, failChannels = null } = {}) {
  const counts = {};
  async function fetchJson(url) {
    const u = new URL(url);
    const endpoint = u.pathname.split('/').pop();
    counts[endpoint] = (counts[endpoint] || 0) + 1;
    if (endpoint === 'channels') {
      if (failChannels) {
        if (failChannels instanceof Error) throw failChannels;
        return failChannels;
      }
      return { items: u.searchParams.get('id').split(',').filter(id => channels[id]).map(id => channels[id]) };
    }
    if (endpoint === 'playlistItems') {
      return { items: [{ snippet: { resourceId: { kind: 'youtube#video', videoId: 'a' } } }] };
    }
    if (endpoint === 'videos') return { items: [VIDEO] };
    throw new Error(`unexpected request ${url}`);
  }
  return { yt: YouTube.create({ apiKey: 'TESTKEY', fetchJson }), counts };
}

// What the channel page does on first load.
async function openChannel(yt, id) {
  const info = await yt.channel(id);
  const listing = yt.channelUploads(id, { uploadsPlaylistId: info.uploadsPlaylistId });
  return { info, page: await listing.more() };
}

test('first channel load makes a single channels request', async () => {
  const { yt, counts } = fake();
  const { info, page } = await openChannel(yt, 'UCchan1');
  assert.strictEqual(info.title, 'Chan One');
  assert.deepStrictEqual(page.items.map(i => i.id), ['a']);
  assert.strictEqual(counts.channels, 1);
});

test('channel() exposes the uploads playlist id', async () => {
  const { yt } = fake();
  assert.strictEqual((await yt.channel('UCchan1')).uploadsPlaylistId, 'UUchan1');
});

test('channelUploads without a known playlist id still looks it up itself', async () => {
  const { yt, counts } = fake();
  const { items } = await yt.channelUploads('UCchan1').more();
  assert.deepStrictEqual(items.map(i => i.id), ['a']);
  assert.strictEqual(counts.channels, 1);
});

test('Load More does not repeat the channels request', async () => {
  const { yt, counts } = fake();
  const info = await yt.channel('UCchan1');
  const listing = yt.channelUploads('UCchan1', { uploadsPlaylistId: info.uploadsPlaylistId });
  await listing.more();
  await listing.more();
  assert.strictEqual(counts.channels, 1);
});

test('an unknown channel is not_found from the info call alone', async () => {
  const { yt, counts } = fake();
  await assert.rejects(openChannel(yt, 'UCnope'), err =>
    err instanceof YouTube.Failure && err.reason === 'not_found');
  assert.strictEqual(counts.channels, 1);
  assert.strictEqual(counts.playlistItems, undefined);
});

test('quota, invalid key and offline fail the info call with their own reason', async () => {
  await assert.rejects(openChannel(fake({ failChannels: QUOTA_ERROR }).yt, 'UCchan1'), e => e.reason === 'quota_exceeded');
  await assert.rejects(openChannel(fake({ failChannels: KEY_ERROR }).yt, 'UCchan1'), e => e.reason === 'invalid_key');
  await assert.rejects(openChannel(fake({ failChannels: new TypeError('Failed to fetch') }).yt, 'UCchan1'), e => e.reason === 'offline');
});
