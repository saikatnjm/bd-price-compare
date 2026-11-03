// Cart CRUD over chrome.storage.local. An item's identity is store+url+name.

export function itemKey(item) {
  return `${item.store}|${item.url || ''}|${item.name}`;
}

export async function getCart() {
  const { cart } = await chrome.storage.local.get('cart');
  return Array.isArray(cart) ? cart : [];
}

async function setCart(cart) {
  await chrome.storage.local.set({ cart });
  return cart;
}

export async function addToCart(item, qty = 1) {
  const cart = await getCart();
  const key = itemKey(item);
  const existing = cart.find(i => itemKey(i) === key);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      store: item.store,
      name: item.name,
      price: item.price,
      oldPrice: item.oldPrice ?? null,
      image: item.image ?? null,
      url: item.url ?? null,
      unit: item.unit ?? null,
      qty,
      addedAt: Date.now()
    });
  }
  return setCart(cart);
}

export async function setQty(key, qty) {
  let cart = await getCart();
  if (qty <= 0) cart = cart.filter(i => itemKey(i) !== key);
  else {
    const it = cart.find(i => itemKey(i) === key);
    if (it) it.qty = qty;
  }
  return setCart(cart);
}

export async function removeFromCart(key) {
  return setCart((await getCart()).filter(i => itemKey(i) !== key));
}

export async function clearCart(store = null) {
  if (!store) return setCart([]);
  return setCart((await getCart()).filter(i => i.store !== store));
}

export function cartCount(cart) {
  return cart.reduce((n, i) => n + i.qty, 0);
}

export function groupByStore(cart) {
  const groups = {};
  for (const i of cart) (groups[i.store] ||= []).push(i);
  return groups;
}

export function subtotal(items) {
  return items.reduce((s, i) => s + i.price * i.qty, 0);
}
