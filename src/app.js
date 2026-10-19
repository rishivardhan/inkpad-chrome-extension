import { idbGet, idbSet } from './db.js';
import { renderMarkdown, esc } from './md.js';

/* ============================================================
   Constants & state
   ============================================================ */
const NOTE_RE = /\.(md|markdown|txt)$/i;
const TRASH_DIR = '.inkpad-trash';
const K = {
  settings: 'inkpad.settings',
  mode: 'inkpad.mode',            // 'folder' | 'local'
  local: 'inkpad.notes',          // notes when no folder is chosen
  localTrash: 'inkpad.trash',
  draft: 'inkpad.draft',          // crash-safety copy of the note being edited
  clips: 'inkpad.clipQueue',      // filled by background.js
};
const IS_TAB = new URLSearchParams(location.search).get('mode') === 'tab';
const DEFAULTS = {
  theme: 'auto', font: 'serif', fontSize: 16, wrap: true, ruled: true,
  view: 'edit', sidebar: true, pinned: [], lastNote: null,
};

const S = {
  store: null,
  notes: [],              // [{ name, modified, size }]
  texts: new Map(),       // name -> text (for search + snippets)
  current: null,
  fileModified: 0,
  dirty: false,
  saveTimer: 0,
  draftTimer: 0,
  saving: Promise.resolve(),
  query: '',
  settings: { ...DEFAULTS },
};

const $ = (s) => document.querySelector(s);
const el = {
  app: $('#app'), list: $('#note-list'), search: $('#search'), editor: $('#editor'),
  preview: $('#preview'), workspace: $('#workspace'), title: $('#title'), ext: $('#ext'),
  folderLabel: $('#folder-label'), folderChip: $('#folder-chip'),
  saveState: $('#save-state'), saveText: $('#save-text'),
  words: $('#stat-words'), chars: $('#stat-chars'), read: $('#stat-read'),
  menu: $('#menu'), menuBtn: $('#btn-menu'), palette: $('#palette'),
  paletteInput: $('#palette-input'), paletteList: $('#palette-list'),
  onboard: $('#onboard'), toast: $('#toast'),
};

/* ============================================================
   Icons
   ============================================================ */
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/>',
  link: '<path d="M10 13.5a4.5 4.5 0 0 0 6.4.4l2.8-2.8a4.5 4.5 0 0 0-6.4-6.4l-1.4 1.4"/><path d="M14 10.5a4.5 4.5 0 0 0-6.4-.4l-2.8 2.8a4.5 4.5 0 0 0 6.4 6.4l1.4-1.4"/>',
  expand: '<path d="M14 4h6v6M20 4l-8 8M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  command: '<path d="M9 6.5A2.5 2.5 0 1 0 6.5 9H17.5A2.5 2.5 0 1 0 15 6.5v11a2.5 2.5 0 1 0 2.5-2.5h-11A2.5 2.5 0 1 0 9 17.5z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  pin: '<path d="M12 17v4M8 4h8l-1 6 3 3.5H6L9 10z"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
  note: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9 12h6M9 16h4"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
};
const icon = (name) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
document.querySelectorAll('[data-icon]').forEach((n) => n.insertAdjacentHTML('afterbegin', icon(n.dataset.icon)));

/* ============================================================
   Utilities
   ============================================================ */
const stem = (n) => n.replace(NOTE_RE, '');
const extOf = (n) => (n.match(NOTE_RE) || ['.md'])[0];
const sanitize = (s) =>
  s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/^\.+/, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled';
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

function relTime(ts) {
  if (!ts) return '';
  const s = (Date.now() - ts) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 6) return `${Math.round(s / 86400)} d ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: s > 86400 * 300 ? 'numeric' : undefined });
}

function uniqueName(base, ext = '.md') {
  const taken = new Set(S.notes.map((n) => n.name.toLowerCase()));
  let name = `${base}${ext}`;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base} ${i}${ext}`;
  return name;
}

let toastTimer = 0;
function toast(msg, action) {
  el.toast.querySelector('#toast-text').textContent = msg;
  const btn = el.toast.querySelector('#toast-action');
  btn.hidden = !action;
  if (action) {
    btn.textContent = action.label;
    btn.onclick = () => { el.toast.hidden = true; action.run(); };
  }
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, action ? 7000 : 3500);
}

/* ============================================================
   Storage backends — same interface for folder and browser storage
   ============================================================ */
class FolderStore {
  constructor(dir) { this.dir = dir; this.kind = 'folder'; }
  get id() { return `folder:${this.dir.name}`; }
  get label() { return this.dir.name; }

  async list() {
    const out = [];
    for await (const [name, h] of this.dir.entries()) {
      if (h.kind !== 'file' || !NOTE_RE.test(name)) continue;
      const f = await h.getFile();
      out.push({ name, modified: f.lastModified, size: f.size });
    }
    return out;
  }
  async read(name) {
    const f = await (await this.dir.getFileHandle(name)).getFile();
    return { text: await f.text(), modified: f.lastModified };
  }
  async modified(name) {
    return (await (await this.dir.getFileHandle(name)).getFile()).lastModified;
  }
  async write(name, text) {
    const h = await this.dir.getFileHandle(name, { create: true });
    const w = await h.createWritable();
    await w.write(text);
    await w.close();
    return (await h.getFile()).lastModified;
  }
  async rename(from, to) {
    const { text } = await this.read(from);
    if (sameName(from, to)) {             // case-only rename on case-insensitive disks
      const tmp = `.inkpad-rename-${Date.now()}.tmp`;
      await this.write(tmp, text);
      await this.dir.removeEntry(from);
      await this.write(to, text);
      await this.dir.removeEntry(tmp);
      return;
    }
    await this.write(to, text);
    await this.dir.removeEntry(from);
  }
  async remove(name) {
    const { text } = await this.read(name);
    const trash = await this.dir.getDirectoryHandle(TRASH_DIR, { create: true });
    const trashName = `${Date.now()}__${name}`;
    const h = await trash.getFileHandle(trashName, { create: true });
    const w = await h.createWritable();
    await w.write(text);
    await w.close();
    await this.dir.removeEntry(name);
    return { name, trashName };
  }
  async restore(token) {
    const trash = await this.dir.getDirectoryHandle(TRASH_DIR);
    const text = await (await (await trash.getFileHandle(token.trashName)).getFile()).text();
    await this.write(token.name, text);
    await trash.removeEntry(token.trashName);
  }
}

