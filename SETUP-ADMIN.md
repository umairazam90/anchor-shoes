# Admin panel: setup and daily use

The admin lives at **`/admin/`** on the shop's own address. It is where you add pairs with photos, mark pairs sold, and change shop settings (WhatsApp number, delivery charges, return policy, announcement bar). The shop reads everything live from a database, so a change shows on the shop straight away. No rebuild, no waiting.

Nothing here needs a password stored on the site. You sign in with your email: Cloudflare sends a 6-digit code, you type it in.

## What is where

| Thing | Where it lives |
|---|---|
| Pairs and settings | Cloudflare **D1** database (binding `DB`). The tables are created by the site itself on the first visit (`src/lib/db.ts`). |
| Uploaded photos | Cloudflare **R2** bucket (binding `PHOTOS`), shown on the shop at `/img/pairs/...` |
| Sign-in | Cloudflare **Access** (email code) in front of `/admin` and `/api/admin`. The site also checks the sign-in itself, so a mistake in the Access rule cannot open the admin. |

Until sign-in is connected, `/admin/` shows "Admin sign-in is not set up yet" and every admin action is refused. That is the safe default, not a fault.

## Step 1: first deploy (creates the database and photo storage)

`wrangler.jsonc` names the D1 database (by ID) and the R2 bucket (`anchor-shoes-photos`). Bare bindings with no ID or name failed the first production deploy (code 10057, Wrangler tried to inherit the bucket from the live version), so they are explicit now. If the build says the bucket does not exist, create it as in step 2 below.

1. Push the `admin-panel` branch. If your Cloudflare project builds branches as previews, open the preview link and check the shop loads (it will show the 5 demo pairs, exactly like today).
2. If the build log says it could not create the database or bucket, do it by hand:
   - Cloudflare dashboard → **Storage & databases** → **D1** → create a database called `anchor-shoes-db`. Copy its ID.
   - Same area → **R2** → create a bucket called `anchor-shoes-photos`.
   - In `wrangler.jsonc` change the two lines to:
     `"d1_databases": [{ "binding": "DB", "database_name": "anchor-shoes-db", "database_id": "<the ID>" }]`
     `"r2_buckets": [{ "binding": "PHOTOS", "bucket_name": "anchor-shoes-photos" }]`

## Step 2: sign-in (Cloudflare Access)

**You need a domain on Cloudflare for this.** Cloudflare Access protects a domain and a path (`yourshop.com/admin`). On the plain `*.workers.dev` address it can only protect the *whole* site, which would lock out your customers. So the order is: buy the domain → add it to Cloudflare → attach it to this Worker → do the steps below. (Owner decision pending: see the open items in `CLAUDE.md`.)

Dashboard labels move around a little; the idea stays the same.

1. Cloudflare dashboard → **Zero Trust** (pick a team name and the free plan if asked). Your **team domain** is `https://<team-name>.cloudflareaccess.com`.
2. **Access controls → Applications → Create new application → Self-hosted and private → Add public hostname.**
   Add two destinations on your domain: `yourshop.com/admin` and `yourshop.com/api/admin`. A rule on a path also covers everything under it.
3. Policy: **Allow**, rule **Emails** = your email. Login method: **One-time PIN**.
4. Open the application and copy its **Application Audience (AUD) tag**.
5. Put both values in `wrangler.jsonc` and push:
   ```
   "vars": {
     "TEAM_DOMAIN": "https://<team-name>.cloudflareaccess.com",
     "POLICY_AUD": "<the AUD tag>",
     "ADMIN_EMAILS": "you@example.com"   // optional second lock: only these emails
   }
   ```
6. Test in a private browser window: `yourshop.com/admin/` must ask for your email and a code, and `yourshop.com/api/admin/pairs/` must do the same. Without signing in, nothing should load.

## Daily use

- **Add a pair**: Admin → *Add a pair*. Pick photos from your phone (they are shrunk automatically before upload), fill in model, brand, EU size, condition, price and flaws. The first photo is the cover; use the arrows to reorder.
- **EU sizes** are what is printed in the shoe. adidas thirds: type `42 2/3`.
- **UK, US and foot length** come from the Nike and adidas charts automatically. Open *More size details* only to override them or add a measured insole length.
- **Mark as sold** straight from the list. The pair leaves the shop's "for sale" lists at once; its page stays up and says sold.
- **Settings**: WhatsApp and call numbers, self pickup, delivery charges, cities, return window and wording, announcement bar, social links.
- **Reviews**: customers send them from the bottom of the home page. They wait under Admin → Reviews (a number on the link shows how many). *Approve and show on shop* publishes one, *Hide from shop* takes it back, *Delete* removes it and its photos. Nothing a customer writes appears on the shop before you approve it.
- **Demo pairs**: the 5 sample pairs from the first install carry a *Demo* tag. *Delete demo pairs* removes them; real pairs are never touched.

Flaws are required on purpose ("None" is fine). Customers see them, and honest condition is the brand's promise.

## Testing on your own computer

```
cp .dev.vars.example .dev.vars     # signs you in as that email, on localhost only
npm run build && npm run preview   # opens http://localhost:4321/admin/
npm test                           # sign-in checks
```

The local database and photos live in `.wrangler/state` (ignored by git). Delete that folder to start fresh.

## If something looks wrong

| You see | Meaning |
|---|---|
| "Admin sign-in is not set up yet" (503) | `TEAM_DOMAIN` or `POLICY_AUD` is empty in `wrangler.jsonc`. |
| "You are not signed in" (401) | The request did not come through Access. Check the Access rule covers both `/admin` and `/api/admin`. |
| "This email is not allowed" (403) | The email is not in `ADMIN_EMAILS`. |
| "Photo storage is not connected yet" | The R2 bucket is not linked. See Step 1.2. |
| "The database is not connected yet" | The D1 database is not linked. See Step 1.2. Until then the shop falls back to the 5 demo pairs. |
| "Back in a minute" on the shop | The database could not be read. Try again in a moment. |

## Known limits of this first admin

- A photo uploaded but not saved (you closed the page) stays in storage. Harmless; a clean-up job is part of the launch hardening.
- Checkout is still the WhatsApp stub: it does not reserve a pair, so two people can still ask for the same pair. Orders in the database, one-pair-one-buyer protection, the TCS tracking number and the phone/email alerts are the next phase.
- There is no phone or email alert yet when a customer sends a review; check the number on the Reviews link in the admin.
- One admin screen at a time: if two people edit the same pair at the same moment, the last save wins.
