import { formatTaka, matchesQuery, querySize } from './lib/normalize.js';
import { STAPLES } from './lib/bazar.js';
import { initLang, toggleLang, getLang, t } from './lib/i18n.js';
import {
  getCart, addToCart, setQty, removeFromCart, clearCart,
  cartCount, groupByStore, subtotal, itemKey
} from './lib/cart.js';

const $ = sel => document.querySelector(sel);
const resultsEl = $('#results');
const chipsEl = $('#chips');
const bestEl = $('#best');
const statusEl = $('#status');

let lastData = null;
let stores = [];
let storeMeta = {};
let checkoutBusy = null;
let category = 'all';
let watchBusy = false;

const CATS = ['all', 'grocery', 'electronics', 'medicine'];
const CAT_LABEL_KEYS = { all: 'catAll', grocery: 'catGrocery', electronics: 'catElectronics', medicine: 'catMedicine' };

if (new URLSearchParams(location.search).get('view') === 'tab') {
  document.body.classList.add('fullpage');
}

init();

async function init() {
  await initLang();
  const info = await chrome.runtime.sendMessage({ type: 'GET_STORES' });
  stores = info?.stores || [];
  for (const s of stores) storeMeta[s.id] = s;
  category = info?.settings?.searchCategory || 'all';

  applyStaticText();
  renderCats();
  renderChips(null);
  renderRecent();
  renderOnboard();
  refreshCartBadge();
  detectPageProduct();

  const { lastQuery } = await chrome.storage.local.get('lastQuery');
  if (lastQuery) $('#query').value = lastQuery;

  $('#go').addEventListener('click', run);
  $('#query').addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
  $('#sort').addEventListener('change', () => render());
  $('#strict').addEventListener('change', () => render());
  $('#openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('#openTab').addEventListener('click', () =>
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?view=tab') })
  );
  $('#langBtn').addEventListener('click', async () => {
    await toggleLang();
    applyStaticText();
    renderChips(lastData);
    renderRecent();
    if (lastData) render();
    else renderOnboard();
    if (!$('#viewCart').classList.contains('hidden')) renderCart();
    if (!$('#viewBazar').classList.contains('hidden')) renderBazar();
  });
  $('#tabSearch').addEventListener('click', () => switchTab('search'));
  $('#tabCart').addEventListener('click', () => { switchTab('cart'); renderCart(); });
  $('#tabWatch').addEventListener('click', () => { switchTab('watch'); renderWatch(); });
  $('#tabBazar').addEventListener('click', () => { switchTab('bazar'); openBazar(); });

  chrome.runtime.onMessage.addListener(msg => {
    if (msg?.type === 'CHECKOUT_PROGRESS') {
      checkoutBusy = msg;
      renderCart();
    }
  });
}

function applyStaticText() {
  $('#appName').textContent = t('appName');
  $('#query').placeholder = t('searchPlaceholder');
  $('#go').textContent = t('compare');
  $('#tabSearch').childNodes[0].textContent = t('searchTab') + ' ';
  $('#tabCart').childNodes[0].textContent = t('cartTab') + ' ';
  $('#watchLabel').textContent = t('watchTab');
  $('#bazarLabel').textContent = t('bazarTab');
  renderCats();
  $('#sortLabel').textContent = t('sort');
  const sortOpts = $('#sort').options;
  sortOpts[0].textContent = t('sortUnit');
  sortOpts[1].textContent = t('sortPrice');
  sortOpts[2].textContent = t('sortStore');
  $('#strictLabel').textContent = t('closeMatches');
  $('#openTab').title = t('openFull');
  $('#openOptions').title = t('settings');
  $('#langBtn').textContent = t('langBtn');
  $('#langBtn').title = t('langTitle');
  statusEl.textContent = lastData
    ? `${t('searchedAt')} ${new Date(lastData.at).toLocaleTimeString()} — ${t('priceNote')}`
    : t('footerIdle');
}

function switchTab(which) {
  $('#viewSearch').classList.toggle('hidden', which !== 'search');
  $('#viewCart').classList.toggle('hidden', which !== 'cart');
  $('#viewWatch').classList.toggle('hidden', which !== 'watch');
  $('#viewBazar').classList.toggle('hidden', which !== 'bazar');
  $('#tabSearch').classList.toggle('active', which === 'search');
  $('#tabCart').classList.toggle('active', which === 'cart');
  $('#tabWatch').classList.toggle('active', which === 'watch');
  $('#tabBazar').classList.toggle('active', which === 'bazar');
}

// ---- Category chips ----
function renderCats() {
  const el = $('#cats');
  el.innerHTML = '';
  for (const c of CATS) {
    const b = document.createElement('button');
    b.className = 'catchip' + (c === category ? ' active' : '');
    b.textContent = t(CAT_LABEL_KEYS[c]);
    b.addEventListener('click', async () => {
      category = c;
      await chrome.storage.sync.set({ searchCategory: c });
      renderCats();
      renderChips(lastData?.category === c ? lastData : null);
    });
    el.appendChild(b);
  }
}

async function refreshCartBadge() {
  const n = cartCount(await getCart());
  const b = $('#cartBadge');
  b.textContent = n;
  b.classList.toggle('hidden', n === 0);
}