class LocalStore {
  constructor() { this.kind = 'local'; }
  get id() { return 'local'; }
  get label() { return 'Browser storage'; }
  async all() { return (await chrome.storage.local.get(K.local))[K.local] || {}; }
  async list() {
    const all = await this.all();
    return Object.entries(all).map(([name, v]) => ({ name, modified: v.modified, size: v.text.length }));
  }
  async read(name) {
    const v = (await this.all())[name];
    if (!v) throw new Error('Not found');
    return { text: v.text, modified: v.modified };
  }
  async modified(name) { return (await this.read(name)).modified; }
  async write(name, text) {
    const all = await this.all();
    const modified = Date.now();
    all[name] = { text, modified };
    await chrome.storage.local.set({ [K.local]: all });
    return modified;
  }
  async rename(from, to) {
    const all = await this.all();
    all[to] = { ...all[from], modified: Date.now() };
    if (from !== to) delete all[from];
    await chrome.storage.local.set({ [K.local]: all });
  }
  async remove(name) {
    const all = await this.all();
    const data = all[name];
    delete all[name];
    await chrome.storage.local.set({ [K.local]: all });
    return { name, data };
  }
  async restore(token) {
    const all = await this.all();
    all[token.name] = token.data;
    await chrome.storage.local.set({ [K.local]: all });
  }
}

/* ============================================================
   Settings
   ============================================================ */
const saveSettings = () => chrome.storage.local.set({ [K.settings]: S.settings });

function applySettings() {
  const st = S.settings;
  const root = document.documentElement;
  if (st.theme === 'auto') delete root.dataset.theme; else root.dataset.theme = st.theme;
  root.dataset.font = st.font;
  root.style.setProperty('--fs', `${st.fontSize}px`);
  el.editor.setAttribute('wrap', st.wrap ? 'soft' : 'off');
  el.editor.classList.toggle('ruled', st.ruled);
  el.workspace.dataset.view = st.view;
  el.app.classList.toggle('no-sidebar', !st.sidebar);

  document.querySelectorAll('.topbar .seg button').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.view === st.view)));
  document.querySelectorAll('.menu [data-setting]').forEach((group) => {
    group.querySelectorAll('button').forEach((b) =>
      b.setAttribute('aria-pressed', String(st[group.dataset.setting] === b.dataset.value)));
  });
  $('#size-val').textContent = st.fontSize;
  $('#opt-ruled').checked = st.ruled;
  $('#opt-wrap').checked = st.wrap;
  $('#btn-tab').hidden = IS_TAB;
}

function setView(view) {
  S.settings.view = view;
  saveSettings();
  applySettings();
  renderPreview();
  if (view !== 'preview') el.editor.focus();
}
const VIEWS = ['edit', 'split', 'preview'];
const cycleView = () => setView(VIEWS[(VIEWS.indexOf(S.settings.view) + 1) % VIEWS.length]);

/* ============================================================
   Folder selection & onboarding
   ============================================================ */
function showOnboard(kind, folderName) {
  el.onboard.hidden = false;
  const primary = $('#ob-primary');
  const secondary = $('#ob-secondary');
  if (kind === 'reconnect') {
    $('#ob-title').textContent = 'Reconnect to your notes folder';
    $('#ob-text').textContent = `Chrome asks for permission again after a restart. Your notes are safe in “${folderName}”; Inkpad just needs your OK to read and save them.`;
    primary.textContent = `Reconnect to “${folderName}”`;
    secondary.textContent = 'Choose a different folder';
    $('#ob-fine').textContent = 'Tip: if Chrome offers “Allow on every visit”, pick it and you won’t see this again.';
    primary.onclick = reconnect;
    secondary.onclick = chooseFolder;
  } else {
    primary.onclick = chooseFolder;
    secondary.onclick = useLocal;
  }
  primary.focus();
}

async function chooseFolder() {
  let dir;
  try {
    dir = await window.showDirectoryPicker({ id: 'inkpad-notes', mode: 'readwrite', startIn: 'documents' });
  } catch (e) {
    if (e.name === 'AbortError') return;
    toast('Chrome can’t show the folder picker here. Open Inkpad in a tab to choose a folder.', { label: 'Open tab', run: openInTab });
    return;
  }
  await flush();
  const previous = S.store;
  await idbSet('dir', dir);
  await chrome.storage.local.set({ [K.mode]: 'folder' });
  const store = new FolderStore(dir);

  // Move notes over from browser storage the first time a folder is chosen.
  if (previous && previous.kind === 'local') {
    const existing = new Set((await store.list()).map((n) => n.name.toLowerCase()));
    const all = await previous.all();
    let copied = 0;
    for (const [name, v] of Object.entries(all)) {
      if (existing.has(name.toLowerCase())) continue;
      await store.write(name, v.text);
      copied++;
    }
    if (copied) toast(`Copied ${copied} note${copied > 1 ? 's' : ''} into “${dir.name}”.`);
  }
  await setStore(store);
}

