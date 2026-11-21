// DELETE /api/admin/admins/<id>/  removes an admin login and signs that person out everywhere.
import type { APIRoute } from "astro";
import { deleteAdmin } from "../../../../lib/db";
import { json } from "../../../../lib/http";

export const DELETE: APIRoute = async ({ params, locals }) => {
  const id = /^\d{1,9}$/.test(params.id ?? "") ? Number(params.id) : 0;
  if (!id) return json({ error: "Not found." }, 404);
  if (locals.admin?.id === id) return json({ error: "You cannot remove the login you are using. Ask another admin to do it." }, 400);
  return (await deleteAdmin(id)) ? json({ ok: true }) : json({ error: "Not found." }, 404);
};
