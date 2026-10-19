# Roadmap to a 5-star extension

Ordered by impact on ratings and reviews. Check items off as they ship.

## Milestone 1.1 — trust and polish (do before or right after public launch)
- [ ] Make `tabs` an optional permission requested on first use of "Insert link" (removes the "Read your browsing history" install warning)
- [ ] First-run walkthrough: 3 short tips after choosing a folder, dismissible
- [ ] Options page for shortcuts (link to chrome://extensions/shortcuts), default folder behaviour, autosave delay
- [ ] Find & replace in the current note (Ctrl+F / Ctrl+H) with match count
- [ ] Unit tests for md.js and the editor helpers; Playwright e2e with the extension loaded; run in CI on every PR
- [ ] Accessibility pass: screen-reader labels, focus order, contrast check in both themes
- [ ] German translation via _locales (chrome.i18n); the store listing in German too

## Milestone 1.2 — organise
- [ ] Subfolders shown as a collapsible tree; move notes between folders by drag and drop
- [ ] `[[Wiki links]]` with autocomplete, backlinks panel, and rename that updates links
- [ ] `#tags` with a tag filter in the sidebar
- [ ] Templates folder (meeting notes, daily note, bug report) picked from the palette
- [ ] Outline / table of contents panel for long notes

## Milestone 1.3 — the browser advantage
- [ ] Per-site notes: a note linked to the current domain or URL that opens automatically in the side panel
- [ ] Clip as Markdown: convert selected HTML (lists, links, code, tables) instead of plain text
- [ ] Paste or drop images: saved into an `assets/` folder next to the note and linked relatively
- [ ] Screenshot of the visible tab into the current note
- [ ] Omnibox keyword: type `ink <text>` in the address bar to append to Inbox

## Milestone 1.4 — power features
- [ ] Version history: snapshot on save into `.inkpad-history/`, browse and restore diffs
- [ ] Syntax highlighting in code blocks (vendored, no remote code)
- [ ] Export note to PDF / HTML; copy as rich text for email and Confluence
- [ ] Focus mode and typewriter scrolling; optional live-preview editor (CodeMirror 6, vendored)
- [ ] Multiple folders / workspaces with a switcher
- [ ] Optional AI actions with the user's own API key (summarise, rewrite, extract tasks), clearly opt-in and disclosed in the privacy policy

## Store and community
- [ ] Short demo GIF/video for the listing and README
- [ ] Support page (GitHub Issues with bug and feature templates), link from the listing
- [ ] Reply to every store review; in-app "What's new" after updates
- [ ] Publish to Microsoft Edge Add-ons (free) once stable
