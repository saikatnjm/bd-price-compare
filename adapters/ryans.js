// Ryans (ryans.com) — Cloudflare-guarded, so searched in a brief background
// tab where the user's own browser session passes the check.

import { scrapeInTab, scrapeProductsInPage } from '../lib/tabScrape.js';

export const ryans = {
  id: 'ryans',
  label: 'Ryans',
  color: '#2563eb',
  category: 'electronics',
  homepage: 'https://www.ryans.com',
  searchUrl: q => `https://www.ryans.com/search?q=${encodeURIComponent(q)}`,
  type: 'tab',

  async search(query, _settings) {
    const url = this.searchUrl(query);
    const result = await scrapeInTab(
      url,
      scrapeProductsInPage,
      [{ query, driveSearch: false, maxWaitMs: 15000, limit: 24 }],
      { timeoutMs: 25000 }
    );
    if (!result) throw new Error('Ryans page did not respond (open ryans.com once, then retry).');
    return (result.items || []).map(i => ({
      store: 'ryans',
      name: i.name,
      price: i.price,
      oldPrice: i.oldPrice,
      image: i.image,
      url: i.url || url
    }));
  }
};
