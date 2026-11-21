// D1 (pairs + settings) and R2 (photos). Everything that talks to Cloudflare storage lives here.
// Tables are created on first use (ensureDb), so deploying from GitHub needs no manual database step.
import { env } from "cloudflare:workers";
import seed from "../data/products.json";
import { DEFAULT_SETTINGS, brandSlug, makeShop, sizeSlug, type Product, type Settings } from "./shop";
import type { PairInput } from "./validate";
import { summarize, type Review, type ReviewInput } from "./reviews";
import type { AccessEnv } from "./access";
import { parseIterations } from "./password";
import type { D1Database, R2Bucket } from "./cf-types";

type Bindings = AccessEnv & { DB?: D1Database; PHOTOS?: R2Bucket; SETUP_CODE?: string; PASSWORD_ITERATIONS?: string };
const bindings = () => env as unknown as Bindings;

export const getDb = () => bindings().DB;
export const getPhotos = () => bindings().PHOTOS;
export const getAccessEnv = (): AccessEnv => {
  const b = bindings();
  return { TEAM_DOMAIN: b.TEAM_DOMAIN, POLICY_AUD: b.POLICY_AUD, ADMIN_EMAILS: b.ADMIN_EMAILS, DEV_ADMIN_EMAIL: b.DEV_ADMIN_EMAIL };
};

