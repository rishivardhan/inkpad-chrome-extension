# Chrome Web Store listing — copy and paste

## Store listing tab

**Name:** Inkpad

**Summary (max 132 chars):**
A fast Markdown notepad in your side panel that saves every note as a real file in a folder you choose.

**Category:** Productivity → Tools (or Workflow & Planning)

**Language:** English

**Description:**
Inkpad is a notepad that lives in Chrome's side panel and keeps your notes where you can see them: as plain Markdown files in a folder on your computer. Close the browser, restart, open the folder in VS Code or any editor, and your notes are exactly where you left them.

Write
• Autosaves as you type, with crash recovery
• Write, Split and Read views with a built-in Markdown preview
• Task lists you can tick in the preview, tables, code blocks, quotes
• Lists continue when you press Enter; Tab and Shift+Tab indent
• Paste a link over selected text to turn it into a Markdown link

Find
• Search titles and full text
• Ctrl+K command palette to jump to any note or run any command
• Pin important notes to the top
• Today's note with Alt+D

Capture from the web
• Right-click selected text, a link or a page to save it to your Inbox note with the source
• Insert a link to the page you're reading with Alt+L

Your files, your folder
• Notes are ordinary .md files you can back up, sync with any cloud drive, or edit in other apps
• Inkpad notices when a note changes in another editor and reloads it
• Deleted notes go to a trash folder, with Undo

Private by design
No account, no servers, no tracking. Inkpad makes no network requests; nothing you write leaves your computer.

Shortcuts: Ctrl+Shift+Y opens the side panel, Alt+Shift+N opens a full tab.

## Graphics (in /screenshots and /promo)
- Store icon 128×128: icons/icon128.png (inside the extension)
- Screenshots 1280×800: screenshot-1..4.png
- Small promo tile 440×280: promo-small-440x280.png

## Privacy tab

**Single purpose:**
Inkpad is a note-taking tool: it lets users write, organise and search Markdown notes in Chrome's side panel and saves them as files in a folder the user chooses.

**Permission justifications:**
- sidePanel: Inkpad's main interface is displayed in Chrome's side panel.
- storage / unlimitedStorage: Stores user settings, a crash-recovery copy of the note being edited, and notes for users who haven't chosen a folder. Notes can be large, so unlimitedStorage avoids the 10 MB local quota.
- contextMenus: Adds "Clip selection to Inkpad", "Save link to Inkpad" and "Save this page to Inkpad" to the right-click menu.
- tabs: Reads the title and URL of the current tab when the user clicks "Insert link to current page" from the side panel or a full Inkpad tab, and opens Inkpad in a full tab.
- scripting: When the user chooses "Clip selection", reads the selected text from the page so line breaks are preserved. Runs only on that user action.
- activeTab: Grants temporary access to the page the user right-clicked, only for the clip action above.

**Remote code:** No, I am not using remote code. (All JavaScript is packaged in the extension.)

**Data usage:** Tick none of the data types. Inkpad does not collect or transmit user data. Certify the three disclosures (not sold to third parties, not used for unrelated purposes, not used for creditworthiness).

**Privacy policy URL:** host PRIVACY.md publicly (GitHub repo, GitHub Pages or a Gist) and paste the link.

## Distribution tab
Visibility: Public (or Unlisted to share by link only). Regions: all. Price: free.
