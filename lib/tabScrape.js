// Opens a background tab, runs an in-page scraper, closes the tab.
// Used for stores whose APIs sit behind bot protection (PerimeterX /
// Cloudflare): a real tab in the user's browser passes those checks.

// All tab scrapes share one queue: only ONE background tab exists at a time,
// whatever number of stores need scraping (keeps memory and CPU flat).
let tabQueue = Promise.resolve();

export function scrapeInTab(url, pageFunc, args, opts) {
  const run = tabQueue.then(() => scrapeInTabNow(url, pageFunc, args, opts));
  tabQueue = run.catch(() => {});
  return run;
}

async function scrapeInTabNow(url, pageFunc, args, { timeoutMs = 25000 } = {}) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForLoad(tab.id, Math.min(timeoutMs, 15000));
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: pageFunc,
      args
    });
    return results?.[0]?.result;
  } finally {
    chrome.tabs.remove(tab.id).catch?.(() => {});
  }
}

export function waitForLoad(tabId, timeoutMs) {
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then(t => {
      if (t.status === 'complete') finish();
    }).catch(finish);
    setTimeout(finish, timeoutMs);
  });
}

// Self-contained function injected into the page (MAIN world). It may drive
// the page's own search box, then extracts product cards generically:
// any small container that holds an image and a taka price.
export function scrapeProductsInPage(opts) {
  const { query, driveSearch, maxWaitMs, limit } = opts;
  const PRICE_RE = /(?:৳|Tk\.?|BDT|Taka)\s*([\d,]+(?:\.\d+)?)/i;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function setNativeValue(input, value) {
    const proto = input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findSearchInput() {
    const sels = [
      'input[type="search"]',
      'input[data-testid*="search" i]',
      '[data-testid*="search" i] input',
      'input[placeholder*="search" i]',
      'input[aria-label*="search" i]',
      'input[name*="search" i]'
    ];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  function priceFromText(text) {
    const m = text.match(PRICE_RE);
    return m ? parseFloat(m[1].replace(/,/g, '')) : null;
  }

  function extractCards() {
    const priceNodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent;
      if (t && t.length < 80 && PRICE_RE.test(t)) priceNodes.push(node.parentElement);
    }

    const containers = new Set();
    for (const el of priceNodes) {
      let cur = el, found = null;
      for (let i = 0; i < 7 && cur && cur !== document.body; i++) {
        if (cur.querySelector && cur.querySelector('img') &&
            cur.textContent.replace(/\s+/g, ' ').length < 600) {
          found = cur;
        }
        cur = cur.parentElement;
      }
      if (found) containers.add(found);
    }

    // Drop containers that contain other containers (keep innermost cards)
    const list = [...containers].filter(c =>
      ![...containers].some(o => o !== c && c.contains(o))
    );

    // No leading \b: badges render as "৳100OFF" (digit glued to the word)
    const BADGE_RE = /(off|save|discount|cashback|coupon)(?![a-z])|ছাড়|সেভ/i;
    const isStruck = el => {
      for (let e = el, i = 0; e && i < 4; e = e.parentElement, i++) {
        if (e.tagName === 'DEL' || e.tagName === 'S') return true;
        try {
          if (getComputedStyle(e).textDecorationLine.includes('line-through')) return true;
        } catch { /* detached */ }
      }
      return false;
    };

    const items = [];
    for (const card of list) {
      const img = card.querySelector('img');
      const link = card.closest('a[href]') || card.querySelector('a[href]');
      const leaves = [...card.querySelectorAll('*')].filter(e => e.childElementCount === 0);
      const texts = leaves.map(e => e.textContent.trim());

      const current = [], struck = [];
      leaves.forEach((el, i) => {
        const t = texts[i];
        if (!t || BADGE_RE.test(t)) return;
        // Badges like "৳100 OFF" often split over sibling elements
        const ctx = el.parentElement ? el.parentElement.textContent.replace(/\s+/g, ' ') : '';
        if (ctx.length < 40 && BADGE_RE.test(ctx)) return;
        const p = priceFromText(t);
        if (p == null || p <= 0) return;
        (isStruck(el) ? struck : current).push(p);
      });
      if (!current.length && !struck.length) continue;

      const nameCandidates = texts
        .filter(t => t && !PRICE_RE.test(t) && t.length >= 8 && !/^[\d.,%\s]+$/.test(t) && !BADGE_RE.test(t))
        .sort((a, b) => b.length - a.length);
      const altName = img && img.alt && img.alt.length >= 8 && !/[-_]\d*$/.test(img.alt) ? img.alt : null;
      const name = nameCandidates[0] || altName || (img && img.alt) || '';
      if (!name) continue;

      const price = current.length ? current[0] : Math.min(...struck);
      const oldPrice = struck.length && Math.max(...struck) > price ? Math.max(...struck) : null;
      items.push({
        name: name.replace(/\s+/g, ' ').trim().slice(0, 160),
        price,
        oldPrice: oldPrice && oldPrice > price ? oldPrice : null,
        image: img ? img.currentSrc || img.src : null,
        url: link ? link.href : location.href
      });
      if (items.length >= (limit || 24)) break;
    }
    return items;
  }

  function relevant(items) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter(i => {
      const n = i.name.toLowerCase();
      return words.some(w => n.includes(w));
    });
  }

  return (async () => {
    const deadline = Date.now() + (maxWaitMs || 15000);

    if (driveSearch) {
      let input = null;
      while (!input && Date.now() < deadline) {
        input = findSearchInput();
        if (!input) await sleep(500);
      }
      if (input) {
        input.focus();
        setNativeValue(input, query);
        await sleep(300);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        const form = input.closest('form');
        if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    }

    let best = [];
    while (Date.now() < deadline) {
      await sleep(900);
      const rel = relevant(extractCards());
      if (rel.length > best.length) best = rel;
      if (best.length >= 6) break;
    }
    return { items: best, pageUrl: location.href, title: document.title };
  })();
}
