// Admin sign-in. Cloudflare Access (email one-time PIN) sits in front of /admin and /api/admin/*.
// Access adds a signed token to every request it lets through. This file checks that token itself,
// so the admin stays locked even if the Access rule is missing or set up wrongly (it fails closed).
//
// No Cloudflare imports here on purpose: it takes its settings as arguments, so it can be tested in plain Node.
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export type AccessEnv = {
  /** https://<team>.cloudflareaccess.com */
  TEAM_DOMAIN?: string;
  /** the Access application's AUD tag */
  POLICY_AUD?: string;
  /** optional extra allow-list, comma separated. Empty means "whoever Access lets in". */
  ADMIN_EMAILS?: string;
  /** local testing only: signs you in as this email, and only when the site runs on localhost */
  DEV_ADMIN_EMAIL?: string;
};

export type AuthResult =
  | { ok: true; email: string; via: "access" | "dev" }
  | { ok: false; status: 401 | 403 | 503; reason: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const keySets = new Map<string, JWTVerifyGetKey>();

function teamDomain(env: AccessEnv): string {
  return (env.TEAM_DOMAIN || "").trim().replace(/\/+$/, "");
}

function remoteKeys(team: string): JWTVerifyGetKey {
  let k = keySets.get(team);
  if (!k) {
    k = createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`), { cooldownDuration: 30_000 });
    keySets.set(team, k);
  }
  return k;
}

export function allowedEmails(env: AccessEnv): string[] {
  return (env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** `getKey` is only passed in tests; in the Worker the keys come from the team's public certs URL. */
export async function authenticate(request: Request, env: AccessEnv, getKey?: JWTVerifyGetKey): Promise<AuthResult> {
  const url = new URL(request.url);
  const allow = allowedEmails(env);

  // Local testing shortcut. It only works on localhost, so a stray variable in production can never open the admin.
  if (env.DEV_ADMIN_EMAIL && LOCAL_HOSTS.has(url.hostname)) {
    return { ok: true, email: env.DEV_ADMIN_EMAIL.toLowerCase(), via: "dev" };
  }

  const team = teamDomain(env);
  const aud = (env.POLICY_AUD || "").trim();
  if (!team || !aud) {
    return { ok: false, status: 503, reason: "Admin sign-in is not set up yet. Cloudflare Access still needs to be connected." };
  }
  if (!getKey && !team.startsWith("https://")) {
    return { ok: false, status: 503, reason: "Admin sign-in is set up wrongly (the team domain must start with https://)." };
  }

  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) {
    return { ok: false, status: 401, reason: "You are not signed in. Open this page through your Cloudflare Access sign-in." };
  }

  try {
    const { payload } = await jwtVerify(token, getKey ?? remoteKeys(team), { issuer: team, audience: aud });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    if (!email) return { ok: false, status: 403, reason: "This sign-in has no email address, so it cannot be used for the admin." };
    if (allow.length && !allow.includes(email)) return { ok: false, status: 403, reason: "This email is not allowed to use the admin." };
    return { ok: true, email, via: "access" };
  } catch {
    return { ok: false, status: 401, reason: "Your sign-in could not be checked. Please sign in again." };
  }
}

/** Browsers always send Origin on POST/PUT/PATCH/DELETE. It must be this site, or the request is refused (CSRF guard). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
