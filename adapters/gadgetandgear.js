// Gadget & Gear (gadgetandgear.com) — Next.js app whose search renders
// client-side behind Cloudflare, so it's scraped in a background tab.

import { scrapeInTab, scrapeProductsInPage } from '../lib/tabScrape.js';

export const gadgetandgear = {
  id: 'gadgetandgear',
  label: 'Gadget & Gear',
  color: '#7c3aed',
  category: 'electronics',
  homepage: 'https://gadgetandgear.com',
  searchUrl: q => `https://gadgetandgear.com/search?keyword=${encodeURIComponent(q)}`,
  type: 'tab',

  async search(query, _settings) {
    const url = this.searchUrl(query);
    const result = await scrapeInTab(
      url,
      scrapeProductsInPage,
      [{ query, driveSearch: false, maxWaitMs: 16000, limit: 24 }],
      { timeoutMs: 26000 }
    );
    if (!result) throw new Error('Gadget & Gear page did not respond.');
    return (result.items || []).map(i => ({
      store: 'gadgetandgear',
      name: i.name,
      price: i.price,
      oldPrice: i.oldPrice,
      image: i.image,
      url: i.url || url
    }));
  }
};
