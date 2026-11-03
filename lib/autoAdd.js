// Auto "add to cart" on a store's own product page: open a background tab,
// click the store's real add button with the user's session, close on success.

// Self-contained, injected into product pages.
export function addToCartOnPage(opts) {
  const { qty, patterns } = opts;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const res = new RegExp(patterns.join('|'), 'i');

  function visible(el) {
    if (!el || el.disabled) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function findAddButton() {
    const candidates = [...document.querySelectorAll('button, [role="button"], a')];
    // Prefer the most specific (shortest matching text) visible button
    const matches = candidates.filter(el => {
      if (!visible(el)) return false;
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const aria = el.getAttribute('aria-label') || '';
      return (txt.length < 60 && res.test(txt)) || res.test(aria);
    });
    matches.sort((a, b) => a.textContent.trim().length - b.textContent.trim().length);
    return matches[0] || null;
  }

  return (async () => {
    const deadline = Date.now() + 15000;
    let btn = null;
    while (!btn && Date.now() < deadline) {
      btn = findAddButton();
      if (!btn) await sleep(600);
    }
    if (!btn) return { ok: false, clicked: 0, reason: 'add button not found' };

    let clicked = 0;
    for (let i = 0; i < qty; i++) {
      btn = findAddButton() || btn;
      btn.scrollIntoView({ block: 'center' });
      btn.click();
      clicked++;
      await sleep(800 + Math.random() * 700);
    }
    return { ok: true, clicked };
  })();
}

// Pandamart darkstore pages are one SPA: search the item by name in the
// page's own search box, then click the matching product card's add button.
export function addToCartOnDarkstore(opts) {
  const { name, qty } = opts;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function setNativeValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findSearchInput() {
    const sels = [
      'input[type="search"]', 'input[data-testid*="search" i]',
      '[data-testid*="search" i] input', 'input[placeholder*="search" i]',
      'input[aria-label*="search" i]', 'input[name*="search" i]'
    ];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  function findCardAddButton() {
    const words = name.toLowerCase().split(/\s+/).filter(w => w.length > 2).slice(0, 4);
    const buttons = [...document.querySelectorAll('button, [role="button"]')];
    for (const b of buttons) {
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      const txt = (b.textContent || '').trim();
      const isAdd = /add|\+/.test(aria) || txt === '+' || /^add\b/i.test(txt);
      if (!isAdd) continue;
      let card = b;
      for (let i = 0; i < 6 && card; i++) {
        const t = (card.textContent || '').toLowerCase();
        if (words.filter(w => t.includes(w)).length >= Math.min(2, words.length) && t.length < 800) {
          return b;
        }
        card = card.parentElement;
      }
    }
    return null;
  }

  return (async () => {
    const deadline = Date.now() + 20000;

    let input = null;
    while (!input && Date.now() < deadline) {
      input = findSearchInput();
      if (!input) await sleep(600);
    }
    if (input) {
      input.focus();
      setNativeValue(input, name);
      await sleep(400);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      const form = input.closest('form');
      if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }

    let btn = null;
    while (!btn && Date.now() < deadline) {
      await sleep(800);
      btn = findCardAddButton();
    }
    if (!btn) return { ok: false, clicked: 0, reason: 'product card not found' };

    let clicked = 0;
    for (let i = 0; i < qty; i++) {
      btn.scrollIntoView({ block: 'center' });
      btn.click();
      clicked++;
      await sleep(800 + Math.random() * 700);
      // After the first add, foodpanda swaps the button for a +/- stepper
      if (i < qty - 1) {
        const plus = [...document.querySelectorAll('button, [role="button"]')].find(b => {
          const aria = (b.getAttribute('aria-label') || '').toLowerCase();
          return /increase|increment|plus/.test(aria);
        });
        if (plus) btn = plus;
        else btn = findCardAddButton() || btn;
      }
    }
    return { ok: true, clicked };
  })();
}

export const STORE_CHECKOUT = {
  shwapno: {
    cartUrl: 'https://www.shwapno.com/cart',
    patterns: ['add to bag', 'add to cart', 'ব্যাগে যোগ']
  },
  meenabazar: {
    cartUrl: 'https://meenabazaronline.com/checkout',
    patterns: ['add to bag', 'add to cart', 'add to basket', 'কার্টে']
  },
  daraz: {
    cartUrl: 'https://cart.daraz.com.bd/shopping_cart',
    patterns: ['^add to cart$', 'add to cart']
  },
  pandamart: {
    cartUrl: null, // the darkstore page itself shows the cart
    darkstore: true
  },
  chaldal: {
    cartUrl: 'https://chaldal.com/checkout',
    patterns: ['add to bag', 'add to cart', '^\\+$']
  },
  startech: {
    cartUrl: 'https://www.startech.com.bd/checkout/cart',
    patterns: ['^add to cart$', 'add to cart']
  },
  ryans: {
    cartUrl: 'https://www.ryans.com/cart-view',
    patterns: ['^add to cart$', 'add to cart', 'buy now']
  },
  gadgetandgear: {
    cartUrl: 'https://gadgetandgear.com/cart',
    patterns: ['^add to cart$', 'add to cart', 'buy now']
  },
  pickaboo: {
    cartUrl: 'https://www.pickaboo.com/cart',
    patterns: ['^add to cart$', 'add to cart', 'buy now']
  }
};
