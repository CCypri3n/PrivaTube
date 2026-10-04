# Changelog

One entry per commit, newest first. Each entry: date, commit subject, what changed and why, issue reference.

## 2026-10-05 — Shared top bar and popups built from one script (closes #22, part of #7) [54cce8e]
- New `web/shell-markup.js` (global `ShellMarkup`, pure part tested): `ShellMarkup.COUNTRIES` (FR, DE, GB, ES, US, defined once), `ShellMarkup.markup()` (the top bar, API key popup and settings popup as one string) and `ShellMarkup.insert()`. `index.html` and `video.html` load it with a classic synchronous `<script>` at the very top of `<body>` followed by `<script>ShellMarkup.insert();</script>`, which `document.write`s the markup at that spot: the bar exists before the rest of the page is parsed and painted (no flash) and it works from disk. If the page had already finished parsing it inserts at the start of `<body>` instead.
- The duplicated HTML is removed from both pages; they keep only page-unique markup (browse: banner, grid, Load More, share popup; player: video, info, comments, share popup, error area). Ids, classes, attributes (aria, `type="password"`), text and order are unchanged (checked: tag-by-tag identical to the old HTML of both pages). Only difference: the key and settings popups now sit at the top of the body instead of after the scripts; they are hidden, `position: fixed`, z-index 10000, so look and stacking are unchanged.
- `tests/shell-markup.test.js`: required ids once each, page-unique ids absent, the five countries in order, password input, aria attributes. Checked in the browser pane over http (both pages: no duplicate ids, key popup shows without a key, gear opens settings with `aria-expanded`, dropdown opens); not checked from `file://` (pane cannot run scripts there).

## 2026-10-05 — Shared Shell script behind the top bar (closes #21, part of #7) [5aad4f6]
- New `web/shell.js` (global `Shell`, loaded by both pages after `youtube.js`, before the page script): `Shell.messageForFailure(error, fallback)` (pure, wording unchanged), `Shell.youtube(apiKey)`, `Shell.showRegion(region, { title })`, `Shell.bindRegion({ onPick(code) })`, `Shell.bindSearch({ onSearch(text) })` (Enter and button, trimmed text) and `Shell.start(onKey)` (waits for `ApiKey.getKey()`, then calls `onKey(key)`; the popup stays up without a key).
- `web/PrivaTube.js` and `web/VideoPlayer.js`: the duplicated failure mapping, YouTube helper, dropdown open/close/outside-click, search box wiring and key start-up are deleted and replaced by calls to `Shell`. Page differences stay in the callbacks: the browse page re-renders on a region pick and ignores an empty search; the player page keeps the video, only updates the address, and searches by navigating to the browse page; the player keeps its own "Video not found." / "Could not load this video." wording. Nothing in the HTML moved (only a `<script>` tag added); #20 Back/Forward, #14 settings and #5 Route usage are untouched. Tiny difference: the player now stores the key even when the address has no video (it was only stored with a video).
- `tests/shell.test.js`: one test per failure reason plus the fallback cases. Checked by hand in a browser with stubbed YouTube data (no real key): browse page region pick re-renders and updates button, header link and address; Enter, button, trimmed text, empty search ignored; Back re-renders; click outside closes the dropdown; player page region pick keeps the iframe and updates the address; player search goes to `index.html?q=...&lang=...`; no key shows the popup.

## 2026-10-05 — Bigger gear icon on the settings button
- `web/styles.css`: `.settings-btn` keeps the same size and position as the country button row (30 x 26 px, same top and height as the country button, 3-4 px to its left) and now centres a larger gear glyph (1.35em, was 0.95em) in it with flex; before, the glyph was small and sat off-centre. Hover, focus and dimmed-while-playing styles unchanged. Checked in the browser pane: the glyph's centre is within 0.3 px of the box centre. (Replaces the short-lived 34 x 34 version.)

## 2026-10-05 — Settings dialog redesign
- `index.html`, `video.html` (identical markup): the settings dialog now has a small round close button (32 px, `x`) in the header next to the title instead of a full-width Close button; "Show Shorts" is an iOS-style switch (51 x 31 track, 27 px knob, crimson when on; still the same checkbox input with `role="switch"`, so keyboard and the saved preference behave as before); the two options sit in one rounded list with a label and a grey hint each, 56 px rows, and "Forget API key" became a quiet red "Forget" text button (44 px tall tap area). Fixed width 360 px (never wider than the screen minus 16 px per side).
- `web/styles.css`: new `.settings-*` and `.switch*` styles (scoped to `#settings-modal`; the API key and share dialogs are unchanged); motion is off under `prefers-reduced-motion`. No JavaScript changed; all element ids kept. Checked in the browser pane (open, switch on, size of controls); not checked with a real key.

