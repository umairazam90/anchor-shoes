// Tests for the review rules (src/lib/reviews.ts). Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { validateReview, hasLink, hasPhone, summarize, starsPct, reviewDate, LIMITS } from "../src/lib/reviews.ts";

const good = { name: "Ali Khan", city: "Lahore", rating: "5", comment: "Shoes arrived as described. Condition was exactly 8 out of 10." };

test("a normal review passes and is tidied", () => {
  const r = validateReview({ ...good, name: "  Ali   Khan ", comment: "  Great pair.  \n\n\n\n Fits well.  " });
  assert.equal(r.ok, true);
  assert.equal(r.value.name, "Ali Khan");
  assert.equal(r.value.rating, 5);
  assert.equal(r.value.comment, "Great pair.\n\nFits well.");
});

test("the city is optional", () => {
  const r = validateReview({ ...good, city: "" });
  assert.equal(r.ok, true);
  assert.equal(r.value.city, "");
});

test("rating must be a whole number from 1 to 5", () => {
  for (const bad of ["", "0", "6", "3.5", "abc", undefined, null, "-1"]) {
    const r = validateReview({ ...good, rating: bad });
    assert.equal(r.ok, false, `rating ${bad}`);
    assert.ok(r.errors.rating);
  }
  for (const ok of ["1", "2", "3", "4", "5", 4]) assert.equal(validateReview({ ...good, rating: ok }).ok, true);
});

test("name and comment lengths are enforced", () => {
  assert.ok(validateReview({ ...good, name: "A" }).errors.name);
  assert.ok(validateReview({ ...good, name: "x".repeat(LIMITS.nameMax + 1) }).errors.name);
  assert.ok(validateReview({ ...good, comment: "short" }).errors.comment);
  assert.ok(validateReview({ ...good, comment: "y".repeat(LIMITS.commentMax + 1) }).errors.comment);
  assert.equal(validateReview({ ...good, comment: "y".repeat(LIMITS.commentMax) }).ok, true);
  assert.ok(validateReview({ ...good, city: "z".repeat(LIMITS.cityMax + 1) }).errors.city);
});

test("links and phone numbers are refused", () => {
  for (const c of [
    "Great shoes, see https://example.com for more",
    "Visit www.cheapshoes.pk today for deals",
    "Order from cheapshoes.com now please",
    "Mail me at someone@mail.example for offers",
    "Join t.me/deals and wa.me/923001234567 please",
    "Call 0300 1234567 for the best price in town",
    "WhatsApp +92 311 9362391 for discounts today",
  ]) {
    const r = validateReview({ ...good, comment: c });
    assert.equal(r.ok, false, c);
    assert.ok(r.errors.comment, c);
  }
  assert.ok(validateReview({ ...good, name: "Buy at shop.com" }).errors.name);
  assert.ok(validateReview({ ...good, city: "www.spam.pk" }).errors.city);
});

test("ordinary numbers in a review are fine", () => {
  for (const c of [
    "Paid Rs 6,500 and the condition was a solid 8/10 as promised.",
    "Size 43 fits perfectly, my usual size is 42 2/3 in adidas.",
    "Delivery took 3 days to Karachi, shoes were clean.",
  ]) assert.equal(validateReview({ ...good, comment: c }).ok, true, c);
  assert.equal(hasPhone("sizes 42 43 44 45 all fit"), false);
  assert.equal(hasPhone("03001234567"), true);
  assert.equal(hasLink("Rs.5000 only, good shoes.condition fine"), false);
});

test("control characters and text-direction tricks are removed", () => {
  const r = validateReview({ ...good, name: "Ali‮ Khan\u0000", comment: "Nice​ pair, really happy\u0007 with it." });
  assert.equal(r.ok, true);
  assert.equal(r.value.name, "Ali Khan");
  assert.equal(r.value.comment, "Nice pair, really happy with it.");
});

test("html is kept as plain text (the page escapes it when showing it)", () => {
  const r = validateReview({ ...good, name: "<b>Ali</b>", comment: "<script>alert(1)</script> nice shoes overall" });
  assert.equal(r.ok, true);
  assert.equal(r.value.name, "<b>Ali</b>");
});

test("summary: count and average to one decimal", () => {
  assert.deepEqual(summarize([]), { count: 0, average: 0 });
  assert.deepEqual(summarize([{ rating: 5 }, { rating: 4 }]), { count: 2, average: 4.5 });
  assert.deepEqual(summarize([{ rating: 5 }, { rating: 5 }, { rating: 4 }]), { count: 3, average: 4.7 });
});

test("star fill and date helpers", () => {
  assert.equal(starsPct(5), 100);
  assert.equal(starsPct(4.5), 90);
  assert.equal(starsPct(0), 0);
  assert.equal(starsPct(9), 100);
  assert.equal(reviewDate("2026-11-21 09:30:00"), "21 Nov 2026");
  assert.equal(reviewDate("2026-01-05 00:00:00"), "5 Jan 2026");
  assert.equal(reviewDate("garbage"), "");
});
