/**
 * Safe text module - the only place untrusted text (anything YouTube sends:
 * titles, channel names, descriptions, comments, URLs) is turned into HTML.
 * Pure: no DOM, no network. URL formats are owned by Route (web/route.js): the
 * builders are injected with Safe.create({ route }); the default Safe uses the global
 * Route in the browser (route.js is loaded first) and require('./route.js') under Node.
 *
 * Link contract (Safe.url): absolute links must be http: or https: (any case). Relative
 * links are accepted only as lowercase `video.html` / `index.html` followed by `?`, `#` or
 * the end of the string; they stay relative so hosting under a subpath works. Everything
 * else (javascript:, data:, //host, whitespace or control characters anywhere, other
 * relative paths) gets the fallback. User-info (https://user@host) and punycode /
 * homograph hosts are accepted by design: links are only displayed as text and opened with
 * target="_blank" rel="noopener noreferrer", and we do not try to judge hosts.
 *
 * Timecodes: m:ss or h:mm:ss, minutes (with hours) and seconds must be below 60, else the
 * text stays text. Seconds are capped at Safe.MAX_SECONDS (359999 = 99:59:59, the largest
 * a timecode can write); larger or non-digit t values (`1h2m`) in YouTube links are ignored.
 *
 * Safe.escape(value)       -> text safe between tags and inside "..." or '...' attributes.
 * Safe.url(value, fallback) -> the URL when it is http(s) or a PrivaTube page link
 *                            (video.html?... / index.html?...), else fallback ('').
 *                            Returns the raw URL: wrap it in Safe.escape() for an attribute.
 * Safe.urlAttr(value, fallback) -> escape(url(value, fallback)), for href="..." / src="...".
 * Safe.description(text, { videoId, region }) -> safe HTML for a plain-text description:
 *                            YouTube links become PrivaTube links, timecodes link to
 *                            videoId (&t=seconds; left as text without a videoId), other
 *                            http(s) links open in a new tab.
 * Safe.create({ route }) -> a Safe with other route builders (tests).
 * Safe.comment(html, { region }) -> safe HTML for YouTube's textDisplay (HTML with <a>/<br>):
 *                            only <br> and <a href> (URL-checked) survive; any other markup
 *                            is shown as text.
 */
