# PrivaTube

A static, build-less web app: a privacy-focused YouTube front-end. It talks directly from the browser to the YouTube Data API v3 using a key the user supplies. There is no backend. It is hosted on GitHub Pages (https://ccypri3n.github.io/PrivaTube/) and also runs from `index.html` opened locally.

## Language

**API key**: The user's own YouTube Data API v3 key. Asked for in a modal on first load, validated with a test request, stored in `localStorage` under `api_key`. Never sent anywhere but Google.

**Home / search / channel mode**: The three states of the browse page (`index.html`, `web/PrivaTube.js`): trending videos for a region, search results (videos and channels), or a channel's uploads. State is carried in URL query params.

**Region**: The country code (FR, DE, GB, ES, US) used for the trending chart on the home page.

**Player page**: `video.html` + `web/VideoPlayer.js`. Reads `?v=<videoId>` (and optional `&t=<seconds>`), embeds the video via `youtube-nocookie.com`, and shows stats, description and comments.

**Shorts filter**: Videos of 180 seconds or less, or tagged `#shorts`, are dropped from listings, as are livestreams/upcoming videos (duration `P0D`). Lives in `web/shorts.js` (pure, unit-tested); the YouTube module (trending, search, channel uploads) applies it and refill pages until ~24 items remain.

**YouTube module**: `web/youtube.js`, exposed as the global `YouTube`. The only code that talks to the YouTube Data API. Created with the API key and a fetch-json function (`YouTube.create({ apiKey, fetchJson })`); no DOM, no `localStorage`. Returns simple items (videos with view count and duration in seconds, channels with subscriber count), applies the Shorts filter itself (`includeShorts` bypasses the Shorts rule only), and throws `YouTube.Failure` with a `reason`: `invalid_key`, `quota_exceeded`, `offline`, `not_found`, `other`. Calls: `trending(region)`, `search(query)`, `channel(id)` (title, banner, thumbnail, subscriberCount), `channelUploads(id)`, `video(id)` (a video with its channel, one object) and `comments(id, { order })`. `trending`, `search` and `channelUploads` also accept `{ includeShorts }`; no page passes it yet (the settings panel, #14, will). Both pages only call it and render.

**Listing**: A paged list from the YouTube module (`trending`, `search`, `channelUploads`; `comments` works the same way). It remembers its own position, so lists never share paging state; `more()` returns `{ items, hasMore }` for the next batch, refilled over a bounded number of requests toward about a full page (24), without duplicates. Replaces the old shared `nextPageToken` global.

**Comment sort**: `relevance` ("Top comments", default) or `time` ("Newest first"), passed to the `commentThreads` endpoint.

**Share link**: A `video.html?v=<id>` URL pointing back at PrivaTube rather than YouTube. Links in descriptions and comments are rewritten the same way.

## Layout

- `index.html`, `video.html`: the two pages
- `web/PrivaTube.js`, `web/VideoPlayer.js`: logic for each page (API-key handling is duplicated in both)
- `web/shorts.js`: duration parser and Shorts predicate (also loaded by `tests/`)
- `web/youtube.js`: the YouTube module (loaded after `shorts.js`, before `PrivaTube.js`; unit-tested with a fake fetch)
- `web/styles.css`, `web/icons/`: shared styling and icons

No build step or package manager. Pure logic is tested with `node --test tests/*.test.js`. To run, open `index.html` or serve the folder statically.