/** the secret that allows creating or resetting an admin login at /admin/setup/ (empty = that page is switched off) */
export const getSetupCode = () => (bindings().SETUP_CODE ?? "").trim();
/** how many rounds the password hash uses (PASSWORD_ITERATIONS in the dashboard; empty = the default) */
export const getPasswordIterations = () => parseIterations(bindings().PASSWORD_ITERATIONS);

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
  [
    // customer reviews; a new review is 'pending' until it is approved in the admin. ip_hash only serves the rate limit.
    `CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL,
      photos TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved')),
      ip_hash TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      decided_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS reviews_status ON reviews (status, id)`,
  ],
  [
    // email + password admin login. Only a salted hash of each password is stored, and only a hash of each session token.
    `CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      admin_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS admin_sessions_admin ON admin_sessions (admin_id)`,
    // one row per sign-in attempt, used for the wrong-password limits (scope = hashed address or email, at = unix seconds)
    `CREATE TABLE IF NOT EXISTS login_fails (scope TEXT NOT NULL, at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS login_fails_scope ON login_fails (scope, at)`,
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

/* ---------- reviews ---------- */
type ReviewRow = { id: number; name: string; city: string; rating: number; comment: string; photos: string; status: string; created_at: string };

function rowToReview(r: ReviewRow): Review {
  let photos: string[] = [];
  try {
    const v = JSON.parse(r.photos);
    if (Array.isArray(v)) photos = v.filter((u) => typeof u === "string");
  } catch { /* keep no photos */ }
  return { id: r.id, name: r.name, city: r.city, rating: r.rating, comment: r.comment, photos, status: r.status === "approved" ? "approved" : "pending", createdAt: r.created_at };
}

/** what the home page shows: the newest approved reviews, plus the count and average over all approved ones */
export async function approvedReviews(limit = 9): Promise<{ reviews: Review[]; count: number; average: number }> {
  const db = getDb();
  if (!db) return { reviews: [], count: 0, average: 0 };
  await ensureDb(db);
  const [list, all] = await db.batch([
    db.prepare("SELECT * FROM reviews WHERE status = 'approved' ORDER BY id DESC LIMIT ?").bind(limit),
    db.prepare("SELECT rating FROM reviews WHERE status = 'approved'"),
  ]);
  return { reviews: (list.results as ReviewRow[]).map(rowToReview), ...summarize(all.results as { rating: number }[]) };
}

/** admin list: waiting reviews first (oldest first, so none is forgotten), then the published ones (newest first) */
export async function listReviews(): Promise<Review[]> {
  const db = await adminDb();
  const { results } = await db
    .prepare("SELECT * FROM reviews ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, CASE status WHEN 'pending' THEN id END ASC, id DESC")
    .all<ReviewRow>();
  return results.map(rowToReview);
}

export async function pendingReviewCount(): Promise<number> {
  const db = await adminDb();
  const r = await db.prepare("SELECT COUNT(*) AS n FROM reviews WHERE status = 'pending'").first<{ n: number }>();
  return r?.n ?? 0;
}

/** how many reviews this sender made in the last hour and day, and how many reviews wait for approval in total */
export async function reviewCounts(ipHash: string): Promise<{ hour: number; day: number; pending: number }> {
  const db = await adminDb();
  const r = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM reviews WHERE ip_hash = ?1 AND created_at > datetime('now', '-1 hour')) AS hour,
         (SELECT COUNT(*) FROM reviews WHERE ip_hash = ?1 AND created_at > datetime('now', '-1 day')) AS day,
         (SELECT COUNT(*) FROM reviews WHERE status = 'pending') AS pending`,
    )
    .bind(ipHash)
    .first<{ hour: number; day: number; pending: number }>();
  return { hour: r?.hour ?? 0, day: r?.day ?? 0, pending: r?.pending ?? 0 };
}

export async function addReview(input: ReviewInput, photos: string[], ipHash: string): Promise<void> {
  const db = await adminDb();
  await db
    .prepare("INSERT INTO reviews (name, city, rating, comment, photos, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(input.name, input.city, input.rating, input.comment, JSON.stringify(photos), ipHash)
    .run();
}

/** publish (approved) or take back (pending). The sender's address hash is wiped once a person has looked at the review. */
export async function setReviewStatus(id: number, status: "approved" | "pending"): Promise<boolean> {
  const db = await adminDb();
  const r = await db.prepare("UPDATE reviews SET status = ?1, ip_hash = '', decided_at = datetime('now') WHERE id = ?2").bind(status, id).run();
  return (r.meta.changes ?? 0) > 0;
}

/** deletes a review and its photos from storage */
export async function deleteReview(id: number): Promise<boolean> {
  const db = await adminDb();
  const row = await db.prepare("SELECT * FROM reviews WHERE id = ?").bind(id).first<ReviewRow>();
  if (!row) return false;
  await db.prepare("DELETE FROM reviews WHERE id = ?").bind(id).run();
  const bucket = getPhotos();
  const keys = rowToReview(row).photos.filter((u) => u.startsWith("/img/reviews/")).map((u) => u.slice("/img/".length));
  if (bucket && keys.length) await bucket.delete(keys);
  return true;
}

/* ---------- admin logins ---------- */
export type AdminRow = { id: number; email: string; password_hash: string; created_at: string; last_login_at: string | null };
export type AdminInfo = { id: number; email: string; createdAt: string; lastLogin: string | null };

const nowSec = () => Math.floor(Date.now() / 1000);

export async function countAdmins(): Promise<number> {
  const db = await adminDb();
  const r = await db.prepare("SELECT COUNT(*) AS n FROM admins").first<{ n: number }>();
  return r?.n ?? 0;
}

export async function listAdmins(): Promise<AdminInfo[]> {
  const db = await adminDb();
  const { results } = await db.prepare("SELECT id, email, created_at, last_login_at FROM admins ORDER BY id").all<AdminRow>();
  return results.map((r) => ({ id: r.id, email: r.email, createdAt: r.created_at, lastLogin: r.last_login_at }));
}

export async function findAdmin(email: string): Promise<AdminRow | null> {
  const db = await adminDb();
  return db.prepare("SELECT * FROM admins WHERE email = ?").bind(email).first<AdminRow>();
}

export async function getAdminById(id: number): Promise<AdminRow | null> {
  const db = await adminDb();
  return db.prepare("SELECT * FROM admins WHERE id = ?").bind(id).first<AdminRow>();
}

/** adds an admin; returns its id, or null when that email already has a login */
export async function createAdmin(email: string, passwordHash: string): Promise<number | null> {
  const db = await adminDb();
  const r = await db.prepare("INSERT INTO admins (email, password_hash) VALUES (?1, ?2) ON CONFLICT(email) DO NOTHING").bind(email, passwordHash).run();
  if (!(r.meta.changes ?? 0)) return null;
  const row = await findAdmin(email);
  return row?.id ?? null;
}

export async function setAdminPassword(id: number, passwordHash: string): Promise<void> {
  const db = await adminDb();
  await db.prepare("UPDATE admins SET password_hash = ?1 WHERE id = ?2").bind(passwordHash, id).run();
}

/** removes an admin and every session of theirs */
export async function deleteAdmin(id: number): Promise<boolean> {
  const db = await adminDb();
  const [, r] = await db.batch([
    db.prepare("DELETE FROM admin_sessions WHERE admin_id = ?").bind(id),
    db.prepare("DELETE FROM admins WHERE id = ?").bind(id),
  ]);
  return (r.meta.changes ?? 0) > 0;
}

export async function newSession(adminId: number, tokenHash: string, expiresAt: number): Promise<void> {
  const db = await adminDb();
  await db.prepare("INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES (?1, ?2, ?3)").bind(tokenHash, adminId, expiresAt).run();
}

/** who this (hashed) session token belongs to, or null when it is unknown or expired */
export async function sessionAdmin(tokenHash: string): Promise<{ id: number; email: string } | null> {
  const db = await adminDb();
  return db
    .prepare("SELECT a.id AS id, a.email AS email FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = ?1 AND s.expires_at > ?2")
    .bind(tokenHash, nowSec())
    .first<{ id: number; email: string }>();
}

export async function endSession(tokenHash: string): Promise<void> {
  const db = await adminDb();
  await db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(tokenHash).run();
}

/** signs an admin out everywhere, optionally keeping the session they are using right now */
export async function endSessionsOf(adminId: number, keepHash = ""): Promise<void> {
  const db = await adminDb();
  await db.prepare("DELETE FROM admin_sessions WHERE admin_id = ?1 AND token_hash <> ?2").bind(adminId, keepHash).run();
}

/** after a successful sign-in: remember the time and tidy up expired sessions */
export async function touchLogin(adminId: number): Promise<void> {
  const db = await adminDb();
  await db.batch([
    db.prepare("UPDATE admins SET last_login_at = datetime('now') WHERE id = ?").bind(adminId),
    db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(nowSec()),
  ]);
}

/** counts one attempt on each scope, tidies old rows, and returns how many attempts each scope has in the last `windowMin` minutes (this one included) */
export async function chargeAttempt(scopes: string[], windowMin: number): Promise<Record<string, number>> {
  const db = await adminDb();
  const now = nowSec();
  await db.batch([
    db.prepare("DELETE FROM login_fails WHERE at < ?").bind(now - 86400),
    ...scopes.map((s) => db.prepare("INSERT INTO login_fails (scope, at) VALUES (?1, ?2)").bind(s, now)),
  ]);
  const out: Record<string, number> = {};
  for (const s of scopes) {
    const r = await db.prepare("SELECT COUNT(*) AS n FROM login_fails WHERE scope = ?1 AND at > ?2").bind(s, now - windowMin * 60).first<{ n: number }>();
    out[s] = r?.n ?? 0;
  }
  return out;
}

/** forgives the attempts of these scopes (after a correct password) */
export async function forgiveAttempts(scopes: string[]): Promise<void> {
  const db = await adminDb();
  await db.batch(scopes.map((s) => db.prepare("DELETE FROM login_fails WHERE scope = ?").bind(s)));
}
