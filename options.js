const DEFAULTS = {
  enabledStores: {
    shwapno: true, meenabazar: true, pandamart: true, chaldal: false,
    startech: true, ryans: true, gadgetandgear: true,
    pickaboo: false, techland: false, sumashtech: false, globalbrand: false,
    othoba: false, daraz: true
  },
  meenaSubUnitId: 2,
  meenaAreaId: 2
};

const CATEGORIES = [
  {
    title: '🥬 Groceries',
    stores: [
      { id: 'shwapno', label: 'Shwapno', color: '#e2136e', note: 'shwapno.com — direct search API' },
      { id: 'meenabazar', label: 'Meena Bazar', color: '#00843d', note: 'meenabazaronline.com — direct API; branch auto-detected when you visit the site' },
      { id: 'pandamart', label: 'Pandamart', color: '#d70f64', note: 'foodpanda.com.bd — background tab; follows your last visited pandamart' },
      { id: 'chaldal', label: 'Chaldal', color: '#f9a825', note: 'chaldal.com — background tab' }
    ]
  },
  {
    title: '💻 Electronics & Gadgets',
    stores: [
      { id: 'startech', label: 'Star Tech', color: '#ef4a23', note: 'startech.com.bd — direct search' },
      { id: 'ryans', label: 'Ryans', color: '#2563eb', note: 'ryans.com — background tab' },
      { id: 'gadgetandgear', label: 'Gadget & Gear', color: '#7c3aed', note: 'gadgetandgear.com — background tab' },
      { id: 'pickaboo', label: 'Pickaboo', color: '#0ea5e9', note: 'pickaboo.com — direct search' },
      { id: 'techland', label: 'Techland', color: '#16a34a', note: 'techlandbd.com — background tab' },
      { id: 'sumashtech', label: 'Sumash Tech', color: '#db2777', note: 'sumashtech.com — background tab' },
      { id: 'globalbrand', label: 'Global Brand', color: '#0891b2', note: 'globalbrand.com.bd — background tab' }
    ]
  },
  {
    title: '🛒 Everything',
    stores: [
      { id: 'daraz', label: 'Daraz', color: '#f57224', note: 'daraz.com.bd — searched in both categories' },
      { id: 'othoba', label: 'Othoba', color: '#65a30d', note: 'othoba.com — background tab, both categories' }
    ]
  }
];

const ALL_STORES = CATEGORIES.flatMap(c => c.stores);

async function load() {
  const stored = await chrome.storage.sync.get(null);
  const settings = {
    ...DEFAULTS,
    ...stored,
    enabledStores: { ...DEFAULTS.enabledStores, ...(stored.enabledStores || {}) }
  };

  const wrap = document.getElementById('stores');
  wrap.innerHTML = '';
  for (const cat of CATEGORIES) {
    const h = document.createElement('h3');
    h.textContent = cat.title;
    h.style.cssText = 'font-size:14px;margin:14px 0 6px;';
    wrap.appendChild(h);
    for (const s of cat.stores) {
      const div = document.createElement('div');
      div.className = 'store';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = s.color;
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'store-' + s.id;
      cb.checked = !!settings.enabledStores[s.id];
      const txt = document.createElement('span');
      txt.innerHTML = `<b>${s.label}</b><small>${s.note}</small>`;
      label.append(cb, txt);
      div.append(dot, label);
      wrap.appendChild(div);
    }
  }

  document.getElementById('meenaSubUnitId').value = settings.meenaSubUnitId;
  document.getElementById('meenaAreaId').value = settings.meenaAreaId;

  renderPandamart(settings);
}

function renderPandamart(settings) {
  const pm = document.getElementById('pmStatus');
  pm.innerHTML = '';
  const stores = Object.entries(settings.pandamartStores || {});
  if (!stores.length) {
    pm.textContent = 'No pandamart captured yet — visit your local pandamart on foodpanda.com.bd once; every store you visit (home, office, hometown) is remembered here.';
    return;
  }
  stores.sort((a, b) => b[1].lastSeen - a[1].lastSeen);

  const mkRadio = (value, labelHtml, checked) => {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;';
    const r = document.createElement('input');
    r.type = 'radio';
    r.name = 'pmChoice';
    r.value = value;
    r.checked = checked;
    const span = document.createElement('span');
    span.innerHTML = labelHtml;
    row.append(r, span);
    return row;
  };

  pm.appendChild(mkRadio(
    '__auto__',
    '<b>Auto</b> <small>— follow the pandamart I visited last (best for home/office/hometown switching)</small>',
    !settings.pandamartPinned
  ));
  for (const [code, s] of stores) {
    pm.appendChild(mkRadio(
      code,
      `<b>${s.name}</b> <small>${s.url}</small>`,
      !!settings.pandamartPinned && settings.pandamartUrl === s.url
    ));
  }
}

document.getElementById('save').addEventListener('click', async () => {
  const enabledStores = {};
  for (const s of ALL_STORES) {
    enabledStores[s.id] = document.getElementById('store-' + s.id).checked;
  }
  const update = {
    enabledStores,
    meenaSubUnitId: Number(document.getElementById('meenaSubUnitId').value) || 2,
    meenaAreaId: Number(document.getElementById('meenaAreaId').value) || 2
  };

  const choice = document.querySelector('input[name="pmChoice"]:checked');
  if (choice) {
    const { pandamartStores = {} } = await chrome.storage.sync.get('pandamartStores');
    if (choice.value === '__auto__') {
      update.pandamartPinned = false;
      const latest = Object.values(pandamartStores).sort((a, b) => b.lastSeen - a.lastSeen)[0];
      if (latest) {
        update.pandamartUrl = latest.url;
        update.pandamartName = latest.name;
      }
    } else if (pandamartStores[choice.value]) {
      update.pandamartPinned = true;
      update.pandamartUrl = pandamartStores[choice.value].url;
      update.pandamartName = pandamartStores[choice.value].name;
    }
  }

  await chrome.storage.sync.set(update);
  const saved = document.getElementById('saved');
  saved.style.opacity = 1;
  setTimeout(() => (saved.style.opacity = 0), 1500);
});

load();
