// Daraz (daraz.com.bd) — the catalog page has an ajax=true mode that returns
// the same JSON the storefront renders from. Sent with your cookies, so being
// logged in reduces the chance of a bot wall.

export const daraz = {
  id: 'daraz',
  label: 'Daraz',
  color: '#f57224',
  category: 'both',
  homepage: 'https://www.daraz.com.bd',
  searchUrl: q => `https://www.daraz.com.bd/catalog/?q=${encodeURIComponent(q)}`,
  type: 'api',

  async search(query, _settings) {
    const url = `https://www.daraz.com.bd/catalog/?ajax=true&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      credentials: 'include',
      headers: { accept: 'application/json, text/plain, */*' }
    });
    if (!res.ok) throw new Error(`Daraz responded ${res.status}`);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Daraz returned a non-JSON page (bot check or login wall). Open daraz.com.bd once in a tab, then retry.');
    }
    const items = data?.mods?.listItems || [];
    return items.map(it => ({
      store: 'daraz',
      name: it.name || '',
      price: it.price != null ? parseFloat(it.price) : null,
      oldPrice:
        it.originalPrice && parseFloat(it.originalPrice) > parseFloat(it.price || '0')
          ? parseFloat(it.originalPrice)
          : null,
      image: it.image || null,
      url: it.itemUrl ? (it.itemUrl.startsWith('//') ? 'https:' + it.itemUrl : it.itemUrl) : null,
      rating: it.ratingScore ? parseFloat(it.ratingScore) : null,
      reviews: it.review ? parseInt(it.review, 10) : null,
      seller: it.sellerName || null,
      stock: it.inStock ?? null,
      discountText: it.discount || null,
      sponsored: !!it.isSponsored
    })).filter(i => i.name && i.price != null && isFinite(i.price));
  }
};
