// Optional extra stores (off by default — tick them in Options). All are
// scraped in a background tab via the shared one-at-a-time queue, so they
// cost nothing unless enabled.

import { scrapeInTab, scrapeProductsInPage } from '../lib/tabScrape.js';

function tabStore({ id, label, color, category, homepage, buildUrl }) {
  return {
    id,
    label,
    color,
    category,
    homepage,
    searchUrl: buildUrl,
    type: 'tab',
    async search(query, _settings) {
      const url = buildUrl(query);
      const result = await scrapeInTab(
        url,
        scrapeProductsInPage,
        [{ query, driveSearch: false, maxWaitMs: 15000, limit: 24 }],
        { timeoutMs: 25000 }
      );
      if (!result) throw new Error(`${label} page did not respond.`);
      return (result.items || []).map(i => ({
        store: id,
        name: i.name,
        price: i.price,
        oldPrice: i.oldPrice,
        image: i.image,
        url: i.url || url
      }));
    }
  };
}

export const techland = tabStore({
  id: 'techland', label: 'Techland', color: '#16a34a', category: 'electronics',
  homepage: 'https://www.techlandbd.com',
  buildUrl: q => `https://www.techlandbd.com/index.php?route=product/search&search=${encodeURIComponent(q)}`
});

export const sumashtech = tabStore({
  id: 'sumashtech', label: 'Sumash Tech', color: '#db2777', category: 'electronics',
  homepage: 'https://www.sumashtech.com',
  buildUrl: q => `https://www.sumashtech.com/search?q=${encodeURIComponent(q)}`
});

export const globalbrand = tabStore({
  id: 'globalbrand', label: 'Global Brand', color: '#0891b2', category: 'electronics',
  homepage: 'https://www.globalbrand.com.bd',
  buildUrl: q => `https://www.globalbrand.com.bd/index.php?route=product/search&search=${encodeURIComponent(q)}`
});

export const othoba = tabStore({
  id: 'othoba', label: 'Othoba', color: '#65a30d', category: 'both',
  homepage: 'https://www.othoba.com',
  buildUrl: q => `https://www.othoba.com/search?q=${encodeURIComponent(q)}`
});
