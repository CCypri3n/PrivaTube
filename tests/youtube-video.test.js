const test = require('node:test');
const assert = require('node:assert');
const { YouTube } = require('../web/youtube.js');

// --- Handwritten sample data (no real data, no key) ---

const VIDEO = {
  id: 'vid1',
  snippet: {
    title: 'A video',
    description: 'About things',
    channelId: 'UCchan1',
    channelTitle: 'Chan One',
    publishedAt: '2024-05-06T07:08:09Z'
  },
  statistics: { viewCount: '1234567', likeCount: '4321', commentCount: '89' }
};

const CHANNEL = {
  id: 'UCchan1',
  snippet: { title: 'Chan One', thumbnails: { default: { url: 'https://img.example/chan1.jpg' } } },
  statistics: { subscriberCount: '55000' }
};

function commentThread(id, { text = `Text ${id}`, likes = 3, authorChannelId = `UCauthor${id}` } = {}) {
  return {
    id,
    snippet: {
      topLevelComment: {
        snippet: {
          textDisplay: text,
          textOriginal: text,
          authorDisplayName: `Author ${id}`,
          authorProfileImageUrl: `https://img.example/${id}.jpg`,
          authorChannelId: authorChannelId ? { value: authorChannelId } : undefined,
          publishedAt: '2024-06-01T10:00:00Z',
          likeCount: likes
        }
      }
    }
  };
}

const QUOTA_ERROR = {
  error: { code: 403, message: 'Quota exceeded.', errors: [{ reason: 'quotaExceeded' }] }
};
const INVALID_KEY_ERROR = {
  error: {
    code: 400,
    message: 'API key not valid. Please pass a valid API key.',
    errors: [{ reason: 'badRequest' }],
    details: [{ reason: 'API_KEY_INVALID' }]
  }
};

/**
 * Fake YouTube for the player page. `commentPages[order]` is an array of pages;
 * page i is served for token `p<i>` (page 0 for no token).
 */
function fake({ videos = {}, channels = {}, commentPages = {}, fail = null } = {}) {
  async function fetchJson(url) {
    if (fail) {
      if (fail instanceof Error) throw fail;
      return fail;
    }
    const u = new URL(url);
    const p = u.searchParams;
    const endpoint = u.pathname.split('/').pop();
    if (endpoint === 'videos') {
      return { items: p.get('id').split(',').filter(id => videos[id]).map(id => videos[id]) };
    }
    if (endpoint === 'channels') {
      return { items: p.get('id').split(',').filter(id => channels[id]).map(id => channels[id]) };
    }
    if (endpoint === 'commentThreads') {
      const pages = commentPages[p.get('order') || 'relevance'] || [[]];
      const token = p.get('pageToken');
      const i = token ? Number(token.slice(1)) : 0;
      const body = { items: pages[i] };
      if (i + 1 < pages.length) body.nextPageToken = `p${i + 1}`;
      return body;
    }
    throw new Error(`unexpected request ${url}`);
  }
  return YouTube.create({ apiKey: 'TEST_KEY', fetchJson });
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

const ids = items => items.map(i => i.id);

test('video with channel', async (t) => {
  await t.test('returns one object with numbers as numbers', async () => {
    const yt = fake({ videos: { vid1: VIDEO }, channels: { UCchan1: CHANNEL } });
    const v = await yt.video('vid1');
    assert.deepEqual(v, {
      id: 'vid1',
      title: 'A video',
      description: 'About things',
      publishedAt: '2024-05-06T07:08:09Z',
      viewCount: 1234567,
      likeCount: 4321,
      commentCount: 89,
      channel: {
        id: 'UCchan1',
        title: 'Chan One',
        avatar: 'https://img.example/chan1.jpg',
        subscriberCount: 55000
      }
    });
  });

  await t.test('hidden counts become null, not NaN', async () => {
    const video = { ...VIDEO, statistics: { viewCount: '10' } }; // likes/comments hidden
    const channel = { ...CHANNEL, statistics: { hiddenSubscriberCount: true } };
    const yt = fake({ videos: { vid1: video }, channels: { UCchan1: channel } });
    const v = await yt.video('vid1');
    assert.equal(v.viewCount, 10);
    assert.equal(v.likeCount, null);
    assert.equal(v.commentCount, null);
    assert.equal(v.channel.subscriberCount, null);
  });

  await t.test('unknown video is a not_found failure', async () => {
    const yt = fake({});
    assert.equal(await reasonOf(yt.video('nope')), 'not_found');
  });

  await t.test('failure reasons: quota, invalid key, offline', async () => {
    assert.equal(await reasonOf(fake({ fail: QUOTA_ERROR }).video('vid1')), 'quota_exceeded');
    assert.equal(await reasonOf(fake({ fail: INVALID_KEY_ERROR }).video('vid1')), 'invalid_key');
    assert.equal(await reasonOf(fake({ fail: new TypeError('Failed to fetch') }).video('vid1')), 'offline');
  });
});

test('comments', async (t) => {
  const pages = {
    relevance: [
      [commentThread('r1'), commentThread('r2')],
      [commentThread('r2'), commentThread('r3')]
    ],
    time: [[commentThread('t1')]]
  };

  await t.test('returns clean comment items', async () => {
    const yt = fake({ commentPages: pages });
    const { items } = await yt.comments('vid1', { order: 'relevance' }).more();
    assert.deepEqual(items[0], {
      kind: 'comment',
      id: 'r1',
      text: 'Text r1',
      authorName: 'Author r1',
      authorChannelId: 'UCauthorr1',
      authorAvatar: 'https://img.example/r1.jpg',
      publishedAt: '2024-06-01T10:00:00Z',
      likeCount: 3
    });
  });

  await t.test('pages without duplicates and reports the end', async () => {
    const yt = fake({ commentPages: pages });
    const list = yt.comments('vid1', { order: 'relevance' });
    const first = await list.more();
    assert.deepEqual(ids(first.items), ['r1', 'r2']);
    assert.equal(first.hasMore, true);
    const second = await list.more();
    assert.deepEqual(ids(second.items), ['r3']);
    assert.equal(second.hasMore, false);
    assert.deepEqual(await list.more(), { items: [], hasMore: false });
  });

  await t.test('order selects the sort; a new list restarts', async () => {
    const yt = fake({ commentPages: pages });
    const top = yt.comments('vid1', { order: 'relevance' });
    await top.more();
    const newest = yt.comments('vid1', { order: 'time' });
    assert.deepEqual(ids((await newest.more()).items), ['t1']);
    assert.deepEqual(ids((await yt.comments('vid1', { order: 'relevance' }).more()).items), ['r1', 'r2']);
  });

  await t.test('defaults to relevance', async () => {
    const yt = fake({ commentPages: pages });
    assert.deepEqual(ids((await yt.comments('vid1').more()).items), ['r1', 'r2']);
  });

  await t.test('two comment lists keep their own position', async () => {
    const yt = fake({ commentPages: pages });
    const a = yt.comments('vid1', { order: 'relevance' });
    const b = yt.comments('vid2', { order: 'relevance' });
    await a.more();
    assert.deepEqual(ids((await b.more()).items), ['r1', 'r2']);
    assert.deepEqual(ids((await a.more()).items), ['r3']);
  });

  await t.test('failures carry a reason', async () => {
    assert.equal(await reasonOf(fake({ fail: QUOTA_ERROR }).comments('vid1').more()), 'quota_exceeded');
    assert.equal(await reasonOf(fake({ fail: new TypeError('x') }).comments('vid1').more()), 'offline');
  });
});
