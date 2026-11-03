// Chaldal (chaldal.com) — optional extra store (off by default; enable in
// Options). Cloudflare-guarded SPA, so we scrape its search page in a
// background tab.

import { scrapeInTab, scrapeProductsInPage } from '../lib/tabScrape.js';

export const chaldal = {
  id: 'chaldal',
  label: 'Chaldal',
  color: '#f9a825',
  category: 'grocery',
  homepage: 'https://chaldal.com',
  searchUrl: q => `https://chaldal.com/search/${encodeURIComponent(q)}`,
  type: 'tab',

  async search(query, _settings) {
    const url = this.searchUrl(query);
    const result = await scrapeInTab(
      url,
      scrapeProductsInPage,
      [{ query, driveSearch: false, maxWaitMs: 15000, limit: 24 }],
      { timeoutMs: 25000 }
    );
    if (!result) throw new Error('Chaldal page did not respond.');
    return (result.items || []).map(i => ({
      store: 'chaldal',
      name: i.name,
      price: i.price,
      oldPrice: i.oldPrice,
      image: i.image,
      url: i.url || url
    }));
  }
};
