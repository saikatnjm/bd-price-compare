// Pickaboo (pickaboo.com) — Next.js, but the search page arrives server-
// rendered with the product list embedded in the RSC payload, so one direct
// fetch is enough (no background tab).

export const pickaboo = {
  id: 'pickaboo',
  label: 'Pickaboo',
  color: '#0ea5e9',
  category: 'electronics',
  homepage: 'https://www.pickaboo.com',
  searchUrl: q => `https://www.pickaboo.com/search-result/${encodeURIComponent(q)}`,
  type: 'api',

  async search(query, _settings) {
    const res = await fetch(this.searchUrl(query), {
      credentials: 'include',
      headers: { accept: 'text/html' }
    });
    if (!res.ok) throw new Error(`Pickaboo responded ${res.status}`);
    const html = await res.text();

    // Records appear as escaped JSON: \"product_name\":\"...\",...
    const re = /\\"product_name\\":\\"(.*?)\\",\\"sku\\":.*?\\"slug\\":\\"(.*?)\\",.*?\\"stock_available\\":(true|false),.*?\\"product_price\\":([\d.]+),\\"product_specialPrice\\":([\d.]+|null),.*?\\"rating\\":\\"([\d.]*)\\",\\"rating_count\\":\\"(\d*)\\",\\"product_img\\":\\"(https:[^\\]+?)\\"/g;
    const items = [];
    const seen = new Set();
    let m;
    while ((m = re.exec(html)) && items.length < 24) {
      const [, rawName, slug, stock, priceS, specialS, rating, ratingCount, img] = m;
      if (seen.has(slug)) continue;
      seen.add(slug);
      const price = specialS !== 'null' ? parseFloat(specialS) : parseFloat(priceS);
      const base = parseFloat(priceS);
      if (!price) continue;
      items.push({
        store: 'pickaboo',
        name: decodeRsc(rawName),
        price,
        oldPrice: base > price ? base : null,
        image: img,
        url: `https://www.pickaboo.com/product-detail/${slug}`,
        stock: stock === 'true',
        rating: rating ? parseFloat(rating) : null,
        reviews: ratingCount ? parseInt(ratingCount, 10) : null
      });
    }
    return items;
  }
};

function decodeRsc(s) {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\\/g, '\\')
    .replace(/\\"/g, '"')
    .trim();
}
