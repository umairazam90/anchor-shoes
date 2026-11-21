// Rules for the email + password admin login: emails, cookies, redirects and the wrong-password limits.
// Pure (no Cloudflare imports) so it is unit-tested in plain Node. The database side is in db.ts, the routes in src/pages/api/admin/.

export const SESSION_DAYS = 14;

export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

export function validEmail(s: string): boolean {
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/* ---------- cookie ---------- */
// On https the cookie gets the "__Host-" prefix: the browser then only accepts it from this exact site, with Secure and Path=/.
export const isHttps = (url: string) => new URL(url).protocol === "https:";
export const cookieName = (secure: boolean) => (secure ? "__Host-anchor_admin" : "anchor_admin");

/** HttpOnly (page scripts cannot read it), Secure on https, Lax (sent when you open the admin from a link, never on other sites' form posts) */
export function sessionCookie(token: string, secure: boolean, days = SESSION_DAYS): string {
  return `${cookieName(secure)}=${token}; Path=/; Max-Age=${days * 86400}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
export function clearCookie(secure: boolean): string {
  return `${cookieName(secure)}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** the session token from the request's Cookie header, or "" */
export function readSessionToken(request: Request): string {
  const header = request.headers.get("cookie") ?? "";
  const name = cookieName(isHttps(request.url));
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      const v = part.slice(i + 1).trim();
      return /^[A-Za-z0-9_-]{20,100}$/.test(v) ? v : "";
    }
  }
  return "";
}

/** where to go after signing in: only paths inside the admin, never another site */
export function safeNext(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!/^\/(admin|api\/admin)(\/|$)/.test(v)) return "/admin/";
  if (v.startsWith("/api/")) return "/admin/"; // API addresses are not pages
  if (v.includes("//") || v.includes("\\") || /[\u0000-\u001f]/.test(v)) return "/admin/";
  if (/^\/admin\/(login|setup)\/?(\?|$)/.test(v)) return "/admin/";
  return v;
}

/* ---------- wrong-password limits ---------- */
// Every attempt is counted BEFORE the password is checked (and forgiven on success), so a burst of parallel
// guesses cannot slip past the limit. Limits are per 15 minutes.
export const LOGIN_LIMITS = { windowMin: 15, perIp: 15, perAccount: 8 } as const;
export const SETUP_LIMITS = { windowMin: 15, perIp: 5, perAll: 20 } as const;

export type Counts = Record<string, number>;

/** true when any counter is over its limit (counters include the attempt being made now) */
export function overLimit(counts: Counts, limits: Record<string, number>): boolean {
  return Object.entries(limits).some(([scope, max]) => (counts[scope] ?? 0) > max);
}