// ---- Detect a product on the page the user is looking at ----
// Runs only when the popup is opened (activeTab): works on ANY shop site
// without the extension reading pages on its own.
function detectProductOnPage() {
  const PRICE_RE = /৳|Tk\.?\s?\d|BDT|₹|\$\s?\d/;
  const body = document.body ? document.body.innerText.slice(0, 30000) : '';
  const commercial =
    PRICE_RE.test(body) ||
    [...document.querySelectorAll('button, [role="button"]')].some(b =>
      /add to (bag|cart|basket)|buy now|order now/i.test(b.textContent || '')
    );
  if (!commercial) return null;

  const clean = s => {
    // Keep buy-get offers as a canonical BxGy token (parens get stripped)
    let bogo = '';
    const bm =
      s.match(/\bbuy\s*(\d+|one)\s*,?\s*get\s*(\d+|one)\b/i) ||
      s.match(/\bb\s*(\d)\s*g\s*(\d)\b/i);
    if (bm) {
      const n = v => (/one/i.test(v) ? 1 : parseInt(v, 10));
      bogo = ` B${n(bm[1])}G${n(bm[2])}`;
    } else if (/\bbogo\b/i.test(s)) {
      bogo = ' B1G1';
    }
    const base = s
      // "180(±)10ml" → "180ml": tolerance, not size
      .replace(/(\d+(?:[.,]\d+)?)\s*(?:\(\s*(?:±|\+\/?-)\s*\)|±|\+\/-)\s*\d+(?:[.,]\d+)?\s*/g, '$1')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[৳$₹]/g, ' ') // our own ৳ compare button sits inside some h1s
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .slice(0, 8)
      .join(' ');
    return base + bogo;
  };

  const h1 = [...document.querySelectorAll('h1')].find(h => {
    const t = h.textContent.trim();
    const r = h.getBoundingClientRect();
    return t.length >= 8 && t.length <= 160 && r.width > 0 && r.height > 0;
  });
  if (h1) return clean(h1.textContent);

  const og = document.querySelector('meta[property="og:title"]')?.content;
  if (og && og.length >= 8) return clean(og.split('|')[0].split(' at ')[0]);
  return null;
}

async function detectPageProduct() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || '')) return;
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: detectProductOnPage
    });
    const title = res?.result;
    if (!title) return;
    const bar = $('#detect');
    bar.innerHTML = '';
    const b = document.createElement('button');
    b.className = 'detectchip';
    b.title = t('comparePage');
    b.textContent = `🔍 ${title}`;
    b.addEventListener('click', () => {
      $('#query').value = title;
      run();
    });
    bar.appendChild(b);
  } catch {
    // chrome:// pages, web store, PDF viewer etc. — nothing to detect
  }
}

// ---- Recent searches ----
async function renderRecent() {
  const { recentSearches = [] } = await chrome.storage.local.get('recentSearches');
  const el = $('#recent');
  el.innerHTML = '';
  if (!recentSearches.length) return;
  for (const q of recentSearches.slice(0, 6)) {
    const b = document.createElement('button');
    b.className = 'recentchip';
    b.textContent = q;
    b.addEventListener('click', () => { $('#query').value = q; run(); });
    el.appendChild(b);
  }
  const clear = document.createElement('button');
  clear.className = 'recentchip clear';
  clear.textContent = '✕';
  clear.title = 'Clear';
  clear.addEventListener('click', async () => {
    await chrome.storage.local.remove('recentSearches');
    renderRecent();
  });
  el.appendChild(clear);
}

// First-run hint: the three zero-typing ways to compare.
function renderOnboard() {
  if (lastData) return;
  resultsEl.innerHTML = '';
  const d = document.createElement('div');
  d.className = 'onboard';
  const title = document.createElement('b');
  title.textContent = '💡 ' + t('onboardTitle');
  const ol = document.createElement('ol');
  for (const k of ['onboard1', 'onboard2', 'onboard3']) {
    const li = document.createElement('li');
    li.textContent = t(k);
    ol.appendChild(li);
  }
  d.append(title, ol);
  resultsEl.appendChild(d);
}

function enabledStores() {
  return stores.filter(
    s => s.enabled && (category === 'all' || s.category === category || s.category === 'both')
  );
}

function renderChips(data) {
  chipsEl.innerHTML = '';
  for (const s of enabledStores()) {
    const r = data?.results?.find(x => x.store === s.id);
    const pending = !r && data?._pending?.has(s.id);
    const skipped = !r && data?._skipped?.has(s.id);
    const chip = document.createElement(r?.searchUrl ? 'a' : 'span');
    chip.className = 'chip' + (r ? (r.ok ? ' ok' : ' err') : skipped ? ' skip' : '');
    if (r?.searchUrl) {
      chip.href = r.searchUrl;
      chip.target = '_blank';
    }
    const dot = document.createElement('span');
    if (pending) dot.className = 'spin';
    else { dot.className = 'dot'; dot.style.background = s.color; }
    chip.appendChild(dot);
    let text = s.label;
    if (r) text += r.ok ? ` · ${r.items.length}` : ' · —';
    else if (skipped) text += ' · ⊘';
    chip.appendChild(document.createTextNode(' ' + text));
    if (skipped) chip.title = t('skippedNote', { cat: t(CAT_LABEL_KEYS[data?.detectedCategory] || 'catAll') });
    chipsEl.appendChild(chip);
  }

  // Electronics: half the buying decision is "what does it go for used?" —
  // one chip deep-links the same query on Bikroy (no scraping, just a link).
  const effCat = data?.detectedCategory || (category !== 'all' ? category : null);
  if (effCat === 'electronics' && data?.query) {
    const bk = document.createElement('a');
    bk.className = 'chip bikroy';
    bk.href = 'https://bikroy.com/en/ads/bangladesh?query=' + encodeURIComponent(data.query);
    bk.target = '_blank';
    bk.rel = 'noreferrer';
    bk.textContent = '🔄 ' + t('usedBikroy');
    chipsEl.appendChild(bk);
  }
}

