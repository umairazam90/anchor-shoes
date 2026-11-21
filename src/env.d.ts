/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** pairs + settings for this request (set in middleware.ts for every storefront page) */
    shop: import("./lib/shop").Shop;
    /** set only on /admin and /api/admin/* once the sign-in has been checked */
    admin?: { email: string; via: "access" | "dev" };
  }
}

// Cloudflare injects its bindings (DB, PHOTOS and the admin variables) through this module.
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
