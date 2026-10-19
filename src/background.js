// Inkpad service worker.
// It never touches the notes folder itself (folder access lives in the app page).
// Clips are queued in chrome.storage.local and the open app page appends them to Inbox.md.

const CLIP_KEY = 'inkpad.clipQueue';
const APP_URL = 'app.html?mode=tab';

function enablePanelOnClick() {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

chrome.runtime.onInstalled.addListener(() => {
  enablePanelOnClick();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'clip-selection', title: 'Clip selection to Inkpad', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'clip-link', title: 'Save link to Inkpad', contexts: ['link'] });
    chrome.contextMenus.create({ id: 'clip-page', title: 'Save this page to Inkpad', contexts: ['page'] });
  });
});
chrome.runtime.onStartup.addListener(enablePanelOnClick);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  // Open the panel first, while Chrome still treats this as a user gesture.
  if (tab && tab.windowId != null) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  handleClip(info, tab);
});

async function handleClip(info, tab) {
  const type = String(info.menuItemId).replace('clip-', '');
  let text = info.selectionText || '';

  // selectionText collapses line breaks; read the real selection when we can.
  if (type === 'selection' && tab && tab.id != null) {
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: info.frameId ? [info.frameId] : undefined },
        func: () => String(window.getSelection()),
      });
      if (res && res.result && res.result.trim()) text = res.result;
    } catch (_) { /* restricted page: keep selectionText */ }
  }

  const clip = {
    type,
    text,
    linkUrl: info.linkUrl || '',
    url: (tab && tab.url) || info.pageUrl || '',
    title: (tab && tab.title) || '',
    ts: Date.now(),
  };
  const got = await chrome.storage.local.get(CLIP_KEY);
  const queue = got[CLIP_KEY] || [];
  queue.push(clip);
  await chrome.storage.local.set({ [CLIP_KEY]: queue });
}

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === 'open-tab') chrome.tabs.create({ url: chrome.runtime.getURL(APP_URL) });
});
