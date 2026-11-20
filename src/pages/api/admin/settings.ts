import type { APIRoute } from "astro";
import { getSettings, saveSettings } from "../../../lib/db";
import { json, readJson } from "../../../lib/http";
import { validateSettings } from "../../../lib/validate";

export const GET: APIRoute = async () => json({ settings: await getSettings() });

export const PUT: APIRoute = async ({ request }) => {
  const v = validateSettings(await readJson(request), await getSettings());
  if (!v.ok) return json({ errors: v.errors }, 422);
  await saveSettings(v.value);
  return json({ settings: v.value });
};
