// Star Tech (startech.com.bd) — server-rendered OpenCart search page,
// parsed straight from the HTML (no DOM needed in the service worker).

export const startech = {
  id: 'startech',
  label: 'Star Tech',
  color: '#ef4a23',
  category: 'electronics',
  homepage: 'https://www.startech.com.bd',
  searchUrl: q => `https://www.startech.com.bd/product/search?search=${encodeURIComponent(q)}`,
  type: 'api',

  async search(query, _settings) {
    const res = await fetch(this.searchUrl(query), {
      credentials: 'include',
      headers: { accept: 'text/html' }
    });
    if (!res.ok) throw new Error(`Star Tech responded ${res.status}`);
    const html = await res.text();

    const blocks = html.split('<div class="p-item"');
    blocks.shift();
    const items = [];
    for (const b of blocks.slice(0, 24)) {
      const nm = b.match(/class="p-item-name">\s*<a href="([^"]+)">([^<]+)</);
      if (!nm) continue;
      const img = b.match(/<img[^>]+src="([^"]+)"/);
      const priceNew = b.match(/class="price-new">([\d,]+)/);
      const priceOld = b.match(/class="price-old">([\d,]+)/);
      const plain = b.match(/p-item-price">\s*(?:<span>)?([\d,]+)\s*৳/);
      const price = priceNew ? parseFloat(priceNew[1].replace(/,/g, ''))
        : plain ? parseFloat(plain[1].replace(/,/g, '')) : null;
      if (!price) continue; // "Call for price" / "Up Coming"
      items.push({
        store: 'startech',
        name: decodeEntities(nm[2].trim()),
        price,
        oldPrice: priceOld ? parseFloat(priceOld[1].replace(/,/g, '')) : null,
        image: img ? img[1] : null,
        url: nm[1],
        stock: !/Out Of Stock/i.test(b)
      });
    }
    return items;
  }
};

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');
}
