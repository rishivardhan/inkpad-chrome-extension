# Inkpad — notes for Claude Code

## Project context
- Owner: rishivardhan (GitHub). Repo: https://github.com/rishivardhan/inkpad-chrome-extension
- Status: v1.0.0 built and tested locally; Chrome Web Store submission in preparation (listing copy, permission justifications and graphics in `store/`).
- Goal: a notepad clearly better than existing Chrome note extensions, whose notes persist as real files in a folder the user picks. Features are added iteratively; see ROADMAP.md for the agreed backlog.
- The extension lives in `src/`. Load `src/` unpacked in chrome://extensions. Build the store zip with `./scripts/package.sh`.
- Release flow: bump `version` in src/manifest.json, add a CHANGELOG entry, tag `vX.Y.Z`, push the tag; GitHub Actions attaches the zip to a release; upload that zip to the store.
- Store review sensitivity: keep permissions minimal and justified in store/LISTING.md; never add remote code; update PRIVACY.md if any data handling changes.

Chrome MV3 extension: Markdown notepad that persists notes as real files in a user-chosen folder.

## Architecture
- `app.html` + `app.js` (ES module) is the whole UI. It runs as the side panel (`app.html`) and as a full tab (`app.html?mode=tab`, `IS_TAB`).
- Storage is abstracted behind two classes in `app.js` with the same interface:
  `list() read(name) modified(name) write(name,text) rename(from,to) remove(name)->token restore(token)`, plus `kind`, `id`, `label`.
  - `FolderStore` wraps a `FileSystemDirectoryHandle` (persisted in IndexedDB via `db.js`, key `dir`). Flat folder only for now; `.md/.markdown/.txt` files.
  - `LocalStore` uses `chrome.storage.local` key `inkpad.notes` when no folder is chosen.
- All app state is in the `S` object. Settings persist in `chrome.storage.local['inkpad.settings']` (`DEFAULTS` lists the keys).
- Save pipeline: `markDirty()` → debounced `save()` → serialized through `S.saving` → `doSave()` (conflict check by lastModified, writes a "(other version)" copy if the disk changed).
- Crash safety: draft copy in `inkpad.draft`, offered back in `checkDraft()`.
- `background.js` never touches the folder. Clips go into `inkpad.clipQueue`; the open app page consumes the queue in `processClips()` and appends to `Inbox.md`.
- `md.js` is a hand-written Markdown renderer (MV3 forbids remote scripts; keep it dependency-free or vendor libraries locally). Task checkboxes carry `data-line` for source toggling.

## Conventions
- No build step, no frameworks, no remote code. Vanilla JS modules, CSS custom properties.
- Colors only via tokens on `:root` (light) and the dark blocks in `app.css`; keep both in sync.
- Icons are inline SVG paths in `ICONS` (app.js); use `icon(name)` or `data-icon="name"` in HTML.
- Edit text through `insertText()` so the native undo stack keeps working.
- UI copy: sentence case, plain verbs, errors say what happened and what to do.

## Testing
Load `src/` unpacked from `chrome://extensions`, reload after changes. Inspect the side panel via right-click → Inspect; the service worker via the extension card.

## Backlog
See ROADMAP.md (prioritised). Original idea list: Subfolders/tree, tags (#tag) and backlinks ([[note]]), find & replace, export to PDF/HTML, syntax highlighting in code blocks, per-site notes (notes keyed by URL), sync of settings via chrome.storage.sync, templates folder, version history snapshots.