## 2026-10-05 — Route follow-ups: popstate re-render, no t inheritance, once-encoded search (closes #20) [5cb8d2d, b8f7e91, 12d2f05]
- `web/PrivaTube.js`: new `popstate` handler (`renderFromAddress`) reads the address through `Route.parse` and re-renders trending, search or channel (Back from a channel to home shows trending and hides the banner; search -> channel -> Back/Forward round-trips). A flag stops the render functions from `pushState`ing (no new entries, no loops). It also fills the search box and syncs the region button, header link and tab title (`syncRegionUI`, also used at startup, on region change and by `showHomepage`), so search in FR, switch to DE, Back shows FR everywhere.
- Address writes go through `pushAddress`, which asks the new pure `Route.addressChange(currentSearch, targetHref, { restoring, loadMore, initial })` for `skip` / `replace` / `push` (tested in `tests/route.test.js`): Back/Forward re-renders and "load more" skip; an identical address skips; the same view spelled differently (bare `/`, old double-encoded `q`, reordered params, compared via `Route.parse`) replaces; a different view pushes, except the first render at startup, which replaces. So startup never adds a history entry. Enter and the search button no longer `pushState` themselves (`submitSearch` -> `searchVideos(false, text)`): an empty box does nothing, a repeated search adds no entry.
- Back/Forward while the API key popup is showing (no key yet) is ignored; startup then renders from the current address (read after the key is accepted, region UI synced). Every popstate also bumps the render generation, even one that renders nothing.
- Stale renders: a render-generation counter makes a slower earlier request drop its result (listing, banner, title, error text) once a newer navigation or popstate has started.
- Links built by the browse page get `currentRegion()` (`{ region }` only), so a `t` in the address no longer leaks onto every video/channel link. `playVideo(id, { t })` takes `t` explicitly: the startup redirect of a shared link (`index.html?v=X&t=90`) passes `startRoute.t` so the timecode survives; clicks from listings pass none.
- `web/route.js`: `Route.search` stores the text encoded once (`AT&T` -> `q=AT%26T`, was `AT%2526T`). `parse` is unchanged: old double-encoded and new once-encoded addresses both give `AT&T`. Known limit (tested): text that itself looks like an escape (typed `a%20b`, `50%25`) reads back decoded (`a b`, `50%`); inherent to still accepting old double-encoded links, no version marker added.
- Tests in `tests/route.test.js` (once-encoded build, both forms parse, round-trips incl. `50%`/`100%`, the escape-text limit, `t` not leaking, explicit `t`, shared-link startup keeps `t`). Checked by hand in a browser with stubbed YouTube data (no real key): Back from channel to home (trending, banner hidden); search -> channel -> Back/Forward; repeated search (no new entry); region switch in search mode then Back (region button, header, results); startup on bare `/`, old-encoded `?q=AT%2526T` and reordered `?lang=ES&q=x` (history length unchanged, address canonicalised); Back with no key (ignored); slow search then popstate (stale result dropped); `t=90` listing links carry no `t`.


## 2026-10-05 — Settings panel review fixes (#14)
- `web/settings.js`: the Show Shorts change is applied when the panel closes (no scroll jump behind the open panel); Tab is kept inside the dialog; the gear button reports `aria-expanded`.
- `web/styles.css`: the gear glyph is forced to text presentation (`font-variant-emoji`) so it does not render as an emoji.

## 2026-10-05 — Settings panel: forget API key and Show Shorts toggle (closes #14)
- New `web/settings.js` (`Settings.getShowShorts()` / `setShowShorts()`, `create({ storage })`, `bindPanel`), loaded by both pages; tested in `tests/settings.test.js` with a fake storage (default off, persistence, invalid stored values -> off, throwing or missing storage tolerated with the value kept for the page session).
- Both pages: gear button in the header left of the region dropdown, opening a "Settings" modal (same style as the key and share popups; `role="dialog"`, labelled button, Close button, Escape and backdrop click close it, focus moves in and back to the button).
- "Forget API key": closes the panel, `ApiKey.clearKey()`, the key popup asks for a new key; then the browse page re-renders its listing and the player page reloads the video.
- "Show Shorts": browser-only (`localStorage` `show_shorts`, not in the URL). The browse page passes `includeShorts` to trending, search and channel uploads and re-renders the current listing on change. The player page has no listings, so the toggle only saves there.
- Browse page: re-rendering replaces the address instead of pushing a duplicate history entry (`setUrl`).
- Not checked in a real browser yet.

