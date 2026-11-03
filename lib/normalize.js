// Quantity parsing + unit-price math shared by background and popup.

const UNIT_ALIASES = {
  kg: ['kg', 'kgs', 'kilo', 'kilogram', 'kilograms', 'কেজি'],
  g: ['g', 'gm', 'gms', 'gram', 'grams', 'gr', 'গ্রাম'],
  l: ['l', 'ltr', 'ltrs', 'litre', 'litres', 'liter', 'liters', 'লিটার'],
  ml: ['ml', 'mililitre', 'milliliter', 'millilitre'],
  pcs: ['pcs', 'pc', 'pscs', 'piece', 'pieces', 'pices', 'pícs', 'টি', 'pcs.']
};

const ALIAS_TO_UNIT = {};
for (const [unit, aliases] of Object.entries(UNIT_ALIASES)) {
  for (const a of aliases) ALIAS_TO_UNIT[a] = unit;
}

const UNIT_PATTERN = Object.keys(ALIAS_TO_UNIT)
  .sort((a, b) => b.length - a.length)
  .map(a => a.replace(/\./g, '\\.'))
  .join('|');

// Matches e.g. "500gm", "1.5 L", "2 x 400 gm", "12 pcs"
const QTY_RE = new RegExp(
  `(?:(\\d+)\\s*[xX×]\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_PATTERN})\\b`,
  'gi'
);

// "180(±)10ml" / "180 ± 10 ml" / "180+/-10ml": the second number is a
// tolerance, not the size — keep only the nominal quantity ("180ml").
const TOLERANCE_RE = /(\d+(?:[.,]\d+)?)\s*(?:\(\s*(?:±|\+\/?-)\s*\)|±|\+\/-)\s*\d+(?:[.,]\d+)?\s*/g;
export function stripTolerance(s) {
  return (s || '').replace(TOLERANCE_RE, '$1');
}

// "Buy1 Get1 Free" / "B1G1" / "BOGO" / "2+1 free": the label size isn't what
// you take home. Returns the effective-quantity multiplier (B1G1 → 2).
export function bogoMultiplier(name) {
  if (!name) return 1;
  const n = v => (/one/i.test(v) ? 1 : parseInt(v, 10));
  let m =
    name.match(/\bbuy\s*(\d+|one)\s*,?\s*get\s*(\d+|one)\b/i) ||
    name.match(/\bb\s*(\d)\s*g\s*(\d)\b/i) ||
    name.match(/\b(\d+)\s*\+\s*(\d+)\s*(?:free|ফ্রি)/i);
  if (m) {
    const x = n(m[1]), y = n(m[2]);
    if (x >= 1 && y >= 1) return (x + y) / x;
  }
  if (/\bbogo\b/i.test(name) || /কিনলে[^\n।]{0,24}ফ্রি/.test(name)) return 2;
  return 1;
}

// Remove offer phrases so they never pollute match words ("sugar free" keeps
// its "free"; only buy-get constructions are dropped).
const BOGO_STRIP_RE = /\(?\s*buy\s*(?:\d+|one)\s*,?\s*get\s*(?:\d+|one)(?:\s*free)?\s*\)?|\bb\s*\d\s*g\s*\d\b|\bbogo\b|\b\d+\s*\+\s*\d+\s*(?:free|ফ্রি)\b/gi;
export function stripBogo(s) {
  return (s || '').replace(BOGO_STRIP_RE, ' ');
}

