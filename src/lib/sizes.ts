// Men's size charts. EU is the size printed on the shoe and is what the shop is organised by.
// UK, US and foot length differ between brands, so each brand with a published chart has its own table.
// "foot" is the length of the foot itself, NOT the "CM" size printed on a shoe box (that number is bigger).
//
// Sources: nike.com men's footwear size chart (regional pages) and adidas.com men's shoe size chart.
export type ChartRow = { eu: number; euLabel: string; uk: number; us: number; foot: number };

const row = (eu: number, uk: number, us: number, foot: number, euLabel = String(eu)): ChartRow => ({ eu, euLabel, uk, us, foot });

export const NIKE_CHART: ChartRow[] = [
  row(38, 5, 5.5, 23.3),
  row(38.5, 5.5, 6, 23.7),
  row(39, 6, 6.5, 24.1),
  row(40, 6, 7, 24.5),
  row(40.5, 6.5, 7.5, 25),
  row(41, 7, 8, 25.4),
  row(42, 7.5, 8.5, 25.8),
  row(42.5, 8, 9, 26.2),
  row(43, 8.5, 9.5, 26.7),
  row(44, 9, 10, 27.1),
  row(44.5, 9.5, 10.5, 27.5),
  row(45, 10, 11, 27.9),
  row(45.5, 10.5, 11.5, 28.3),
  row(46, 11, 12, 28.8),
  row(47, 11.5, 12.5, 29.2),
  row(47.5, 12, 13, 29.6),
  row(48, 12.5, 13.5, 30),
  row(48.5, 13, 14, 30.5),
  row(49, 13.5, 14.5, 30.9),
  row(49.5, 14, 15, 31.3),
];

// adidas sells in thirds of an EU size (for example 42 2/3), so only whole-number rows can be matched to a pair's EU size.
export const ADIDAS_CHART: ChartRow[] = [
  row(38, 5, 5.5, 23.3),
  row(38 + 2 / 3, 5.5, 6, 23.8, "38 2/3"),
  row(39 + 1 / 3, 6, 6.5, 24.2, "39 1/3"),
  row(40, 6.5, 7, 24.6),
  row(40 + 2 / 3, 7, 7.5, 25, "40 2/3"),
  row(41 + 1 / 3, 7.5, 8, 25.5, "41 1/3"),
  row(42, 8, 8.5, 25.9),
  row(42 + 2 / 3, 8.5, 9, 26.3, "42 2/3"),
  row(43 + 1 / 3, 9, 9.5, 26.7, "43 1/3"),
  row(44, 9.5, 10, 27.1),
  row(44 + 2 / 3, 10, 10.5, 27.6, "44 2/3"),
  row(45 + 1 / 3, 10.5, 11, 28, "45 1/3"),
  row(46, 11, 11.5, 28.4),
  row(46 + 2 / 3, 11.5, 12, 28.8, "46 2/3"),
  row(47 + 1 / 3, 12, 12.5, 29.3, "47 1/3"),
  row(48, 12.5, 13, 29.7),
  row(48 + 2 / 3, 13, 13.5, 30.1, "48 2/3"),
  row(49 + 1 / 3, 13.5, 14, 30.5, "49 1/3"),
  row(50, 14, 14.5, 31),
];

export type ChartKey = "nike" | "adidas";
export const CHARTS: Record<ChartKey, { name: string; rows: ChartRow[] }> = {
  nike: { name: "Nike", rows: NIKE_CHART },
  adidas: { name: "adidas", rows: ADIDAS_CHART },
};

/** Which published chart applies to a brand. Brands without one (H&M and others) show the EU size only. */
export function chartKeyFor(brand: string): ChartKey | null {
  const b = brand.trim().toLowerCase();
  if (b === "nike" || b === "jordan" || b === "air jordan") return "nike";
  if (b === "adidas") return "adidas";
  return null;
}

export type ProductSize = { eu: number; uk?: number; us?: number; cm?: number };
/** cm is the foot length for the size */
export type SizeRow = { eu: number; uk: number; us: number; cm: number };

export function fullSize(s: ProductSize, brand = ""): SizeRow {
  const key = chartKeyFor(brand);
  const r = key ? CHARTS[key].rows.find((x) => Math.abs(x.eu - s.eu) < 0.01) : undefined;
  return {
    eu: s.eu,
    uk: s.uk ?? r?.uk ?? NaN,
    us: s.us ?? r?.us ?? NaN,
    cm: s.cm ?? r?.foot ?? NaN,
  };
}

export const fmt = (n: number) => (Number.isNaN(n) ? "-" : String(n));
export const has = (n: number) => !Number.isNaN(n);

/* ---------- EU size text ---------- */
/** EU size the way it is printed on the shoe: 42, 42.5 or "42 2/3" (adidas sells in thirds). */
export function euText(n: number): string {
  const whole = Math.floor(n + 1e-6);
  const f = n - whole;
  if (Math.abs(f - 1 / 3) < 0.02) return `${whole} 1/3`;
  if (Math.abs(f - 2 / 3) < 0.02) return `${whole} 2/3`;
  return String(Math.round(n * 100) / 100);
}

/** Reads what a person types: 42, 42.5, 42,5, "42 2/3" or "42-2/3". Returns NaN when it is not a sensible EU size. */
export function parseEu(text: string): number {
  const t = String(text ?? "").trim().replace(",", ".").replace(/^eu\s*/i, "");
  const third = /^(\d{2})[\s-]+([12])\s*\/\s*3$/.exec(t);
  if (third) return Number(third[1]) + Number(third[2]) / 3;
  if (!/^\d{2}(\.\d{1,2})?$/.test(t)) return NaN;
  const n = Number(t);
  return n >= 30 && n <= 55 ? n : NaN;
}