## 2026-10-05 — Safe text module: escape and URL-check all YouTube-supplied text (closes #6) [5cd55f1, 17b80bc]
- New pure `web/safetext.js` (`Safe.escape`, `url`, `urlAttr`, `description`, `comment`), loaded by both pages after `route.js`; tested in `tests/safetext.test.js` (hostile strings, URL schemes, link/timecode rewriting, comment sanitising, plus a static scan that API fields in `web/PrivaTube.js` / `web/VideoPlayer.js` templates go through `Safe`).
- Fixes an XSS: titles, channel names, banner title, thumbnail/banner/avatar URLs, comment author names/avatars/dates and counts were interpolated into `innerHTML` unescaped (a title like `x" onerror="alert(1)` injected an attribute on the browse page). All of those now go through `Safe.escape` / `Safe.urlAttr`; non-http(s) image URLs become empty (comment avatars fall back to the unavailable-avatar icon).
- Also from the URL, not the API: the player iframe is now built with DOM calls and an encoded id (`?v=` was spliced into HTML), and the region button uses `textContent` (`?lang=` was spliced into `innerHTML`) on both pages.
- Removed the inline `onclick="fetchChannelVideos('<id>')"` on channel results (an id with `'` could escape the JS string); the wrapping link already navigates to the channel.
- `Safe.description(text, { videoId, region })` replaces `youtubeDescriptiontoPrivaTube` + `linkify`: escapes, rewrites YouTube watch / youtu.be / channel links to `video.html?v=` / `index.html?ch=` (keeping `t`), links timecodes to the given video (`&t=`; plain text if no video id; the current video is an argument, not `lastPlayedVideoId`), and makes other http(s) links open with `target="_blank" rel="noopener noreferrer"`. Trailing punctuation is no longer part of a link.
- Dropped or changed behaviours versus the old code: bare `*.html?...` strings in descriptions are no longer linkified; `t=1h2m`-style values are ignored (digits with optional `s` only, at most 359999); trailing punctuation is trimmed from links; bare `www.` text is still not linkified (unchanged). Timecodes with minutes/seconds of 60 or more (`99:99`) stay text.
- Review follow-up: rewritten YouTube links are now built by `Route.video` / `Route.channel` (injected: `Safe.create({ route })`; the default `Safe` uses the global `Route`, or `require('./route.js')` under Node), so URL format stays in `route.js`; they now carry `&lang=` (default `FR`; `Safe.comment` takes `{ region }` like `description`). The link contract (lowercase `video.html`/`index.html` relative links only, user-info and punycode hosts accepted by design) is documented in the module header.
- `Safe.comment(textDisplay)` replaces `youtubeCommentPrivaTube`: keeps only `<br>` and `<a href>` (href decoded, URL-checked, YouTube links rewritten, external ones hardened); `javascript:`/`data:` anchors become plain text; every other tag is shown as text. The YouTube module output is unchanged.

## 2026-10-05 — API key popup follow-ups: try-again outcome, reset state, shared pending promise (closes #19) [ca1480c, e95b8c3]
- `web/apikey.js`: the key check now has three outcomes: accepted (OK, or 403 quota exceeded), rejected (400, or a non-quota 403: "Invalid API Key") and try-again (network error, 5xx, 429 and any other answer: "try again in a moment", key not saved). Before, any non-quota failure blamed the key.
- The popup opens with an empty input and the error hidden every time (new `open()` ui step, once per popup session; errors still persist between retries). Previously the last typed key survived "forget".
- Concurrent `getKey()` calls share one pending promise (one popup, one check, one result), reset once settled.
- Incomplete popup markup makes `getKey()` reject with an error naming the missing element instead of hanging.
- The `create` option `fetch` is renamed `fetchFn` so it no longer shadows the global (no callers passed it); `create` also takes an optional `doc`. `getKey`/`clearKey` unchanged.
- Note for the #4 entry: pressing Enter in the key input now submits the popup (like clicking Save).
- Tests: 5xx/503/500/429, concurrent calls, whitespace-only and padded saved values, Enter key, Save click and listener removal, reset on reopen, missing markup, via a tiny fake document. Not checked in a real browser (the issue's by-hand check with a real key is still to do).
- Hardening after review: `getKey()` never throws synchronously (a throwing storage becomes a rejection); the popup is closed if asking or checking fails unexpectedly; Enter calls `preventDefault()`; `ask()` no longer re-validates markup that `open()` checked. Tests added for these and for `getKey()` working again after a rejection; the reset-on-reopen test no longer relies on timers.
- Closes #19.

## 2026-10-05 — Player page: keep region select on the player URL (#5)
- `web/VideoPlayer.js`: changing the region on the player page rebuilds the `video.html?v=` href instead of `Route.href`, which parsed a page without `v` as home and rewrote the address to `index.html`. Review fix for the Route module (#5).

## 2026-10-05 — Route module: one place for URL state (closes #5)
- New pure `web/route.js` (`Route.parse`, `home`, `channel`, `video`, `search`, `href`, `share`), loaded by both pages before the page scripts; tested in `tests/route.test.js`. Mode precedence is `v`, then `q`, then `ch`, else home; region defaults to `FR` in one place; `t` is kept only as a non-negative integer.
- `web/PrivaTube.js` and `web/VideoPlayer.js` no longer touch `URLSearchParams`: removed the per-handler param clearing, the four `lang=FR` defaults, both copies of `createVideoUrl`/`createChannelUrl`, the mode derivation (country select and page load) and the hardcoded share link, which now keeps `t`.
- Behaviour changes: navigating to a channel drops `q` and `t` (a leftover `q` made a reload show search); going home drops other params and writes `lang` in one history entry; searching from the player page now encodes `q` like the browse page does; timecode links in descriptions carry the region; invalid `t` (non-integer) is ignored.

## 2026-10-04 — API key module: shared popup, check and storage (closes #4) [f394400]
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
