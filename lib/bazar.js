// Daily Bazar: once a day, fetch today's prices for the staple items every
// Bangladeshi household buys, from the direct-API grocery stores only
// (Shwapno + Meena Bazar — no background tabs), and keep 30 days of history
// so the popup can show আজকের বাজার দর with day-over-day change.

import { enrich } from './normalize.js';

// Whole-word match: staple queries are plain words, and substring matching
// bites here ("rui" is inside "fRUIt" — a biscuit once won as rui fish).
function tokenScore(name, query) {
  const hay = ' ' + name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ') + ' ';
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  return words.filter(w => hay.includes(' ' + w + ' ')).length / words.length;
}

// queries: the first is what we search; a name counts as a match when it
// matches ANY of them (stores spell "soyabean"/"mosur" differently).
// range: plausible unit-price band (৳ per kg/L/pc) — anything outside is a
// snack, a frozen item or a parsing glitch, never the staple itself.
export const STAPLES = [
  { id: 'rice',   queries: ['miniket rice', 'miniket chal'], en: 'Rice (Miniket)', bn: 'চাল (মিনিকেট)',
    base: 'g', range: [40, 200], exclude: ['puffed', 'flour', 'powder', 'muri'] },
  { id: 'oil',    queries: ['soybean oil', 'soyabean oil'],  en: 'Soybean oil',    bn: 'সয়াবিন তেল',
    base: 'ml', range: [100, 300], exclude: ['spray', 'mustard', 'olive'] },
  { id: 'onion',  queries: ['onion'],                        en: 'Onion',          bn: 'পেঁয়াজ',
    base: 'g', range: [30, 250],
    exclude: ['powder', 'paste', 'flakes', 'dried', 'pickle', 'fried', 'crispy',
              'chips', 'chanachur', 'biscuit', 'noodle', 'soup', 'masala', 'sauce', 'rings'] },
  { id: 'potato', queries: ['potato'],                       en: 'Potato',         bn: 'আলু',
    base: 'g', range: [15, 150],
    exclude: ['chips', 'cracker', 'sweet', 'powder', 'flakes', 'sticks',
              'pallet', 'fry', 'frozen', 'french', 'wedges'] },
  { id: 'egg',    queries: ['egg'],                          en: 'Eggs (farm)',    bn: 'ডিম (ফার্ম)',
    base: 'pcs', range: [8, 30],
    exclude: ['duck', 'quail', 'noodle', 'chocolate', 'plant', 'shampoo'] },
  { id: 'dal',    queries: ['masoor dal', 'mosur dal', 'masur dal', 'red lentil'], en: 'Masoor dal', bn: 'মসুর ডাল',
    base: 'g', range: [60, 300], exclude: [] },
  { id: 'sugar',  queries: ['sugar'],                        en: 'Sugar',          bn: 'চিনি',
    base: 'g', range: [80, 220], exclude: ['free', 'icing', 'cube', 'brown', 'candy'] },
  { id: 'salt',   queries: ['salt'],                         en: 'Salt',           bn: 'লবণ',
    base: 'g', range: [15, 100], exclude: ['bath', 'pink', 'himalayan', 'black', 'rock', 'bit'] },
  { id: 'atta',   queries: ['atta'],                         en: 'Atta (flour)',   bn: 'আটা',
    base: 'g', range: [30, 130],
    exclude: ['maida', 'semolina', 'suji', 'rooti', 'roti', 'paratha', 'noodle'] },
  // Meat & fish: stores price these per kg without writing "kg" in the name
  // (assumeKg), and fish names carry size brackets like "(1-1.499 kg)" that
  // are the fish's size class, not a pack quantity (stripSize).
  { id: 'chicken', queries: ['broiler chicken'],             en: 'Chicken (broiler)', bn: 'মুরগি (ব্রয়লার)',
    base: 'g', range: [120, 340], assumeKg: true, stripSize: true,
    exclude: ['masala', 'seasoning', 'nugget', 'sausage', 'ball', 'samosa', 'spring', 'chips',
              'cutlet', 'pops', 'puri', 'cordon', 'strip', 'wing', 'drumstick', 'lollipop'] },
  { id: 'beef',   queries: ['beef'],                         en: 'Beef (bone-in)', bn: 'গরুর মাংস',
    base: 'g', range: [500, 1100], assumeKg: true, stripSize: true,
    exclude: ['masala', 'seasoning', 'chips', 'dried', 'achar', 'pickle', 'kabab', 'noodle',
              'kolija', 'liver', 'vuri', 'tripe', 'tongue', 'brain', 'hoof'] },
  { id: 'fish',   queries: ['rui fish', 'ruhi fish', 'rui'], en: 'Rui fish',       bn: 'রুই মাছ',
    base: 'g', range: [180, 700], assumeKg: true, stripSize: true,
    exclude: ['dried', 'shutki', 'pickle', 'achar', 'masala', 'fillet'] },
  { id: 'chili',  queries: ['kacha morich', 'green chili', 'green chilli'], en: 'Green chili', bn: 'কাঁচা মরিচ',
    base: 'g', range: [30, 600], assumeKg: true,
    exclude: ['sauce', 'powder', 'pickle', 'achar', 'paste', 'dried', 'flakes', 'chips',
              'shimla', 'capsicum', 'naga', 'noodle'] }
];

