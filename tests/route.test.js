const test = require('node:test');
const assert = require('node:assert');
const { Route } = require('../web/route.js');

test('parse: modes and precedence', async (t) => {
  await t.test('no params is home with default region', () => {
    const r = Route.parse('');
    assert.equal(r.mode, 'home');
    assert.equal(r.region, 'FR');
    assert.equal(r.videoId, null);
    assert.equal(r.channelId, null);
    assert.equal(r.query, null);
    assert.equal(r.t, null);
  });
  await t.test('lang sets the region, stays home', () => {
    const r = Route.parse('?lang=DE');
    assert.equal(r.mode, 'home');
    assert.equal(r.region, 'DE');
  });
  await t.test('video', () => {
    const r = Route.parse('?v=abc123&lang=GB&t=90');
    assert.deepEqual([r.mode, r.videoId, r.region, r.t], ['video', 'abc123', 'GB', 90]);
  });
  await t.test('search', () => {
    const r = Route.parse('?q=cats');
    assert.deepEqual([r.mode, r.query], ['search', 'cats']);
  });
  await t.test('channel', () => {
    const r = Route.parse('?ch=UC123');
    assert.deepEqual([r.mode, r.channelId], ['channel', 'UC123']);
  });
  await t.test('precedence: v over q over ch', () => {
    assert.equal(Route.parse('?ch=C&q=x&v=V').mode, 'video');
    assert.equal(Route.parse('?ch=C&q=x').mode, 'search');
    assert.equal(Route.parse('?ch=C').mode, 'channel');
  });
  await t.test('all fields are still reported when a higher mode wins', () => {
    const r = Route.parse('?ch=C&q=x&v=V');
    assert.deepEqual([r.channelId, r.query, r.videoId], ['C', 'x', 'V']);
  });
  await t.test('accepts a full href, with or without leading ?, ignores hash', () => {
    assert.equal(Route.parse('https://x.test/PrivaTube/index.html?ch=C#top').channelId, 'C');
    assert.equal(Route.parse('ch=C').channelId, 'C');
    assert.equal(Route.parse('video.html?v=V&lang=ES').region, 'ES');
  });
});

test('parse: q decoding matches the page (encodeURIComponent inside the param)', async (t) => {
  await t.test('double-encoded q (as the index page writes it) gives the typed text', () => {
    assert.equal(Route.parse('?q=' + encodeURIComponent(encodeURIComponent('a b&c'))).query, 'a b&c');
  });
  await t.test('once-encoded and old double-encoded AT&T both parse to AT&T', () => {
    assert.equal(Route.parse('?q=AT%26T').query, 'AT&T');
    assert.equal(Route.parse('?q=AT%2526T').query, 'AT&T');
    assert.equal(Route.parse('?q=AT%26T').mode, 'search');
  });
  await t.test('single-encoded q (old player page links) still works', () => {
    assert.equal(Route.parse('?q=a%20b').query, 'a b');
  });
  await t.test('malformed escape falls back to the raw text, no throw', () => {
    assert.equal(Route.parse('?q=50%25').query, '50%');
    assert.equal(Route.parse('?q=' + encodeURIComponent('50%')).query, '50%');
  });
});

test('parse: defaults and junk', async (t) => {
  await t.test('empty values are ignored', () => {
    const r = Route.parse('?v=&q=&ch=&lang=&t=');
    assert.deepEqual([r.mode, r.region, r.t], ['home', 'FR', null]);
  });
  await t.test('t must be a non-negative integer', () => {
    assert.equal(Route.parse('?v=V&t=0').t, 0);
    assert.equal(Route.parse('?v=V&t=abc').t, null);
    assert.equal(Route.parse('?v=V&t=-5').t, null);
    assert.equal(Route.parse('?v=V&t=1.5').t, null);
  });
  await t.test('unknown params and non-strings never throw', () => {
    assert.equal(Route.parse('?foo=bar&&=&%').mode, 'home');
    assert.equal(Route.parse(undefined).mode, 'home');
    assert.equal(Route.parse(null).mode, 'home');
  });
});

