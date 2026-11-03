// Shwapno (shwapno.com) — public JSON search API, uses your site cookies
// so results reflect your selected outlet/dark store when you're logged in.

export const shwapno = {
  id: 'shwapno',
  label: 'Shwapno',
  color: '#e2136e',
  category: 'grocery',
  homepage: 'https://www.shwapno.com',
  searchUrl: q => `https://www.shwapno.com/search?q=${encodeURIComponent(q)}`,
  type: 'api',

  async search(query, _settings) {
    const url = `https://www.shwapno.com/api/search?q=${encodeURIComponent(query)}&pageNumber=1&requestType=0`;
    const res = await fetch(url, {
      credentials: 'include',
      headers: { accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`Shwapno responded ${res.status}`);
    const data = await res.json();
    const rows = data?.products || [];
    return rows.map(row => {
      const p = row.product || row;
      const price = p?.price?.priceValue ?? null;
      const discount = p?.price?.discountAmountValue || 0;
      return {
        store: 'shwapno',
        name: p?.name || '',
        price,
        oldPrice: discount > 0 && price != null ? price + discount : null,
        image: p?.picture?.largeDeviceUrl?.imageUrl || p?.picture?.smallDeviceUrl?.imageUrl || null,
        url: p?.seName ? `https://www.shwapno.com/${p.seName}` : null,
        unit: p?.unit || null,
        stock: p?.stock ? p.stock === 'InStock' : null,
        delivery: p?.deliveryInfo || null
      };
    }).filter(i => i.name && i.price != null);
  }
};