async function reconnect() {
  const dir = await idbGet('dir');
  if (!dir) return chooseFolder();
  if ((await dir.requestPermission({ mode: 'readwrite' })) === 'granted') await setStore(new FolderStore(dir));
}

async function useLocal() {
  await chrome.storage.local.set({ [K.mode]: 'local' });
  await setStore(new LocalStore());
}

async function setStore(store) {
  S.store = store;
  S.texts.clear();
  S.current = null;
  el.onboard.hidden = true;
  el.folderLabel.textContent = store.label;
  el.folderChip.title = store.kind === 'folder'
    ? `Notes are saved as files in “${store.label}”. Click to change.`
    : 'Notes are in Chrome’s storage. Click to save them to a folder instead.';
  el.folderChip.classList.toggle('warn', store.kind === 'local');
  await refreshList();
  if (!S.notes.length) {
    await store.write('Welcome.md', WELCOME);
    await refreshList();
  }
  const target = S.notes.find((n) => n.name === S.settings.lastNote) || sortedNotes()[0];
  if (target) await openNote(target.name);
  loadTexts();
  processClips();
}

/* ============================================================
   Note list
   ============================================================ */
function sortedNotes(list = S.notes) {
  const pinned = new Set(S.settings.pinned);
  return list.slice().sort((a, b) =>
    (pinned.has(b.name) - pinned.has(a.name)) || (b.modified - a.modified));
}

async function refreshList() {
  if (!S.store) return;
  try {
    S.notes = await S.store.list();
  } catch (e) {
    console.error(e);
    toast('Inkpad lost access to the notes folder. Reconnect to keep saving.', { label: 'Reconnect', run: reconnect });
    return;
  }
  renderList();
}

async function loadTexts() {
  for (const n of S.notes) {
    if (S.texts.has(n.name) || n.size > 2_000_000) continue;
    try { S.texts.set(n.name, (await S.store.read(n.name)).text); } catch (_) { /* skip */ }
  }
  renderList();
}

function highlight(text, q) {
  if (!q) return esc(text);
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return esc(text);
  return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
}

