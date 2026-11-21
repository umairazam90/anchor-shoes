// Password hashing and the small checks around it.
// Pure on purpose: only Web Crypto (also built into Node), no Cloudflare imports, so it is unit-tested in plain Node.
//
// Format of a stored hash:  pbkdf2-sha256$<iterations>$<salt>$<hash>   (salt and hash in base64url)
// The iteration count is stored inside the hash, so it can be changed later without breaking old passwords.

const enc = new TextEncoder();

/** 100,000 rounds. Higher is stronger but costs more CPU time per sign-in (Cloudflare's Free plan allows 10 ms per request). */
export const DEFAULT_ITERATIONS = 100_000;
export const PASSWORD = { min: 10, max: 200 } as const;

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/** compares two byte strings without stopping at the first difference */
export function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** same, for two strings (the setup code) */
export function safeEqualText(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  // pad to the same length so the time does not reveal how long the real code is
  const n = Math.max(x.length, y.length);
  const px = new Uint8Array(n); px.set(x);
  const py = new Uint8Array(n); py.set(y);
  return safeEqual(px, py) && x.length === y.length;
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  // NFKC so the same typed letters always give the same bytes, whatever keyboard made them
  const key = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

export async function hashPassword(password: string, iterations = DEFAULT_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derive(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${b64(salt)}$${b64(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const p = stored.split("$");
  if (p.length !== 4 || p[0] !== "pbkdf2-sha256") return false;
  const iterations = Number(p[1]);
  if (!Number.isInteger(iterations) || iterations < 1_000 || iterations > 1_000_000) return false;
  let salt: Uint8Array<ArrayBuffer>;
  let want: Uint8Array<ArrayBuffer>;
  try {
    salt = unb64(p[2]);
    want = unb64(p[3]);
  } catch {
    return false;
  }
  return safeEqual(await derive(password, salt, iterations), want);
}

let dummy: Promise<string> | null = null;
/** A real hash of a random password. Checked when the email is unknown, so "no such admin" takes as long as "wrong password". */
export function dummyHash(iterations = DEFAULT_ITERATIONS): Promise<string> {
  dummy ??= hashPassword(b64(crypto.getRandomValues(new Uint8Array(18))), iterations);
  return dummy;
}

/** the iteration count from the PASSWORD_ITERATIONS setting (text), or the default when it is empty or silly */
export function parseIterations(raw: string | undefined): number {
  const n = Number((raw ?? "").trim());
  return Number.isInteger(n) && n >= 10_000 && n <= 1_000_000 ? n : DEFAULT_ITERATIONS;
}

const COMMON = new Set([
  "password", "password1", "password12", "password123", "passw0rd123", "1234567890", "12345678910", "0123456789",
  "qwertyuiop", "qwerty12345", "asdfghjkl", "iloveyou123", "admin12345", "administrator", "welcome123", "letmein123",
  "anchorshoes", "anchorshoes1", "anchorshoes123", "pakistan123", "shoesshoes",
]);

/** "" when the new password is acceptable, otherwise a plain sentence saying what to change */
export function checkNewPassword(pw: string, email = ""): string {
  if (pw.length < PASSWORD.min) return `Use at least ${PASSWORD.min} characters. A few words with spaces is easy to remember and hard to guess.`;
  if (pw.length > PASSWORD.max) return `That is too long (${PASSWORD.max} characters at most).`;
  if (/^\d+$/.test(pw)) return "Add some letters. Numbers alone are easy to guess.";
  if (/^(.)\1+$/.test(pw)) return "That repeats one character. Pick something only you would think of.";
  const squashed = pw.toLowerCase().replace(/\s+/g, "");
  if (COMMON.has(squashed)) return "That password is too common. Pick something only you would think of.";
  const name = email.split("@")[0]?.toLowerCase() ?? "";
  if (name.length >= 4 && squashed.includes(name)) return "Do not use your email name inside the password.";
  return "";
}

export function randomToken(bytes = 32): string {
  return b64(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
  return Array.from(d, (x) => x.toString(16).padStart(2, "0")).join("");
}
