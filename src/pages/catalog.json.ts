import { catalogItems } from "../lib/shop";

// Read by the cart, search and saved-pairs scripts. Becomes a live endpoint when pairs move to D1.
export function GET() {
  return new Response(JSON.stringify({ items: catalogItems() }), {
    headers: { "content-type": "application/json", "cache-control": "no-cache" },
  });
}
