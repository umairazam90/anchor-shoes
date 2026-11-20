import { parseEu } from "./sizes";
import type { Settings } from "./shop";

export type Result<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

export type PairInput = {
  name: string;
  brand: string;
  colour: string;
  size: { eu: number; uk?: number; us?: number; cm?: number };
  insole?: number;
  condition: number;
  price: number;
  flaws: string;
  photos: string[];
  status: "available" | "sold";
};

const str = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v.trim().replace(",", "."));
  return NaN;
}

/** EU size: a number from the API or the text a person typed ("42", "42.5", "42 2/3") */
function euOf(v: unknown): number {
  if (typeof v === "string") return parseEu(v);
  if (typeof v === "number" && Number.isFinite(v) && v >= 30 && v <= 55) {
    const half = Math.abs(v * 2 - Math.round(v * 2)) < 0.001;
    const third = Math.abs(v * 3 - Math.round(v * 3)) < 0.01;
    return half || third ? v : NaN;
  }
  return NaN;
}

/** photos must be ours: uploaded (/img/...) or bundled (/images/...). Never a link to another site. */
const PHOTO = /^\/(img|images)\/[A-Za-z0-9][A-Za-z0-9._\/-]*$/;

export function validatePair(raw: any): Result<PairInput> {
  const errors: Record<string, string> = {};
  const r = raw && typeof raw === "object" ? raw : {};

  const name = str(r.name);
  if (name.length < 2 || name.length > 80) errors.name = "Enter the model name (2 to 80 letters).";

  const brand = str(r.brand);
  if (brand.length < 1 || brand.length > 40) errors.brand = "Enter the brand.";

  const colour = str(r.colour);
  if (colour.length > 60) errors.colour = "Colour is too long (60 letters at most).";

  const size = r.size && typeof r.size === "object" ? r.size : {};
  const eu = euOf(size.eu);
  if (Number.isNaN(eu)) errors.eu = "Enter the EU size printed on the shoe, for example 42, 42.5 or 42 2/3.";

  const opt = (key: "uk" | "us" | "cm" | "insole", src: any, min: number, max: number, label: string) => {
    if (isBlank(src?.[key])) return undefined;
    const n = num(src[key]);
    if (!Number.isFinite(n) || n < min || n > max) {
      errors[key] = `${label} should be between ${min} and ${max}, or left empty.`;
      return undefined;
    }
    return Math.round(n * 10) / 10;
  };
  const uk = opt("uk", size, 1, 20, "UK size");
  const us = opt("us", size, 1, 20, "US size");
  const cm = opt("cm", size, 15, 40, "Foot length");
  const insole = opt("insole", r, 15, 40, "Insole length");

  const condition = num(r.condition);
  if (!Number.isInteger(condition) || condition < 1 || condition > 10) errors.condition = "Condition must be a whole number from 1 to 10.";

  const price = num(r.price);
  if (!Number.isInteger(price) || price < 100 || price > 1_000_000) errors.price = "Enter the price in rupees, for example 6500.";

  const flaws = typeof r.flaws === "string" ? r.flaws.trim() : "";
  if (flaws.length < 2) errors.flaws = "Describe any flaws honestly, or write None if there are no flaws.";
  else if (flaws.length > 600) errors.flaws = "Flaws text is too long (600 letters at most).";

  const photos = Array.isArray(r.photos) ? r.photos : [];
  if (photos.length < 1) errors.photos = "Add at least one photo.";
  else if (photos.length > 8) errors.photos = "Eight photos at most.";
  else if (!photos.every((p: unknown) => typeof p === "string" && PHOTO.test(p) && !p.includes(".."))) errors.photos = "One of the photos is not valid. Remove it and upload it again.";

  const status = r.status === "sold" ? "sold" : "available";

  if (Object.keys(errors).length) return { ok: false, errors };
  const sz: PairInput["size"] = { eu };
  if (uk !== undefined) sz.uk = uk;
  if (us !== undefined) sz.us = us;
  if (cm !== undefined) sz.cm = cm;
  const value: PairInput = { name, brand, colour, size: sz, condition, price, flaws, photos: photos as string[], status };
  if (insole !== undefined) value.insole = insole;
  return { ok: true, value };
}

/* ---------- settings ---------- */
const phoneOk = (s: string) => s === "" || /^\+?[0-9][0-9 ()-]{6,19}$/.test(s);
const urlOk = (s: string) => {
  if (s === "") return true;
  try { return new URL(s).protocol === "https:"; } catch { return false; }
};
const emailOk = (s: string) => s === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** Only these settings can be changed from the admin. Anything else in the request is ignored. */
export function validateSettings(raw: any, current: Settings): Result<Settings> {
  const errors: Record<string, string> = {};
  const r = raw && typeof raw === "object" ? raw : {};
  const out: Settings = { ...current };

  const text = (key: keyof Settings, max: number, label: string, ok: (s: string) => boolean = () => true, hint = "") => {
    if (r[key] === undefined) return;
    const v = typeof r[key] === "string" ? (r[key] as string).trim() : "";
    if (v.length > max) errors[key] = `${label} is too long (${max} letters at most).`;
    else if (!ok(v)) errors[key] = hint || `${label} does not look right.`;
    else (out as any)[key] = v;
  };

  text("whatsapp", 24, "WhatsApp number", phoneOk, "Enter the number with country code, for example +92 311 1234567.");
  text("phone", 24, "Call number", phoneOk, "Enter the number with country code, for example +92 311 1234567.");
  text("email", 80, "Email", emailOk, "Enter a valid email address.");
  text("hours", 80, "Hours");
  text("address", 160, "Address");
  text("pickup", 160, "Self pickup location");
  text("instagram", 200, "Instagram link", urlOk, "Use the full link starting with https://");
  text("tiktok", 200, "TikTok link", urlOk, "Use the full link starting with https://");
  text("facebook", 200, "Facebook link", urlOk, "Use the full link starting with https://");
  text("deliveryFee", 80, "Delivery charges");
  text("cities", 200, "Cities served");
  text("returnPolicy", 400, "Return policy summary");
  text("tcsTrackUrl", 200, "TCS tracking page link", urlOk, "Use the full link starting with https://");

  if (r.returnWindowDays !== undefined) {
    const n = num(r.returnWindowDays);
    if (!Number.isInteger(n) || n < 0 || n > 60) errors.returnWindowDays = "Return window must be a whole number of days from 0 to 60.";
    else out.returnWindowDays = n;
  }

  if (r.announcements !== undefined) {
    const list = (Array.isArray(r.announcements) ? r.announcements : String(r.announcements).split("\n"))
      .map((x: unknown) => str(x))
      .filter(Boolean);
    if (list.length < 1 || list.length > 6) errors.announcements = "Add between 1 and 6 announcement lines.";
    else if (list.some((x: string) => x.length > 90)) errors.announcements = "Each announcement should be 90 letters or fewer.";
    else out.announcements = list;
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: out };
}
