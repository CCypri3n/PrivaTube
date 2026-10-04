# Changelog

One entry per commit, newest first. Each entry: date, commit subject, what changed and why, issue reference.

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
