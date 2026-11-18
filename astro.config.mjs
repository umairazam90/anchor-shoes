import { defineConfig } from "astro/config";

// Static output. Cloudflare serves ./dist through Workers static assets (see wrangler.jsonc).
export default defineConfig({
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
});
