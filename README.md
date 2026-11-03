# BD Price Compare — Chrome extension

> **⬇ One-click download & install guide: [saikatnjm.github.io/bd-price-compare](https://saikatnjm.github.io/bd-price-compare/)**

Search a product once, see prices side by side from the Bangladeshi stores you
use, with per-kg / per-litre unit prices so the **real** best deal is obvious.
Free, open source (MIT), bilingual English/বাংলা, and 100% local — it uses your
own store logins and sends nothing anywhere.

**Stores**: Shwapno · Meena Bazar · Pandamart (foodpanda) · Chaldal · Daraz ·
Star Tech · Ryans · Gadget & Gear · Pickaboo · Techland · Sumash Tech ·
Global Brand · Othoba

## Categories

Searches are category-aware — pick with the chips above the search box
(remembered between sessions):

- 🥬 **Groceries**: Shwapno, Meena Bazar, Pandamart on by default · Chaldal opt-in
- 💻 **Electronics**: Star Tech, Ryans, Gadget & Gear on by default · Pickaboo,
  Techland, Sumash Tech, Global Brand opt-in
- 🛒 **Everything**: Daraz on by default (always included for electronics) ·
  Othoba opt-in

Major 3 per category are on by default; tick more in ⚙ Options anytime.

**Location-aware stores**: every pandamart you visit on foodpanda is
remembered — "Auto" mode follows the one you visited last (home / office /
hometown), or pin one in Options. Meena Bazar's branch (SubUnitId/AreaId)
is likewise captured automatically when you use the site with a delivery
location set.
- **All** auto-detects: the fast direct-API stores answer first, and whichever
  category matches the product is the only one whose tab-scraped stores run.

Compare buttons on store pages also carry their category automatically
(৳ on Star Tech → electronics search; ৳ on Shwapno → groceries).

Tab-scraped stores open **one background tab at a time** (a shared queue),
never a burst of tabs.

Enable/disable any store in ⚙ Options, grouped by category.

## ⭐ Price watch

Tap **☆** on any result to watch it. Watched items are re-checked once a day
(direct-API stores only; tab-scraped stores update when you hit "Check now"),
and you get a Chrome notification when a price drops below what you starred
it at. The ⭐ Watch tab shows starred vs current price with the drop amount.

## Stores

| Store | How it's searched | Notes |
|---|---|---|
| **Shwapno** | Direct JSON API (`shwapno.com/api/search`) | Uses your cookies, so your selected outlet applies |
| **Meena Bazar** | Direct JSON API (`mbonlineapi.com`) | Store branch configurable in Options (default: Dhaka) |
| **Daraz** | Catalog JSON (`/catalog/?ajax=true`) | Being logged in helps avoid their bot wall |
| **Pandamart** (foodpanda) | Background tab + on-page scrape | foodpanda's API is PerimeterX-protected, so a real tab in *your* browser does the search |
| **Chaldal** (bonus) | Background tab scrape | Off by default — enable in Options |
| **Foodi** | ✗ not possible | Foodimart groceries are app-only; no web catalog to compare |

## Install (load unpacked)

1. Open Chrome → `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** → pick this folder
4. Pin "BD Price Compare" to the toolbar

## One-time Pandamart setup

Pandamart stores differ by area, so the extension needs to know yours:
open [foodpanda.com.bd](https://www.foodpanda.com.bd), go to your local
**pandamart** once — the extension remembers it automatically (check in
⚙ Settings that it says "Linked").

## Cart & checkout handoff

- Hit **+** on any result (or the best-deal banner) to add it to the
  extension's cart; the toolbar icon shows a count badge.
- The **Cart** tab groups items by store with qty steppers, per-store
  subtotals and a grand total.
- **"Add all to <store> & open →"** opens that store in background tabs,
  clicks the store's own add-to-cart button for each item with your
  logged-in session (human-paced, one at a time), closes tabs that
  succeeded, leaves failures open for you, and finishes on the store's
  cart page. **Login and payment always stay in your hands.**

## Compare from any website — three ways, zero typing

1. **Open the popup on any shop's product page** — the extension detects
   the product title right there and shows a one-tap
   "🔍 <product>" chip; tap it to compare against your stores.
2. **On your own stores** (Shwapno, Meena Bazar, Daraz, Pandamart,
   Chaldal) a small **৳ button appears next to the product title** —
   click it and the comparison overlay opens on the spot, best deal
   crowned 🏆.
3. **Select any product text** on any page → right-click →
   **"Compare BD prices"** → same overlay.

All three use Chrome's `activeTab` grant or your chosen stores only —
the extension never reads pages on its own.

## Language

The **বাং / EN** button in the popup header switches the whole UI between
English and Bangla (remembered; also changes the right-click menu).

## Polite use (don't get flagged)

- Identical searches within 5 minutes are served from a local cache
  instead of re-hitting the stores.
- Cart filling is sequential with human-paced, jittered delays.
- No CAPTCHA bypassing, no header spoofing — everything is your own
  session doing normal page actions. If a store shows a bot wall, the
  extension backs off and tells you instead of fighting it.

## Using it

- Click the icon, type a product (e.g. `fresh milk 1l`), hit **Compare**.
- 🏆 **Best deal** picks the lowest *unit price* (৳/kg or ৳/L) when products
  from 2+ stores are comparable, otherwise the lowest price.
- **Buy1 Get1 / B1G1 / BOGO offers count double**: a 180ml B1G1 shampoo is
  treated as 360ml (shown as 🎁 `180ml ×2`), so its ৳/L is what you really
  pay. Tolerance sizes like `180(±)10ml` read as 180ml, not 10ml.
- **Close matches only** filters out noise (Daraz returns a lot of it) —
  untick it to see everything each store returned.
- Chips at the top open the same search on each store's own site.
- ⛶ opens the comparison in a full tab.

## How it works / privacy

- Everything runs **locally in your browser** using your own logged-in
  sessions; nothing is sent anywhere else.
- Shwapno / Meena Bazar / Daraz are fetched directly (fast).
- Pandamart (and Chaldal, if enabled) briefly open a **background tab**,
  run the store's own search, read the rendered product cards, and close
  the tab — that's the only way past their bot protection, and it's your
  normal session doing a normal search.
- Prices are read live at search time and can differ by delivery area.

## Known limits

- Foodi/Foodimart has no website catalog — can't be compared (app-only).
- Meena Bazar's branch IDs (`SubUnitId`/`AreaId`) default to 2/2 (Dhaka).
  If your account delivers from a different branch, prices may differ
  slightly from what checkout shows.
- Pandamart scraping depends on foodpanda's page rendering; if they
  redesign, the generic card detector usually still works, but if results
  stop appearing, re-open your pandamart page once and try again.
