import type { APIRoute } from "astro";
import { getPhotos } from "../../../lib/db";
import { json } from "../../../lib/http";
import { sniffImage } from "../../../lib/photos";

const MAX_BYTES = 3 * 1024 * 1024;

export const POST: APIRoute = async ({ request }) => {
  const bucket = getPhotos();
  if (!bucket) return json({ error: "Photo storage is not connected yet (see SETUP-ADMIN.md)." }, 503);

  let file: FormDataEntryValue | null = null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return json({ error: "No photo was received." }, 400);
  }
  if (!(file instanceof File)) return json({ error: "No photo was received." }, 400);
  if (file.size > MAX_BYTES) return json({ error: "This photo is too big (3 MB at most)." }, 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) return json({ error: "Only JPG, PNG or WebP photos can be uploaded." }, 415);

  const key = `pairs/${crypto.randomUUID()}.${type.ext}`;
  await bucket.put(key, bytes, { httpMetadata: { contentType: type.mime } });
  return json({ url: `/img/${key}` }, 201);
};
