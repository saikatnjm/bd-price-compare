// Runs on meenabazaronline.com. The site keeps the selected branch
// (SubUnitId/AreaId) in its own storage once you pick a delivery location;
// we read it there so extension searches use YOUR branch's prices, and keep
// following it when you change location on the site.

(function () {
  function deepFind(obj, keys, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 4) return null;
    const out = {};
    for (const k of keys) {
      if (obj[k] != null && (typeof obj[k] === 'number' || /^\d+$/.test(obj[k]))) {
        out[k] = Number(obj[k]);
      }
    }
    if (Object.keys(out).length === keys.length) return out;
    for (const v of Object.values(obj)) {
      if (v && typeof v === 'object') {
        const found = deepFind(v, keys, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  function scan() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const raw = localStorage.getItem(key);
        if (!raw) continue;

        // Plain numeric keys like "subunit"/"area"
        if (/sub.?unit/i.test(key) && /^\d+$/.test(raw)) {
          const areaRaw = localStorage.getItem('area') || localStorage.getItem('AreaId');
          return {
            SubUnitId: Number(raw),
            AreaId: areaRaw && /^\d+$/.test(areaRaw) ? Number(areaRaw) : null
          };
        }

        // JSON blobs (currentUser, location objects…)
        if (raw.startsWith('{') || raw.startsWith('[')) {
          try {
            const found = deepFind(JSON.parse(raw), ['SubUnitId', 'AreaId']);
            if (found) return found;
          } catch { /* not JSON */ }
        }
      }
    } catch { /* storage blocked */ }
    return null;
  }

  async function capture() {
    const found = scan();
    if (!found || !found.SubUnitId) return false;
    const { meenaSubUnitId, meenaAreaId } = await chrome.storage.sync.get([
      'meenaSubUnitId', 'meenaAreaId'
    ]);
    const next = {};
    if (found.SubUnitId !== meenaSubUnitId) next.meenaSubUnitId = found.SubUnitId;
    if (found.AreaId && found.AreaId !== meenaAreaId) next.meenaAreaId = found.AreaId;
    if (Object.keys(next).length) await chrome.storage.sync.set(next);
    return true;
  }

  // The SPA writes its storage after login/location pick; try a few times.
  let tries = 0;
  const timer = setInterval(async () => {
    tries++;
    if ((await capture()) || tries >= 10) clearInterval(timer);
  }, 3000);
  capture();
})();
