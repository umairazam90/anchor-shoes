// Tests for the admin sign-in check (src/lib/access.ts). Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { SignJWT, generateKeyPair, createLocalJWKSet, exportJWK } from "jose";
import { authenticate, sameOrigin } from "../src/lib/access.ts";

const TEAM = "https://anchor.cloudflareaccess.com";
const AUD = "aud-123";
const ENV = { TEAM_DOMAIN: TEAM, POLICY_AUD: AUD };

const { privateKey, publicKey } = await generateKeyPair("RS256");
const other = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const getKey = createLocalJWKSet({ keys: [jwk] });

const sign = (claims = {}, { key = privateKey, iss = TEAM, aud = AUD, exp = "10m", kid = "k1" } = {}) =>
  new SignJWT({ email: "umair@example.com", ...claims })
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime(exp).sign(key);

const req = (token, url = "https://anchor-shoes.example.workers.dev/admin/") =>
  new Request(url, { headers: token ? { "cf-access-jwt-assertion": token } : {} });

test("a valid Access token signs the owner in", async () => {
  const r = await authenticate(req(await sign()), ENV, getKey);
  assert.deepEqual(r, { ok: true, email: "umair@example.com", via: "access" });
});

test("no token: refused with 401", async () => {
  const r = await authenticate(req(null), ENV, getKey);
  assert.equal(r.ok, false); assert.equal(r.status, 401);
});

test("token for a different application (wrong audience): refused", async () => {
  const r = await authenticate(req(await sign({}, { aud: "someone-elses-app" })), ENV, getKey);
  assert.equal(r.ok, false); assert.equal(r.status, 401);
});

test("token from a different Access team (wrong issuer): refused", async () => {
  const r = await authenticate(req(await sign({}, { iss: "https://evil.cloudflareaccess.com" })), ENV, getKey);
  assert.equal(r.ok, false);
});

test("expired token: refused", async () => {
  const r = await authenticate(req(await sign({}, { exp: Math.floor(Date.now() / 1000) - 120 })), ENV, getKey);
  assert.equal(r.ok, false);
});

test("token signed with someone else's key (forged): refused", async () => {
  const r = await authenticate(req(await sign({}, { key: other.privateKey })), ENV, getKey);
  assert.equal(r.ok, false);
});

test("a garbage token is refused, not a crash", async () => {
  const r = await authenticate(req("not.a.jwt"), ENV, getKey);
  assert.equal(r.ok, false); assert.equal(r.status, 401);
});

test("service tokens have no email: refused", async () => {
  const t = await new SignJWT({ type: "app" }).setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(TEAM).setAudience(AUD).setExpirationTime("10m").sign(privateKey);
  const r = await authenticate(req(t), ENV, getKey);
  assert.equal(r.ok, false); assert.equal(r.status, 403);
});

test("ADMIN_EMAILS allow-list: other emails refused, listed email accepted (case-insensitive)", async () => {
  const env = { ...ENV, ADMIN_EMAILS: "Umair@Example.com, helper@example.com" };
  assert.equal((await authenticate(req(await sign()), env, getKey)).ok, true);
  const bad = await authenticate(req(await sign({ email: "stranger@example.com" })), env, getKey);
  assert.equal(bad.ok, false); assert.equal(bad.status, 403);
});

test("not configured yet: fails closed with 503, even with a token", async () => {
  const r = await authenticate(req(await sign()), {}, getKey);
  assert.equal(r.ok, false); assert.equal(r.status, 503);
});

test("team domain must be https (outside tests)", async () => {
  const r = await authenticate(req("x"), { TEAM_DOMAIN: "http://anchor.cloudflareaccess.com", POLICY_AUD: AUD });
  assert.equal(r.ok, false); assert.equal(r.status, 503);
});

test("local test sign-in works on localhost only", async () => {
  const env = { DEV_ADMIN_EMAIL: "Dev@Local.test" };
  const local = await authenticate(req(null, "http://localhost:4321/admin/"), env);
  assert.deepEqual(local, { ok: true, email: "dev@local.test", via: "dev" });
  const prod = await authenticate(req(null, "https://anchor-shoes.example.workers.dev/admin/"), env);
  assert.equal(prod.ok, false);
  const tricky = await authenticate(req(null, "https://localhost.evil.com/admin/"), env);
  assert.equal(tricky.ok, false);
});

test("same-origin check for changes (CSRF guard)", () => {
  const mk = (origin) => new Request("https://shop.example/api/admin/pairs/", { method: "POST", headers: origin ? { origin } : {} });
  assert.equal(sameOrigin(mk("https://shop.example")), true);
  assert.equal(sameOrigin(mk("https://evil.example")), false);
  assert.equal(sameOrigin(mk(null)), false);
  assert.equal(sameOrigin(mk("null")), false);
});
