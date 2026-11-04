import { shwapno } from './adapters/shwapno.js';
import { meenabazar } from './adapters/meenabazar.js';
import { daraz } from './adapters/daraz.js';
import { pandamart } from './adapters/pandamart.js';
import { chaldal } from './adapters/chaldal.js';
import { startech } from './adapters/startech.js';
import { ryans } from './adapters/ryans.js';
import { gadgetandgear } from './adapters/gadgetandgear.js';
import { pickaboo } from './adapters/pickaboo.js';
import { techland, sumashtech, globalbrand, othoba, medeasy } from './adapters/extraStores.js';
import { arogga } from './adapters/arogga.js';
import { enrich, matchScore } from './lib/normalize.js';
import { waitForLoad } from './lib/tabScrape.js';
import { getCart, addToCart, cartCount, itemKey } from './lib/cart.js';
import { maybeRefreshBazar } from './lib/bazar.js';
import { logResults, attachHistory } from './lib/history.js';
import { addToCartOnPage, addToCartOnDarkstore, STORE_CHECKOUT } from './lib/autoAdd.js';

const ADAPTERS = [
  shwapno, meenabazar, pandamart, chaldal,
  startech, ryans, gadgetandgear, pickaboo, techland, sumashtech, globalbrand,
  arogga, medeasy,
  othoba, daraz
];

// Major 3 per category on by default; everything else is an opt-in checkbox.
const DEFAULT_SETTINGS = {
  enabledStores: {
    shwapno: true, meenabazar: true, pandamart: true, chaldal: false,
    startech: true, ryans: true, gadgetandgear: true,
    pickaboo: false, techland: false, sumashtech: false, globalbrand: false,
    arogga: true, medeasy: true,
    othoba: false, daraz: true
  },
  searchCategory: 'all',
  meenaSubUnitId: 2,
  meenaAreaId: 2,
  pandamartUrl: null,
  pandamartName: null,
  uiLang: 'en'
};

function inCategory(adapter, category) {
  if (!category || category === 'all') return true;
  return adapter.category === category || adapter.category === 'both';
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(null);
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    enabledStores: { ...DEFAULT_SETTINGS.enabledStores, ...(stored.enabledStores || {}) }
  };
}