function snippetFor(name, q) {
  const text = S.texts.get(name);
  if (!text) return '';
  if (q) {
    const i = text.toLowerCase().indexOf(q);
    if (i >= 0) {
      const start = Math.max(0, i - 30);
      return (start ? '…' : '') + highlight(text.slice(start, i + 90).replace(/\s+/g, ' '), q);
    }
  }
  const line = text.split('\n').find((l) => l.trim() && !/^#{1,6}\s/.test(l)) || '';
  return esc(line.replace(/[#>*_`~=-]|\[[ xX]\]/g, '').trim().slice(0, 140));
}

function renderList() {
  const q = S.query.trim().toLowerCase();
  let items = sortedNotes();
  if (q) items = items.filter((n) => n.name.toLowerCase().includes(q) || (S.texts.get(n.name) || '').toLowerCase().includes(q));

  if (!items.length) {
    el.list.innerHTML = `<li class="list-empty">${q ? `Nothing matches “${esc(S.query.trim())}”.` : 'No notes yet. Create one with the + button.'}</li>`;
    return;
  }
  const pinned = new Set(S.settings.pinned);
  el.list.innerHTML = items.map((n) => `
    <li>
      <div class="note-item${n.name === S.current ? ' active' : ''}" role="option" tabindex="0" data-name="${esc(n.name)}" aria-selected="${n.name === S.current}">
        <div class="n-title">${pinned.has(n.name) ? `<span class="pin-mark" title="Pinned">${icon('pin')}</span>` : ''}<span>${highlight(stem(n.name), q)}</span></div>
        <div class="n-meta">${relTime(n.modified)}</div>
        <div class="n-snippet">${snippetFor(n.name, q)}</div>
        <div class="n-actions">
          <button data-act="pin" title="${pinned.has(n.name) ? 'Unpin' : 'Pin to top'}" aria-label="${pinned.has(n.name) ? 'Unpin' : 'Pin to top'}">${icon('pin')}</button>
          <button data-act="delete" title="Delete" aria-label="Delete">${icon('trash')}</button>
        </div>
      </div>
    </li>`).join('');
}

el.list.addEventListener('click', (e) => {
  const item = e.target.closest('.note-item');
  if (!item) return;
  const name = item.dataset.name;
  const act = e.target.closest('[data-act]');
  if (act) {
    e.stopPropagation();
    if (act.dataset.act === 'pin') togglePin(name);
    if (act.dataset.act === 'delete') deleteNote(name);
    return;
  }
  openNote(name, { focus: true });
});
el.list.addEventListener('keydown', (e) => {
  const item = e.target.closest('.note-item');
  if (!item) return;
  if (e.key === 'Enter') openNote(item.dataset.name, { focus: true });
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const all = [...el.list.querySelectorAll('.note-item')];
    all[Math.max(0, Math.min(all.length - 1, all.indexOf(item) + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  }
});

el.search.addEventListener('input', () => { S.query = el.search.value; renderList(); });
el.search.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); el.list.querySelector('.note-item')?.focus(); }
  if (e.key === 'Enter') { const first = el.list.querySelector('.note-item'); if (first) openNote(first.dataset.name, { focus: true }); }
  if (e.key === 'Escape') { el.search.value = ''; S.query = ''; renderList(); el.editor.focus(); }
});

/* ============================================================
   Open / save
   ============================================================ */
function setEmptyState(empty) {
  el.editor.disabled = empty;
  el.title.disabled = empty;
  if (empty) {
    el.editor.value = '';
    el.title.value = '';
    el.preview.innerHTML = '';
    el.editor.placeholder = 'Create a note with the + button to start writing.';
    setStatus('idle');
  } else {
    el.editor.placeholder = 'Start writing…';
  }
}

async function openNote(name, { focus = false, caretEnd = false } = {}) {
  await flush();
  let r;
  try {
    r = await S.store.read(name);
  } catch (e) {
    toast(`Couldn’t open “${stem(name)}”. It may have been moved or deleted.`);
    await refreshList();
    return;
  }
  setEmptyState(false);
  S.current = name;
  S.fileModified = r.modified;
  S.dirty = false;
  S.texts.set(name, r.text);
  el.editor.value = r.text;
  el.editor.scrollTop = 0;
  if (caretEnd) el.editor.setSelectionRange(r.text.length, r.text.length);
  else el.editor.setSelectionRange(0, 0);
  el.title.value = stem(name);
  el.ext.textContent = extOf(name);
  S.settings.lastNote = name;
  saveSettings();
  renderPreview();
  updateStats();
  setStatus('saved');
  renderList();
  closeDrawer();
  if (focus) el.editor.focus();
  if (caretEnd) el.editor.scrollTop = el.editor.scrollHeight;
  checkDraft(name, r);
}

async function checkDraft(name, r) {
  const d = (await chrome.storage.local.get(K.draft))[K.draft];
  if (d && d.store === S.store.id && d.name === name && d.text !== r.text && d.ts > r.modified) {
    toast('Found unsaved changes from your last session.', {
      label: 'Restore',
      run: () => { replaceAll(d.text); },
    });
  }
}

function setStatus(state) {
  el.saveState.className = `save-state ${state}`;
  const label = {
    idle: 'No note open',
    editing: 'Editing…',
    saving: 'Saving…',
    saved: S.store?.kind === 'folder' ? `Saved to ${S.store.label}` : 'Saved in browser',
    error: 'Not saved — check folder access',
  }[state];
  el.saveText.textContent = label;
  el.saveState.title = state === 'saved' ? `Last saved ${new Date().toLocaleTimeString()}` : '';
}

function markDirty() {
  if (!S.current) return;
  S.dirty = true;
  setStatus('editing');
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(save, 650);
  clearTimeout(S.draftTimer);
  const name = S.current;
  S.draftTimer = setTimeout(() => {
    chrome.storage.local.set({ [K.draft]: { store: S.store.id, name, text: el.editor.value, ts: Date.now() } });
  }, 250);
}

function save() {
  S.saving = S.saving.then(doSave).catch((e) => {
    console.error(e);
    S.dirty = true;
    setStatus('error');
    toast('Couldn’t save this note. Inkpad may have lost access to the folder.', { label: 'Reconnect', run: reconnect });
  });
  return S.saving;
}

async function doSave() {
  clearTimeout(S.saveTimer);
  if (!S.dirty || !S.current) return;
  const name = S.current;
  const text = el.editor.value;
  S.dirty = false;
  setStatus('saving');

  // If the file changed on disk since we loaded it (another editor, another window),
  // keep that version as a copy instead of silently overwriting it.
  try {
    const onDisk = await S.store.modified(name);
    if (onDisk > S.fileModified) {
      const other = (await S.store.read(name)).text;
      if (other !== text) {
        const copy = uniqueName(`${stem(name)} (other version)`, extOf(name));
        await S.store.write(copy, other);
        toast(`“${stem(name)}” changed outside Inkpad. That version is saved as “${stem(copy)}”.`);
      }
    }
  } catch (_) { /* file is new or was removed: just write it */ }

  const modified = await S.store.write(name, text);
  if (S.current === name) S.fileModified = modified;
  S.texts.set(name, text);
  const entry = S.notes.find((n) => n.name === name);
  if (entry) { entry.modified = modified; entry.size = text.length; } else S.notes.push({ name, modified, size: text.length });
  if (!S.dirty) setStatus('saved');
  renderList();
  const d = (await chrome.storage.local.get(K.draft))[K.draft];
  if (d && d.name === name && d.text === text) chrome.storage.local.remove(K.draft);
}

async function flush() {
  if (S.dirty) await save();
  else await S.saving;
}

/* ============================================================
   Note actions
   ============================================================ */
async function newNote(base = 'Untitled', body = '') {
  if (!S.store) return;
  await flush();
  await refreshList();
  const name = uniqueName(sanitize(base));
  await S.store.write(name, body);
  await refreshList();
  await openNote(name, { caretEnd: true });
  el.title.focus();
  el.title.select();
}

async function openToday() {
  if (!S.store) return;
  const name = `${ymd()}.md`;
  await refreshList();
  if (!S.notes.some((n) => sameName(n.name, name))) {
    const heading = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    await S.store.write(name, `# ${heading}\n\n- [ ] \n`);
    await refreshList();
  }
  await openNote(name, { focus: true, caretEnd: true });
}

async function renameCurrent() {
  if (!S.current) return;
  const from = S.current;
  const to = sanitize(el.title.value) + extOf(from);
  if (to === from) { el.title.value = stem(from); return; }
  if (S.notes.some((n) => sameName(n.name, to) && !sameName(n.name, from))) {
    toast(`A note called “${stem(to)}” already exists.`);
    el.title.value = stem(from);
    return;
  }
  await flush();
  try {
    await S.store.rename(from, to);
  } catch (e) {
    console.error(e);
    toast('Couldn’t rename the note.');
    el.title.value = stem(from);
    return;
  }
  S.settings.pinned = S.settings.pinned.map((p) => (p === from ? to : p));
  S.texts.set(to, S.texts.get(from) || el.editor.value);
  S.texts.delete(from);
  if (S.current === from) {
    S.current = to;
    S.settings.lastNote = to;
    S.fileModified = await S.store.modified(to);
    el.title.value = stem(to);
  }
  saveSettings();
  await refreshList();
}

async function deleteNote(name) {
  if (!S.store) return;
  if (name === S.current) await flush();
  let token;
  try { token = await S.store.remove(name); } catch (e) { console.error(e); toast('Couldn’t delete the note.'); return; }
  S.texts.delete(name);
  const wasPinned = S.settings.pinned.includes(name);
  S.settings.pinned = S.settings.pinned.filter((p) => p !== name);
  saveSettings();
  await refreshList();
  if (name === S.current) {
    S.current = null;
    const next = sortedNotes()[0];
    if (next) await openNote(next.name); else setEmptyState(true);
  }
  toast(`Deleted “${stem(name)}”.`, {
    label: 'Undo',
    run: async () => {
      await S.store.restore(token);
      if (wasPinned) { S.settings.pinned.push(name); saveSettings(); }
      await refreshList();
      await openNote(name, { focus: true });
    },
  });
}

function togglePin(name = S.current) {
  if (!name) return;
  const p = S.settings.pinned;
  S.settings.pinned = p.includes(name) ? p.filter((x) => x !== name) : [...p, name];
  saveSettings();
  renderList();
}

function download() {
  if (!S.current) return;
  const blob = new Blob([el.editor.value], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = S.current;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function copyNote() {
  await navigator.clipboard.writeText(el.editor.value);
  toast('Copied the note as Markdown.');
}

function openInTab() {
  chrome.tabs.create({ url: chrome.runtime.getURL('app.html?mode=tab') });
}

async function currentPage() {
  const ok = (t) => t && t.url && /^https?:/i.test(t.url);
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (ok(active)) return active;
  const tabs = (await chrome.tabs.query({})).filter(ok);
  tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return tabs[0];
}

async function insertPageLink() {
  if (!S.current) return;
  const tab = await currentPage();
  if (!tab) { toast('Open a web page first, then insert its link.'); return; }
  if (S.settings.view === 'preview') setView('edit');
  el.editor.focus();
  const title = (tab.title || tab.url).replace(/([[\]])/g, '\\$1');
  insertText(`[${title}](${tab.url})`);
}

/* ============================================================
   Editor behaviour
   ============================================================ */
function afterEdit() {
  markDirty();
  schedulePreview();
  updateStats();
}

function insertText(text) {
  el.editor.focus();
  // execCommand keeps the native undo stack intact.
  if (!document.execCommand('insertText', false, text)) {
    el.editor.setRangeText(text, el.editor.selectionStart, el.editor.selectionEnd, 'end');
    afterEdit();
  }
}

function replaceAll(text) {
  el.editor.focus();
  el.editor.select();
  insertText(text);
}

function lineBounds(v, pos) {
  const start = v.lastIndexOf('\n', pos - 1) + 1;
  let end = v.indexOf('\n', pos);
  if (end === -1) end = v.length;
  return [start, end];
}

const LIST_RE = /^(\s*)([-*+]|(\d+)([.)]))(\s+)(\[[ xX]\]\s+)?/;

function continueList() {
  const { selectionStart: s, selectionEnd: e, value: v } = el.editor;
  if (s !== e) return false;
  const [ls, le] = lineBounds(v, s);
  const line = v.slice(ls, le);
  const m = line.match(LIST_RE);
  if (!m || s < ls + m[0].length) return false;
  if (!line.slice(m[0].length).trim()) {           // empty item: end the list
    el.editor.setSelectionRange(ls, le);
    insertText('');
    return true;
  }
  const marker = m[3] ? `${Number(m[3]) + 1}${m[4]}` : m[2];
  insertText(`\n${m[1]}${marker}${m[5]}${m[6] ? '[ ] ' : ''}`);
  return true;
}

function indent(outdent) {
  const { selectionStart: s, selectionEnd: e, value: v } = el.editor;
  const [ls] = lineBounds(v, s);
  const [, le] = lineBounds(v, e);
  const first = v.slice(ls, lineBounds(v, s)[1]);
  if (s === e && !outdent && !LIST_RE.test(first)) { insertText('  '); return; }
  const block = v.slice(ls, le);
  const next = block.split('\n').map((l) => (outdent ? l.replace(/^( {1,2}|\t)/, '') : `  ${l}`)).join('\n');
  if (next === block) return;
  el.editor.setSelectionRange(ls, le);
  insertText(next);
  if (s === e) {
    const delta = next.split('\n')[0].length - block.split('\n')[0].length;
    const pos = Math.max(ls, s + delta);
    el.editor.setSelectionRange(pos, pos);
  } else {
    el.editor.setSelectionRange(ls, ls + next.length);
  }
}

function wrapSelection(mark) {
  const { selectionStart: s, selectionEnd: e, value: v } = el.editor;
  const sel = v.slice(s, e);
  if (sel.startsWith(mark) && sel.endsWith(mark) && sel.length >= mark.length * 2) {
    insertText(sel.slice(mark.length, sel.length - mark.length));
    el.editor.setSelectionRange(s, e - mark.length * 2);
    return;
  }
  insertText(`${mark}${sel}${mark}`);
  el.editor.setSelectionRange(s + mark.length, e + mark.length);
}

el.editor.addEventListener('input', afterEdit);
el.editor.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === 'Tab' && !mod && !e.altKey) { e.preventDefault(); indent(e.shiftKey); return; }
  if (e.key === 'Enter' && !e.shiftKey && !mod && !e.altKey && !e.isComposing) {
    if (continueList()) e.preventDefault();
    return;
  }
  if (mod && !e.shiftKey && !e.altKey) {
    const k = e.key.toLowerCase();
    if (k === 'b') { e.preventDefault(); wrapSelection('**'); }
    else if (k === 'i') { e.preventDefault(); wrapSelection('_'); }
  }
  if (mod && e.shiftKey && e.key.toLowerCase() === 'x') { e.preventDefault(); wrapSelection('~~'); }
});

