// Approximate men's conversion (common Nike chart). Fit varies by brand, so a pair can override uk/us/cm in products.json.
export type SizeRow = { eu: number; uk: number; us: number; cm: number };

export const SIZE_CHART: SizeRow[] = [
  { eu: 39, uk: 6, us: 6.5, cm: 24.5 },
  { eu: 40, uk: 6, us: 7, cm: 25 },
  { eu: 41, uk: 7, us: 8, cm: 26 },
  { eu: 42, uk: 7.5, us: 8.5, cm: 26.5 },
  { eu: 43, uk: 8.5, us: 9.5, cm: 27.5 },
  { eu: 44, uk: 9, us: 10, cm: 28 },
  { eu: 45, uk: 10, us: 11, cm: 29 },
  { eu: 46, uk: 11, us: 12, cm: 30 },
];

export type ProductSize = { eu: number; uk?: number; us?: number; cm?: number };

export function fullSize(s: ProductSize): SizeRow {
  const row = SIZE_CHART.find((r) => r.eu === s.eu);
  return {
    eu: s.eu,
    uk: s.uk ?? row?.uk ?? NaN,
    us: s.us ?? row?.us ?? NaN,
    cm: s.cm ?? row?.cm ?? NaN,
  };
}

export const fmt = (n: number) => (Number.isNaN(n) ? "-" : String(n));