function withTimeout(promise, ms, storeLabel) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${storeLabel} timed out`)), ms))
  ]);
}

// Results cache: identical searches within 5 min are served locally instead
// of re-hitting the stores (polite use; also makes the popup feel instant).
const CACHE_TTL = 5 * 60 * 1000;

async function getCached(query, category) {
  const key = `cache:${category || 'all'}:` + query.toLowerCase();
  const stored = await chrome.storage.local.get(key);
  const hit = stored[key];
  return hit && Date.now() - hit.at < CACHE_TTL ? hit.data : null;
}

async function setCached(query, category, data) {
  const key = `cache:${category || 'all'}:` + query.toLowerCase();
  await chrome.storage.local.set({ [key]: { at: Date.now(), data } });
  const all = await chrome.storage.local.get(null);
  const cacheKeys = Object.keys(all)
    .filter(k => k.startsWith('cache:'))
    .sort((a, b) => all[b].at - all[a].at);
  if (cacheKeys.length > 10) {
    await chrome.storage.local.remove(cacheKeys.slice(10));
  }
}

// onEvent (optional) streams progress to a connected popup:
//   {type:'plan', stores:[ids]} → {type:'store', result} per store →
//   {type:'skip', stores:[ids], detected} → caller resolves with full data.
async function runSearch(query, category, onEvent = () => {}) {
  const settings = await getSettings();
  category = category || settings.searchCategory || 'all';
  const cached = await getCached(query, category);
  if (cached) {
    rememberSearch(query);
    return { ...cached, cached: true };
  }
  const active = ADAPTERS.filter(a => settings.enabledStores[a.id] && inCategory(a, category));
  onEvent({ type: 'plan', stores: active.map(a => a.id) });

  const runAdapter = async adapter => {
    const timeout = adapter.type === 'tab' ? 40000 : 15000;
    const started = Date.now();
    try {
      const items = await withTimeout(adapter.search(query, settings), timeout, adapter.label);
      items.forEach(enrich);
      await attachHistory(items);  // yesterday-and-earlier stats for badges/verdicts
      await logResults(items);     // then today's prices join the log
      return {
        store: adapter.id, label: adapter.label, color: adapter.color,
        searchUrl: adapter.searchUrl(query), ok: true, ms: Date.now() - started, items
      };
    } catch (e) {
      return {
        store: adapter.id, label: adapter.label, color: adapter.color,
        searchUrl: adapter.searchUrl(query), ok: false, ms: Date.now() - started,
        error: e?.message || String(e), setupNeeded: e?.code === 'SETUP_NEEDED', items: []
      };
    }
  };

  const runAndReport = a =>
    runAdapter(a).then(r => { onEvent({ type: 'store', result: r }); return r; });

  // Phase 1: fast direct-API stores in parallel.
  const apiAdapters = active.filter(a => a.type === 'api');
  const tabAdapters = active.filter(a => a.type === 'tab');
  const apiResults = await Promise.all(apiAdapters.map(runAndReport));

  // On "All", let the API results decide whether this is a grocery or an
  // electronics product, so tab-scraped stores of the other kind are never
  // opened at all (fewer tabs, no pointless searches).
  let detected = category;
  if (category === 'all') {
    const counts = { grocery: 0, electronics: 0, medicine: 0 };
    for (const r of apiResults) {
      const a = ADAPTERS.find(x => x.id === r.store);
      if (!a || a.category === 'both' || !r.ok || !(a.category in counts)) continue;
      counts[a.category] += r.items.filter(i => matchScore(i.name, query) >= 0.65).length;
    }
    const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (winner[1] > 0) detected = winner[0];
  }

  // Phase 2: tab-scraped stores (one tab at a time via the scrape queue).
  const tabsToRun = tabAdapters.filter(a => inCategory(a, detected));
  const skipped = tabAdapters.filter(a => !tabsToRun.includes(a));
  if (skipped.length) onEvent({ type: 'skip', stores: skipped.map(a => a.id), detected });
  const tabResults = await Promise.all(tabsToRun.map(runAndReport));

  const results = [...apiResults, ...tabResults];
  rememberSearch(query);
  const data = { query, category, detectedCategory: detected, at: Date.now(), results };
  if (results.some(r => r.ok)) await setCached(query, category, data);
  return data;
}

// ---- Recent searches (kept tiny: last 8, newest first) ----
async function rememberSearch(query) {
  const { recentSearches = [] } = await chrome.storage.local.get('recentSearches');
  const next = [query, ...recentSearches.filter(q => q.toLowerCase() !== query.toLowerCase())].slice(0, 8);
  await chrome.storage.local.set({ recentSearches: next });
}

// ---- Cart badge ----
async function updateBadge() {
  const n = cartCount(await getCart());
  await chrome.action.setBadgeText({ text: n ? String(n) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#7e22ce' });
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.cart) updateBadge();
  if (area === 'sync' && changes.uiLang) setupContextMenu();
});
updateBadge();

// Human-paced gap between items so the handoff never looks like a burst.
const pause = () => new Promise(r => setTimeout(r, 700 + Math.random() * 800));

// ---- Checkout handoff: fill the store's real cart in background tabs ----
async function checkoutStore(storeId, sendProgress) {
  const settings = await getSettings();
  const items = (await getCart()).filter(i => i.store === storeId);
  const cfg = STORE_CHECKOUT[storeId];
  if (!items.length || !cfg) return { ok: 0, fail: 0, failures: [] };

  const failures = [];
  let done = 0;

  const report = () =>
    sendProgress?.({ type: 'CHECKOUT_PROGRESS', store: storeId, done, total: items.length, failed: failures.length });

  if (cfg.darkstore) {
    const base = settings.pandamartUrl;
    if (!base) return { ok: 0, fail: items.length, failures: items.map(i => ({ name: i.name, reason: 'pandamart not linked' })) };
    const tab = await chrome.tabs.create({ url: base, active: false });
    await waitForLoad(tab.id, 15000);
    for (const item of items) {
      try {
        const [res] = await chrome.scripting.executeScript({
          target: { tabId: tab.id }, world: 'MAIN',
          func: addToCartOnDarkstore, args: [{ name: item.name, qty: item.qty }]
        });
        if (!res?.result?.ok) failures.push({ name: item.name, reason: res?.result?.reason || 'failed' });
      } catch (e) {
        failures.push({ name: item.name, reason: e.message });
      }
      done++; report();
      await pause();
    }
    await chrome.tabs.update(tab.id, { active: true });
  } else {
    for (const item of items) {
      let tab = null;
      try {
        if (!item.url) throw new Error('no product link');
        tab = await chrome.tabs.create({ url: item.url, active: false });
        await waitForLoad(tab.id, 15000);
        const [res] = await chrome.scripting.executeScript({
          target: { tabId: tab.id }, world: 'MAIN',
          func: addToCartOnPage, args: [{ qty: item.qty, patterns: cfg.patterns }]
        });
        if (res?.result?.ok) {
          await chrome.tabs.remove(tab.id);
        } else {
          failures.push({ name: item.name, reason: res?.result?.reason || 'failed' });
        }
      } catch (e) {
        failures.push({ name: item.name, reason: e.message });
        if (tab) { try { await chrome.tabs.remove(tab.id); } catch {} }
      }
      done++; report();
      await pause();
    }
    await chrome.tabs.create({ url: cfg.cartUrl, active: true });
  }

  return { ok: items.length - failures.length, fail: failures.length, failures };
}

// ---- Price watch: starred items re-checked once a day ----
async function getWatches() {
  const { watches } = await chrome.storage.local.get('watches');
  return Array.isArray(watches) ? watches : [];
}

async function addWatch(item) {
  const watches = await getWatches();
  const key = itemKey(item);
  if (!watches.some(w => w.key === key)) {
    watches.push({
      key,
      store: item.store,
      name: item.name,
      url: item.url ?? null,
      image: item.image ?? null,
      basePrice: item.price,
      lastPrice: item.price,
      lastChecked: Date.now(),
      notifiedPrice: null,
      addedAt: Date.now()
    });
    await chrome.storage.local.set({ watches });
  }
  return watches;
}

async function removeWatch(key) {
  const watches = (await getWatches()).filter(w => w.key !== key);
  await chrome.storage.local.set({ watches });
  return watches;
}

// One polite request per watched item: search only its own store by name.
async function checkWatch(watch, { manual }) {
  const adapter = ADAPTERS.find(a => a.id === watch.store);
  if (!adapter) return;
  // The daily alarm only touches direct-API stores; tab-scraped stores
  // (which open visible tabs) are refreshed when the user asks.
  if (adapter.type !== 'api' && !manual) return;
  const settings = await getSettings();
  const query = watch.name.split(/\s+/).slice(0, 8).join(' ');
  const items = await adapter.search(query, settings);
  let match = watch.url ? items.find(i => i.url === watch.url) : null;
  if (!match) {
    match = items
      .map(i => ({ i, s: matchScore(i.name, watch.name) }))
      .filter(x => x.s >= 0.8)
      .sort((a, b) => b.s - a.s)[0]?.i;
  }
  if (!match) return;
  watch.lastPrice = match.price;
  watch.lastChecked = Date.now();
  // Notify below the user's own target when they set one, else below the
  // price they starred it at.
  const threshold = watch.target != null ? watch.target + 0.001 : watch.basePrice;
  if (match.price < threshold && watch.notifiedPrice !== match.price) {
    watch.notifiedPrice = match.price;
    const { uiLang } = await chrome.storage.sync.get('uiLang');
    chrome.notifications.create(`drop:${watch.key}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: uiLang === 'bn' ? 'দাম কমেছে! 🎉' : 'Price drop! 🎉',
      message: `${watch.name}\n৳${watch.basePrice} → ৳${match.price} (${adapter.label})`
    });
  }
}

