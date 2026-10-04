# Changelog

One entry per commit, newest first. Each entry: date, commit subject, what changed and why, issue reference.

## 2026-10-05 — API key popup follow-ups: try-again outcome, reset state, shared pending promise (closes #19)
- `web/apikey.js`: the key check now has three outcomes: accepted (OK, or 403 quota exceeded), rejected (400, or a non-quota 403: "Invalid API Key") and try-again (network error, 5xx, 429 and any other answer: "try again in a moment", key not saved). Before, any non-quota failure blamed the key.
- The popup opens with an empty input and the error hidden every time (new `open()` ui step, once per popup session; errors still persist between retries). Previously the last typed key survived "forget".
- Concurrent `getKey()` calls share one pending promise (one popup, one check, one result), reset once settled.
- Incomplete popup markup makes `getKey()` reject with an error naming the missing element instead of hanging.
- The `create` option `fetch` is renamed `fetchFn` so it no longer shadows the global (no callers passed it); `create` also takes an optional `doc`. `getKey`/`clearKey` unchanged.
- Note for the #4 entry: pressing Enter in the key input now submits the popup (like clicking Save).
- Tests: 5xx/503/500/429, concurrent calls, whitespace-only and padded saved values, Enter key, Save click and listener removal, reset on reopen, missing markup, via a tiny fake document. Not checked in a real browser (the issue's by-hand check with a real key is still to do).
- Closes #19.

## 2026-10-04 — API key module: shared popup, check and storage (closes #4)
- New `web/apikey.js` (`ApiKey.getKey()`, `ApiKey.clearKey()`, `ApiKey.create({ storage, fetch, ui })`); loaded by both pages before the page scripts. Deleted the duplicated `fetchApiKey` from `web/PrivaTube.js` and `web/VideoPlayer.js`.
- The check now distinguishes rejected (invalid message, not saved), quota exceeded (key is valid: saved) and network error (network message, not saved); the error is hidden on the next success.
- `video.html` key input is now `type="password"` like `index.html`; popup markup is identical.
- Added `tests/apikey.test.js` with fake storage, network and UI.
- Closes #4.

## 2026-10-04 — Fill YouTube module test gaps, document includeShorts
- Added `tests/youtube-gaps.test.js`: when the refill bound is reached while more videos exist, `trending` and `channelUploads` return the partial batch with `hasMore` true (and the listing continues without repeats). Checked by breaking the bound and the end-of-list flag.
- Already covered, left alone: `includeShorts` on `channelUploads` (`tests/youtube-channels.test.js`) and comment `order` reaching the request (`tests/youtube-video.test.js`, whose fake serves pages by the requested order; breaking it fails them).
- `CONTEXT.md`: trending, search and channel uploads accept `includeShorts`; no page passes it yet (#14). No module behaviour changed. Closes #18.

## 2026-10-04 — Player page: show load errors in one place
- `video.html`: new `#video-error` area (crimson, `role="alert"`). `web/VideoPlayer.js`: a video load failure shows one message there (video not found, quota "try again tomorrow", invalid key, offline, generic fallback) and hides and empties title, description, stats, channel info and comments, with no placeholders; a successful load or closing the player clears it. A comments-only failure keeps the video and shows the message in the comments area. `web/styles.css`: `.video-error`. Closes #16.

## 2026-10-04 — Fix search crash without q in the address and stale channel banner (#17)
- `web/PrivaTube.js`: `searchVideos` now declares `query` with `let` and `queryFromField` with `const`, so searching from the box works when the address has no `q` (it threw a `TypeError` before); empty search text just returns. `showHomepage` hides `#channel-banner` (`searchVideos` already did), so a previous channel's banner no longer stays above trending. Minimal fix; address handling is left for #5.

## 2026-10-04 — Channel page: one channels request, explicit failures (closes #15)
- `web/youtube.js`: `channel(id)` now also returns `uploadsPlaylistId`; `channelUploads(id, { uploadsPlaylistId })` uses it and skips its own channels lookup (still works without it).
- `web/PrivaTube.js`: channel mode awaits the info call first and builds the uploads listing from its result, so a channel load costs one channels request. The info call's failure reason decides the message: "Channel not found." for not_found, distinct quota / invalid key / offline messages otherwise (no longer swallowed).
- Added `tests/youtube-channel-requests.test.js`; `tests/youtube-channels.test.js` expects the new `uploadsPlaylistId` field.

## 2026-10-04 — YouTube module step 3: player page, video and comments
- `web/youtube.js`: added `video(id)` (video plus its channel in one object, counts as numbers or null, unknown video fails with `not_found`) and `comments(id, { order })` (`relevance` or `time`; Listing-style `more()` with no duplicates and end reported; each call keeps its own position). `makeListing` gained an optional request bound (one request per comment batch).
- `web/VideoPlayer.js`: only calls the module and renders; removed its inline video, channel and comment requests (API key validation stays, #4) and the global `nextPageToken`. Failures map to messages (not found, quota "try again tomorrow", invalid key, offline); changing the comment sort restarts the list. Fixed latent errors in the old comment code (undefined `video`/`commentsDiv`).
- `video.html` loads `web/shorts.js` and `web/youtube.js`; added `tests/youtube-video.test.js`; `CONTEXT.md` updated. Step 3 of #10, closes #13.

## 2026-10-04 — YouTube module step 2: channels
- `web/youtube.js`: added `channel(id)` (title, banner, thumbnail, subscriberCount) and `channelUploads(id, { includeShorts })` returning a Listing (same Shorts/livestream/unavailable filtering, refill, no duplicates, `more()`); an unknown channel throws `YouTube.Failure` with reason `not_found`.
- `web/PrivaTube.js`: channel mode only calls the module and renders (banner, "Channel not found."); deleted the inline channel fetching, cached uploads-playlist state, `collectPages`, `filterListable`, `isListableResource`, the legacy result rendering, `parseDurationToVisual`, `PAGE_SIZE` and the `nextPageToken` global.
- Added `tests/youtube-channels.test.js`; `CONTEXT.md` updated (merged duplicate Listing/YouTube module entries). Step 2 of #10, closes #12.

## 2026-10-04 — YouTube module step 1: core, trending and search
- New `web/youtube.js` (`YouTube.create({ apiKey, fetchJson })`): trending and search return Listings with `more()`, normalized items (numbers, duration in seconds, stats joined), Shorts/livestream/unavailable filtering via `shorts.js` (`includeShorts` bypasses Shorts only), bounded page refill, de-duplication, and `YouTube.Failure` with a reason (invalid key, quota exceeded, offline, not found, other).
- `web/PrivaTube.js`: home and search now only call the module and render; removed their inline fetching, the stats re-fetch and the shared `nextPageToken` for these paths. Quota/invalid-key/offline show distinct messages. Channel mode unchanged (legacy rendering kept until step 2).
- `index.html` loads `web/youtube.js`; added `tests/youtube.test.js`; `CONTEXT.md` gains YouTube module and Listing. Step 1 of #10, closes #11.

## 2026-10-04 — Document #8 fix and changelog convention
- Added `CHANGELOG.md` and the changelog rule in `CLAUDE.md`. Closes #8.

## 2026-10-04 — Address review: dedupe listable adapter, rename filter, count only videos in search refill (`3b75327`)
- `isListableResource` helper replaces two duplicated adapters in `web/PrivaTube.js`.
- `filterOutShorts` renamed `filterListable` (it also drops livestreams and unavailable videos).
- Search refill counts only videos toward the ~24 target, not channels.
- Refs #8.

## 2026-10-04 — Fix Shorts filter: parse hours, 180s cutoff, shared predicate, page refill (`1bd49a5`)
- New `web/shorts.js`: pure `parseDuration` (days/hours/minutes/seconds; `P0D` and invalid → 0), `isShort` (≤ 180 s or `#shorts`), `isListable` (also hides livestreams/upcoming, `P0D`).
- Trending, search and channel listings share the predicate; videos of an hour or longer are no longer dropped.
- `collectPages` refills trending/search/channel pages (max 5 requests) toward 24 items; channel listing no longer slices to 24 since the page token has advanced.
- Added `tests/shorts.test.js` (run `node --test tests/*.test.js`); updated `CONTEXT.md`.
- Fixes #8.
