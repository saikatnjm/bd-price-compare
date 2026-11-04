// Arogga — online pharmacy (medicine category). Public JSON search API;
// prices are per base unit (per tablet/piece), with the MRP as oldPrice
// when a discount applies. Strictly price info + links — no health advice.

const API = 'https://api.arogga.com/general/v3/search';

export const arogga = {
  id: 'arogga',
  label: 'Arogga',
  color: '#14b8a6',
  category: 'medicine',
  homepage: 'https://www.arogga.com',
  searchUrl: q => `https://www.arogga.com/search?q=${encodeURIComponent(q)}`,
  type: 'api',

  async search(query) {
    const res = await fetch(`${API}?search=${encodeURIComponent(query)}&limit=24`, {
      headers: { accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`Arogga HTTP ${res.status}`);
    const data = await res.json();

    const items = [];
    for (const p of data?.data || []) {
      const v = Array.isArray(p.pv) ? p.pv[0] : null;
      const mrp = Number(v?.pv_mrp) || 0;
      const price = Number(v?.pv_b2c_discounted_price) || mrp;
      if (!price || price <= 0) continue;

      const unitLabel = (Array.isArray(p.pu) && p.pu[0]?.pu_label) || 'unit';
      const strip = Array.isArray(p.pu) ? p.pu.find(u => (u.pu_multiplier || 1) > 1) : null;

      const name =
        [p.p_name, p.p_strength, p.p_form].filter(Boolean).join(' ') +
        (p.p_generic_name?.trim() ? ` — ${p.p_generic_name.trim()}` : '') +
        (p.p_rx_req ? ' ℞' : '');

      const subBits = [`per ${unitLabel}`];
      if (strip?.pu_label && strip.pu_multiplier) {
        subBits.push(`${strip.pu_label} of ${strip.pu_multiplier}: ৳${Math.round(price * strip.pu_multiplier * 100) / 100}`);
      }
      if (p.p_brand_name || p.p_brand) subBits.push(p.p_brand_name || p.p_brand);

      items.push({
        store: 'arogga',
        name,
        price,
        oldPrice: mrp > price ? mrp : undefined,
        image: p.POSTER || p.attachedFiles_p_images?.[0]?.src,
        url: `https://www.arogga.com/search?q=${encodeURIComponent(p.p_name)}`,
        delivery: subBits.join(' · ')
      });
    }
    return items;
  }
};
