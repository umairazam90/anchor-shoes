// Wrong-password limits for the sign-in, the setup page and the change-password form.
// Counting happens in the database (db.ts); the rules (how many, how long) are in adminauth.ts.
import { chargeAttempt } from "./db";
import { LOGIN_LIMITS, SETUP_LIMITS, overLimit } from "./adminauth";
import { sha256Hex } from "./password";

const short = async (text: string) => (await sha256Hex(text)).slice(0, 24);
/** the visitor's address (Cloudflare adds it), stored only as a short hash and only for a day */
const ipOf = (request: Request) => request.headers.get("cf-connecting-ip") || "local";

/** counts one sign-in attempt for this address and this email; `locked` means too many, so do NOT check the password */
export async function loginGate(request: Request, email: string): Promise<{ scopes: string[]; locked: boolean }> {
  const scopes = [`ip:${await short(ipOf(request))}`, `acct:${await short(email)}`];
  const counts = await chargeAttempt(scopes, LOGIN_LIMITS.windowMin);
  return { scopes, locked: overLimit(counts, { [scopes[0]]: LOGIN_LIMITS.perIp, [scopes[1]]: LOGIN_LIMITS.perAccount }) };
}

/** same for the setup page, which has a tighter limit because one secret code protects it */
export async function setupGate(request: Request): Promise<{ scopes: string[]; locked: boolean }> {
  const scopes = [`setup-ip:${await short(ipOf(request))}`, "setup-all"];
  const counts = await chargeAttempt(scopes, SETUP_LIMITS.windowMin);
  return { scopes, locked: overLimit(counts, { [scopes[0]]: SETUP_LIMITS.perIp, [scopes[1]]: SETUP_LIMITS.perAll }) };
}
