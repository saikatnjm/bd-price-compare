// Adds a small ৳ compare button next to the product title on ANY shop's
// product page. One click → the comparison overlay, no typing. Everything
// runs locally; nothing about the page leaves the browser.

(function () {
  if (window.__bdpcCompareBtn) return;
  window.__bdpcCompareBtn = true;

  const BTN_CLASS = 'bdpc-compare-btn';

  // Our own stores: on these, trust the first h1 even if the <title> differs.
  const KNOWN_PRODUCT_URLS = [
    /shwapno\.com\/(?!search|cart|checkout|$)[^/?#]+$/i,
    /meenabazaronline\.com\/product\//i,
    /daraz\.com\.bd\/products\//i,
    /foodpanda\.com\.bd\/.*darkstore/i,
    /chaldal\.com\/[^/?#]+$/i,
    /pickaboo\.com\/product-detail\//i
  ];

  const BUY_RE = /add to (bag|cart|basket)|buy now|order now|কিনুন|অর্ডার|কার্টে|ব্যাগে/i;
  const PRICE_RE = /৳|Tk\.?\s?\d|BDT|₹|\$\s?\d/;

  function knownProductUrl() {
    return KNOWN_PRODUCT_URLS.some(re => re.test(location.href));
  }

  function commercialPage() {
    if (!PRICE_RE.test(document.body.innerText.slice(0, 20000))) return false;
    return [...document.querySelectorAll('button, [role="button"], input[type="submit"]')]
      .some(b => BUY_RE.test(b.textContent || b.value || ''));
  }

  function visibleH1s() {
    return [...document.querySelectorAll('h1')].filter(h => {
      const t = h.textContent.replace(/৳\s*$/, '').trim();
      if (t.length < 8 || t.length > 160) return false;
      const r = h.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  // A product page's h1 is almost always echoed in the document title;
  // that filters out "Trending"-style section headings on generic sites.
  function findTitleEl() {
    const h1s = visibleH1s();
    if (!h1s.length) return null;
    const docTitle = document.title.toLowerCase();
    const echoed = h1s.find(h =>
      docTitle.includes(h.textContent.trim().toLowerCase().slice(0, 15))
    );
    return echoed || (knownProductUrl() ? h1s[0] : null);
  }

  function cleanTitle(raw) {
    // "Buy1 Get1" lives inside parentheses we strip — keep it as a canonical
    // BxGy token so the comparison knows the real take-home quantity.
    let bogo = '';
    const bm =
      raw.match(/\bbuy\s*(\d+|one)\s*,?\s*get\s*(\d+|one)\b/i) ||
      raw.match(/\bb\s*(\d)\s*g\s*(\d)\b/i);
    if (bm) {
      const n = v => (/one/i.test(v) ? 1 : parseInt(v, 10));
      bogo = ` B${n(bm[1])}G${n(bm[2])}`;
    } else if (/\bbogo\b/i.test(raw)) {
      bogo = ' B1G1';
    }
    const base = raw
      // "180(±)10ml" → "180ml": drop the tolerance, keep the nominal size
      .replace(/(\d+(?:[.,]\d+)?)\s*(?:\(\s*(?:±|\+\/?-)\s*\)|±|\+\/-)\s*\d+(?:[.,]\d+)?\s*/g, '$1')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .slice(0, 8)
      .join(' ');
    return base + bogo;
  }

  async function makeButton(title) {
    const { uiLang } = await chrome.storage.sync.get('uiLang');
    const bn = uiLang === 'bn';
    const btn = document.createElement('button');
    btn.className = BTN_CLASS;
    btn.type = 'button';
    btn.textContent = '৳';
    btn.title = bn ? 'অন্য দোকানের দাম তুলনা করুন' : 'Compare prices at other stores';
    btn.style.cssText = [
      'all:initial', 'cursor:pointer', 'display:inline-grid', 'place-items:center',
      'width:22px', 'height:22px', 'margin-left:8px', 'border-radius:50%',
      'background:#0f766e', 'color:#fff', 'font:700 13px/1 system-ui,sans-serif',
      'vertical-align:middle', 'box-shadow:0 1px 4px rgba(0,0,0,.25)',
      'transition:transform .12s'
    ].join(';');
    btn.addEventListener('mouseenter', () => (btn.style.transform = 'scale(1.15)'));
    btn.addEventListener('mouseleave', () => (btn.style.transform = ''));
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      btn.style.opacity = '.5';
      chrome.runtime.sendMessage(
        { type: 'COMPARE_HERE', query: cleanTitle(title) },
        () => setTimeout(() => (btn.style.opacity = '1'), 800)
      );
    });
    return btn;
  }

  async function attach() {
    if (!knownProductUrl() && !commercialPage()) return false;
    const titleEl = findTitleEl();
    if (!titleEl) return false;
    const oldBtn = titleEl.querySelector('.' + BTN_CLASS);
    const title = titleEl.textContent.replace(/৳\s*$/, '').trim();
    if (oldBtn && titleEl.dataset.bdpc === title) return true;
    if (oldBtn) oldBtn.remove(); // SPA swapped the title text; re-bind
    titleEl.dataset.bdpc = title;
    titleEl.appendChild(await makeButton(title));
    return true;
  }

  // SPAs render late and swap pages without reloading. Retry a few times
  // per URL, then go quiet until the URL changes — keeps idle cost ~zero.
  let lastHref = location.href;
  let attempts = 0;
  attach().then(ok => { if (ok) attempts = 99; });
  setInterval(async () => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      attempts = 0;
    }
    if (attempts >= 8) return;
    attempts++;
    if (await attach()) attempts = 99;
  }, 1500);
})();