// Pasting a URL over selected text makes a Markdown link.
el.editor.addEventListener('paste', (e) => {
  const text = e.clipboardData.getData('text/plain');
  const { selectionStart: s, selectionEnd: en, value: v } = el.editor;
  if (s !== en && /^https?:\/\/\S+$/.test(text.trim())) {
    e.preventDefault();
    insertText(`[${v.slice(s, en)}](${text.trim()})`);
  }
});

function updateStats() {
  const v = el.editor.value;
  const words = (v.match(/\S+/g) || []).length;
  el.words.textContent = `${words.toLocaleString()} word${words === 1 ? '' : 's'}`;
  el.chars.textContent = `${v.length.toLocaleString()} characters`;
  el.read.textContent = `${Math.max(1, Math.round(words / 230))} min read`;
}

let previewFrame = 0;
function schedulePreview() {
  if (S.settings.view === 'edit') return;
  cancelAnimationFrame(previewFrame);
  previewFrame = requestAnimationFrame(renderPreview);
}
function renderPreview() {
  if (S.settings.view === 'edit') return;
  const html = renderMarkdown(el.editor.value);
  el.preview.innerHTML = html || '<p class="empty">Nothing to preview yet.</p>';
}

// Ticking a checkbox in the preview updates the Markdown source.
el.preview.addEventListener('click', (e) => {
  const box = e.target.closest('input[type="checkbox"][data-line]');
  if (!box) return;
  const lines = el.editor.value.split('\n');
  const n = Number(box.dataset.line);
  if (lines[n] == null) return;
  lines[n] = lines[n].replace(/\[( |x|X)\]/, (m) => (m === '[ ]' ? '[x]' : '[ ]'));
  const pos = el.editor.selectionStart;
  el.editor.value = lines.join('\n');
  el.editor.setSelectionRange(pos, pos);
  afterEdit();
});