// Base units: g, ml, pcs. Returns {qty, baseUnit, display} or null.
export function parseQuantity(name) {
  if (!name) return null;
  const matches = [...stripTolerance(name).matchAll(QTY_RE)];
  if (!matches.length) return null;

  let grams = 0, mls = 0, pieces = 0;
  const parts = [];
  for (const m of matches) {
    const mult = m[1] ? parseFloat(m[1]) : 1;
    const num = parseFloat(m[2].replace(',', '.'));
    const unit = ALIAS_TO_UNIT[m[3].toLowerCase()] || ALIAS_TO_UNIT[m[3]];
    if (!unit || !isFinite(num)) continue;
    if (unit === 'kg') grams += mult * num * 1000;
    else if (unit === 'g') grams += mult * num;
    else if (unit === 'l') mls += mult * num * 1000;
    else if (unit === 'ml') mls += mult * num;
    else if (unit === 'pcs') pieces = Math.max(pieces, mult * num);
    parts.push(m[0].trim());
  }

  // "5gm 24 pcs" style multipacks: weight per piece times count
  if (grams > 0 && pieces > 1 && !/[xX×]/.test(name)) grams *= pieces;
  if (mls > 0 && pieces > 1 && !/[xX×]/.test(name)) mls *= pieces;

  // Buy-get offers multiply what you actually take home (180ml B1G1 = 360ml)
  const bogo = bogoMultiplier(name);
  if (bogo > 1) { grams *= bogo; mls *= bogo; pieces *= bogo; }
  const suffix = bogo > 1 ? ` ×${String(Math.round(bogo * 10) / 10)}` : '';
  const display = parts.join(' ') + suffix;

  if (grams > 0) return { qty: grams, baseUnit: 'g', display, bogo: bogo > 1 };
  if (mls > 0) return { qty: mls, baseUnit: 'ml', display, bogo: bogo > 1 };
  if (pieces > 0) return { qty: pieces, baseUnit: 'pcs', display, bogo: bogo > 1 };
  return null;
}

// What size is the user comparing against? First size in the query
// (tolerance-stripped), scaled by any buy-get offer.
export function querySize(query) {
  const q = stripBogo(stripTolerance(query || ''));
  const m = q.match(/(\d+(?:[.,]\d+)?)\s*(kg|gm|gram|g|ml|ltr|litre|liter|l)\b/i);
  if (!m) return null;
  const num = parseFloat(m[1].replace(',', '.'));
  const u = m[2].toLowerCase();
  const targetBase = ['kg', 'g', 'gm', 'gram'].includes(u) ? 'g' : 'ml';
  const big = u === 'kg' || u === 'l' || u === 'ltr' || u === 'litre' || u === 'liter';
  return { targetBase, targetQty: (big ? num * 1000 : num) * bogoMultiplier(query) };
}

// Returns {value, label} e.g. {value: 960, label: '৳960/kg'} or null.
export function unitPrice(price, quantity) {
  if (!quantity || !price || price <= 0 || quantity.qty <= 0) return null;
  if (quantity.baseUnit === 'g') {
    return { value: (price / quantity.qty) * 1000, label: 'kg', per: 1000 };
  }
  if (quantity.baseUnit === 'ml') {
    return { value: (price / quantity.qty) * 1000, label: 'L', per: 1000 };
  }
  return { value: price / quantity.qty, label: 'pc', per: 1 };
}

export function formatTaka(n) {
  if (n == null || !isFinite(n)) return '';
  const rounded = Math.round(n * 100) / 100;
  const s = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2);
  return '৳' + Number(s).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

// Attach quantity/unit-price info to a result item in place.
export function enrich(item) {
  const q = parseQuantity(item.name);
  if (q) {
    item.quantity = q;
    const up = unitPrice(item.price, q);
    if (up) item.unitPrice = up;
  }
  return item;
}

const STOPWORDS = new Set(['the', 'a', 'an', 'with', 'and', '&', 'for', 'of', 'pack']);
const QTY_TOKEN_RE = /^\d+(?:[.,]\d+)?(?:gm|g|kg|ml|l|ltr|litre|liter|pcs|pc)?$/i;

// Meaningful query words: drop stopwords and size tokens like "200gm",
// whose formatting varies between stores ("200 gm", "0.2kg"…).
export function queryWords(query) {
  return stripBogo(stripTolerance(query))
    .toLowerCase()
    .split(/\s+/)
    // A token must contain a letter or digit — drops stray "৳", "-", "(new)" debris
    .filter(w => w && /[\p{L}\p{N}]/u.test(w) && !STOPWORDS.has(w) && !QTY_TOKEN_RE.test(w));
}

// Fraction of meaningful query words found in the name (0..1).
export function matchScore(name, query) {
  if (!name) return 0;
  const words = queryWords(query);
  if (!words.length) return 1;
  const hay = name.toLowerCase();
  return words.filter(w => hay.includes(w)).length / words.length;
}

// Every meaningful word present? (used by the popup's strict filter)
export function matchesQuery(name, query) {
  return matchScore(name, query) >= 0.999;
}
