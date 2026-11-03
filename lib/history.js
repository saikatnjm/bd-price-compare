// Price history: every search quietly logs one price point per item per day
// (locally, nothing leaves the browser). After a few days of use this powers
// "lowest in 30 days" badges and the fake-discount check: a strikethrough
// "old price" that the store never actually charged recently gets flagged.

const MAX_ITEMS = 600;   // prune the log when it grows past this…
const PRUNE_TO = 500;    // …down to the most recently seen items
const MAX_PTS = 60;      // days kept per item

const today = () => new Date().toISOString().slice(0, 10);

// Identity: store + URL (sans query) when there is one, else the name.
const keyOf = i =>
  (i.store + '|' + (((i.url || '').split('?')[0]) || (i.name || '').toLowerCase())).slice(0, 300);

// storage.local read-modify-write must not interleave across parallel
// adapters — writes go through one chain.
let chain = Promise.resolve();

export function logResults(items) {
  chain = chain.then(() => doLog(items)).catch(() => {});
  return chain;
}

async function doLog(items) {
  const usable = (items || []).filter(i => i && i.price > 0);
  if (!usable.length) return;
  const { priceLog = {} } = await chrome.storage.local.get('priceLog');
  const d = today();
  for (const i of usable) {
    const rec = (priceLog[keyOf(i)] ||= { s: i.store, pts: [] });
    rec.t = Date.now();
    const last = rec.pts[rec.pts.length - 1];
    if (last && last.d === d) last.p = i.price;
    else rec.pts.push({ d, p: i.price });
    while (rec.pts.length > MAX_PTS) rec.pts.shift();
  }
  const keys = Object.keys(priceLog);
  if (keys.length > MAX_ITEMS) {
    keys.sort((a, b) => (priceLog[a].t || 0) - (priceLog[b].t || 0));
    for (const k of keys.slice(0, keys.length - PRUNE_TO)) delete priceLog[k];
  }
  await chrome.storage.local.set({ priceLog });
}

// Attach {lo, hi, n, lowest?, claim?} to each item that has history from
// BEFORE today. claim judges the strikethrough oldPrice:
//   'real'  — the store really charged about that much recently
//   'fake'  — 5+ days of data and it never sold within 15% of the "old price"
export async function attachHistory(items) {
  const { priceLog = {} } = await chrome.storage.local.get('priceLog');
  const d = today();
  for (const i of items || []) {
    const rec = priceLog[keyOf(i)];
    if (!rec) continue;
    const past = rec.pts.filter(p => p.d !== d);
    if (!past.length) continue;
    const ps = past.map(p => p.p);
    const hist = { lo: Math.min(...ps), hi: Math.max(...ps), n: past.length };
    if (i.price <= hist.lo * 1.02) hist.lowest = true;
    if (i.oldPrice) {
      if (hist.hi >= i.oldPrice * 0.92) hist.claim = 'real';
      else if (past.length >= 5 && hist.hi < i.oldPrice * 0.85) hist.claim = 'fake';
    }
    i.hist = hist;
  }
  return items;
}