// Streaming search: results render store by store as each one answers,
// so the slow tab-scraped stores never block the fast API ones.
let searchPort = null;

function run() {
  const query = $('#query').value.trim();
  if (!query) return;
  chrome.storage.local.set({ lastQuery: query });

  $('#go').disabled = true;
  bestEl.classList.add('hidden');
  $('#controls').classList.add('hidden');
  statusEl.textContent = t('searching') + '…';
  resultsEl.innerHTML = `<div class="empty">${t('comparing')}<br><small>${t('bgTabNote')}</small></div>`;

  const live = {
    query, category, at: Date.now(), results: [],
    _pending: new Set(enabledStores().map(s => s.id)), _skipped: new Set(), partial: true
  };
  lastData = live;
  renderChips(live);

  if (searchPort) { try { searchPort.disconnect(); } catch { /* already gone */ } }
  const port = chrome.runtime.connect({ name: 'search' });
  searchPort = port;

  port.onMessage.addListener(msg => {
    if (port !== searchPort) return; // superseded by a newer search
    if (msg.type === 'plan') {
      live._pending = new Set(msg.stores);
      renderChips(live);
    } else if (msg.type === 'skip') {
      for (const id of msg.stores) { live._pending.delete(id); live._skipped.add(id); }
      live.detectedCategory = msg.detected;
      renderChips(live);
    } else if (msg.type === 'store') {
      live._pending.delete(msg.result.store);
      live.results.push(msg.result);
      render();
      if (live._pending.size) {
        statusEl.textContent = t('stillSearching', { n: live._pending.size });
      }
    } else if (msg.type === 'done') {
      lastData = { ...msg.data, _skipped: live._skipped };
      $('#go').disabled = false;
      statusEl.textContent = msg.data.error
        ? msg.data.error
        : `${t('searchedAt')} ${new Date(lastData.at).toLocaleTimeString()} — ${lastData.cached ? t('fromCache') : t('priceNote')}`;
      renderRecent();
      render();
      searchPort = null;
      try { port.disconnect(); } catch { /* fine */ }
    }
  });
  port.onDisconnect.addListener(() => {
    if (searchPort === port) { searchPort = null; $('#go').disabled = false; }
  });
  port.postMessage({ type: 'SEARCH', query, category });
}

function currentItems() {
  if (!lastData) return [];
  const strict = $('#strict').checked;
  const all = [];
  for (const r of lastData.results) {
    for (const item of r.items) {
      if (strict && !matchesQuery(item.name, lastData.query)) continue;
      all.push({ ...item, _label: r.label, _color: r.color });
    }
  }
  return all;
}

// When the best-value item is a different size than the query, explain the
// per-unit win and point at the cheapest same-size option.
function bestExplain(items, best, query) {
  const qs = querySize(query || '');
  if (!qs || !best?.unitPrice || !best.quantity) return {};
  const { targetBase, targetQty } = qs;
  if (best.quantity.baseUnit !== targetBase) return {};
  const cand = items
    .filter(i =>
      i.unitPrice && i.quantity?.baseUnit === targetBase &&
      Math.abs(i.quantity.qty - targetQty) / targetQty <= 0.15
    )
    .sort((a, b) => a.price - b.price)[0];
  if (!cand || (cand.name === best.name && cand.store === best.store && cand.price === best.price)) return {};
  const pct = Math.round((1 - best.unitPrice.value / cand.unitPrice.value) * 100);
  const ratio = best.quantity.qty / cand.quantity.qty;
  if (pct <= 0 || ratio <= 1.05) return {};
  const ratioTxt = (Math.round(ratio * 10) / 10).toString().replace(/\.0$/, '') + '×';
  const diff = best.price - cand.price;
  return {
    why: t(diff >= 0 ? 'reasonBigger' : 'reasonCheaper', {
      ratio: ratioTxt, diff: formatTaka(Math.abs(diff)), pct, unit: best.unitPrice.label
    }),
    sameSizeLine: t('sameSizeCheapest', {
      size: cand.quantity.display, price: formatTaka(cand.price), store: cand._label
    })
  };
}

function pickBest(items) {
  for (const base of ['g', 'ml']) {
    const comparable = items.filter(i => i.quantity?.baseUnit === base && i.unitPrice);
    const storesIn = new Set(comparable.map(i => i.store));
    if (comparable.length >= 2 && storesIn.size >= 2) {
      return comparable.reduce((a, b) => (a.unitPrice.value <= b.unitPrice.value ? a : b));
    }
  }
  if (!items.length) return null;
  return items.reduce((a, b) => (a.price <= b.price ? a : b));
}

