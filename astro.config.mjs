import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

// On-demand rendering on Cloudflare Workers. Pairs and settings are read from D1 on every request,
// so a pair marked sold in /admin disappears from the shop straight away (no rebuild needed).
export default defineConfig({
  output: "server",
  adapter: cloudflare({ imageService: "passthrough" }),
  // No Astro sessions: the cart and saved pairs live in the browser, and admin sign-in is Cloudflare Access.
  // (Leaving this on makes the adapter add an unused KV store that has to be created on every deploy.)
  session: false,
  trailingSlash: "always",
  build: { format: "directory" },
});
