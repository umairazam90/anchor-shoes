import type { APIRoute } from "astro";

// Read by the cart, search and saved-pairs scripts. Always live: it comes straight from the database.
export const GET: APIRoute = ({ locals }) =>
  new Response(JSON.stringify({ items: locals.shop.catalogItems() }), {
    headers: { "content-type": "application/json", "cache-control": "no-cache" },
  });
