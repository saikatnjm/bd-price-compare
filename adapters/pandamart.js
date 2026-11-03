// Pandamart (foodpanda.com.bd) — the API sits behind PerimeterX, so we open
// your local pandamart's page in a background tab (your logged-in session
// passes the check), run its own search box and read the rendered results.
// The content script saves your pandamart URL the first time you visit it.

import { scrapeInTab, scrapeProductsInPage } from '../lib/tabScrape.js';

export const pandamart = {
  id: 'pandamart',
  label: 'Pandamart',
  color: '#d70f64',
  category: 'grocery',
  homepage: 'https://www.foodpanda.com.bd',
  searchUrl: () => 'https://www.foodpanda.com.bd',
  type: 'tab',

  async search(query, settings) {
    const base = settings?.pandamartUrl;
    if (!base) {
      const err = new Error(
        'Pandamart not set up yet: open foodpanda.com.bd once and visit your local pandamart — the extension will remember it.'
      );
      err.code = 'SETUP_NEEDED';
      throw err;
    }
    this.searchUrl = () => base;
    const result = await scrapeInTab(
      base,
      scrapeProductsInPage,
      [{ query, driveSearch: true, maxWaitMs: 18000, limit: 24 }],
      { timeoutMs: 30000 }
    );
    if (!result) throw new Error('Pandamart page did not respond (bot check or slow load).');
    return (result.items || []).map(i => ({
      store: 'pandamart',
      name: i.name,
      price: i.price,
      oldPrice: i.oldPrice,
      image: i.image,
      url: i.url || base
    }));
  }
};