test('hrefs', async (t) => {
  await t.test('home', () => {
    assert.equal(Route.home({ region: 'DE' }), 'index.html?lang=DE');
    assert.equal(Route.home(), 'index.html?lang=FR');
    assert.equal(Route.home({ region: '' }), 'index.html?lang=FR');
  });
  await t.test('channel keeps the existing format', () => {
    assert.equal(Route.channel('UC1', { region: 'US' }), 'index.html?ch=UC1&lang=US');
    assert.equal(Route.channel('UC1'), 'index.html?ch=UC1&lang=FR');
  });
  await t.test('video, with and without t', () => {
    assert.equal(Route.video('V1', { region: 'GB' }), 'video.html?v=V1&lang=GB');
    assert.equal(Route.video('V1', { region: 'GB', t: 90 }), 'video.html?v=V1&lang=GB&t=90');
    assert.equal(Route.video('V1', { t: 0 }), 'video.html?v=V1&lang=FR&t=0');
    assert.equal(Route.video('V1', { t: null }), 'video.html?v=V1&lang=FR');
    assert.equal(Route.video('V1', { t: 'junk' }), 'video.html?v=V1&lang=FR');
  });
  await t.test('search stores the text once-encoded (AT&T -> AT%26T, not AT%2526T)', () => {
    assert.equal(Route.search('AT&T', { region: 'ES' }), 'index.html?q=AT%26T&lang=ES');
    assert.equal(Route.search('a b'), 'index.html?q=a+b&lang=FR');
  });
  await t.test('search href parses back to the typed text', () => {
    ['AT&T', 'a b&c', 'cafe \u00e9', '50%', '100%', 'x=y?z#w'].forEach((text) => {
      assert.equal(Route.parse(Route.search(text)).query, text);
    });
  });
  await t.test('known limit: text that already looks like an escape reads back decoded', () => {
    // Needed so old double-encoded addresses keep parsing; accepted trade-off.
    assert.equal(Route.search('a%20b'), 'index.html?q=a%2520b&lang=FR');
    assert.equal(Route.parse(Route.search('a%20b')).query, 'a b');
    assert.equal(Route.parse(Route.search('50%25')).query, '50%');
  });
  await t.test('shared-link startup redirect keeps t (explicit), region from the address', () => {
    const start = Route.parse('?v=X&lang=DE&t=90');
    assert.equal(Route.video(start.videoId, { region: start.region, t: start.t }), 'video.html?v=X&lang=DE&t=90');
    const noT = Route.parse('?v=X&lang=DE');
    assert.equal(Route.video(noT.videoId, { region: noT.region, t: noT.t }), 'video.html?v=X&lang=DE');
  });
  await t.test('listing video links carry t only when passed explicitly', () => {
    const current = Route.parse('?v=X&lang=DE&t=90');
    assert.equal(Route.video('V1', { region: current.region }), 'video.html?v=V1&lang=DE');
    assert.equal(Route.video('V1', { region: current.region, t: 90 }), 'video.html?v=V1&lang=DE&t=90');
    assert.equal(Route.channel('UC1', { region: current.region }), 'index.html?ch=UC1&lang=DE');
  });
  await t.test('share link points at the Pages site, includes t when present', () => {
    assert.equal(Route.share('V1'), 'https://ccypri3n.github.io/PrivaTube/?v=V1');
    assert.equal(Route.share('V1', { t: 42 }), 'https://ccypri3n.github.io/PrivaTube/?v=V1&t=42');
    assert.equal(Route.share('V1', { t: 'x' }), 'https://ccypri3n.github.io/PrivaTube/?v=V1');
    assert.equal(Route.share('V1', { base: 'http://localhost:8000/' }), 'http://localhost:8000/?v=V1');
  });
  await t.test('ids with special characters survive a round trip', () => {
    assert.equal(Route.parse(Route.video('a&b=c')).videoId, 'a&b=c');
    assert.equal(Route.parse(Route.share('a&b=c')).videoId, 'a&b=c');
  });
});

test('href(route) and round-trips', async (t) => {
  await t.test('href builds from a parsed route by mode', () => {
    assert.equal(Route.href(Route.parse('?lang=DE')), 'index.html?lang=DE');
    assert.equal(Route.href(Route.parse('?ch=C&lang=DE')), 'index.html?ch=C&lang=DE');
    assert.equal(Route.href(Route.parse('?v=V&t=5&lang=DE')), 'video.html?v=V&lang=DE&t=5');
    assert.equal(Route.href(Route.parse('?q=hi&lang=DE')), Route.search('hi', { region: 'DE' }));
  });
  await t.test('changing the region keeps the mode and params', () => {
    const r = Route.parse(Route.search('cats & dogs', { region: 'FR' }));
    const back = Route.parse(Route.href({ ...r, region: 'US' }));
    assert.deepEqual([back.mode, back.query, back.region], ['search', 'cats & dogs', 'US']);
  });
  await t.test('round-trip each mode', () => {
    for (const text of ['cats', 'a b', '50%', 'é ü ñ', 'x&y=z', '日本語']) {
      assert.equal(Route.parse(Route.search(text, { region: 'DE' })).query, text);
    }
    const c = Route.parse(Route.channel('UCabc_-', { region: 'GB' }));
    assert.deepEqual([c.mode, c.channelId, c.region], ['channel', 'UCabc_-', 'GB']);
    const v = Route.parse(Route.video('vid', { region: 'GB', t: 12 }));
    assert.deepEqual([v.mode, v.videoId, v.region, v.t], ['video', 'vid', 'GB', 12]);
    const h = Route.parse(Route.home({ region: 'ES' }));
    assert.deepEqual([h.mode, h.region], ['home', 'ES']);
  });
});