// ---- Share a comparison as a PNG (drawn on canvas; no remote images,
// so the canvas stays untainted and downloadable) ----
function shareButton(items, best, query) {
  const btn = document.createElement('button');
  btn.className = 'starbtn';
  btn.textContent = '📤';
  btn.title = t('share');
  btn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    drawShareCard(items, best, query);
    btn.textContent = '✓';
    btn.title = t('shareDone');
    setTimeout(() => { btn.textContent = '📤'; btn.title = t('share'); }, 1500);
  });
  return btn;
}

function drawShareCard(items, best, query) {
  const list = [best, ...items.filter(i => i !== best)
    .sort((a, b) => (a.unitPrice?.value ?? Infinity) - (b.unitPrice?.value ?? Infinity))].slice(0, 5);
  const W = 800, rowH = 72, top = 140, footH = 60;
  const H = top + list.length * rowH + footH;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');

  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#16111c'); g.addColorStop(1, '#1e1628');
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  x.fillStyle = '#7e22ce';
  x.beginPath(); x.roundRect(28, 26, 44, 44, 12); x.fill();
  x.fillStyle = '#fff';
  x.font = '700 26px system-ui, "Noto Sans Bengali", sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('৳', 50, 49);
  x.textAlign = 'left';
  x.font = '700 24px system-ui, sans-serif';
  x.fillText('BD Price Compare', 86, 48);
  x.fillStyle = '#a79cb5';
  x.font = '15px system-ui, "Noto Sans Bengali", sans-serif';
  const q = query.length > 70 ? query.slice(0, 69) + '…' : query;
  x.fillText('“' + q + '”', 30, 98);

  const trunc = (s, maxW, font) => {
    x.font = font;
    if (x.measureText(s).width <= maxW) return s;
    while (s.length && x.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  };

  list.forEach((it, i) => {
    const y = top + i * rowH;
    if (i === 0) {
      x.fillStyle = 'rgba(242,194,0,.10)';
      x.strokeStyle = 'rgba(242,194,0,.55)';
      x.beginPath(); x.roundRect(20, y + 2, W - 40, rowH - 8, 12); x.fill(); x.stroke();
    }
    x.fillStyle = it._color || '#888';
    x.beginPath(); x.arc(44, y + 26, 6, 0, 7); x.fill();
    x.fillStyle = i === 0 ? '#f2c200' : '#a79cb5';
    x.font = '700 13px system-ui, sans-serif';
    x.fillText((i === 0 ? '🏆 ' : '') + (it._label || it.store), 58, y + 27);
    x.fillStyle = '#ece7f2';
    x.font = '500 16px system-ui, "Noto Sans Bengali", sans-serif';
    x.fillText(trunc(it.name, 500, '500 16px system-ui, "Noto Sans Bengali", sans-serif'), 44, y + 50);
    x.textAlign = 'right';
    x.font = '800 20px system-ui, "Noto Sans Bengali", sans-serif';
    x.fillText(formatTaka(it.price), W - 36, y + 30);
    if (it.unitPrice) {
      x.fillStyle = '#c084fc';
      x.font = '700 13px system-ui, "Noto Sans Bengali", sans-serif';
      x.fillText(`${formatTaka(it.unitPrice.value)}/${it.unitPrice.label}`, W - 36, y + 52);
    }
    x.textAlign = 'left';
  });

  x.fillStyle = '#8d81a0';
  x.font = '13px system-ui, sans-serif';
  x.fillText('saikatnjm.github.io/bd-price-compare · ' + new Date().toLocaleDateString(), 30, H - 26);

  c.toBlob(b => {
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u;
    a.download = 'bd-price-' + query.toLowerCase().replace(/[^a-z0-9ঀ-৿]+/g, '-').slice(0, 40) + '.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 5000);
  });
}

// Store tag: colored dot + name (quieter than a solid colored pill).
function storeBadge(label, color) {
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.style.setProperty('--store-c', color);
  badge.textContent = label;
  return badge;
}

function addButton(item) {
  const btn = document.createElement('button');
  btn.className = 'addbtn';
  btn.textContent = '+';
  btn.title = t('addToCart');
  btn.addEventListener('click', async e => {
    e.preventDefault();
    e.stopPropagation();
    await addToCart(item);
    btn.textContent = '✓';
    btn.classList.add('done');
    setTimeout(() => { btn.textContent = '+'; btn.classList.remove('done'); }, 1200);
    refreshCartBadge();
  });
  return btn;
}

function starButton(item) {
  const btn = document.createElement('button');
  btn.className = 'starbtn';
  btn.textContent = '☆';
  btn.title = t('watchTab');
  btn.addEventListener('click', async e => {
    e.preventDefault();
    e.stopPropagation();
    await chrome.runtime.sendMessage({ type: 'WATCH_ADD', item });
    btn.textContent = '★';
    btn.classList.add('done');
  });
  return btn;
}

function render() {
  if (!lastData) return;
  renderChips(lastData);
  $('#controls').classList.remove('hidden');

  const items = currentItems();
  const sort = $('#sort').value;
  const sorted = [...items].sort((a, b) => {
    if (sort === 'unit') {
      const ua = a.unitPrice?.value ?? Infinity;
      const ub = b.unitPrice?.value ?? Infinity;
      if (ua !== ub) return ua - ub;
      return a.price - b.price;
    }
    if (sort === 'price') return a.price - b.price;
    return a._label.localeCompare(b._label) || a.price - b.price;
  });

  const best = pickBest(items);
  if (best) {
    bestEl.classList.remove('hidden');
    bestEl.innerHTML = '';

    const img = document.createElement('img');
    img.className = 'heroimg';
    img.src = best.image || 'icons/icon48.png';
    img.alt = '';
    bestEl.appendChild(img);

    const mid = document.createElement('div');
    mid.className = 'heromid';
    const crown = document.createElement('div');
    crown.className = 'herocrown';
    crown.textContent = '🏆 ' + t('bestDeal');
    const nm = document.createElement('a');
    nm.className = 'heron';
    nm.textContent = best.name;
    nm.title = best.name;
    if (best.url) { nm.href = best.url; nm.target = '_blank'; nm.rel = 'noreferrer'; }
    const metaLine = document.createElement('div');
    metaLine.className = 'meta';
    metaLine.appendChild(storeBadge(best._label, best._color));
    if (best.quantity?.display) {
      const sz = document.createElement('span');
      sz.className = 'sizepill';
      sz.textContent = (best.quantity.bogo ? '🎁 ' : '') + best.quantity.display;
      metaLine.appendChild(sz);
    }
    mid.append(crown, nm, metaLine);
    bestEl.appendChild(mid);

    const right = document.createElement('div');
    right.className = 'heroright';
    const pr = document.createElement('div');
    pr.className = 'heroprice';
    pr.textContent = formatTaka(best.price);
    right.appendChild(pr);
    if (best.unitPrice) {
      const up = document.createElement('div');
      up.className = 'herounit';
      up.textContent = `${formatTaka(best.unitPrice.value)}/${best.unitPrice.label}`;
      right.appendChild(up);
    }
    // "save X% per unit vs the next store" — the one-glance reason it wins
    if (best.unitPrice) {
      const rival = items
        .filter(i =>
          i.store !== best.store && i.unitPrice &&
          i.quantity?.baseUnit === best.quantity?.baseUnit
        )
        .sort((a, b) => a.unitPrice.value - b.unitPrice.value)[0];
      if (rival) {
        const pct = Math.round((1 - best.unitPrice.value / rival.unitPrice.value) * 100);
        if (pct >= 2) {
          const sv = document.createElement('div');
          sv.className = 'herosave';
          sv.textContent = '▼ ' + t('youSave', { pct, unit: best.unitPrice.label, store: rival._label });
          right.appendChild(sv);
        }
      }
    }
    const btns = document.createElement('div');
    btns.className = 'herobtns';
    btns.append(shareButton(items, best, lastData.query), starButton(best), addButton(best));
    right.appendChild(btns);
    bestEl.appendChild(right);

    const extra = bestExplain(items, best, lastData.query);
    if (best.hist?.claim === 'fake') {
      extra.histLine = '⚠ ' + t('histFake', { hi: formatTaka(best.hist.hi), old: formatTaka(best.oldPrice) });
    } else if (best.hist?.claim === 'real') {
      extra.histLine = '✅ ' + t('histReal', { old: formatTaka(best.oldPrice) });
    } else if (best.hist?.lowest && best.hist.n >= 3) {
      extra.histLine = '🔻 ' + t('histLowest') + ` (${t('histRange', { lo: formatTaka(best.hist.lo), hi: formatTaka(best.hist.hi) })})`;
    }
    for (const [icon, line] of [['💡', extra.why], ['📏', extra.sameSizeLine], ['', extra.histLine]]) {
      if (!line) continue;
      const d = document.createElement('div');
      d.className = 'whyline';
      d.textContent = icon + ' ' + line;
      bestEl.appendChild(d);
    }
  } else {
    bestEl.classList.add('hidden');
  }

  resultsEl.innerHTML = '';
  for (const r of lastData.results.filter(x => !x.ok)) {
    const div = document.createElement('div');
    div.className = 'storeerr';
    div.innerHTML = `<b>${r.label}:</b> ${escapeHtml(r.error || t('failed'))} · <a href="${r.searchUrl}" target="_blank">${t('searchManually')}</a>`;
    resultsEl.appendChild(div);
  }

  if (!sorted.length) {
    resultsEl.insertAdjacentHTML(
      'beforeend',
      lastData._pending?.size
        ? `<div class="empty">${t('comparing')}</div>`
        : `<div class="empty">${t('noMatches')}` +
          ($('#strict').checked ? `<br><small>${t('tryUntick')}</small>` : '') +
          '</div>'
    );
    return;
  }

  for (const item of sorted) {
    const a = document.createElement('a');
    a.className = 'row';
    a.style.setProperty('--store-c', item._color);
    if (best && item.name === best.name && item.store === best.store && item.price === best.price) {
      a.classList.add('best-row');
    }
    a.href = item.url || '#';
    a.target = '_blank';
    a.rel = 'noreferrer';

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = item.image || 'icons/icon48.png';
    img.alt = '';
    a.appendChild(img);

    const mid = document.createElement('div');
    mid.className = 'mid';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = item.name;
    name.title = item.name;
    mid.appendChild(name);

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.appendChild(storeBadge(item._label, item._color));
    if (item.quantity?.display) {
      const sz = document.createElement('span');
      sz.className = 'sizepill';
      sz.textContent = (item.quantity.bogo ? '🎁 ' : '') + item.quantity.display;
      meta.appendChild(sz);
    }
    const subBits = [];
    if (item.rating) subBits.push(`★ ${item.rating.toFixed ? item.rating.toFixed(1) : item.rating}${item.reviews ? ` (${item.reviews})` : ''}`);
    if (item.delivery) subBits.push(item.delivery);
    if (subBits.length) {
      const sub = document.createElement('span');
      sub.className = 'sub';
      sub.textContent = subBits.join(' · ');
      meta.appendChild(sub);
    }
    if (item.stock === false) {
      const oos = document.createElement('span');
      oos.className = 'oos';
      oos.textContent = t('outOfStock');
      meta.appendChild(oos);
    }
    if (item.hist?.claim === 'fake') {
      const fk = document.createElement('span');
      fk.className = 'fakepill';
      fk.textContent = '⚠ ' + t('histFakeShort');
      fk.title = t('histFake', { hi: formatTaka(item.hist.hi), old: formatTaka(item.oldPrice) });
      meta.appendChild(fk);
    }
    mid.appendChild(meta);
    a.appendChild(mid);

    const right = document.createElement('div');
    right.className = 'right';
    const pb = document.createElement('div');
    pb.className = 'pricebox';
    const priceLine = document.createElement('div');
    if (item.oldPrice) {
      const old = document.createElement('span');
      old.className = 'old';
      old.textContent = formatTaka(item.oldPrice);
      priceLine.appendChild(old);
    }
    const price = document.createElement('span');
    price.className = 'price';
    price.textContent = formatTaka(item.price);
    priceLine.appendChild(price);
    pb.appendChild(priceLine);
    if (item.unitPrice) {
      const up = document.createElement('div');
      up.className = 'unitprice';
      up.textContent = `${formatTaka(item.unitPrice.value)}/${item.unitPrice.label}`;
      pb.appendChild(up);
    }
    if (item.hist) {
      const h = document.createElement('div');
      h.className = 'histline' + (item.hist.lowest ? ' good' : '');
      h.textContent = item.hist.lowest
        ? '🔻 ' + t('histLowest')
        : t('histRange', { lo: formatTaka(item.hist.lo), hi: formatTaka(item.hist.hi) });
      pb.appendChild(h);
    }
    right.appendChild(pb);
    right.appendChild(starButton(item));
    right.appendChild(addButton(item));
    a.appendChild(right);
    resultsEl.appendChild(a);
  }
}

// ---- Watch view ----
async function renderWatch() {
  const { watches = [] } = await chrome.storage.local.get('watches');
  const el = $('#watchList');
  el.innerHTML = '';

  if (!watches.length) {
    el.innerHTML = `<div class="empty">${t('watchEmpty')}</div>`;
    return;
  }

  const hint = document.createElement('div');
  hint.className = 'carthint';
  hint.textContent = t('watchHint');
  el.appendChild(hint);

  for (const w of watches) {
    const meta = storeMeta[w.store] || { label: w.store, color: '#888' };
    const row = document.createElement('a');
    row.className = 'row';
    row.href = w.url || '#';
    row.target = '_blank';
    row.rel = 'noreferrer';

    const img = document.createElement('img');
    img.src = w.image || 'icons/icon48.png';
    row.appendChild(img);

    const mid = document.createElement('div');
    mid.className = 'mid';
    const nm = document.createElement('div');
    nm.className = 'name';
    nm.textContent = w.name;
    nm.title = w.name;
    mid.appendChild(nm);
    const metaLine = document.createElement('div');
    metaLine.className = 'meta';
    metaLine.appendChild(storeBadge(meta.label, meta.color));
    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.textContent = `${t('starredAt')} ${formatTaka(w.basePrice)}` +
      (w.target ? ` · 🎯 ${formatTaka(w.target)}` : '') +
      ` · ${new Date(w.lastChecked).toLocaleDateString()}`;
    metaLine.appendChild(sub);
    mid.appendChild(metaLine);
    row.appendChild(mid);

    const right = document.createElement('div');
    right.className = 'right';
    const pb = document.createElement('div');
    pb.className = 'pricebox';
    const dropped = w.lastPrice < w.basePrice;
    const raised = w.lastPrice > w.basePrice;
    pb.innerHTML = `<div><span class="price" style="${dropped ? 'color:#16a34a' : raised ? 'color:#c0392b' : ''}">${formatTaka(w.lastPrice)}</span></div>` +
      (dropped ? `<div class="unitprice" style="color:#16a34a">▼ ${formatTaka(w.basePrice - w.lastPrice)}</div>` : '');
    right.appendChild(pb);
    const tgt = document.createElement('button');
    tgt.className = 'rm';
    tgt.textContent = '🎯';
    tgt.title = t('watchTarget');
    tgt.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      const v = prompt(t('watchTarget'), w.target || Math.floor(w.basePrice * 0.9));
      if (v === null) return;
      await chrome.runtime.sendMessage({ type: 'WATCH_TARGET', key: w.key, target: Number(v) || 0 });
      renderWatch();
    });
    right.appendChild(tgt);
    const rm = document.createElement('button');
    rm.className = 'rm';
    rm.textContent = '🗑';
    rm.title = t('watchRemove');
    rm.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      await chrome.runtime.sendMessage({ type: 'WATCH_REMOVE', key: w.key });
      renderWatch();
    });
    right.appendChild(rm);
    row.appendChild(right);
    el.appendChild(row);
  }

  const check = document.createElement('button');
  check.className = 'sendbtn';
  check.disabled = watchBusy;
  check.textContent = watchBusy ? t('watchChecking') : t('watchRefresh');
  check.addEventListener('click', async () => {
    watchBusy = true;
    renderWatch();
    await chrome.runtime.sendMessage({ type: 'WATCH_CHECK' });
    watchBusy = false;
    renderWatch();
  });
  el.appendChild(check);
}

