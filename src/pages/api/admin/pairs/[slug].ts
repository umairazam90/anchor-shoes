import type { APIRoute } from "astro";
import { deletePair, getPair, setStatus, updatePair } from "../../../../lib/db";
import { json, readJson } from "../../../../lib/http";
import { validatePair } from "../../../../lib/validate";

const missing = () => json({ error: "That pair no longer exists." }, 404);

export const GET: APIRoute = async ({ params }) => {
  const pair = await getPair(params.slug ?? "");
  return pair ? json({ pair }) : missing();
};

/** save all details of a pair */
export const PUT: APIRoute = async ({ params, request }) => {
  const v = validatePair(await readJson(request));
  if (!v.ok) return json({ errors: v.errors }, 422);
  const pair = await updatePair(params.slug ?? "", v.value);
  return pair ? json({ pair }) : missing();
};

/** quick change of status only: { "status": "sold" } or { "status": "available" } */
export const PATCH: APIRoute = async ({ params, request }) => {
  const body = (await readJson(request)) as { status?: string } | null;
  if (body?.status !== "sold" && body?.status !== "available") return json({ error: "Status must be sold or available." }, 422);
  return (await setStatus(params.slug ?? "", body.status)) ? json({ ok: true, status: body.status }) : missing();
};

export const DELETE: APIRoute = async ({ params }) => ((await deletePair(params.slug ?? "")) ? json({ ok: true }) : missing());
