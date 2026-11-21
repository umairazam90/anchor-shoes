/** "X-Astro-Reroute: no" stops Astro from swapping an API error for the website's 404 page */
export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...(status >= 400 ? { "x-astro-reroute": "no" } : {}) },
  });

/** body of a request as JSON, or null when it is missing or not valid JSON */
export async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
