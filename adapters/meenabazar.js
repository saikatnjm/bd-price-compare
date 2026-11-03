// Meena Bazar Online (meenabazaronline.com) — Angular SPA backed by
// mbonlineapi.com. SubUnitId/AreaId select the fulfilling store; 2/2 is the
// Dhaka default and can be changed in Options.

export const meenabazar = {
  id: 'meenabazar',
  label: 'Meena Bazar',
  color: '#00843d',
  category: 'grocery',
  homepage: 'https://meenabazaronline.com',
  searchUrl: q => `https://meenabazaronline.com/search/${encodeURIComponent(q)}`,
  type: 'api',

  async search(query, settings) {
    const body = {
      TagName: query,
      SubUnitId: Number(settings?.meenaSubUnitId) || 2,
      AreaId: Number(settings?.meenaAreaId) || 2,
      StartSl: 1,
      NoOfItem: 24,
      ThumbSize: 'lg'
    };
    const res = await fetch('https://mbonlineapi.com/api/front/search/product', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Meena Bazar responded ${res.status}`);
    const data = await res.json();
    const rows = data?.data?.product || [];
    return rows.map(p => ({
      store: 'meenabazar',
      name: p.ItemDisplayName || p.ItemDescription || '',
      price: p.DiscountSalesPrice ?? p.UnitSalesPrice ?? null,
      oldPrice:
        p.UnitSalesPrice != null &&
        p.DiscountSalesPrice != null &&
        p.UnitSalesPrice > p.DiscountSalesPrice
          ? p.UnitSalesPrice
          : null,
      image: p.ImageUrl || null,
      url: p.ItemSlug && p.ItemId
        ? `https://meenabazaronline.com/product/${encodeURIComponent(p.ItemSlug)}/${p.ItemId}`
        : null,
      unit: p.Unit || null,
      stock: p.StockQuantity != null ? p.StockQuantity > 0 : null
    })).filter(i => i.name && i.price != null);
  }
};
