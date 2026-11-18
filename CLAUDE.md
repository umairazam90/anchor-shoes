# Anchor Shoes: project brief

Owner: Umair. Pakistan-based seller of pre-loved shoes (TikTok, Instagram, Facebook Marketplace, OLX). Pairs are one-off, so stock is 0 or 1 per pair.

## Decisions (do not revisit without asking)
- Brand: **Anchor Shoes**. No anchor symbol anywhere in the branding. Logo A (Lace Frame) is the header logo, B (Seal) the profile picture, C (Sticker) for stickers and boxes.
- Palette: navy #17223B, brass #B8923F, deep brass #8A6D25 (text), light brass #D4B876 (on navy), cream #F7F5F0. Never pair red with green. Plain, simple look: audience is not very modern, shoes are not high-end. Poppins for the site (self-hosted via @fontsource).
- English only. Android only for alerts (no iPhone work).
- Orders: customer orders, Umair confirms by call and WhatsApp, ships by TCS with COD. No cart (one-off pairs): a short order form on the product page.
- **TCS tracking has no API.** Admin stores the TCS tracking number per order. The customer gets the number plus a link `/track/?n=<number>`; the page shows the number and sends them to the TCS website. Do not integrate TCS APIs.
- WhatsApp and call numbers are settings (src/data/settings.json now, admin-editable later), never hard-coded.
- Never put a real-looking phone number in the repo: a fake wa.me link could message a stranger.
- No Telegram. Alerts by email and Android push (tool to be chosen in M3).

## Stack
Astro 7 (static) + TypeScript, deployed on Cloudflare Workers static assets (wrangler.jsonc). Later: D1 (orders, stock, settings), R2 (photos). Cloudflare builds from GitHub on every push, so no Cloudflare keys are shared with Claude.

## Milestones
1. **M1 storefront (done in preview)**: Home with EU size filter, product pages, size guide, /track page, brand assets. Data in src/data/products.json (all `sample: true` until real values are entered).
2. M2: order form on the product page, atomic stock (D1) so one pair cannot be sold twice.
3. M3: admin page (add pairs with photos/size/condition/price, settings, orders, tracking number), email + Android alerts.
4. M4: security hardening and launch (domain, headers, rate limiting, backups).

## Conventions
- Sizes: EU primary, UK/US/cm derived from src/lib/sizes.ts (Nike men's chart, approximate); a pair can override uk/us/cm.
- Price format "Rs 6,500". Condition is out of 10 with flaws written honestly.
- Remove `sample: true` from a product once real values are in. The yellow preview ribbon disappears by itself when no samples remain and a WhatsApp number is set.
- Keep pages mobile-first (390px) with no horizontal scroll. Check with a phone-width screenshot before committing.
- Brand SVGs in public/brand were generated from the logo script; regenerate rather than hand-editing.

## Open items from Umair
- WhatsApp and calling numbers (will provide later).
- Real details for each pair: model, EU size, condition /10, flaws, price, photos.
- Delivery fee, return/exchange policy, cities served.
- Exact TCS tracking page URL (settings.tcsTrackUrl is the TCS home page for now).
- Name handles/domain/trademark check for "Anchor Shoes" before buying the domain.
- Urdu wording on the Urdu logos needs a native check (not used on the site).

## Commands
npm run dev | npm run build | npm run preview | npm run check | npm run deploy
