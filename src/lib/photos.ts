import { getPhotos } from "./db";

const gone = () => new Response("Not found", { status: 404, headers: { "x-astro-reroute": "no" } });

// Photos live in R2 and are served at /img/pairs/<random-name>.jpg (uploaded in the admin) or /img/reviews/<random-name>.jpg (sent by customers).
// Every upload gets a new random name, so a photo never changes under its URL and browsers can keep it for a year.
// (Handled in the middleware rather than as a page route, so the URL needs no trailing slash.)
export async function servePhoto(request: Request, pathname: string): Promise<Response> {
  const key = pathname.slice("/img/".length);
  const bucket = getPhotos();
  if (!bucket || !/^(pairs|reviews)\/[A-Za-z0-9._-]+$/.test(key)) return gone();
  const obj = await bucket.get(key);
  if (!obj) return gone();

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  if (request.headers.get("if-none-match") === obj.httpEtag) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : obj.body, { headers });
}

/** what an image really is, from its first bytes (the file name and the type the browser claims are not trusted) */
export function sniffImage(b: Uint8Array): { mime: string; ext: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { mime: "image/webp", ext: "webp" };
  return null;
}
