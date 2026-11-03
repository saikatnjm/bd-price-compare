// On-demand shopping assistant: injected only when the user picks
// "Compare BD prices" from the right-click menu on any page.

(function () {
  if (window.__bdpcOverlayLoaded) return;
  window.__bdpcOverlayLoaded = true;

  const T = {
    en: {
      title: 'BD Price Compare', searching: 'Searching your stores…',
      add: 'Add', added: '✓', none: 'No matches found.', close: 'Close',
      openFull: 'Open extension for more', failedStores: 'No reply from', cached: 'cached',
      reasonBigger: '{ratio} bigger for {diff} more — {pct}% cheaper per {unit}',
      reasonCheaper: '{ratio} bigger and {diff} cheaper — {pct}% less per {unit}',
      sameSizeTag: 'same size'
    },
    bn: {
      title: 'বিডি প্রাইস কম্পেয়ার', searching: 'আপনার দোকানগুলোতে খোঁজা হচ্ছে…',
      add: 'যোগ', added: '✓', none: 'কোনো মিল পাওয়া যায়নি।', close: 'বন্ধ',
      openFull: 'আরও দেখতে এক্সটেনশন খুলুন', failedStores: 'সাড়া নেই', cached: 'ক্যাশ',
      reasonBigger: '{ratio} বড়, দাম {diff} বেশি — প্রতি {unit} এ {pct}% সাশ্রয়',
      reasonCheaper: '{ratio} বড় এবং {diff} সস্তা — প্রতি {unit} এ {pct}% সাশ্রয়',
      sameSizeTag: 'একই সাইজ'
    }
  };

  const fill = (tpl, vars) => {
    let s = tpl;
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
    return s;
  };

  let host = null;

  function taka(n) {
    const r = Math.round(n * 100) / 100;
    return '৳' + (r % 1 === 0 ? r : r.toFixed(2));
  }

  function close() {
    if (host) { host.remove(); host = null; }
  }

  async function show(query, lang, category) {
    close();
    const t = T[lang] || T.en;
    host = document.createElement('div');
    host.style.cssText = 'all:initial; position:fixed; top:16px; right:16px; z-index:2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        .panel {
          width: 378px; max-height: 75vh; display: flex; flex-direction: column;
          background: #fff; color: #1a1f2b; border: 1px solid #d8dce3; border-radius: 12px;
          box-shadow: 0 8px 30px rgba(0,0,0,.25);
          font: 12.5px/1.4 system-ui, sans-serif; overflow: hidden;
        }
        @media (prefers-color-scheme: dark) {
          .panel { background: #14181d; color: #e8eaee; border-color: #2a2f37; }
          .row:hover { background: #1d242b !important; }
        }
        .hd { display:flex; align-items:center; gap:8px; padding:9px 12px; border-bottom:1px solid rgba(128,128,128,.25); }
        .logo { display:inline-grid; place-items:center; width:20px; height:20px; border-radius:6px; background:#0f766e; color:#fff; font-weight:700; font-size:12px; }
        .hd b { flex:1; font-size:13px; }
        .hd button { all:unset; cursor:pointer; padding:2px 7px; border-radius:6px; color:#888; font-size:14px; }
        .hd button:hover { background: rgba(128,128,128,.15); }
        .q { padding:7px 12px; font-size:11.5px; color:#888; border-bottom:1px solid rgba(128,128,128,.15); }
        .list { overflow-y:auto; padding:4px; }
        .row { display:grid; grid-template-columns:36px 1fr auto; gap:8px; align-items:center;
               padding:6px; border-radius:8px; text-decoration:none; color:inherit; }
        .row:hover { background:#f0fdf9; }
        .row img { width:36px; height:36px; object-fit:contain; border-radius:6px; background:#fff; border:1px solid rgba(128,128,128,.25); }
        .nm {
          font-weight:500; max-width:205px; overflow:hidden;
          display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
          line-height:1.3; margin-bottom:2px;
        }
        .st { font-size:9.5px; font-weight:700; color:#fff; padding:1px 6px; border-radius:999px; }
        .pr { font-weight:700; font-size:12.5px; text-align:right; }
        .up { font-size:10.5px; color:#0f9488; text-align:right; }
        .addb { all:unset; cursor:pointer; margin-left:6px; width:22px; height:22px; text-align:center;
                border-radius:6px; background:#0f766e; color:#fff; font-weight:700; font-size:13px; line-height:22px; }
        .msg { padding:18px 12px; text-align:center; color:#888; }
        .why {
          margin:2px 6px 6px; padding:6px 10px; border-radius:8px;
          background:rgba(242,194,0,.12); border:1px solid rgba(242,194,0,.45);
          font-size:11.5px; font-weight:600;
        }
        .sz {
          display:inline-block; margin-left:5px; padding:0 6px; border-radius:999px;
          border:1px solid rgba(128,128,128,.45); font-size:9.5px; color:#888;
          vertical-align:1px;
        }
        .sstag {
          display:inline-block; margin-left:5px; padding:0 6px; border-radius:999px;
          border:1px solid rgba(242,194,0,.6); font-size:9.5px; color:#b8860b;
          vertical-align:1px; font-weight:700;
        }
        .ft { padding:7px 12px; border-top:1px solid rgba(128,128,128,.25); font-size:11px; color:#888; }
      </style>
      <div class="panel">
        <div class="hd"><span class="logo">৳</span><b>${t.title}</b><button id="x" title="${t.close}">✕</button></div>
        <div class="q">“${query.replace(/[<>&]/g, '')}”</div>
        <div class="list"><div class="msg">${t.searching}</div></div>
        <div class="ft">${t.openFull}</div>
      </div>`;
    document.documentElement.appendChild(host);
    root.getElementById('x').addEventListener('click', close);

    let data;
    try {
      data = await chrome.runtime.sendMessage({ type: 'SEARCH', query, category: category || undefined });
    } catch {
      data = null;
    }
    if (!host) return; // closed while searching
    const list = root.querySelector('.list');
    list.innerHTML = '';

    const items = [];
    for (const r of data?.results || []) {
      for (const it of r.items) items.push({ ...it, _label: r.label, _color: r.color });
    }
    // Rank by how many meaningful query words a name contains (size tokens
    // like "200gm" vary between stores and are ignored), then by unit price.
    const STOP = new Set(['the', 'a', 'an', 'with', 'and', '&', 'for', 'of', 'pack']);
    const QTY = /^\d+(?:[.,]\d+)?(?:gm|g|kg|ml|l|ltr|litre|liter|pcs|pc)?$/i;
    const BOGO_STRIP = /\(?\s*buy\s*(?:\d+|one)\s*,?\s*get\s*(?:\d+|one)(?:\s*free)?\s*\)?|\bb\s*\d\s*g\s*\d\b|\bbogo\b/gi;
    // "180(±)10ml" → "180ml" (tolerance, not size); offer phrases are match
    // noise but DO scale the size the user is really buying (B1G1 = ×2).
    const qClean = query.toLowerCase()
      .replace(/(\d+(?:[.,]\d+)?)\s*(?:\(\s*(?:±|\+\/?-)\s*\)|±|\+\/-)\s*\d+(?:[.,]\d+)?\s*/g, '$1');
    const bm = qClean.match(/\bbuy\s*(\d+|one)\s*,?\s*get\s*(\d+|one)\b/) || qClean.match(/\bb\s*(\d)\s*g\s*(\d)\b/);
    let bogoMult = 1;
    if (bm) {
      const n = v => (v === 'one' ? 1 : parseInt(v, 10));
      const x = n(bm[1]), y = n(bm[2]);
      if (x >= 1 && y >= 1) bogoMult = (x + y) / x;
    } else if (/\bbogo\b/.test(qClean)) bogoMult = 2;
    const qWords = qClean.replace(BOGO_STRIP, ' ');
    const words = qWords.split(/\s+/)
      .filter(w => w && /[\p{L}\p{N}]/u.test(w) && !STOP.has(w) && !QTY.test(w));
    const score = n => {
      if (!words.length) return 1;
      const hay = n.toLowerCase();
      return words.filter(w => hay.includes(w)).length / words.length;
    };
    const scored = items.map(i => ({ ...i, _s: score(i.name) }));
    let pool = scored.filter(i => i._s >= 0.65);
    const strong = pool.length > 0;
    if (!strong) pool = scored.filter(i => i._s >= 0.4);

    // The size in the query ("500gm") tells us the unit family the user is
    // looking at: powder/solid (g) vs liquid (ml). Same-family items rank
    // first, and unit prices are only compared inside one family — a raw
    // ৳180 must never beat ৳240/kg.
    const qm = qWords.match(/(\d+(?:[.,]\d+)?)\s*(kg|gm|gram|g|ml|ltr|litre|liter|l)\b/i);
    let targetBase = null;
    let targetQty = null;
    if (qm) {
      const num = parseFloat(qm[1].replace(',', '.'));
      const u = qm[2];
      targetBase = ['kg', 'g', 'gm', 'gram'].includes(u) ? 'g' : 'ml';
      targetQty = (u === 'kg' ? num * 1000 : u === 'ml' || u === 'g' || u === 'gm' || u === 'gram' ? num : num * 1000) * bogoMult;
    }

    const rank = i => {
      const base = i.quantity?.baseUnit;
      const sameFamily = targetBase ? (base === targetBase ? 0 : 1) : 0;
      const unitKey = i.unitPrice && (!targetBase || base === targetBase)
        ? i.unitPrice.value
        : Infinity;
      return [-i._s, sameFamily, unitKey, i.price];
    };
    pool.sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      for (let k = 0; k < ra.length; k++) if (ra[k] !== rb[k]) return ra[k] - rb[k];
      return 0;
    });
    pool = pool.slice(0, 12);
    // Never crown a weak guess or a different unit family than the query's
    const crown = strong && (!targetBase || pool[0]?.quantity?.baseUnit === targetBase);

    if (!pool.length) {
      list.innerHTML = `<div class="msg">${t.none}</div>`;
      return;
    }

    // When the winner is a different size than the query (300ml beats 150ml
    // per litre), say WHY, and pin the cheapest same-size item right below —
    // otherwise a higher absolute price looks like a worse deal.
    let sameSize = null;
    let whyText = null;
    const top = pool[0];
    if (crown && targetQty && top?.unitPrice) {
      const cand = scored
        .filter(i =>
          i._s >= 0.65 && i.unitPrice &&
          i.quantity?.baseUnit === targetBase &&
          Math.abs(i.quantity.qty - targetQty) / targetQty <= 0.15
        )
        .sort((a, b) => a.price - b.price)[0];
      const isTop = cand && cand.name === top.name && cand.store === top.store && cand.price === top.price;
      if (cand && !isTop) {
        const pct = Math.round((1 - top.unitPrice.value / cand.unitPrice.value) * 100);
        const ratio = top.quantity.qty / cand.quantity.qty;
        if (pct > 0 && ratio > 1.05) {
          sameSize = cand;
          const ratioTxt = (Math.round(ratio * 10) / 10).toString().replace(/\.0$/, '') + '×';
          const diff = top.price - cand.price;
          whyText = fill(diff >= 0 ? t.reasonBigger : t.reasonCheaper, {
            ratio: ratioTxt,
            diff: taka(Math.abs(diff)),
            pct,
            unit: top.unitPrice.label
          });
          pool = pool.filter(i => i !== sameSize);
          pool.splice(1, 0, sameSize);
          pool = pool.slice(0, 12);
        }
      }
    }

    pool.forEach((item, idx) => {
      const a = document.createElement('a');
      a.className = 'row';
      if (idx === 0 && crown) a.style.cssText = 'background:rgba(242,194,0,.12); outline:1px solid rgba(242,194,0,.5);';
      a.href = item.url || '#';
      a.target = '_blank';
      a.rel = 'noreferrer';
      const img = document.createElement('img');
      img.src = item.image || '';
      a.appendChild(img);
      const mid = document.createElement('div');
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = item.name;
      nm.title = item.name;
      const st = document.createElement('span');
      st.className = 'st';
      st.style.background = item._color;
      st.textContent = item._label;
      mid.append(nm, st);
      if (item.quantity?.display) {
        const sz = document.createElement('span');
        sz.className = 'sz';
        sz.textContent = (item.quantity.bogo ? '🎁 ' : '') + item.quantity.display;
        mid.appendChild(sz);
      }
      if (item === sameSize) {
        const tag = document.createElement('span');
        tag.className = 'sstag';
        tag.textContent = '📏 ' + t.sameSizeTag;
        mid.appendChild(tag);
      }
      a.appendChild(mid);
      const right = document.createElement('div');
      right.style.cssText = 'display:flex;align-items:center;';
      const pwrap = document.createElement('div');
      const pr = document.createElement('div');
      pr.className = 'pr';
      pr.textContent = (idx === 0 && crown ? '🏆 ' : '') + taka(item.price);
      pwrap.appendChild(pr);
      if (item.unitPrice) {
        const up = document.createElement('div');
        up.className = 'up';
        up.textContent = `${taka(item.unitPrice.value)}/${item.unitPrice.label}`;
        pwrap.appendChild(up);
      }
      const btn = document.createElement('button');
      btn.className = 'addb';
      btn.textContent = '+';
      btn.title = t.add;
      btn.addEventListener('click', async e => {
        e.preventDefault();
        e.stopPropagation();
        await chrome.runtime.sendMessage({ type: 'ADD_TO_CART', item });
        btn.textContent = t.added;
        setTimeout(() => (btn.textContent = '+'), 1200);
      });
      right.append(pwrap, btn);
      a.appendChild(right);
      list.appendChild(a);
      if (idx === 0 && crown && whyText) {
        const why = document.createElement('div');
        why.className = 'why';
        why.textContent = '💡 ' + whyText;
        list.appendChild(why);
      }
    });
  }

  chrome.runtime.onMessage.addListener(msg => {
    if (msg?.type === 'SHOW_OVERLAY') show(msg.query, msg.lang, msg.category);
  });
})();