// Keep split view scroll roughly in sync.
el.editor.addEventListener('scroll', () => {
  if (S.settings.view !== 'split') return;
  const r = el.editor.scrollTop / Math.max(1, el.editor.scrollHeight - el.editor.clientHeight);
  el.preview.scrollTop = r * (el.preview.scrollHeight - el.preview.clientHeight);
});

/* ============================================================
   Title
   ============================================================ */
el.title.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); el.editor.focus(); }
  if (e.key === 'Escape') { el.title.value = stem(S.current || ''); el.editor.focus(); }
});
el.title.addEventListener('blur', renameCurrent);

/* ============================================================
   Sidebar / drawer
   ============================================================ */
const narrow = window.matchMedia('(max-width: 720px)');
function closeDrawer() { el.app.classList.remove('drawer-open'); }
$('#btn-sidebar').addEventListener('click', () => {
  if (narrow.matches) {
    el.app.classList.toggle('drawer-open');
    if (el.app.classList.contains('drawer-open')) el.search.focus();
  } else {
    S.settings.sidebar = !S.settings.sidebar;
    saveSettings();
    applySettings();
  }
});
$('#scrim').addEventListener('click', closeDrawer);

/* ============================================================
   Menu
   ============================================================ */
function openMenu() {
  $('#pin-label').textContent = S.settings.pinned.includes(S.current) ? 'Unpin note' : 'Pin note';
  el.menu.hidden = false;
  el.menuBtn.setAttribute('aria-expanded', 'true');
}
function closeMenu() {
  el.menu.hidden = true;
  el.menuBtn.setAttribute('aria-expanded', 'false');
}
el.menuBtn.addEventListener('click', (e) => { e.stopPropagation(); el.menu.hidden ? openMenu() : closeMenu(); });
document.addEventListener('click', (e) => { if (!el.menu.hidden && !el.menu.contains(e.target)) closeMenu(); });

el.menu.querySelectorAll('[data-setting]').forEach((group) => {
  group.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S.settings[group.dataset.setting] = b.dataset.value;
    saveSettings();
    applySettings();
  });
});
const setSize = (d) => { S.settings.fontSize = Math.max(12, Math.min(26, S.settings.fontSize + d)); saveSettings(); applySettings(); };
$('#size-down').addEventListener('click', () => setSize(-1));
$('#size-up').addEventListener('click', () => setSize(1));
$('#opt-ruled').addEventListener('change', (e) => { S.settings.ruled = e.target.checked; saveSettings(); applySettings(); });
$('#opt-wrap').addEventListener('change', (e) => { S.settings.wrap = e.target.checked; saveSettings(); applySettings(); });