// Only direct-API grocery stores: a daily automatic check must never open tabs.
export const BAZAR_STORES = ['shwapno', 'meenabazar'];

const KEEP_DAYS = 30;

const todayKey = () => new Date().toISOString().slice(0, 10);
const gap = () => new Promise(r => setTimeout(r, 300 + Math.random() * 400));

// The cheapest strong match in the right unit family is "the price" of a
// staple at that store (powders, pickles etc. are excluded by word).
export function pickStaple(items, staple) {
  const ok = items
    .map(i => {
      const raw = { ...i };
      // "(1-1.499 kg)" on fish/meat is a size class, not a pack quantity
      if (staple.stripSize) raw.name = raw.name.replace(/\(\s*\d[^)]*[-–][^)]*\)/g, ' ');
      const e = enrich(raw);
      e.name = i.name;
      // Loose produce/meat is priced per kg with no digit in the name
      // ("Onion Local Loose (P) Kg", "Beef Boneless")
      if (!e.quantity && staple.base === 'g' && (staple.assumeKg || /\bkg\.?\b/i.test(e.name))) {
        e.quantity = { qty: 1000, baseUnit: 'g', display: '1kg' };
        e.unitPrice = { value: e.price, label: 'kg', per: 1000 };
      }
      return e;
    })
    .filter(i =>
      i.price > 0 && i.stock !== false &&
      i.quantity?.baseUnit === staple.base && i.unitPrice &&
      i.unitPrice.value >= staple.range[0] && i.unitPrice.value <= staple.range[1] &&
      staple.queries.some(q => tokenScore(i.name, q) >= 0.65) &&
      !staple.exclude.some(w => i.name.toLowerCase().includes(w))
    )
    .sort((a, b) => a.unitPrice.value - b.unitPrice.value);
  const best = ok[0];
  if (!best) return null;
  return {
    name: best.name,
    price: best.price,
    unit: Math.round(best.unitPrice.value * 100) / 100,
    unitLabel: best.unitPrice.label,
    qty: best.quantity.display,
    url: best.url || null
  };
}

// Runs every staple query against every bazar store, serially and politely.
// adaptersById: {shwapno: adapter, meenabazar: adapter}
export async function runBazarUpdate(adaptersById, settings) {
  const stores = BAZAR_STORES.filter(id => adaptersById[id] && settings.enabledStores[id]);
  if (!stores.length) return null;

  const { bazarHistory = {} } = await chrome.storage.local.get('bazarHistory');
  const date = todayKey();

  for (const staple of STAPLES) {
    for (const storeId of stores) {
      try {
        // Some store search engines miss a spelling — fall through the aliases
        // until one yields a usable item.
        let picked = null;
        for (const q of staple.queries) {
          const items = await adaptersById[storeId].search(q, settings);
          picked = pickStaple(items, staple);
          if (picked) break;
          await gap();
        }
        if (picked) {
          const hist = ((bazarHistory[staple.id] ||= {})[storeId] ||= []);
          const point = { d: date, p: picked.price, u: picked.unit, l: picked.unitLabel,
                          n: picked.name, q: picked.qty, url: picked.url };
          const idx = hist.findIndex(h => h.d === date);
          if (idx >= 0) hist[idx] = point; else hist.push(point);
          while (hist.length > KEEP_DAYS) hist.shift();
        }
      } catch { /* store down today — keep yesterday's data */ }
      await gap();
    }
  }

  const last = { at: Date.now(), date };
  await chrome.storage.local.set({ bazarHistory, bazarLast: last });
  return { bazarHistory, bazarLast: last };
}

// Refresh only when today's check hasn't happened yet (or force=true).
export async function maybeRefreshBazar(adaptersById, settings, force = false) {
  const { bazarLast, bazarHistory = {} } = await chrome.storage.local.get(['bazarLast', 'bazarHistory']);
  const stale = !bazarLast || Date.now() - bazarLast.at > 20 * 60 * 60 * 1000 || bazarLast.date !== todayKey();
  if (!force && !stale) return { bazarHistory, bazarLast, refreshed: false };
  const res = await runBazarUpdate(adaptersById, settings);
  return res ? { ...res, refreshed: true } : { bazarHistory, bazarLast, refreshed: false };
}
