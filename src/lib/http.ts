/** "X-Astro-Reroute: no" stops Astro from swapping an API error for the website's 404 page */
export const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...(status >= 400 ? { "x-astro-reroute": "no" } : {}), ...extra },
  });

/** a redirect that can also carry a cookie (Response.redirect() cannot) */
export const redirect = (to: string, cookie?: string, status = 303) =>
  new Response(null, { status, headers: { location: to, "cache-control": "no-store", ...(cookie ? { "set-cookie": cookie } : {}) } });

/** body of a request as JSON, or null when it is missing or not valid JSON */
export async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
