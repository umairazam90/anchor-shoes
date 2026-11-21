import type { APIRoute } from "astro";
import { sameOrigin } from "../../lib/access";
import { addReview, getPhotos, reviewCounts } from "../../lib/db";
import { json } from "../../lib/http";
import { sniffImage } from "../../lib/photos";
import { LIMITS, validateReview } from "../../lib/reviews";

// Public: anyone can send a review, so every guard here is cheap and strict.
// A new review is saved as "pending" and only shows on the shop after it is approved in the admin.
const MAX_REQUEST = LIMITS.photos * LIMITS.photoBytes + 200 * 1024;
const PER_HOUR = 2;
const PER_DAY = 4;
const MAX_WAITING = 60;

/** the sender's address, scrambled and mixed with today's date: enough to count their reviews, not to look them up later */
async function senderKey(request: Request): Promise<string> {
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const data = new TextEncoder().encode(`${ip}|${new Date().toISOString().slice(0, 10)}|anchor-reviews`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const POST: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) return json({ error: "This request was refused. Please send your review from the shop's home page." }, 403);
  if (!(request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) return json({ error: "Please use the review form." }, 415);
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_REQUEST) return json({ error: "That is too much to send at once. Please use fewer or smaller photos." }, 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Your review could not be read. Please try again." }, 400);
  }

  // hidden field that people never see: a robot fills it in. Pretend it worked and save nothing.
  if (String(form.get("website") ?? "").trim()) return json({ ok: true }, 201);

  const v = validateReview({ name: form.get("name"), city: form.get("city"), rating: form.get("rating"), comment: form.get("comment") });
  const errors: Record<string, string> = v.ok ? {} : { ...v.errors };

  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > LIMITS.photos) errors.photos = `You can add ${LIMITS.photos} photos at most.`;
  else if (files.some((f) => f.size > LIMITS.photoBytes)) errors.photos = "One of the photos is too big (2 MB at most).";

  // read every photo and check what it really is before anything is stored
  const ready: { bytes: Uint8Array; mime: string; ext: string }[] = [];
  if (!errors.photos) {
    for (const f of files) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const type = sniffImage(bytes);
      if (!type) {
        errors.photos = "Only JPG, PNG or WebP photos can be added.";
        break;
      }
      ready.push({ bytes, ...type });
    }
  }
  if (!v.ok || errors.photos) return json({ errors }, 422);

  const bucket = getPhotos();
  if (ready.length && !bucket) return json({ error: "Photos cannot be saved right now. Please try again later, or send your review without photos." }, 503);

  const sender = await senderKey(request);
  try {
    const n = await reviewCounts(sender);
    if (n.hour >= PER_HOUR || n.day >= PER_DAY) return json({ error: "You have sent a few reviews already. Thank you! Please try again later." }, 429);
    if (n.pending >= MAX_WAITING) return json({ error: "We have a lot of reviews to check right now. Please try again tomorrow." }, 429);
  } catch {
    return json({ error: "Reviews cannot be saved right now. Please try again in a moment." }, 503);
  }

  const keys: string[] = [];
  try {
    for (const p of ready) {
      const key = `reviews/${crypto.randomUUID()}.${p.ext}`;
      await bucket!.put(key, p.bytes, { httpMetadata: { contentType: p.mime } });
      keys.push(key);
    }
    await addReview(v.value, keys.map((k) => `/img/${k}`), sender);
  } catch {
    if (bucket && keys.length) await bucket.delete(keys).catch(() => {});
    return json({ error: "Your review could not be saved. Please try again in a moment." }, 503);
  }
  return json({ ok: true }, 201);
};