// ---- Daily Bazar view ----
let bazarBusy = false;

// Open the tab: render what we have, then refresh in the background if
// today's check hasn't run yet.
async function openBazar() {
  await renderBazar();
  if (bazarBusy) return;
  bazarBusy = true;
  renderBazar();
  const res = await chrome.runtime.sendMessage({ type: 'BAZAR_REFRESH' }).catch(() => null);
  bazarBusy = false;
  if (!$('#viewBazar').classList.contains('hidden')) renderBazar();
  return res;
}

function sparkline(series) {
  const pts = series.slice(-7);
  if (pts.length < 2) return null;
  const min = Math.min(...pts), max = Math.max(...pts);
  const span = max - min || 1;
  const W = 56, H = 16, step = W / (pts.length - 1);
  const coords = pts.map((v, i) =>
    `${(i * step).toFixed(1)},${(H - 2 - ((v - min) / span) * (H - 4)).toFixed(1)}`
  );
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'spark');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', coords.join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'currentColor');
  line.setAttribute('stroke-width', '1.5');
  svg.appendChild(line);
  return svg;
}

async function renderBazar() {
  const el = $('#bazarList');
  const { bazarHistory = {}, bazarLast } = await chrome.storage.local.get(['bazarHistory', 'bazarLast']);
  el.innerHTML = '';

  const hint = document.createElement('div');
  hint.className = 'carthint';
  hint.textContent = t('bazarHint');
  el.appendChild(hint);

  if (bazarBusy) {
    const d = document.createElement('div');
    d.className = 'carthint busy';
    d.textContent = '⏳ ' + t('bazarChecking');
    el.appendChild(d);
  }

  const lang = getLang();
  let any = false;

  for (const s of STAPLES) {
    const perStore = bazarHistory[s.id] || {};
    const latest = [];
    for (const [storeId, hist] of Object.entries(perStore)) {
      if (hist.length) latest.push({ storeId, ...hist[hist.length - 1] });
    }
    if (!latest.length) continue;
    any = true;
    latest.sort((a, b) => a.u - b.u);
    const best = latest[0];
    const meta = storeMeta[best.storeId] || { label: best.storeId, color: '#888' };

    // Cheapest unit price across stores, per day → change + sparkline
    const byDate = {};
    for (const hist of Object.values(perStore)) {
      for (const pt of hist) {
        if (!(pt.d in byDate) || pt.u < byDate[pt.d]) byDate[pt.d] = pt.u;
      }
    }
    const dates = Object.keys(byDate).sort();
    const series = dates.map(d => byDate[d]);
    const prev = series.length >= 2 ? series[series.length - 2] : null;
    const diff = prev != null ? Math.round((best.u - prev) * 100) / 100 : null;

    const row = document.createElement(best.url ? 'a' : 'div');
    row.className = 'bazrow';
    row.style.setProperty('--store-c', meta.color);
    if (best.url) { row.href = best.url; row.target = '_blank'; row.rel = 'noreferrer'; }

    const left = document.createElement('div');
    left.className = 'mid';
    const nm = document.createElement('div');
    nm.className = 'bazname';
    nm.textContent = lang === 'bn' ? s.bn : s.en;
    const sub = document.createElement('div');
    sub.className = 'meta';
    sub.appendChild(storeBadge(meta.label, meta.color));
    const item = document.createElement('span');
    item.className = 'sub';
    item.textContent = `${best.n} · ${formatTaka(best.p)}`;
    item.title = best.n;
    sub.appendChild(item);
    left.append(nm, sub);
    row.appendChild(left);

    const right = document.createElement('div');
    right.className = 'bazright';
    const up = document.createElement('div');
    up.className = 'bazunit';
    up.textContent = `${formatTaka(best.u)}/${best.l}`;
    right.appendChild(up);
    const line2 = document.createElement('div');
    line2.className = 'bazline2';
    if (diff != null && Math.abs(diff) >= 0.01) {
      const ch = document.createElement('span');
      ch.className = 'bazchange ' + (diff > 0 ? 'upbad' : 'downgood');
      const pct = prev ? Math.round(Math.abs(diff) / prev * 1000) / 10 : 0;
      ch.textContent = `${diff > 0 ? '▲' : '▼'} ${formatTaka(Math.abs(diff))} (${pct}%)`;
      ch.title = t('bazarVsYesterday');
      line2.appendChild(ch);
    }
    const spark = sparkline(series);
    if (spark) line2.appendChild(spark);
    if (line2.childNodes.length) right.appendChild(line2);
    row.appendChild(right);
    el.appendChild(row);
  }

  if (!any && !bazarBusy) {
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = t('bazarEmpty');
    el.appendChild(d);
  }

  const foot = document.createElement('div');
  foot.className = 'cartfoot';
  const when = document.createElement('span');
  when.className = 'sub';
  when.style.color = 'var(--muted)';
  when.textContent = bazarLast ? `${t('bazarUpdated')}: ${new Date(bazarLast.at).toLocaleString()}` : '';
  const check = document.createElement('button');
  check.className = 'clearbtn';
  check.disabled = bazarBusy;
  check.textContent = t('bazarCheckNow');
  check.addEventListener('click', async () => {
    if (bazarBusy) return;
    bazarBusy = true;
    renderBazar();
    await chrome.runtime.sendMessage({ type: 'BAZAR_REFRESH', force: true }).catch(() => null);
    bazarBusy = false;
    renderBazar();
  });
  foot.append(when, check);
  el.appendChild(foot);
}

