# Anchor Shoes: project brief

Owner: Umair. Pakistan-based seller of pre-loved shoes (TikTok, Instagram, Facebook Marketplace, OLX). Pairs are one-off, so stock is 0 or 1 per pair.

## Decisions (do not revisit without asking)
- Brand: **Anchor Shoes**. No anchor symbol anywhere in the branding. Logo A (Lace Frame) is the header logo, B (Seal) the profile picture, C (Sticker) for stickers and boxes.
- Palette: navy #17223B, brass #B8923F, deep brass #8A6D25 (text), light brass #D4B876 (on navy), cream #F7F5F0. Never pair red with green (navy for success, red #A3321F only for errors). Poppins for the site (self-hosted via @fontsource).
- Look (revised 2026-11-18): Umair did not like the first plain theme and asked for a **Shopify-store style**: announcement bar, sticky header with search/account/saved/cart icons, hero, size tiles, product cards with heart and quick-add, filters and sort, cart drawer, sticky buy bar on mobile. Keep it clean and simple for a not-very-modern audience.
- English only. Android only for alerts (no iPhone work).
- Customer flow (Umair's workflow): Home with **main categories by size** -> size-range page (e.g. EU 43-44) -> **sub-category = exact EU size** catalogue -> shoe page with details -> cart/checkout (order page) -> Contact page -> Track page. Plus search, saved pairs and a lightweight account.
- Categories are EU size ranges in `src/data/categories.json`; sub-categories are the exact EU sizes that have pairs (generated).
- Cart exists (a pair can be in the cart once). Cart, saved pairs and account details live in the browser's localStorage (`anchor.cart`, `anchor.wish`, `anchor.me`). **No passwords.** Account = saved delivery details + saved pairs + order lookup by TCS number.
- Orders: customer orders, Umair confirms by call and WhatsApp, ships by TCS with COD only.
- **Checkout is an interim stub until M2**: with a WhatsApp number set it opens WhatsApp with the order text; without one it shows a "preview only, nothing was sent" panel. It does not reserve stock.
- **TCS tracking has no API.** Admin stores the TCS tracking number per order. The customer gets the number plus a link `/track/?n=<number>`; the page shows the number and sends them to the TCS website. Do not integrate TCS APIs.
- WhatsApp and call numbers are settings (src/data/settings.json now, admin-editable later), never hard-coded.
- Never put a real-looking phone number in the repo: a fake wa.me link could message a stranger.
- No Telegram. Alerts by email and Android push (tool to be chosen in M3).
- **Admin login plan:** Cloudflare Access (Zero Trust) email one-time PIN in front of `/admin` and `/api/admin/*`, and the Worker also verifies the Access JWT. Umair logs in with his own email, no password to store. Fallback if Access is not wanted: custom login (more code and risk).

## Stack
Astro 7 (static) + TypeScript, deployed on Cloudflare Workers static assets (wrangler.jsonc). Later: Worker API + D1 (orders, stock, settings, pairs) and R2 (photos); the catalogue moves from static JSON to D1 in M2/M3. Cloudflare builds from GitHub on every push, so no Cloudflare keys are shared with Claude.

## Code map
- `src/lib/shop.ts`: all data access (products, categories, settings, formatting, WhatsApp helpers, `catalogItems()`). When D1 arrives, only this layer changes.
- `src/pages/catalog.json.ts` -> `/catalog.json`: lightweight catalogue used by cart, search, saved pairs.
- `src/scripts/store.ts`: cart, saved pairs, drawers (menu/cart/search), announcement rotation. Imported by `Base.astro`.
- `src/components/`: `ProductCard`, `ShopGrid` (filters + sort, client-side), `Crumbs`, `Icon`.
- Pages: `/`, `/shoes/`, `/size/<range>/`, `/size/<range>/<eu>/`, `/shoe/<slug>/`, `/cart/`, `/checkout/`, `/search/`, `/wishlist/`, `/account/`, `/contact/`, `/track/`, `/size-guide/`, 404.

## Milestones
1. **M1 storefront (done, restyled 2026-11-18)**: Shopify-style storefront, size categories, cart, search, saved pairs, account-lite, contact, track, size guide. Data in src/data/products.json (all `sample: true` until real values are entered).
2. M2: real orders: Worker + D1, atomic stock so one pair cannot be sold twice (also across cart items), order saved and alerts triggered.
3. M3: admin page (add pairs with photos/size/condition/price, mark sold, settings, orders, TCS tracking number + customer link), email + Android alerts.
4. M4: security hardening and launch (domain, headers, rate limiting, backups).

## Conventions
- Sizes: EU primary, UK/US/cm derived from src/lib/sizes.ts (Nike men's chart, approximate); a pair can override uk/us/cm. Sizes outside the chart show "-" for UK/US/cm until overridden.
- Price format "Rs 6,500". Condition is out of 10 with flaws written honestly.
- products.json order = order added; newest is last (the site shows newest first).
- Remove `sample: true` from a product once real values are in. The yellow preview ribbon disappears by itself when no samples remain, a WhatsApp number is set and `returnPolicy` is filled in settings.
- Settings also hold `deliveryFee`, `cities`, `returnPolicy` (empty = neutral placeholder text on the shoe page).
- Keep pages mobile-first (390px) with no horizontal scroll. Check with a phone-width screenshot before committing.
- Brand SVGs in public/brand were generated from the logo script; regenerate rather than hand-editing.

## Open items from Umair
- WhatsApp and calling numbers (will provide later).
- Real details for each pair: model, EU size, condition /10, flaws, price, photos.
- Delivery fee, return/exchange policy, cities served.
- Exact TCS tracking page URL (settings.tcsTrackUrl is the TCS home page for now, unverified).
- Name handles/domain/trademark check for "Anchor Shoes" before buying the domain.
- Urdu wording on the Urdu logos needs a native check (not used on the site).
- Second size scale: Umair mentioned "41 and 22"; the site shows EU, UK, US and cm. Confirm what he meant.
- Make the GitHub repo private.

## Commands
npm run dev | npm run build | npm run preview | npm run check | npm run deploy
