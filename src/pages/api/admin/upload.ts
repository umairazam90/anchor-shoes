import type { APIRoute } from "astro";
import { getPhotos } from "../../../lib/db";
import { json } from "../../../lib/http";

const MAX_BYTES = 3 * 1024 * 1024;

/** what the file really is, from its first bytes (the file name and the type the browser claims are not trusted) */
function sniff(b: Uint8Array): { mime: string; ext: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { mime: "image/webp", ext: "webp" };
  return null;
}

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
  const type = sniff(bytes);
  if (!type) return json({ error: "Only JPG, PNG or WebP photos can be uploaded." }, 415);

  const key = `pairs/${crypto.randomUUID()}.${type.ext}`;
  await bucket.put(key, bytes, { httpMetadata: { contentType: type.mime } });
  return json({ url: `/img/${key}` }, 201);
};