el.menu.addEventListener('click', (e) => {
  const item = e.target.closest('[data-act]');
  if (!item) return;
  closeMenu();
  ({
    download, copy: copyNote, pin: () => togglePin(), folder: chooseFolder,
    delete: () => S.current && deleteNote(S.current),
  })[item.dataset.act]?.();
});

/* ============================================================
   Command palette
   ============================================================ */
const COMMANDS = [
  { label: 'New note', hint: 'Alt+N', run: () => newNote() },
  { label: 'Open today’s note', hint: 'Alt+D', run: openToday },
  { label: 'Insert link to current page', hint: 'Alt+L', run: insertPageLink },
  { label: 'Write view', run: () => setView('edit') },
  { label: 'Split view', run: () => setView('split') },
  { label: 'Read view', run: () => setView('preview') },
  { label: 'Pin or unpin this note', run: () => togglePin() },
  { label: 'Rename this note', run: () => { el.title.focus(); el.title.select(); } },
  { label: 'Download this note', run: download },
  { label: 'Copy note as Markdown', run: copyNote },
  { label: 'Delete this note', run: () => S.current && deleteNote(S.current) },
  { label: 'Change notes folder', run: chooseFolder },
  { label: 'Switch theme', run: () => { const order = ['auto', 'light', 'dark']; S.settings.theme = order[(order.indexOf(S.settings.theme) + 1) % 3]; saveSettings(); applySettings(); toast(`Theme: ${S.settings.theme}`); } },
  { label: 'Open Inkpad in a tab', run: openInTab, when: () => !IS_TAB },
];

function fuzzyScore(q, s) {
  s = s.toLowerCase();
  if (!q) return 0;
  const idx = s.indexOf(q);
  if (idx >= 0) return idx;
  let pos = 0, gaps = 0;
  for (const ch of q) {
    const f = s.indexOf(ch, pos);
    if (f < 0) return null;
    gaps += f - pos;
    pos = f + 1;
  }
  return 100 + gaps;
}

let paletteItems = [];
let paletteIndex = 0;

function openPalette() {
  closeMenu();
  el.palette.hidden = false;
  el.paletteInput.value = '';
  renderPalette();
  el.paletteInput.focus();
}
function closePalette() { el.palette.hidden = true; }

function renderPalette() {
  const raw = el.paletteInput.value.trim();
  const q = raw.toLowerCase();
  const notes = sortedNotes().map((n) => ({ kind: 'note', label: stem(n.name), hint: relTime(n.modified), run: () => openNote(n.name, { focus: true }) }));
  const cmds = COMMANDS.filter((c) => !c.when || c.when()).map((c) => ({ kind: 'bolt', ...c }));
  const scored = [...notes, ...cmds]
    .map((it) => ({ it, s: fuzzyScore(q, it.label) }))
    .filter((x) => x.s !== null);
  if (q) scored.sort((a, b) => a.s - b.s);
  paletteItems = scored.map((x) => x.it).slice(0, 40);
  if (raw && !notes.some((n) => n.label.toLowerCase() === q)) {
    paletteItems.push({ kind: 'plus', label: `Create note “${raw}”`, run: () => newNote(raw) });
  }
  paletteIndex = 0;
  el.paletteList.innerHTML = paletteItems.length
    ? paletteItems.map((it, i) => `<li role="option" data-i="${i}" class="${i === 0 ? 'active' : ''}"><span class="p-kind">${icon(it.kind)}</span><span class="p-label">${esc(it.label)}</span>${it.hint ? `<span class="p-hint">${/^(Alt|Ctrl)/.test(it.hint) ? `<kbd>${esc(it.hint)}</kbd>` : esc(it.hint)}</span>` : ''}</li>`).join('')
    : '<li class="p-empty">No matches</li>';
}

function movePalette(d) {
  if (!paletteItems.length) return;
  paletteIndex = (paletteIndex + d + paletteItems.length) % paletteItems.length;
  el.paletteList.querySelectorAll('li').forEach((li, i) => li.classList.toggle('active', i === paletteIndex));
  el.paletteList.children[paletteIndex]?.scrollIntoView({ block: 'nearest' });
}

function runPalette(i = paletteIndex) {
  const it = paletteItems[i];
  if (!it) return;
  closePalette();
  it.run();
}

el.paletteInput.addEventListener('input', renderPalette);
el.paletteInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); movePalette(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); movePalette(-1); }
  else if (e.key === 'Enter') { e.preventDefault(); runPalette(); }
  else if (e.key === 'Escape') { e.preventDefault(); closePalette(); el.editor.focus(); }
});
el.paletteList.addEventListener('click', (e) => {
  const li = e.target.closest('li[data-i]');
  if (li) runPalette(Number(li.dataset.i));
});
el.palette.addEventListener('click', (e) => { if (e.target === el.palette) closePalette(); });

/* ============================================================
   Global shortcuts & buttons
   ============================================================ */
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && !e.shiftKey && k === 'k') { e.preventDefault(); el.palette.hidden ? openPalette() : closePalette(); }
  else if (mod && !e.shiftKey && k === 's') { e.preventDefault(); if (S.current) { S.dirty = true; save(); } }
  else if (mod && !e.shiftKey && k === 'e') { e.preventDefault(); cycleView(); }
  else if (e.altKey && !mod && e.code === 'KeyN') { e.preventDefault(); newNote(); }
  else if (e.altKey && !mod && e.code === 'KeyD') { e.preventDefault(); openToday(); }
  else if (e.altKey && !mod && e.code === 'KeyL') { e.preventDefault(); insertPageLink(); }
  else if (e.key === 'Escape') { closeMenu(); closeDrawer(); }
});

