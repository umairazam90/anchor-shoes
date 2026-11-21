// Tests for password hashing and the admin login rules (src/lib/password.ts, src/lib/adminauth.ts). Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, checkNewPassword, parseIterations, safeEqualText, randomToken, sha256Hex, dummyHash, DEFAULT_ITERATIONS } from "../src/lib/password.ts";
import { normalizeEmail, validEmail, safeNext, readSessionToken, sessionCookie, clearCookie, cookieName, overLimit, LOGIN_LIMITS } from "../src/lib/adminauth.ts";

const FAST = 10_000; // keeps the tests quick; the real default is 100,000

test("a password verifies against its own hash, and only that password", async () => {
  const h = await hashPassword("correct horse battery", FAST);
  assert.match(h, /^pbkdf2-sha256\$10000\$[\w-]+\$[\w-]+$/);
  assert.equal(await verifyPassword("correct horse battery", h), true);
  assert.equal(await verifyPassword("correct horse batterY", h), false);
  assert.equal(await verifyPassword("", h), false);
});

test("the same password gets a different hash each time (random salt), and the hash never contains the password", async () => {
  const a = await hashPassword("same password here", FAST);
  const b = await hashPassword("same password here", FAST);
  assert.notEqual(a, b);
  assert.equal(a.includes("same password here"), false);
  assert.equal(await verifyPassword("same password here", a), true);
  assert.equal(await verifyPassword("same password here", b), true);
});

test("the default is 100,000 rounds and the count is stored inside the hash", async () => {
  assert.equal(DEFAULT_ITERATIONS, 100_000);
  const h = await hashPassword("a long enough password");
  assert.equal(h.split("$")[1], "100000");
  assert.equal(await verifyPassword("a long enough password", h), true);
});

test("damaged or foreign hash strings never verify and never throw", async () => {
  for (const bad of ["", "plain", "pbkdf2-sha256$x$y$z", "pbkdf2-sha256$100$AAAA$AAAA", "md5$100000$AAAA$AAAA", "pbkdf2-sha256$100000$!!!$???", "a$b$c$d$e"]) {
    assert.equal(await verifyPassword("anything at all", bad), false, bad);
  }
});

test("typing the same letters in another unicode form still matches (NFKC)", async () => {
  const h = await hashPassword("café au lait 2026", FAST); // é as one character
  assert.equal(await verifyPassword("café au lait 2026", h), true); // é as e + accent
});

test("the dummy hash is a valid hash that no real password matches", async () => {
  const d = await dummyHash(FAST);
  assert.match(d, /^pbkdf2-sha256\$/);
  assert.equal(await verifyPassword("password123", d), false);
});

test("new password rules", () => {
  const okEmail = "umair@example.com";
  assert.equal(checkNewPassword("blue lamp river 42", okEmail), "");
  assert.match(checkNewPassword("short1", okEmail), /at least 10/);
  assert.match(checkNewPassword("1234567890123", okEmail), /letters/);
  assert.match(checkNewPassword("aaaaaaaaaaaa", okEmail), /repeats/);
  assert.match(checkNewPassword("Password 123", okEmail), /common/);
  assert.match(checkNewPassword("anchorshoes", okEmail), /at least 10|common/);
  assert.match(checkNewPassword("my umair secret", okEmail), /email name/);
  assert.match(checkNewPassword("x".repeat(201), okEmail), /too long/);
  assert.equal(checkNewPassword("x".repeat(200) + "", okEmail) !== "", true); // all one character
});

test("PASSWORD_ITERATIONS: only sensible numbers are used", () => {
  assert.equal(parseIterations(undefined), 100_000);
  assert.equal(parseIterations(""), 100_000);
  assert.equal(parseIterations("abc"), 100_000);
  assert.equal(parseIterations("50"), 100_000); // far too weak
  assert.equal(parseIterations("50000"), 50_000);
  assert.equal(parseIterations(" 100000 "), 100_000);
});

test("safeEqualText compares secrets exactly, including different lengths", () => {
  assert.equal(safeEqualText("abc123", "abc123"), true);
  assert.equal(safeEqualText("abc123", "abc124"), false);
  assert.equal(safeEqualText("abc", "abc123"), false);
  assert.equal(safeEqualText("abc123", "abc"), false);
  assert.equal(safeEqualText("", ""), true);
});

test("tokens are long, URL-safe and different every time; sha256 matches a known value", async () => {
  const a = randomToken(), b = randomToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("emails are lower-cased and checked", () => {
  assert.equal(normalizeEmail("  Umair@Example.COM "), "umair@example.com");
  assert.equal(validEmail("umair@example.com"), true);
  for (const bad of ["", "umair", "umair@", "@example.com", "a b@example.com", "a@b", "a@@b.com", "x".repeat(250) + "@a.com"]) assert.equal(validEmail(bad), false, bad);
});

test("after sign-in you can only be sent to a page inside the admin", () => {
  assert.equal(safeNext("/admin/reviews/"), "/admin/reviews/");
  assert.equal(safeNext("/admin/pair/new/?x=1"), "/admin/pair/new/?x=1");
  assert.equal(safeNext("/admin"), "/admin");
  for (const bad of [null, undefined, "", "https://evil.example/", "//evil.example/admin/", "/\\evil.example", "/admin//evil.example", "/admin/\\x", "javascript:alert(1)", "/shoes/", "/api/admin/pairs/", "/admin/login/", "/admin/setup/?e=bad", "/admin/\u0000x", "/administrator/"]) {
    assert.equal(safeNext(bad), "/admin/", String(bad));
  }
});

test("the cookie is HttpOnly and Lax; on https it is also Secure and uses the __Host- name", () => {
  const https = sessionCookie("tok", true), http = sessionCookie("tok", false);
  assert.match(https, /^__Host-anchor_admin=tok; Path=\/; Max-Age=1209600; HttpOnly; SameSite=Lax; Secure$/);
  assert.match(http, /^anchor_admin=tok; Path=\/; Max-Age=1209600; HttpOnly; SameSite=Lax$/);
  assert.match(clearCookie(true), /Max-Age=0/);
  assert.equal(cookieName(true), "__Host-anchor_admin");
});

test("the session token is read from the right cookie only, and only if it looks like one of ours", () => {
  const tok = randomToken();
  const get = (url, cookie) => readSessionToken(new Request(url, { headers: cookie ? { cookie } : {} }));
  assert.equal(get("https://anchorshoes.com/admin/", `a=1; __Host-anchor_admin=${tok}; b=2`), tok);
  assert.equal(get("http://localhost:4321/admin/", `anchor_admin=${tok}`), tok);
  assert.equal(get("https://anchorshoes.com/admin/", `anchor_admin=${tok}`), ""); // the plain name is not accepted on https
  assert.equal(get("https://anchorshoes.com/admin/", `__Host-anchor_admin=short`), "");
  assert.equal(get("https://anchorshoes.com/admin/", `__Host-anchor_admin=${tok}"; x=<script>`), "");
  assert.equal(get("https://anchorshoes.com/admin/", ""), "");
});

test("limits: the attempt being made counts, so the 9th try on one email is the first refused", () => {
  const limits = { "ip:a": LOGIN_LIMITS.perIp, "acct:b": LOGIN_LIMITS.perAccount };
  assert.equal(overLimit({ "ip:a": 1, "acct:b": 8 }, limits), false);
  assert.equal(overLimit({ "ip:a": 1, "acct:b": 9 }, limits), true);
  assert.equal(overLimit({ "ip:a": 16, "acct:b": 1 }, limits), true);
  assert.equal(overLimit({}, limits), false);
});
