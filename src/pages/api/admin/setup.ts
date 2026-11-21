// POST /api/admin/setup/  creates an admin login, or resets the password of an existing one, for whoever knows the SETUP_CODE secret.
// Open to everyone on purpose (it is how the first admin gets in), so it is switched off unless SETUP_CODE is set, and it is rate limited.
import type { APIRoute } from "astro";
import { checkNewPassword, hashPassword, randomToken, safeEqualText, sha256Hex } from "../../../lib/password";
import { SESSION_DAYS, isHttps, normalizeEmail, sessionCookie, validEmail } from "../../../lib/adminauth";
import { createAdmin, endSessionsOf, findAdmin, forgiveAttempts, getPasswordIterations, getSetupCode, newSession, setAdminPassword, touchLogin } from "../../../lib/db";
import { setupGate } from "../../../lib/guard";
import { json, readJson } from "../../../lib/http";

const text = (v: unknown) => (typeof v === "string" ? v : "");

export const POST: APIRoute = async ({ request }) => {
  const secret = getSetupCode();
  if (secret.length < 16) return json({ error: "Setup is switched off. Add a secret called SETUP_CODE (16 or more characters) in Cloudflare to switch it on." }, 403);

  const body = (await readJson(request)) as Record<string, unknown> | null;
  const email = normalizeEmail(text(body?.email));
  const password = text(body?.password);
  const errors: Record<string, string> = {};
  if (!validEmail(email)) errors.email = "Enter a full email address.";
  const weak = checkNewPassword(password, email);
  if (weak) errors.password = weak;
  else if (password !== text(body?.again)) errors.again = "The two passwords are not the same.";
  if (!text(body?.code).trim()) errors.code = "Enter the setup code.";
  if (Object.keys(errors).length) return json({ errors }, 422);

  try {
    const gate = await setupGate(request);
    if (gate.locked) return json({ error: "Too many tries. Please wait 15 minutes and try again." }, 429);
    if (!safeEqualText(text(body?.code).trim(), secret)) return json({ errors: { code: "That setup code is not right." } }, 422);

    const hash = await hashPassword(password, getPasswordIterations());
    const existing = await findAdmin(email);
    let id: number | null;
    if (existing) {
      await setAdminPassword(existing.id, hash);
      await endSessionsOf(existing.id); // a reset signs that admin out everywhere
      id = existing.id;
    } else {
      id = await createAdmin(email, hash);
    }
    if (!id) return json({ error: "Could not save the login. Please try again." }, 500);

    const token = randomToken();
    await newSession(id, await sha256Hex(token), Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400);
    await touchLogin(id);
    await forgiveAttempts([gate.scopes[0]]);
    return json({ ok: true, reset: !!existing }, 200, { "set-cookie": sessionCookie(token, isHttps(request.url)) });
  } catch (err) {
    console.error("setup failed", err);
    return json({ error: "The database could not be reached. Please try again." }, 503);
  }
};
