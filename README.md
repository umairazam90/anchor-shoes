# Anchor Shoes storefront and admin

Astro 7 shop for pre-loved shoes, running as a Cloudflare Worker. Pairs and settings live in a Cloudflare D1 database and photos in R2, managed from `/admin/` (sign-in by email code through Cloudflare Access).

```
npm install
cp .dev.vars.example .dev.vars   # local-only sign-in for /admin on localhost
npm run build && npm run preview # http://localhost:4321  (admin: /admin/)
npm test                         # admin sign-in checks
npm run check                    # type check
```

- Add and edit pairs, mark sold, change settings: **`/admin/`**. Setup and daily use: `SETUP-ADMIN.md`.
- `src/data/products.json` is only the 5 demo pairs inserted on the first run (and the fallback when no database is bound). `src/data/settings.json` holds the default settings; the live values are edited in the admin.
- Decisions, code map and milestone plan: `CLAUDE.md`.