async function checkAllWatches({ manual = false } = {}) {
  const watches = await getWatches();
  for (const w of watches) {
    try { await checkWatch(w, { manual }); } catch {}
    await pause();
  }
  await chrome.storage.local.set({ watches });
  return watches;
}

const bazarAdapters = { shwapno, meenabazar };
const refreshBazar = async (force = false) =>
  maybeRefreshBazar(bazarAdapters, await getSettings(), force);

chrome.alarms.create('priceWatch', { periodInMinutes: 24 * 60, delayInMinutes: 90 });
chrome.alarms.create('bazarDaily', { periodInMinutes: 24 * 60, delayInMinutes: 20 });
chrome.alarms.onAlarm.addListener(a => {
  if (a.name === 'bazarDaily') refreshBazar();
  if (a.name === 'priceWatch') checkAllWatches();
});

// ---- Right-click shopping assistant on any page ----
const MENU_ID = 'bd-price-compare';

async function setupContextMenu() {
  const { uiLang } = await chrome.storage.sync.get('uiLang');
  const title = uiLang === 'bn' ? '“%s” — বিডি দাম তুলনা করুন' : 'Compare BD prices for “%s”';
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_ID, title, contexts: ['selection'] });
  });
}
chrome.runtime.onInstalled.addListener(setupContextMenu);
chrome.runtime.onStartup?.addListener(setupContextMenu);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id || !info.selectionText) return;
  const query = info.selectionText.trim().slice(0, 80);
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/overlay.js'] });
    const { uiLang } = await chrome.storage.sync.get('uiLang');
    await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_OVERLAY', query, lang: uiLang === 'bn' ? 'bn' : 'en' });
  } catch (e) {
    // Page where injection is not allowed (chrome://, web store, etc.)
    console.warn('overlay injection failed', e);
  }
});

