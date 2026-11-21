import categories from "../data/categories.json";
import defaultSettings from "../data/settings.json";
import { euText, fullSize, has, type ProductSize } from "./sizes";

export type Product = {
  slug: string;
  name: string;
  brand: string;
  colour: string;
  size: ProductSize;
  /** measured insole length in cm, optional: the most reliable fit information for a pre-loved pair */
  insole?: number;
  condition: number;
  price: number;
  flaws: string;
  photos: string[];
  status: "available" | "sold";
  sample?: boolean;
  createdAt?: string;
  soldAt?: string | null;
};

export type Category = { slug: string; label: string; blurb: string; from: number; to: number };
export type Brand = { name: string; slug: string; open: number; total: number; photo?: string };
export type Settings = typeof defaultSettings;

export const DEFAULT_SETTINGS: Settings = defaultSettings;
export const allCategories = categories as Category[];

/* ---------- pure helpers (no data) ---------- */
export const rs = (n: number) => "Rs " + new Intl.NumberFormat("en-PK").format(n);
/** url piece for an EU size: 42 -> "42", 42.5 -> "42-5", 42 2/3 -> "42-2of3" */
export const sizeSlug = (eu: number) => euText(eu).replace(/\./g, "-").replace(/\s+/g, "-").replace("/", "of");
/** a category's "to" is its last half size, so anything below to + 0.5 belongs to it (this keeps adidas thirds in range) */
export const inRange = (c: Category, eu: number) => eu >= c.from && eu < c.to + 0.5;

export const brandSlug = (name: string) =>
  name.toLowerCase().replace(/&/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function sizeLine(p: Product) {
  const s = fullSize(p.size, p.brand);
  return `EU ${euText(s.eu)}` + (has(s.uk) ? ` · UK ${s.uk}` : "");
}

/* ---------- a snapshot of the shop for one request ---------- */
// Pairs and settings are read from D1 once per request (see db.ts and middleware.ts) and handed to
// makeShop(). Pages use Astro.locals.shop, so nothing here touches the database itself.
export function makeShop(allProducts: Product[], settings: Settings) {
  const available = () => allProducts.filter((p) => p.status === "available");
  const productsIn = (c: Category) => allProducts.filter((p) => inRange(c, p.size.eu));
  const categoryOf = (eu: number) => allCategories.find((c) => inRange(c, eu));
  const sizesIn = (c: Category) => [...new Set(productsIn(c).map((p) => p.size.eu))].sort((a, b) => a - b);
  const productsOfBrand = (slug: string) => allProducts.filter((p) => brandSlug(p.brand) === slug);

  /** one entry per brand, alphabetical. photo = the newest available pair (falls back to a sold one) */
  function allBrands(): Brand[] {
    const names = [...new Set(allProducts.map((p) => p.brand))].sort((a, b) => a.localeCompare(b));
    return names.map((name) => {
      const items = allProducts.filter((p) => p.brand === name);
      const open = items.filter((p) => p.status === "available");
      const pick = [...(open.length ? open : items)].reverse()[0];
      return { name, slug: brandSlug(name), open: open.length, total: items.length, photo: pick?.photos[0] };
    });
  }

  /** digits for wa.me. Accepts 03xx..., +92 3xx... or 923xx... Returns "" while no number is set. */
  function waDigits(): string {
    let d = (settings.whatsapp || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.startsWith("0")) d = "92" + d.slice(1);
    return d;
  }

  function waLink(text: string): string {
    const d = waDigits();
    return d ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : "";
  }

  /** tel: link without spaces, so it dials correctly on every phone */
  function telHref(): string {
    const raw = (settings.phone || "").trim();
    if (!raw) return "";
    let d = raw.replace(/[^\d+]/g, "");
    if (d.startsWith("0")) d = "+92" + d.slice(1);
    else if (!d.startsWith("+")) d = "+" + d;
    return `tel:${d}`;
  }

  /** short return policy for the shoe page. The full text lives on /returns/. */
  const returnSummary = () => (settings.returnPolicy || "").replace("{days}", String(settings.returnWindowDays));

  const previewNotes = (): string[] => {
    const n: string[] = [];
    if (allProducts.some((p) => p.sample)) n.push("sample prices, sizes and conditions");
    if (!settings.whatsapp) n.push("WhatsApp number not set");
    if (!settings.returnPolicy) n.push("return policy not set");
    return n;
  };

  function catalogItems() {
    return allProducts.map((p) => {
      const s = fullSize(p.size, p.brand);
      const n = (v: number) => (Number.isNaN(v) ? null : v);
      return {
        slug: p.slug, name: p.name, brand: p.brand, colour: p.colour,
        eu: s.eu, euLabel: euText(s.eu), uk: n(s.uk), us: n(s.us), cm: n(s.cm),
        price: p.price, condition: p.condition, photo: p.photos[0], status: p.status, flaws: p.flaws,
      };
    });
  }

  return {
    allProducts, allCategories, settings,
    available, productsIn, categoryOf, sizesIn, productsOfBrand, allBrands,
    waDigits, waLink, telHref, returnSummary, previewNotes, catalogItems,
  };
}

export type Shop = ReturnType<typeof makeShop>;
