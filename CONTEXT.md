# PrivaTube

A static, build-less web app: a privacy-focused YouTube front-end. It talks directly from the browser to the YouTube Data API v3 using a key the user supplies. There is no backend. It is hosted on GitHub Pages (https://ccypri3n.github.io/PrivaTube/) and also runs from `index.html` opened locally.

## Language

**API key**: The user's own YouTube Data API v3 key. Asked for in a modal on first load, validated with a test request, stored in `localStorage` under `api_key`. Never sent anywhere but Google. Handled only by `web/apikey.js` (`ApiKey.getKey()` / `ApiKey.clearKey()`); a key is accepted when Google says it is valid or that its quota is exceeded, rejected ("invalid", not saved) when Google says it is bad (400, non-quota 403), and "try again" (not saved) on network or server trouble (5xx, 429).

**Home / search / channel mode**: The three states of the browse page (`index.html`, `web/PrivaTube.js`): trending videos for a region, search results (videos and channels), or a channel's uploads. State is carried in URL query params.

**Region**: The country code (FR, DE, GB, ES, US) used for the trending chart on the home page.

**Player page**: `video.html` + `web/VideoPlayer.js`. Reads `?v=<videoId>` (and optional `&t=<seconds>`), embeds the video via `youtube-nocookie.com`, and shows stats, description and comments.

**Shorts filter**: Videos of 180 seconds or less, or tagged `#shorts`, are dropped from listings, as are livestreams/upcoming videos (duration `P0D`). Lives in `web/shorts.js` (pure, unit-tested); the YouTube module (trending, search, channel uploads) applies it and refill pages until ~24 items remain.

**YouTube module**: `web/youtube.js`, exposed as the global `YouTube`. The only code that talks to the YouTube Data API. Created with the API key and a fetch-json function (`YouTube.create({ apiKey, fetchJson })`); no DOM, no `localStorage`. Returns simple items (videos with view count and duration in seconds, channels with subscriber count), applies the Shorts filter itself (`includeShorts` bypasses the Shorts rule only), and throws `YouTube.Failure` with a `reason`: `invalid_key`, `quota_exceeded`, `offline`, `not_found`, `other`. Calls: `trending(region)`, `search(query)`, `channel(id)` (title, banner, thumbnail, subscriberCount), `channelUploads(id)`, `video(id)` (a video with its channel, one object) and `comments(id, { order })`. `trending`, `search` and `channelUploads` also accept `{ includeShorts }`; the browse page passes the Show Shorts setting. Both pages only call it and render.

**Listing**: A paged list from the YouTube module (`trending`, `search`, `channelUploads`; `comments` works the same way). It remembers its own position, so lists never share paging state; `more()` returns `{ items, hasMore }` for the next batch, refilled over a bounded number of requests toward about a full page (24), without duplicates. Replaces the old shared `nextPageToken` global.

**Comment sort**: `relevance` ("Top comments", default) or `time` ("Newest first"), passed to the `commentThreads` endpoint.

**Route module**: `web/route.js`, global `Route`, pure (no DOM). The only code that knows the URL format. `Route.parse(search or href)` gives `{ mode, region, videoId, channelId, query, t }` (mode precedence `v` over `q` over `ch`, else home; region defaults to `FR`; `query` is decoded text). Builders `home`, `channel`, `video` (optional `t`), `search`, `href(route)` and `share` return hrefs. Handlers call it instead of using `URLSearchParams`.

**Safe text module**: `web/safetext.js`, global `Safe`, pure (no DOM). The only code that turns YouTube-supplied text (titles, channel names, descriptions, comments, image URLs) into HTML: `Safe.escape`, `Safe.url` / `Safe.urlAttr` (http(s) or PrivaTube page links only), `Safe.description(text, { videoId, region })` (escape, rewrite YouTube links and timecodes, linkify) and `Safe.comment(textDisplay)` (allow-list: `<br>` and URL-checked `<a href>`, everything else shown as text). Page scripts never put API text into `innerHTML` except through it.

**Settings panel**: A gear button in the header (left of the region dropdown, both pages) opening a small modal styled like the other popups. Holds "Show Shorts" (checkbox) and "Forget API key" (calls `ApiKey.clearKey()`, then the key popup asks for a new key and the page re-renders). **Show Shorts** is a browser-only preference (`localStorage` `show_shorts`, default off, never in the URL) behind `Settings.getShowShorts()` / `Settings.setShowShorts()` in `web/settings.js` (pure, injectable storage, tolerant of broken storage and invalid values); the browse page passes it as `includeShorts` and re-renders the current listing on change. Panel wiring is `Settings.bindPanel`.

**Share link**: A URL pointing back at PrivaTube rather than YouTube (the Pages site, `?v=<id>`, plus `&t=` when the player has a timecode; built by `Route.share`). Links in descriptions and comments are rewritten the same way.

## Layout

- `index.html`, `video.html`: the two pages
- `web/PrivaTube.js`, `web/VideoPlayer.js`: logic for each page
- `web/apikey.js`: API key popup, check and storage behind `ApiKey.getKey()`; storage, fetch and UI are injectable (tested in `tests/apikey.test.js`)
- `web/route.js`: the Route module (loaded by both pages before the page scripts; tested in `tests/route.test.js`)
- `web/safetext.js`: the Safe text module (loaded by both pages before the page scripts; tested in `tests/safetext.test.js`)
- `web/settings.js`: the Settings module and settings panel wiring (loaded by both pages before `shorts.js`; tested in `tests/settings.test.js`)
- `web/shorts.js`: duration parser and Shorts predicate (also loaded by `tests/`)
- `web/youtube.js`: the YouTube module (loaded after `shorts.js`, before `PrivaTube.js`; unit-tested with a fake fetch)
- `web/styles.css`, `web/icons/`: shared styling and icons

No build step or package manager. Pure logic is tested with `node --test tests/*.test.js`. To run, open `index.html` or serve the folder statically.
