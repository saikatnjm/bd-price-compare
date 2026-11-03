// Runs on foodpanda.com.bd pages. Every pandamart/darkstore you visit is
// remembered (home, office, hometown…), and unless you pinned one in
// Options, the most recently visited store becomes the active one — so
// searches follow wherever you're ordering from. SPA navigations don't
// refire content scripts, so we also poll for URL changes.

(function () {
  let lastSaved = null;

  async function maybeCapture() {
    const m = location.pathname.match(/\/darkstore\/([a-z0-9]+)\/([^/?#]+)/i);
    if (!m) return;
    const url = `${location.origin}${location.pathname.split('?')[0]}`;
    if (url === lastSaved) return;
    lastSaved = url;

    const code = m[1];
    const name =
      document.title.split('|')[0].split('–')[0].trim() ||
      m[2].replace(/-/g, ' ');

    const { pandamartStores = {}, pandamartPinned = false } =
      await chrome.storage.sync.get(['pandamartStores', 'pandamartPinned']);
    pandamartStores[code] = { url, name, lastSeen: Date.now() };

    const update = { pandamartStores };
    if (!pandamartPinned) {
      update.pandamartUrl = url;
      update.pandamartName = name;
    }
    await chrome.storage.sync.set(update);
  }

  maybeCapture();
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      maybeCapture();
    }
  }, 1500);
})();
