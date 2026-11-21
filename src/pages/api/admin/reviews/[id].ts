import type { APIRoute } from "astro";
import { deleteReview, setReviewStatus } from "../../../../lib/db";
import { json, readJson } from "../../../../lib/http";

const missing = () => json({ error: "That review no longer exists." }, 404);
const idOf = (raw: string | undefined) => (/^\d{1,9}$/.test(raw ?? "") ? Number(raw) : 0);

/** publish or take back a review: { "status": "approved" } or { "status": "pending" } */
export const PATCH: APIRoute = async ({ params, request }) => {
  const body = (await readJson(request)) as { status?: string } | null;
  if (body?.status !== "approved" && body?.status !== "pending") return json({ error: "Status must be approved or pending." }, 422);
  const id = idOf(params.id);
  return id && (await setReviewStatus(id, body.status)) ? json({ ok: true, status: body.status }) : missing();
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = idOf(params.id);
  return id && (await deleteReview(id)) ? json({ ok: true }) : missing();
};
