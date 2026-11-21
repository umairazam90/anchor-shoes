// POST /api/admin/admins/  adds another admin login (email + password). Only a signed-in admin can reach it.
import type { APIRoute } from "astro";
import { checkNewPassword, hashPassword } from "../../../../lib/password";
import { normalizeEmail, validEmail } from "../../../../lib/adminauth";
import { createAdmin, getPasswordIterations } from "../../../../lib/db";
import { json, readJson } from "../../../../lib/http";

const text = (v: unknown) => (typeof v === "string" ? v : "");

export const POST: APIRoute = async ({ request }) => {
  const body = (await readJson(request)) as Record<string, unknown> | null;
  const email = normalizeEmail(text(body?.email));
  const password = text(body?.password);
  const errors: Record<string, string> = {};
  if (!validEmail(email)) errors.email = "Enter a full email address.";
  const weak = checkNewPassword(password, email);
  if (weak) errors.password = weak;
  else if (password !== text(body?.again)) errors.again = "The two passwords are not the same.";
  if (Object.keys(errors).length) return json({ errors }, 422);

  const id = await createAdmin(email, await hashPassword(password, getPasswordIterations()));
  if (!id) return json({ errors: { email: "That email already has a login." } }, 422);
  return json({ ok: true, id }, 201);
};
