# PrivaTube

A static, build-less web app: a privacy-focused YouTube front-end. It talks directly from the browser to the YouTube Data API v3 using a key the user supplies. There is no backend. It is hosted on GitHub Pages (https://ccypri3n.github.io/PrivaTube/) and also runs from `index.html` opened locally.

## Language

**API key**: The user's own YouTube Data API v3 key. Asked for in a modal on first load, validated with a test request, stored in `localStorage` under `api_key`. Never sent anywhere but Google.

**Home / search / channel mode**: The three states of the browse page (`index.html`, `web/PrivaTube.js`): trending videos for a region, search results (videos and channels), or a channel's uploads. State is carried in URL query params.

**Region**: The country code (FR, DE, GB, ES, US) used for the trending chart on the home page.

**Player page**: `video.html` + `web/VideoPlayer.js`. Reads `?v=<videoId>` (and optional `&t=<seconds>`), embeds the video via `youtube-nocookie.com`, and shows stats, description and comments.

**Shorts filter**: Videos of 60 seconds or less, or tagged `#shorts`, are dropped from listings.

**Comment sort**: `relevance` ("Top comments", default) or `time` ("Newest first"), passed to the `commentThreads` endpoint.

**Share link**: A `video.html?v=<id>` URL pointing back at PrivaTube rather than YouTube. Links in descriptions and comments are rewritten the same way.

## Layout

- `index.html`, `video.html`: the two pages
- `web/PrivaTube.js`, `web/VideoPlayer.js`: logic for each page (API-key handling is duplicated in both)
- `web/styles.css`, `web/icons/`: shared styling and icons

No build step, package manager or tests. To run, open `index.html` or serve the folder statically.
