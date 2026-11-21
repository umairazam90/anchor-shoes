// Customer reviews: the rules for what may be posted, plus small display helpers.
// Pure on purpose (no imports), so the public form's server check, the pages and the tests all share it.

export type ReviewInput = { name: string; city: string; rating: number; comment: string };
export type Review = ReviewInput & { id: number; photos: string[]; status: "pending" | "approved"; createdAt: string };
export type Result<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

export const LIMITS = {
  nameMin: 2,
  nameMax: 40,
  cityMax: 40,
  commentMin: 10,
  commentMax: 600,
  photos: 3,
  photoBytes: 2 * 1024 * 1024,
} as const;

/** removes control characters and invisible text-direction tricks, and unifies line breaks */
const clean = (v: unknown): string =>
  String(v ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, "");

const oneLine = (v: unknown) => clean(v).replace(/\s+/g, " ").trim();

/** web addresses, e-mail addresses and chat links: reviews are for words, not advertising */
export function hasLink(s: string): boolean {
  return /(https?:|www\.|\bt\.me\b|\bwa\.me\b|@[\w-]+\.\w|\b[\w-]+\.(com|net|org|pk|co|io|me|xyz|shop|store|info|link|ly|app)\b)/i.test(s);
}

/** a run of 9 or more digits (a phone number), allowing spaces, dashes and brackets between them */
export function hasPhone(s: string): boolean {
  for (const m of s.matchAll(/\+?\d[\d\s().-]{6,}\d/g)) {
    if (m[0].replace(/\D/g, "").length >= 9) return true;
  }
  return false;
}

export function validateReview(raw: { name?: unknown; city?: unknown; rating?: unknown; comment?: unknown }): Result<ReviewInput> {
  const errors: Record<string, string> = {};

  const name = oneLine(raw.name);
  if (name.length < LIMITS.nameMin) errors.name = "Please enter your name.";
  else if (name.length > LIMITS.nameMax) errors.name = `Your name can be ${LIMITS.nameMax} letters at most.`;
  else if (hasLink(name) || hasPhone(name)) errors.name = "Please enter just your name.";

  const city = oneLine(raw.city);
  if (city.length > LIMITS.cityMax) errors.city = `The city can be ${LIMITS.cityMax} letters at most.`;
  else if (city && (hasLink(city) || hasPhone(city))) errors.city = "Please enter just your city.";

  const rating = Number(raw.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.rating = "Please tap a star to rate your pair.";

  const comment = clean(raw.comment)
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (comment.length < LIMITS.commentMin) errors.comment = `Please write at least ${LIMITS.commentMin} letters about your experience.`;
  else if (comment.length > LIMITS.commentMax) errors.comment = `Please keep your review under ${LIMITS.commentMax} letters.`;
  else if (hasLink(comment) || hasPhone(comment)) errors.comment = "Please do not put links or phone numbers in your review.";

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { name, city, rating, comment } };
}

/** how many reviews and the average rating (one decimal) */
export function summarize(list: { rating: number }[]): { count: number; average: number } {
  if (!list.length) return { count: 0, average: 0 };
  const sum = list.reduce((a, r) => a + r.rating, 0);
  return { count: list.length, average: Math.round((sum / list.length) * 10) / 10 };
}

/** how full the stars are, as a percentage, for any rating from 0 to 5 */
export const starsPct = (rating: number) => Math.round((Math.max(0, Math.min(5, rating)) / 5) * 100);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-21 09:30:00" (database time) becomes "21 Nov 2026" */
export function reviewDate(createdAt: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(createdAt);
  if (!m) return "";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ""} ${m[1]}`;
}

/** the label shown under the star picker */
export const RATING_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"] as const;
