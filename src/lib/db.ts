// D1 (pairs + settings) and R2 (photos). Everything that talks to Cloudflare storage lives here.
// Tables are created on first use (ensureDb), so deploying from GitHub needs no manual database step.
import { env } from "cloudflare:workers";
import seed from "../data/products.json";
import { DEFAULT_SETTINGS, brandSlug, makeShop, sizeSlug, type Product, type Settings } from "./shop";
import type { PairInput } from "./validate";
import type { AccessEnv } from "./access";
import type { D1Database, R2Bucket } from "./cf-types";

type Bindings = AccessEnv & { DB?: D1Database; PHOTOS?: R2Bucket };
const bindings = () => env as unknown as Bindings;

export const getDb = () => bindings().DB;
export const getPhotos = () => bindings().PHOTOS;
export const getAccessEnv = (): AccessEnv => {
  const b = bindings();
  return { TEAM_DOMAIN: b.TEAM_DOMAIN, POLICY_AUD: b.POLICY_AUD, ADMIN_EMAILS: b.ADMIN_EMAILS, DEV_ADMIN_EMAIL: b.DEV_ADMIN_EMAIL };
};

/* ---------- schema ---------- */
// Each entry is one version of the schema. To change the tables later, ADD a new entry; never edit an old one.
const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE IF NOT EXISTS pairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      brand TEXT NOT NULL,
      colour TEXT NOT NULL DEFAULT '',
      eu REAL NOT NULL,
      uk REAL, us REAL, cm REAL, insole REAL,
      cond INTEGER NOT NULL,
      price INTEGER NOT NULL,
      flaws TEXT NOT NULL DEFAULT '',
      photos TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','sold')),
      sample INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      sold_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS pairs_status ON pairs (status)`,
  ],
];

let ready: Promise<void> | null = null;

/** Creates the tables (once per Worker instance) and puts the sample pairs in on the very first run. */
export function ensureDb(db: D1Database): Promise<void> {
  ready ??= (async () => {
    await db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    const row = await db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").first<{ value: string }>();
    const have = row ? Number(row.value) : 0;
    for (let v = have; v < MIGRATIONS.length; v++) {
      await db.batch([
        ...MIGRATIONS[v].map((sql) => db.prepare(sql)),
        db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(String(v + 1)),
      ]);
    }
    const seeded = await db.prepare("SELECT value FROM meta WHERE key = 'seeded'").first();
    if (!seeded) {
      // INSERT OR IGNORE: two instances starting at the same moment cannot create duplicates
      const stmts = (seed as Product[]).map((p) => insertStatement(db, p, true));
      await db.batch([...stmts, db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('seeded', '1')")]);
    }
  })().catch((e) => {
    ready = null; // try again on the next request
    throw e;
  });
  return ready;
}

/* ---------- rows <-> products ---------- */
type PairRow = {
  id: number; slug: string; name: string; brand: string; colour: string;
  eu: number; uk: number | null; us: number | null; cm: number | null; insole: number | null;
  cond: number; price: number; flaws: string; photos: string; status: string; sample: number;
  created_at: string; updated_at: string; sold_at: string | null;
};

function rowToProduct(r: PairRow): Product {
  const size: Product["size"] = { eu: r.eu };
  if (r.uk != null) size.uk = r.uk;
  if (r.us != null) size.us = r.us;
  if (r.cm != null) size.cm = r.cm;
  let photos: string[] = [];
  try { photos = JSON.parse(r.photos); } catch { /* keep [] */ }
  const p: Product = {
    slug: r.slug, name: r.name, brand: r.brand, colour: r.colour, size,
    condition: r.cond, price: r.price, flaws: r.flaws, photos,
    status: r.status === "sold" ? "sold" : "available",
    createdAt: r.created_at, soldAt: r.sold_at,
  };
  if (r.insole != null) p.insole = r.insole;
  if (r.sample) p.sample = true;
  return p;
}

function insertStatement(db: D1Database, p: Product, sample = false) {
  return db
    .prepare(
      `INSERT OR IGNORE INTO pairs (slug, name, brand, colour, eu, uk, us, cm, insole, cond, price, flaws, photos, status, sample, sold_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ${p.status === "sold" ? "datetime('now')" : "NULL"})`,
    )
    .bind(
      p.slug, p.name, p.brand, p.colour, p.size.eu, p.size.uk ?? null, p.size.us ?? null, p.size.cm ?? null,
      p.insole ?? null, p.condition, p.price, p.flaws, JSON.stringify(p.photos), p.status, sample || p.sample ? 1 : 0,
    );
}

/* ---------- the shop (storefront) ---------- */
function mergeSettings(stored: string | undefined | null): Settings {
  if (!stored) return { ...DEFAULT_SETTINGS };
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }; } catch { return { ...DEFAULT_SETTINGS }; }
}

/** One snapshot of pairs + settings for a request. Without a database (not connected yet) the bundled sample pairs are used. */
export async function loadShop() {
  const db = getDb();
  if (!db) return makeShop(seed as Product[], DEFAULT_SETTINGS);
  await ensureDb(db);
  const [pairs, settings] = await db.batch([
    db.prepare("SELECT * FROM pairs ORDER BY id"),
    db.prepare("SELECT value FROM meta WHERE key = 'settings'"),
  ]);
  const products = (pairs.results as PairRow[]).map(rowToProduct);
  const stored = (settings.results as { value: string }[])[0]?.value;
  return makeShop(products, mergeSettings(stored));
}

/* ---------- admin: pairs ---------- */
async function adminDb(): Promise<D1Database> {
  const db = getDb();
  if (!db) throw new Error("The database is not connected yet (see SETUP-ADMIN.md).");
  await ensureDb(db);
  return db;
}

export async function listPairs(): Promise<Product[]> {
  const db = await adminDb();
  const { results } = await db.prepare("SELECT * FROM pairs ORDER BY id").all<PairRow>();
  return results.map(rowToProduct);
}

export async function getPair(slug: string): Promise<Product | null> {
  const db = await adminDb();
  const r = await db.prepare("SELECT * FROM pairs WHERE slug = ?").bind(slug).first<PairRow>();
  return r ? rowToProduct(r) : null;
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "pair";

async function freeSlug(db: D1Database, input: PairInput): Promise<string> {
  const base = `${slugify(input.name.toLowerCase().startsWith(input.brand.toLowerCase()) ? input.name : `${input.brand} ${input.name}`)}-eu${sizeSlug(input.size.eu)}`;
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const taken = await db.prepare("SELECT 1 FROM pairs WHERE slug = ?").bind(slug).first();
    if (!taken) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

export async function createPair(input: PairInput): Promise<Product> {
  const db = await adminDb();
  const slug = await freeSlug(db, input);
  await insertStatement(db, { ...input, slug }).run();
  return (await getPair(slug))!;
}

/** Removes uploaded files that no other pair still uses (bundled /images/ files are left alone). */
async function dropPhotos(db: D1Database, urls: string[], exceptSlug: string) {
  const bucket = getPhotos();
  if (!bucket) return;
  const keys: string[] = [];
  for (const url of urls.filter((u) => u.startsWith("/img/"))) {
    const used = await db
      .prepare("SELECT 1 FROM pairs WHERE slug != ?1 AND instr(photos, ?2) > 0 LIMIT 1")
      .bind(exceptSlug, `"${url}"`)
      .first();
    if (!used) keys.push(url.slice("/img/".length));
  }
  if (keys.length) await bucket.delete(keys);
}

export async function updatePair(slug: string, input: PairInput): Promise<Product | null> {
  const db = await adminDb();
  const before = await getPair(slug);
  if (!before) return null;
  const sold = input.status === "sold";
  await db
    .prepare(
      `UPDATE pairs SET name=?1, brand=?2, colour=?3, eu=?4, uk=?5, us=?6, cm=?7, insole=?8, cond=?9, price=?10, flaws=?11, photos=?12,
         status=?13, sold_at = CASE WHEN ?14 = 1 THEN COALESCE(sold_at, datetime('now')) ELSE NULL END, updated_at = datetime('now')
       WHERE slug = ?15`,
    )
    .bind(
      input.name, input.brand, input.colour, input.size.eu, input.size.uk ?? null, input.size.us ?? null, input.size.cm ?? null,
      input.insole ?? null, input.condition, input.price, input.flaws, JSON.stringify(input.photos), input.status, sold ? 1 : 0, slug,
    )
    .run();
  await dropPhotos(db, before.photos.filter((u) => !input.photos.includes(u)), slug);
  return getPair(slug);
}

export async function setStatus(slug: string, status: "available" | "sold"): Promise<boolean> {
  const db = await adminDb();
  const r = await db
    .prepare(
      `UPDATE pairs SET status = ?1, sold_at = CASE WHEN ?1 = 'sold' THEN COALESCE(sold_at, datetime('now')) ELSE NULL END, updated_at = datetime('now') WHERE slug = ?2`,
    )
    .bind(status, slug)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

export async function deletePair(slug: string): Promise<boolean> {
  const db = await adminDb();
  const before = await getPair(slug);
  if (!before) return false;
  await db.prepare("DELETE FROM pairs WHERE slug = ?").bind(slug).run();
  await dropPhotos(db, before.photos, slug);
  return true;
}

/** Deletes the 5 demo pairs that came with the first install. Real pairs are never touched. */
export async function deleteSamples(): Promise<number> {
  const db = await adminDb();
  const r = await db.prepare("DELETE FROM pairs WHERE sample = 1").run();
  return r.meta.changes ?? 0;
}

export async function knownBrands(): Promise<string[]> {
  const db = await adminDb();
  const { results } = await db.prepare("SELECT DISTINCT brand FROM pairs ORDER BY brand").all<{ brand: string }>();
  const names = new Set(results.map((r) => r.brand));
  for (const b of ["Nike", "Adidas", "Puma", "Jordan", "New Balance", "Converse", "Vans", "Reebok", "Skechers"]) {
    if (![...names].some((n) => brandSlug(n) === brandSlug(b))) names.add(b);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/* ---------- admin: settings ---------- */
export async function getSettings(): Promise<Settings> {
  const db = await adminDb();
  const row = await db.prepare("SELECT value FROM meta WHERE key = 'settings'").first<{ value: string }>();
  return mergeSettings(row?.value);
}

export async function saveSettings(s: Settings): Promise<void> {
  const db = await adminDb();
  await db
    .prepare("INSERT INTO meta (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(JSON.stringify(s))
    .run();
}