$('#btn-new').addEventListener('click', () => newNote());
$('#btn-today').addEventListener('click', openToday);
$('#btn-palette-side').addEventListener('click', openPalette);
$('#btn-link').addEventListener('click', insertPageLink);
$('#btn-tab').addEventListener('click', openInTab);
el.folderChip.addEventListener('click', chooseFolder);
document.querySelectorAll('.topbar .seg button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

/* ============================================================
   Web clipping (context menu → background.js → queue → Inbox.md)
   ============================================================ */
const mdText = (s) => s.replace(/([[\]])/g, '\\$1');

function clipToMarkdown(c) {
  const when = new Date(c.ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const src = c.url ? `[${mdText(c.title || c.url)}](${c.url})` : 'unknown page';
  if (c.type === 'selection') {
    const quote = c.text.trim().split('\n').map((l) => `> ${l}`).join('\n');
    return `\n${quote}\n\n— ${src}, ${when}\n`;
  }
  if (c.type === 'link') return `\n- [${mdText(c.linkUrl)}](${c.linkUrl}) — found on ${src}, ${when}\n`;
  return `\n- ${src} — saved ${when}\n`;
}

let clipping = false;
async function processClips() {
  if (!S.store || clipping) return;
  clipping = true;
  try {
    const queue = (await chrome.storage.local.get(K.clips))[K.clips] || [];
    if (!queue.length) return;
    await chrome.storage.local.set({ [K.clips]: [] });
    const inbox = S.notes.find((n) => sameName(n.name, 'Inbox.md'))?.name || 'Inbox.md';
    if (S.current === inbox) await flush();
    let text = '# Inbox\n';
    try { text = (await S.store.read(inbox)).text; } catch (_) { /* first clip */ }
    text = text.replace(/\s*$/, '\n') + queue.map(clipToMarkdown).join('');
    const modified = await S.store.write(inbox, text);
    S.texts.set(inbox, text);
    if (S.current === inbox) {
      S.fileModified = modified;
      el.editor.value = text;
      el.editor.scrollTop = el.editor.scrollHeight;
      renderPreview();
      updateStats();
    }
    await refreshList();
    const msg = queue.length > 1 ? `Clipped ${queue.length} items to Inbox.` : 'Clipped to Inbox.';
    toast(msg, S.current === inbox ? null : { label: 'Open Inbox', run: () => openNote(inbox, { caretEnd: true, focus: true }) });
  } finally {
    clipping = false;
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[K.clips]?.newValue?.length) processClips();
});

/* ============================================================
   Stay in sync with the disk
   ============================================================ */
async function resync() {
  if (!S.store || S.dirty) return;
  await refreshList();
  if (!S.current) return;
  try {
    const m = await S.store.modified(S.current);
    if (m === S.fileModified) return;
    const r = await S.store.read(S.current);
    S.fileModified = r.modified;
    if (r.text !== el.editor.value && !S.dirty) {
      const pos = Math.min(el.editor.selectionStart, r.text.length);
      el.editor.value = r.text;
      el.editor.setSelectionRange(pos, pos);
      S.texts.set(S.current, r.text);
      renderPreview();
      updateStats();
      toast('Reloaded: this note changed outside Inkpad.');
    }
  } catch (_) {
    toast(`“${stem(S.current)}” is no longer in the folder. Keep typing to save it again.`);
  }
}

window.addEventListener('focus', resync);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') resync(); else flush();
});
window.addEventListener('pagehide', () => { flush(); });
setInterval(() => { if (S.store) renderList(); }, 60_000); // refresh "x min ago"

/* ============================================================
   Welcome note
   ============================================================ */
const WELCOME = `# Welcome to Inkpad

Every note here is a plain **Markdown file** in the folder you picked. Close Chrome, reboot, open the folder in VS Code: it's all still there.

## Try these
- [ ] Press **Ctrl+K** to jump to any note or run a command
- [ ] Press **Alt+D** for today's note
- [ ] Select text on any web page, right-click → **Clip selection to Inkpad**
- [ ] Press **Ctrl+E** to switch between Write, Split and Read

## Writing shortcuts
| Keys | Does |
| --- | --- |
| Ctrl+B / Ctrl+I | Bold / italic |
| Ctrl+Shift+X | Strikethrough |
| Tab / Shift+Tab | Indent / outdent list items |
| Enter in a list | Continues the list (and checkboxes) |
| Alt+L | Insert a link to the page you're on |
| Ctrl+S | Save now (it also saves as you type) |
| Paste a URL over text | Turns the text into a link |

> Open Inkpad from the toolbar icon or **Ctrl+Shift+Y**. **Alt+Shift+N** opens it in a full tab.
`;

/* ============================================================
   Boot
   ============================================================ */
async function boot() {
  const got = await chrome.storage.local.get([K.settings, K.mode]);
  S.settings = { ...DEFAULTS, ...(got[K.settings] || {}) };
  if (IS_TAB) document.title = 'Inkpad';
  applySettings();
  setEmptyState(true);

  if (got[K.mode] === 'local') return setStore(new LocalStore());

  const dir = await idbGet('dir').catch(() => null);
  if (!dir) return showOnboard('first');
  const perm = await dir.queryPermission({ mode: 'readwrite' });
  if (perm === 'granted') return setStore(new FolderStore(dir));
  el.folderLabel.textContent = dir.name;
  showOnboard('reconnect', dir.name);
}

boot().catch((e) => {
  console.error(e);
  toast('Inkpad couldn’t start. Reload the extension from chrome://extensions.');
});
