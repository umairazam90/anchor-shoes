// PUT /api/admin/password/  changes the password of the admin who is signed in (needs the current one) and signs out their other devices.
import type { APIRoute } from "astro";
import { checkNewPassword, hashPassword, sha256Hex, verifyPassword } from "../../../lib/password";
import { readSessionToken } from "../../../lib/adminauth";
import { endSessionsOf, getAdminById, getPasswordIterations, setAdminPassword } from "../../../lib/db";
import { loginGate } from "../../../lib/guard";
import { json, readJson } from "../../../lib/http";

const text = (v: unknown) => (typeof v === "string" ? v : "");

export const PUT: APIRoute = async ({ request, locals }) => {
  const me = locals.admin;
  if (!me?.id || me.via !== "password") {
    return json({ error: "Only an admin who signed in with a password can change it here. Add a password login first." }, 400);
  }
  const body = (await readJson(request)) as Record<string, unknown> | null;
  const errors: Record<string, string> = {};
  const weak = checkNewPassword(text(body?.next), me.email);
  if (weak) errors.next = weak;
  else if (text(body?.next) !== text(body?.again)) errors.again = "The two passwords are not the same.";
  if (!text(body?.current)) errors.current = "Enter your current password.";
  if (Object.keys(errors).length) return json({ errors }, 422);

  // guessing the current password is limited exactly like signing in
  const gate = await loginGate(request, me.email);
  if (gate.locked) return json({ error: "Too many tries. Please wait 15 minutes and try again." }, 429);
  const row = await getAdminById(me.id);
  if (!row || !(await verifyPassword(text(body?.current), row.password_hash))) return json({ errors: { current: "That is not your current password." } }, 422);

  await setAdminPassword(me.id, await hashPassword(text(body?.next), getPasswordIterations()));
  await endSessionsOf(me.id, await sha256Hex(readSessionToken(request)));
  return json({ ok: true });
};
