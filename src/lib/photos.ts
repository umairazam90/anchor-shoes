import { getPhotos } from "./db";

const gone = () => new Response("Not found", { status: 404, headers: { "x-astro-reroute": "no" } });

// Photos uploaded from the admin live in R2 and are served at /img/pairs/<random-name>.jpg.
// Every upload gets a new random name, so a photo never changes under its URL and browsers can keep it for a year.
// (Handled in the middleware rather than as a page route, so the URL needs no trailing slash.)
export async function servePhoto(request: Request, pathname: string): Promise<Response> {
  const key = pathname.slice("/img/".length);
  const bucket = getPhotos();
  if (!bucket || !/^pairs\/[A-Za-z0-9._-]+$/.test(key)) return gone();
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
