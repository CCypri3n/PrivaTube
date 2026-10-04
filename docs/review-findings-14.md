# Review findings for #14 (settings panel)

Scoring agent: 8/10 on attempt 1 (branch `worktree-agent-af634636c70e62c26`, base 958812e). No agent opened the pages in a browser. Status below reflects the branch after review fixes.

## Fixed on the branch
- Toggling Show Shorts re-rendered the list behind the open panel and jumped the page to the top: the change is now applied when the panel closes (`web/settings.js`).
- `aria-modal` without a focus trap: Tab is now kept inside the dialog.
- Gear button had no `aria-expanded`: added to both pages and kept in sync.
- Gear glyph could render as an emoji: `font-variant-emoji: text` added.

## Open (not fixed)
1. **Gear position.** `.settings-btn` is `position: fixed; right: 96px`, next to the region button at `right: 32px`. The region button's width varies (`US ▼` plus padding), so the two may overlap, or collide with the search bar at phone width (375px). Check by hand at desktop and phone width; ideally put the gear in the same flex container as the region dropdown.
2. **History behaviour change.** `setUrl` in `web/PrivaTube.js` replaces the history entry when the URL would not change (to avoid duplicates on re-render). This also affects clicking Home, repeating a search, or changing region on the same query. Beyond the issue; confirm it is wanted or revert and pass a "no push" flag to `rerenderListing`.
3. **Duplicated forget-key handler** in both pages (clear key, blank `API_KEY`, `getKey`, then reload step); `bindPanel` could own it with a `reload` callback.
4. **Inline styles in the modal markup** (`index.html`, `video.html`) and identical markup on both pages (overlaps #7, page shell).
5. **No tests for `bindPanel`, the re-render wiring or `setUrl`** (only the storage module is tested). A small DOM fake would cover them.
6. Re-rendering a channel listing makes another channels request (banner rebuilt).

## By-hand browser checks
- Gear visible on both pages without overlap; also while a video plays (fades to 0.5 until hovered).
- Toggle Show Shorts on home, search and channel; close the panel; the list re-renders and the URL is unchanged; reload keeps the choice; a private window defaults to off.
- Escape, backdrop click and Close all close the panel and return focus to the gear; Tab stays inside.
- Forget API key: key popup appears empty, localStorage `api_key` is removed; a valid key re-renders the listing (browse) or reloads the video (player).
- Back button not polluted with duplicate entries after toggling.
