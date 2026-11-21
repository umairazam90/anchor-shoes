import { defineMiddleware } from "astro:middleware";
import { authenticate, sameOrigin } from "./lib/access";
import { readSessionToken } from "./lib/adminauth";
import { getAccessEnv, loadShop, sessionAdmin } from "./lib/db";
import { servePhoto } from "./lib/photos";
import { sha256Hex } from "./lib/password";

const isAdmin = (p: string) => p === "/admin" || p.startsWith("/admin/") || p === "/api/admin" || p.startsWith("/api/admin/");

// The only admin addresses that work without signing in: the login and setup pages and the two forms that serve them.
const OPEN_ADMIN = new Set(["/admin/login/", "/admin/setup/", "/api/admin/login/", "/api/admin/setup/"]);

type WhoAmI = { id?: number; email: string; via: "access" | "dev" | "password" };

/** Who is asking? A valid Cloudflare Access token (or the localhost test sign-in) first, then the site's own login cookie. */
async function whoIsAdmin(request: Request): Promise<WhoAmI | null> {
  const viaAccess = await authenticate(request, getAccessEnv());
  if (viaAccess.ok) return { email: viaAccess.email, via: viaAccess.via };
  const token = readSessionToken(request);
  if (!token) return null;
  try {
    const row = await sessionAdmin(await sha256Hex(token));
    return row ? { id: row.id, email: row.email, via: "password" } : null;
  } catch (err) {
    console.error("session lookup failed", err);
    return null;
  }
}

const page = (status: number, title: string, text: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>` +
      `<body style="font:16px/1.6 system-ui,sans-serif;max-width:34rem;margin:15vh auto;padding:0 1.25rem;color:#17223b"><h1 style="font-size:1.4rem">${title}</h1><p>${text}</p>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-astro-reroute": "no" } },
  );

const refuse = (api: boolean, status: number, text: string) =>
  api
    ? new Response(JSON.stringify({ error: text }), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-astro-reroute": "no" } })
    : page(status, status === 503 ? "Admin is not ready yet" : status === 403 ? "Request refused" : "Admin sign-in needed", text);

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;

  // ---- photos (public, no database needed) ----
  if (pathname.startsWith("/img/") && (ctx.request.method === "GET" || ctx.request.method === "HEAD")) {
    return servePhoto(ctx.request, pathname);
  }

  // ---- admin: nothing below this block runs unless the sign-in checks out ----
  if (isAdmin(pathname)) {
    const api = pathname.startsWith("/api/");
    const open = OPEN_ADMIN.has(pathname.endsWith("/") ? pathname : `${pathname}/`);
    const admin = await whoIsAdmin(ctx.request);
    if (!admin && !open) {
      if (api) return refuse(true, 401, "You are signed out. Please sign in again.");
      const back = encodeURIComponent(pathname + ctx.url.search);
      return new Response(null, { status: 302, headers: { location: `/admin/login/?next=${back}`, "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
    }
    if (!["GET", "HEAD"].includes(ctx.request.method) && !sameOrigin(ctx.request)) {
      return refuse(api, 403, "This request did not come from the admin page, so it was refused.");
    }
    if (admin) ctx.locals.admin = admin;
    // admin pages never show the shop, but an unknown admin address renders the site's 404 page, which needs it
    if (!api) ctx.locals.shop = await loadShop().catch(() => undefined as never);
    const res = await next();
    const out = new Response(res.body, res);
    out.headers.set("Cache-Control", "no-store");
    out.headers.set("X-Robots-Tag", "noindex, nofollow");
    out.headers.set("X-Frame-Options", "DENY"); // the admin pages are never shown inside another site
    out.headers.set("Referrer-Policy", "same-origin");
    return out;
  }

  // ---- API routes do not need the shop ----
  if (pathname.startsWith("/api/")) return next();

  // ---- storefront: read pairs and settings once for this request ----
  try {
    ctx.locals.shop = await loadShop();
  } catch (err) {
    console.error("loadShop failed", err);
    return page(503, "Back in a minute", "We are updating the shop. Please try again in a moment.");
  }
  return next();
});