function createSafe(options) {
  const route = (options && options.route) || null;
  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function escape(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, c => ESCAPES[c]);
  }

  const CONTROL_OR_SPACE = /[\x00-\x20\x7f-\x9f\u00a0\u2028\u2029\ufeff]/;

  function url(value, fallback) {
    const bad = fallback === undefined ? '' : fallback;
    if (typeof value !== 'string') return bad;
    const u = value.trim();
    if (!u || CONTROL_OR_SPACE.test(u)) return bad;
    if (/^https?:\/\/[^\/\\?#]/i.test(u)) return u;
    if (/^(?:video|index)\.html(?:[?#]|$)/.test(u)) return u;
    return bad;
  }

  // Text between tags: escape everything, but leave well-formed entities alone
  // (comments arrive already entity-encoded; description text has none to keep).
  function escapeKeepingEntities(s) {
    return String(s)
      .replace(/&(?!(?:#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});)/gi, '&amp;')
      .replace(/[<>"']/g, c => ESCAPES[c]);
  }

  function decodeEntities(s) {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    return s.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|(amp|lt|gt|quot|apos));/gi, (m, dec, hex, name) => {
      if (name) return named[name.toLowerCase()];
      const code = dec !== undefined ? parseInt(dec, 10) : parseInt(hex, 16);
      try { return String.fromCodePoint(code); } catch (e) { return ''; }
    });
  }

  const MAX_SECONDS = 359999;

  function seconds(value) {
    const m = /^(\d{1,6})s?$/.exec(value);
    return m && Number(m[1]) <= MAX_SECONDS ? Number(m[1]) : null;
  }

  function timeParam(query) {
    for (const pair of (query || '').split('&')) {
      const eq = pair.indexOf('=');
      if (eq !== -1 && (pair.slice(0, eq) === 't' || pair.slice(0, eq) === 'start')) {
        const t = seconds(pair.slice(eq + 1));
        if (t !== null) return t;
      }
    }
    return null;
  }

  // A raw URL -> { href, external }, or null when it is not a safe link.
  // YouTube video/channel links point back at PrivaTube.
  function resolve(raw, region) {
    const u = url(raw, null);
    if (u === null) return null;
    let m = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(.*)$/i.exec(u);
    if (m) {
      const params = m[1].split('&');
      const v = params.map(p => /^v=([A-Za-z0-9_-]{11})$/.exec(p)).find(Boolean);
      if (v) return { href: video(v[1], region, timeParam(m[1])), external: false };
    }
    m = /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})(?:[?#](.*))?$/i.exec(u);
    if (m) return { href: video(m[1], region, timeParam((m[2] || '').split('#')[0])), external: false };
    m = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})(?:[\/?#]|$)/i.exec(u);
    if (m) return { href: route.channel(m[1], { region }), external: false };
    if (/^https?:/i.test(u)) return { href: u, external: true };
    return { href: u, external: false }; // PrivaTube page link
  }

  function video(id, region, t) {
    return route.video(id, { region, t });
  }

  function anchor(link, innerHtml) {
    const attrs = link.external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return '<a href="' + escape(link.href) + '"' + attrs + '>' + innerHtml + '</a>';
  }

  // url() already escaped, for dropping straight into href="..." / src="...".
  function urlAttr(value, fallback) {
    return escape(url(value, fallback));
  }

  function description(text, options) {
    if (typeof text !== 'string' || !text) return '';
    const opts = options || {};
    const videoId = opts.videoId ? String(opts.videoId) : '';
    const src = text.replace(/\s+/g, ' ').trim();
    const token = /https?:\/\/[^\s<>"']+|(?<![\d:])\d{1,2}:\d{2}(?::\d{2})?(?![\d:])/gi;
    let out = '';
    let last = 0;
    let m;
    while ((m = token.exec(src)) !== null) {
      let piece = m[0];
      let link = null;
      let label = piece;
      if (/^https?:/i.test(piece)) {
        const trail = /[.,;:!?)\]}]+$/.exec(piece);
        if (trail) piece = piece.slice(0, -trail[0].length);
        link = resolve(piece, opts.region);
        label = link && !link.external ? link.href : piece;
        token.lastIndex = m.index + piece.length;
      } else if (videoId) {
        const parts = piece.split(':').map(Number);
        const rest = parts.slice(1);
        const t = rest.every(n => n < 60) ? parts.reduce((total, n) => total * 60 + n, 0) : null;
        if (t !== null && t <= MAX_SECONDS) link = { href: video(videoId, opts.region, t), external: false };
      }
      out += escape(src.slice(last, m.index));
      out += link ? anchor(link, escape(label)) : escape(piece);
      last = m.index + piece.length;
    }
    return out + escape(src.slice(last));
  }

  function comment(html, options) {
    const region = options && options.region;
    if (typeof html !== 'string' || !html) return '';
    const src = html.replace(/\s+/g, ' ').trim();
    const tag = /<br\s*\/?>|<a\s+href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
    let out = '';
    let last = 0;
    let m;
    while ((m = tag.exec(src)) !== null) {
      out += escapeKeepingEntities(src.slice(last, m.index));
      last = m.index + m[0].length;
      if (m[0][1] === 'b' || m[0][1] === 'B') { out += '<br>'; continue; }
      const link = resolve(decodeEntities(m[1] !== undefined ? m[1] : m[2]), region);
      const innerRaw = decodeEntities(m[3]);
      const shown = link && !link.external && resolve(innerRaw.trim(), region) ? link.href : null;
      const inner = shown !== null ? escape(shown) : escapeKeepingEntities(m[3]);
      out += link ? anchor(link, inner) : inner;
    }
    return out + escapeKeepingEntities(src.slice(last));
  }

  return { escape, url, urlAttr, description, comment, MAX_SECONDS };
}

function defaultRoute() {
  if (typeof Route !== 'undefined') return Route;
  if (typeof require !== 'undefined') return require('./route.js').Route;
  throw new Error('Safe: web/route.js must be loaded before web/safetext.js');
}

const Safe = Object.assign(createSafe({ route: defaultRoute() }), { create: createSafe });

// Export for Node.js (when running tests)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Safe };
}
