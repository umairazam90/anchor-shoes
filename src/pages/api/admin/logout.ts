// POST /api/admin/logout/ ends this browser's session and forgets the cookie.
import type { APIRoute } from "astro";
import { clearCookie, isHttps, readSessionToken } from "../../../lib/adminauth";
import { endSession } from "../../../lib/db";
import { sha256Hex } from "../../../lib/password";
import { redirect } from "../../../lib/http";

export const POST: APIRoute = async ({ request }) => {
  const token = readSessionToken(request);
  if (token) await endSession(await sha256Hex(token)).catch((e) => console.error("logout failed", e));
  return redirect("/admin/login/?e=out", clearCookie(isHttps(request.url)));
};