// ---- Cart view ----
async function renderCart() {
  const cart = await getCart();
  refreshCartBadge();
  const el = $('#cartList');
  el.innerHTML = '';

  if (!cart.length) {
    el.innerHTML = `<div class="empty">${t('emptyCart')}</div>`;
    return;
  }

  const hint = document.createElement('div');
  hint.className = 'carthint';
  hint.textContent = t('cartHint');
  el.appendChild(hint);

  const groups = groupByStore(cart);
  let grand = 0;

  for (const [storeId, items] of Object.entries(groups)) {
    const meta = storeMeta[storeId] || { label: storeId, color: '#888' };
    const sub = subtotal(items);
    grand += sub;

    const box = document.createElement('div');
    box.className = 'cartgroup';

    const head = document.createElement('div');
    head.className = 'carthead';
    head.appendChild(storeBadge(meta.label, meta.color));
    const st = document.createElement('span');
    st.className = 'subtotal';
    st.textContent = `${t('subtotal')}: ${formatTaka(sub)}`;
    head.appendChild(st);
    box.appendChild(head);

    for (const item of items) {
      const key = itemKey(item);
      const row = document.createElement('div');
      row.className = 'cartrow';

      const img = document.createElement('img');
      img.src = item.image || 'icons/icon48.png';
      row.appendChild(img);

      const mid = document.createElement('div');
      mid.className = 'mid';
      const nm = document.createElement(item.url ? 'a' : 'div');
      nm.className = 'name';
      nm.textContent = item.name;
      nm.title = item.name;
      if (item.url) { nm.href = item.url; nm.target = '_blank'; }
      mid.appendChild(nm);
      const line = document.createElement('div');
      line.className = 'qtyline';
      const minus = qtyBtn('−', () => changeQty(key, item.qty - 1));
      const num = document.createElement('span');
      num.className = 'qtynum';
      num.textContent = item.qty;
      const plus = qtyBtn('+', () => changeQty(key, item.qty + 1));
      const rm = document.createElement('button');
      rm.className = 'rm';
      rm.textContent = '🗑';
      rm.title = t('remove');
      rm.addEventListener('click', async () => { await removeFromCart(key); renderCart(); });
      line.append(minus, num, plus, rm);
      mid.appendChild(line);
      row.appendChild(mid);

      const pr = document.createElement('div');
      pr.className = 'pricebox';
      pr.innerHTML = `<span class="price">${formatTaka(item.price * item.qty)}</span>`;
      row.appendChild(pr);

      box.appendChild(row);
    }

    const action = document.createElement('button');
    action.className = 'sendbtn';
    const busy = checkoutBusy && checkoutBusy.store === storeId;
    if (busy) {
      action.disabled = true;
      action.textContent = `${t('sending', { store: meta.label })} ${checkoutBusy.done}/${checkoutBusy.total}`;
    } else {
      action.textContent = t('sendToStore', { store: meta.label });
    }
    action.addEventListener('click', async () => {
      checkoutBusy = { store: storeId, done: 0, total: items.length };
      renderCart();
      const res = await chrome.runtime.sendMessage({ type: 'CHECKOUT_STORE', store: storeId });
      checkoutBusy = null;
      const note = document.createElement('div');
      note.className = 'carthint';
      note.textContent = res?.fail
        ? t('sendReport', { ok: res.ok, fail: res.fail })
        : t('sendDone');
      await renderCart();
      $('#cartList').prepend(note);
    });
    box.appendChild(action);
    el.appendChild(box);
  }

  const foot = document.createElement('div');
  foot.className = 'cartfoot';
  const total = document.createElement('b');
  total.textContent = `${t('grandTotal')}: ${formatTaka(grand)}`;
  const clear = document.createElement('button');
  clear.className = 'clearbtn';
  clear.textContent = t('clearCart');
  clear.addEventListener('click', async () => {
    if (confirm(t('clearConfirm'))) { await clearCart(); renderCart(); }
  });
  foot.append(total, clear);
  el.appendChild(foot);
}

function qtyBtn(sym, fn) {
  const b = document.createElement('button');
  b.className = 'qtybtn';
  b.textContent = sym;
  b.addEventListener('click', fn);
  return b;
}

async function changeQty(key, qty) {
  await setQty(key, qty);
  renderCart();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
