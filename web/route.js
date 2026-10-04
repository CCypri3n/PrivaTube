/**
 * Route module - the URL is the app's only state; this is the only code that
 * knows its format. Pure: no DOM, no window.location (callers pass the
 * search string or href in).
 *
 * Route.parse(urlOrSearch) -> { mode, region, videoId, channelId, query, t }
 *   mode: 'video' (v) wins over 'search' (q) wins over 'channel' (ch), else 'home'.
 *   region defaults to 'FR'. query is the typed text (decoded the way the page
 *   always has: the q param holds an encodeURIComponent'd string). t is a
 *   non-negative integer (seconds) or null. Empty/junk params are ignored.
 * Route.home / channel / video / search / href build hrefs (relative to the
 * pages); Route.share builds the link to give to other people.
 * Builders take { region, t } options, so a parsed route can be passed as is.
 */
const Route = (function () {
  const DEFAULT_REGION = 'FR';
  const SHARE_BASE = 'https://ccypri3n.github.io/PrivaTube/';

  function parseTime(value) {
    return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : null;
  }

  function validTime(t) {
    if (Number.isInteger(t) && t >= 0) return t;
    return typeof t === 'string' ? parseTime(t) : null;
  }

  function parse(input) {
    let s = typeof input === 'string' ? input : '';
    const hash = s.indexOf('#');
    if (hash !== -1) s = s.slice(0, hash);
    const qm = s.indexOf('?');
    if (qm !== -1) s = s.slice(qm + 1);
    const params = new URLSearchParams(s);

    const videoId = params.get('v') || null;
    const channelId = params.get('ch') || null;
    const rawQuery = params.get('q') || null;
    let query = rawQuery;
    if (rawQuery !== null) {
      try { query = decodeURIComponent(rawQuery); } catch (e) { /* use as typed */ }
    }
    const mode = videoId ? 'video' : rawQuery ? 'search' : channelId ? 'channel' : 'home';
    return {
      mode,
      region: params.get('lang') || DEFAULT_REGION,
      videoId,
      channelId,
      query,
      t: parseTime(params.get('t'))
    };
  }

  function regionOf(options) {
    return (options && options.region) || DEFAULT_REGION;
  }

  function build(page, pairs) {
    const p = new URLSearchParams();
    pairs.forEach(([k, v]) => p.set(k, v));
    return page + '?' + p.toString();
  }

  function home(options) {
    return build('index.html', [['lang', regionOf(options)]]);
  }

  function channel(channelId, options) {
    return build('index.html', [['ch', channelId], ['lang', regionOf(options)]]);
  }

  function video(videoId, options) {
    const pairs = [['v', videoId], ['lang', regionOf(options)]];
    const t = validTime(options && options.t);
    if (t !== null) pairs.push(['t', String(t)]);
    return build('video.html', pairs);
  }

  function search(text, options) {
    return build('index.html', [['q', encodeURIComponent(text)], ['lang', regionOf(options)]]);
  }

  // Href for a parsed route (e.g. the same page with another region).
  function href(route) {
    if (route.mode === 'video') return video(route.videoId, route);
    if (route.mode === 'search') return search(route.query, route);
    if (route.mode === 'channel') return channel(route.channelId, route);
    return home(route);
  }

  // Link to give to other people: the deployed Pages site (options.base overrides).
  function share(videoId, options) {
    const base = (options && options.base) || SHARE_BASE;
    const t = validTime(options && options.t);
    return base + '?' + build('', [['v', videoId]]).slice(1) + (t !== null ? '&t=' + t : '');
  }

  return { parse, home, channel, video, search, href, share, DEFAULT_REGION };
})();

// Export for Node.js (when running tests)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Route };
}