// In-page compare button → show the overlay in that tab and search.
// The overlay ships as a static content script; injection is the fallback
// for tabs that loaded before the extension was (re)loaded.
// The page's own host tells us the category (compare button on Star Tech
// means an electronics product; on Shwapno, a grocery one).
const HOST_CATEGORY = [
  [/shwapno\.com|meenabazaronline\.com|chaldal\.com|foodpanda\.com/i, 'grocery'],
  [/startech\.com\.bd|ryans\.com|gadgetandgear\.com|pickaboo\.com|techlandbd\.com|sumashtech\.com/i, 'electronics'],
  [/arogga\.com|medeasy\.health|medex\.com\.bd|lazzpharma\.com|osudpotro\.com/i, 'medicine']
];

function categoryForUrl(url) {
  for (const [re, cat] of HOST_CATEGORY) if (re.test(url || '')) return cat;
  return null;
}

async function compareHere(tabId, query, pageUrl) {
  const { uiLang } = await chrome.storage.sync.get('uiLang');
  const category = categoryForUrl(pageUrl);
  const msg = { type: 'SHOW_OVERLAY', query, category, lang: uiLang === 'bn' ? 'bn' : 'en' };
  try {
    await chrome.tabs.sendMessage(tabId, msg);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content/overlay.js'] });
    await chrome.tabs.sendMessage(tabId, msg);
  }
}

// ---- Streaming search port (popup): results arrive store by store ----
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'search') return;
  let gone = false;
  port.onDisconnect.addListener(() => { gone = true; });
  const post = ev => { if (!gone) { try { port.postMessage(ev); } catch { gone = true; } } };
  port.onMessage.addListener(msg => {
    if (msg?.type !== 'SEARCH') return;
    runSearch(msg.query, msg.category, post)
      .then(data => post({ type: 'done', data }))
      .catch(e => post({ type: 'done', data: { query: msg.query, at: Date.now(), results: [], error: e?.message || String(e) } }));
  });
});

// ---- Message router ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'SEARCH') {
    runSearch(msg.query, msg.category)
      .then(sendResponse)
      .catch(e => sendResponse({ error: e?.message || String(e), results: [] }));
    return true;
  }
  if (msg?.type === 'GET_STORES') {
    getSettings().then(settings => {
      sendResponse({
        stores: ADAPTERS.map(a => ({
          id: a.id, label: a.label, color: a.color, homepage: a.homepage,
          type: a.type, category: a.category, enabled: !!settings.enabledStores[a.id]
        })),
        settings
      });
    });
    return true;
  }
  if (msg?.type === 'WATCH_ADD') {
    addWatch(msg.item).then(ws => sendResponse({ ok: true, count: ws.length }));
    return true;
  }
  if (msg?.type === 'WATCH_REMOVE') {
    removeWatch(msg.key).then(ws => sendResponse({ ok: true, count: ws.length }));
    return true;
  }
  if (msg?.type === 'WATCH_TARGET') {
    getWatches().then(async ws => {
      const w = ws.find(x => x.key === msg.key);
      if (w) {
        w.target = msg.target > 0 ? msg.target : null;
        w.notifiedPrice = null; // re-arm the notification for the new target
        await chrome.storage.local.set({ watches: ws });
      }
      sendResponse({ ok: !!w });
    });
    return true;
  }
  if (msg?.type === 'BAZAR_REFRESH') {
    refreshBazar(!!msg.force)
      .then(res => sendResponse({ ok: true, ...res }))
      .catch(e => sendResponse({ ok: false, error: e?.message || String(e) }));
    return true;
  }
  if (msg?.type === 'WATCH_CHECK') {
    checkAllWatches({ manual: true }).then(ws => sendResponse({ ok: true, watches: ws }));
    return true;
  }
  if (msg?.type === 'ADD_TO_CART') {
    addToCart(msg.item, msg.qty || 1).then(cart => sendResponse({ ok: true, count: cartCount(cart) }));
    return true;
  }
  if (msg?.type === 'COMPARE_HERE' && sender?.tab?.id) {
    compareHere(sender.tab.id, msg.query, sender.tab.url)
      .then(() => sendResponse({ ok: true }))
      .catch(e => sendResponse({ ok: false, error: e?.message }));
    return true;
  }
  if (msg?.type === 'CHECKOUT_STORE') {
    const progress = p => chrome.runtime.sendMessage(p).catch(() => {});
    checkoutStore(msg.store, progress)
      .then(sendResponse)
      .catch(e => sendResponse({ ok: 0, fail: -1, error: e?.message || String(e) }));
    return true;
  }
});
