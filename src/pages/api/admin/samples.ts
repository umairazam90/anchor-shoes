import type { APIRoute } from "astro";
import { deleteSamples } from "../../../lib/db";
import { json } from "../../../lib/http";

/** removes the demo pairs that came with the first install */
export const DELETE: APIRoute = async () => json({ removed: await deleteSamples() });
