# Anchor Shoes: project brief

Owner: Umair. Pakistan-based seller of pre-loved shoes (TikTok, Instagram, Facebook Marketplace, OLX). Pairs are one-off, so stock is 0 or 1 per pair.

## Decisions (do not revisit without asking)
- Brand: **Anchor Shoes**. No anchor symbol anywhere in the branding. Logo A (Lace Frame) is the header logo, B (Seal) the profile picture, C (Sticker) for stickers and boxes.
- Palette: navy #17223B, brass #B8923F, deep brass #8A6D25 (text), light brass #D4B876 (on navy), cream #F7F5F0. Never pair red with green (navy for success, red #A3321F only for errors). Poppins for the site (self-hosted via @fontsource).
- Look (revised 2026-11-18): Umair did not like the first plain theme and asked for a **Shopify-store style**: announcement bar, sticky header with search/account/saved/cart icons, hero, size tiles, product cards with heart and quick-add, filters and sort, cart drawer, sticky buy bar on mobile. Keep it clean and simple for a not-very-modern audience.
- English only. Android only for alerts (no iPhone work).
- Customer flow (Umair's workflow): Home with **main categories by size** -> size-range page (e.g. EU 43-44) -> **sub-category = exact EU size** catalogue -> shoe page with details -> cart/checkout (order page) -> Contact page -> Track page. Plus search, saved pairs and a lightweight account.
- **Shop by brand (added 2026-11-20):** `/brands/` lists brands, `/brand/<slug>/` shows one brand's pairs with a size bar (EU size pills) above the grid. Brands come from each pair's `brand` field; nothing to maintain separately.
- **Photos are never cropped (2026-11-20):** every photo box uses `object-fit: contain`, centred. Photos are 4:5; other shapes sit centred with a neutral background. Do not switch back to `cover`.
- **Payment wording (2026-11-20):** the pair's price is cash on delivery, but **delivery charges are paid in advance** (shown on cart, order page, shoe page, return policy, WhatsApp order text). The order page must keep saying so.
- **No "Sent by TCS" / "Delivered by TCS" / "we call you" wording** on the storefront. How it works is exactly: Pick your pair -> Confirm the order -> Pay on delivery. TCS is only mentioned on the Track page (tracking number + link to TCS).
- **Self pickup** (`settings.pickup`, Main Peshawar Road, Rawalpindi) is shown on the Contact page only. Never on the home page.
- Return policy: generic page at `/returns/` (window from `settings.returnWindowDays`, currently 3, a placeholder Umair has not confirmed). Short version on each shoe page comes from `settings.returnPolicy` (`{days}` is replaced).
- Categories are EU size ranges in `src/data/categories.json`; sub-categories are the exact EU sizes that have pairs (generated).
- Cart exists (a pair can be in the cart once). Cart, saved pairs and account details live in the browser's localStorage (`anchor.cart`, `anchor.wish`, `anchor.me`). **No passwords.** Account = saved delivery details + saved pairs + order lookup by TCS number.
- Orders: customer orders, Umair confirms by call and WhatsApp, ships by TCS with COD only.
- **Checkout is an interim stub until M2**: with a WhatsApp number set it opens WhatsApp with the order text; without one it shows a "preview only, nothing was sent" panel. It does not reserve stock.
- **TCS tracking has no API.** Admin stores the TCS tracking number per order. The customer gets the number plus a link `/track/?n=<number>`; the page shows the number and sends them to the TCS website. Do not integrate TCS APIs.
- WhatsApp and call numbers are settings (src/data/settings.json now, admin-editable later), never hard-coded. Both are set to Umair's real number **+92 311 9362391** (provided 2026-11-20).
- Never put an invented or placeholder phone number in the repo: a fake wa.me link could message a stranger. Only numbers Umair gave us.
- No Telegram. Alerts by email and Android push (tool to be chosen in M3).
- **Admin login plan:** Cloudflare Access (Zero Trust) email one-time PIN in front of `/admin` and `/api/admin/*`, and the Worker also verifies the Access JWT. Umair logs in with his own email, no password to store. Fallback if Access is not wanted: custom login (more code and risk).

## Stack
Astro 7 (static) + TypeScript, deployed on Cloudflare Workers static assets (wrangler.jsonc). Later: Worker API + D1 (orders, stock, settings, pairs) and R2 (photos); the catalogue moves from static JSON to D1 in M2/M3. Cloudflare builds from GitHub on every push, so no Cloudflare keys are shared with Claude.

## Code map
- `src/lib/shop.ts`: all data access (products, categories, settings, formatting, WhatsApp helpers, `catalogItems()`). When D1 arrives, only this layer changes.
- `src/pages/catalog.json.ts` -> `/catalog.json`: lightweight catalogue used by cart, search, saved pairs.
- `src/scripts/store.ts`: cart, saved pairs, drawers (menu/cart/search), announcement rotation. Imported by `Base.astro`.
- `src/components/`: `ProductCard`, `ShopGrid` (filters + sort, client-side), `Crumbs`, `Icon`.
- Pages: `/`, `/shoes/`, `/size/<range>/`, `/size/<range>/<eu>/`, `/brands/`, `/brand/<slug>/`, `/shoe/<slug>/`, `/cart/`, `/checkout/`, `/search/`, `/wishlist/`, `/account/`, `/contact/`, `/track/`, `/size-guide/`, `/returns/`, 404.
- `src/lib/sizes.ts`: brand size charts (Nike/Jordan, adidas) with UK, US and **foot length** (not the box "CM" size). Brands with no published chart (e.g. H&M) show EU only.

## Milestones
1. **M1 storefront (done, restyled 2026-11-18)**: Shopify-style storefront, size categories, cart, search, saved pairs, account-lite, contact, track, size guide. Data in src/data/products.json (all `sample: true` until real values are entered).
2. M2: real orders: Worker + D1, atomic stock so one pair cannot be sold twice (also across cart items), order saved and alerts triggered.
3. M3: admin page (add pairs with photos/size/condition/price, mark sold, settings, orders, TCS tracking number + customer link), email + Android alerts.
4. M4: security hardening and launch (domain, headers, rate limiting, backups).

## Conventions
- Sizes: EU primary (the size printed on the shoe). UK/US/foot length come from the pair's **brand chart** in src/lib/sizes.ts (Nike men's and adidas men's, from nike.com and adidas.com); a pair can override uk/us/cm in products.json, and can add an optional measured `insole` (cm). adidas sells in thirds (42 2/3), so only whole-number adidas sizes (40, 42, 44...) get UK/US. Anything without a chart shows EU only.
- Price format "Rs 6,500". Condition is out of 10 with flaws written honestly.
- products.json order = order added; newest is last (the site shows newest first).
- Remove `sample: true` from a product once real values are in. The yellow preview ribbon disappears by itself when no samples remain, a WhatsApp number is set and `returnPolicy` is filled in settings.
- Settings also hold `deliveryFee`, `cities`, `returnPolicy` (empty = neutral placeholder text on the shoe page).
- Keep pages mobile-first (390px) with no horizontal scroll. Check with a phone-width screenshot before committing.
- Brand SVGs in public/brand were generated from the logo script; regenerate rather than hand-editing.

## Open items from Umair
- Real details for each pair: model, EU size, condition /10, flaws, price, photos.
- Delivery fee amount and cities served. How customers pay the advance delivery charges (method and account) is not defined yet.
- Confirm the generic return policy: 3-day window, exchange or refund, refund method, delivery charges not refunded unless our mistake.
- Exact self-pickup location and timings (only "Main Peshawar Road, Rawalpindi" so far).
- Exact TCS tracking page URL (settings.tcsTrackUrl is the TCS home page for now, unverified).
- Name handles/domain/trademark check for "Anchor Shoes" before buying the domain.
- Urdu wording on the Urdu logos needs a native check (not used on the site).
- Second size scale: Umair mentioned "41 and 22"; the site shows EU, UK, US and cm. Confirm what he meant.
- Make the GitHub repo private.

## Commands
npm run dev | npm run build | npm run preview | npm run check | npm run deploy
