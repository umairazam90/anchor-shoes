import products from "../data/products.json";
import settings from "../data/settings.json";
import { fullSize, type ProductSize } from "./sizes";

export type Product = {
  slug: string;
  name: string;
  colour: string;
  size: ProductSize;
  condition: number;
  price: number;
  flaws: string;
  photos: string[];
  status: "available" | "sold";
  sample?: boolean;
};

export const allProducts = products as Product[];
export { settings };

export const rs = (n: number) => "Rs " + new Intl.NumberFormat("en-PK").format(n);

export function sizeLine(p: Product) {
  const s = fullSize(p.size);
  return `EU ${s.eu} · UK ${s.uk}`;
}

/** wa.me link. Accepts 03xx..., +92 3xx... or 923xx... Returns "" when no number is set yet. */
export function waLink(text: string): string {
  let d = (settings.whatsapp || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) d = "92" + d.slice(1);
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

export const previewNotes = (): string[] => {
  const n: string[] = [];
  if (allProducts.some((p) => p.sample)) n.push("sample prices, sizes and conditions");
  if (!settings.whatsapp) n.push("WhatsApp number not set");
  return n;
};
