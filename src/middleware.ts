import { defineMiddleware } from "astro:middleware";
import { authenticate, sameOrigin } from "./lib/access";
import { getAccessEnv, loadShop } from "./lib/db";
import { servePhoto } from "./lib/photos";

const isAdmin = (p: string) => p === "/admin" || p.startsWith("/admin/") || p === "/api/admin" || p.startsWith("/api/admin/");

const page = (status: number, title: string, text: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>` +
      `<body style="font:16px/1.6 system-ui,sans-serif;max-width:34rem;margin:15vh auto;padding:0 1.25rem;color:#17223b"><h1 style="font-size:1.4rem">${title}</h1><p>${text}</p>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-astro-reroute": "no" } },
  );

const refuse = (api: boolean, status: number, text: string) =>
  api
    ? new Response(JSON.stringify({ error: text }), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-astro-reroute": "no" } })
    : page(status, status === 503 ? "Admin is not ready yet" : "Admin sign-in needed", text);

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;

  // ---- photos (public, no database needed) ----
  if (pathname.startsWith("/img/") && (ctx.request.method === "GET" || ctx.request.method === "HEAD")) {
    return servePhoto(ctx.request, pathname);
  }

  // ---- admin: nothing below this block runs unless the sign-in checks out ----
  if (isAdmin(pathname)) {
    const api = pathname.startsWith("/api/");
    const auth = await authenticate(ctx.request, getAccessEnv());
    if (!auth.ok) return refuse(api, auth.status, auth.reason);
    if (!["GET", "HEAD"].includes(ctx.request.method) && !sameOrigin(ctx.request)) {
      return refuse(api, 403, "This request did not come from the admin page, so it was refused.");
    }
    ctx.locals.admin = { email: auth.email, via: auth.via };
    // admin pages never show the shop, but an unknown admin address renders the site's 404 page, which needs it
    if (!api) ctx.locals.shop = await loadShop().catch(() => undefined as never);
    const res = await next();
    const out = new Response(res.body, res);
    out.headers.set("Cache-Control", "no-store");
    out.headers.set("X-Robots-Tag", "noindex, nofollow");
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
