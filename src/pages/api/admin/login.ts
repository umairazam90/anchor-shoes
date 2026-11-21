// POST /api/admin/login/  (a plain HTML form: email, password, next). Open to everyone on purpose; everything else in /admin needs this first.
import type { APIRoute } from "astro";
import { PASSWORD, dummyHash, randomToken, sha256Hex, verifyPassword } from "../../../lib/password";
import { SESSION_DAYS, isHttps, normalizeEmail, safeNext, sessionCookie, validEmail } from "../../../lib/adminauth";
import { findAdmin, forgiveAttempts, getPasswordIterations, newSession, touchLogin } from "../../../lib/db";
import { loginGate } from "../../../lib/guard";
import { redirect } from "../../../lib/http";

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData().catch(() => null);
  const next = safeNext(String(form?.get("next") ?? ""));
  const back = (e: string) => redirect(`/admin/login/?e=${e}&next=${encodeURIComponent(next)}`);

  const email = normalizeEmail(String(form?.get("email") ?? ""));
  const password = String(form?.get("password") ?? "");
  if (!validEmail(email) || !password || password.length > PASSWORD.max) return back("form");

  try {
    // Count this attempt first. Over the limit: stop here, without even looking at the password.
    const gate = await loginGate(request, email);
    if (gate.locked) return back("locked");

    const admin = await findAdmin(email);
    // An unknown email still runs a full password check, so the answer takes the same time either way.
    const ok = await verifyPassword(password, admin?.password_hash ?? (await dummyHash(getPasswordIterations())));
    if (!admin || !ok) return back("bad");

    const token = randomToken();
    await newSession(admin.id, await sha256Hex(token), Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400);
    await touchLogin(admin.id);
    await forgiveAttempts(gate.scopes);
    return redirect(next, sessionCookie(token, isHttps(request.url)));
  } catch (err) {
    console.error("login failed", err);
    return back("down");
  }
};
