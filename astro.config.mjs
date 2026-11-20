import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

// On-demand rendering on Cloudflare Workers. Pairs and settings are read from D1 on every request,
// so a pair marked sold in /admin disappears from the shop straight away (no rebuild needed).
export default defineConfig({
  output: "server",
  adapter: cloudflare({ imageService: "passthrough" }),
  trailingSlash: "always",
  build: { format: "directory" },
});
