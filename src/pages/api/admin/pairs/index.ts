import type { APIRoute } from "astro";
import { createPair, listPairs } from "../../../../lib/db";
import { json, readJson } from "../../../../lib/http";
import { validatePair } from "../../../../lib/validate";

export const GET: APIRoute = async () => json({ pairs: await listPairs() });

export const POST: APIRoute = async ({ request }) => {
  const v = validatePair(await readJson(request));
  if (!v.ok) return json({ errors: v.errors }, 422);
  return json({ pair: await createPair(v.value) }, 201);
};
