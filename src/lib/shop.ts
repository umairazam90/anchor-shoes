import products from "../data/products.json";
import settings from "../data/settings.json";
import categories from "../data/categories.json";
import { fullSize, has, type ProductSize } from "./sizes";

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
};

export type Category = { slug: string; label: string; blurb: string; from: number; to: number };
export type Brand = { name: string; slug: string; open: number; total: number; photo?: string };

// All data access goes through this file. When pairs move to D1 (M2/M3), only this layer changes.
export const allProducts = products as Product[];
export const allCategories = categories as Category[];
export { settings };

export const rs = (n: number) => "Rs " + new Intl.NumberFormat("en-PK").format(n);
export const sizeSlug = (eu: number) => String(eu).replace(".", "-");
export const available = () => allProducts.filter((p) => p.status === "available");

export const inRange = (c: Category, eu: number) => eu >= c.from && eu <= c.to;
export const productsIn = (c: Category) => allProducts.filter((p) => inRange(c, p.size.eu));
export const categoryOf = (eu: number) => allCategories.find((c) => inRange(c, eu));
export const sizesIn = (c: Category) =>
  [...new Set(productsIn(c).map((p) => p.size.eu))].sort((a, b) => a - b);

/* ---------- brands ---------- */
export const brandSlug = (name: string) =>
  name.toLowerCase().replace(/&/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const productsOfBrand = (slug: string) => allProducts.filter((p) => brandSlug(p.brand) === slug);

/** one entry per brand, alphabetical. photo = the newest available pair (falls back to a sold one) */
export function allBrands(): Brand[] {
  const names = [...new Set(allProducts.map((p) => p.brand))].sort((a, b) => a.localeCompare(b));
  return names.map((name) => {
    const items = allProducts.filter((p) => p.brand === name);
    const open = items.filter((p) => p.status === "available");
    const pick = [...(open.length ? open : items)].reverse()[0];
    return { name, slug: brandSlug(name), open: open.length, total: items.length, photo: pick?.photos[0] };
  });
}

export function sizeLine(p: Product) {
  const s = fullSize(p.size, p.brand);
  return `EU ${s.eu}` + (has(s.uk) ? ` · UK ${s.uk}` : "");
}

/* ---------- contact ---------- */
/** digits for wa.me. Accepts 03xx..., +92 3xx... or 923xx... Returns "" while no number is set. */
export function waDigits(): string {
  let d = (settings.whatsapp || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) d = "92" + d.slice(1);
  return d;
}

export function waLink(text: string): string {
  const d = waDigits();
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : "";
}

/** tel: link without spaces, so it dials correctly on every phone */
export function telHref(): string {
  const raw = (settings.phone || "").trim();
  if (!raw) return "";
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("0")) d = "+92" + d.slice(1);
  else if (!d.startsWith("+")) d = "+" + d;
  return `tel:${d}`;
}

/** short return policy for the shoe page. The full text lives on /returns/. */
export function returnSummary(): string {
  return (settings.returnPolicy || "").replace("{days}", String(settings.returnWindowDays));
}

export const previewNotes = (): string[] => {
  const n: string[] = [];
  if (allProducts.some((p) => p.sample)) n.push("sample prices, sizes and conditions");
  if (!settings.whatsapp) n.push("WhatsApp number not set");
  if (!settings.returnPolicy) n.push("return policy not set");
  return n;
};

export function catalogItems() {
  return allProducts.map((p) => {
    const s = fullSize(p.size, p.brand);
    const n = (v: number) => (Number.isNaN(v) ? null : v);
    return {
      slug: p.slug, name: p.name, brand: p.brand, colour: p.colour,
      eu: s.eu, uk: n(s.uk), us: n(s.us), cm: n(s.cm),
      price: p.price, condition: p.condition, photo: p.photos[0], status: p.status, flaws: p.flaws,
    };
  });
}
