// Customer-side state: cart, saved pairs, drawers and search. Everything lives in the browser (localStorage).
// Pairs are one-off, so the cart holds each pair at most once.

export type Item = {
  slug: string; name: string; brand: string; colour: string;
  eu: number; euLabel: string; uk: number | null; us: number | null; cm: number | null;
  price: number; condition: number; photo: string; status: "available" | "sold"; flaws: string;
};
export type Me = { name?: string; phone?: string; city?: string; address?: string };

const K = { cart: "anchor.cart", wish: "anchor.wish", me: "anchor.me" };

function read<T>(k: string, d: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
}
function write(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: state just will not persist */ }
}

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export const rs = (n: number) => "Rs " + new Intl.NumberFormat("en-PK").format(n);

let _cat: Promise<Item[]> | null = null;
export function catalog(): Promise<Item[]> {
  // a failed request is not cached, so a brief network drop does not leave the cart blank until the page is reloaded
  return (_cat ??= fetch("/catalog.json")
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then((d) => d.items as Item[])
    .catch(() => { _cat = null; return [] as Item[]; }));
}

export const getCart = () => read<string[]>(K.cart, []);
export const getWish = () => read<string[]>(K.wish, []);
export const getMe = () => read<Me>(K.me, {});
export const saveMe = (m: Me) => write(K.me, m);
const emit = () => window.dispatchEvent(new CustomEvent("store:change"));

export function addToCart(slug: string) {
  const c = getCart();
  if (!c.includes(slug)) { c.push(slug); write(K.cart, c); }
  emit();
}
export function removeFromCart(slug: string) { write(K.cart, getCart().filter((s) => s !== slug)); emit(); }
export function clearCart() { write(K.cart, []); emit(); }
export function toggleWish(slug: string) {
  const w = getWish();
  const i = w.indexOf(slug);
  if (i >= 0) w.splice(i, 1); else w.push(slug);
  write(K.wish, w); emit();
}

/** same markup as ProductCard.astro, for lists built in the browser */
export function cardHTML(p: Item) {
  const sold = p.status === "sold";
  const href = `/shoe/${esc(p.slug)}/`;
  const uk = p.uk ?? "-";
  return `<li class="pc" data-card data-slug="${esc(p.slug)}">
    <div class="pc__media">
      <a class="pc__link" href="${href}" tabindex="-1" aria-hidden="true"><img src="${esc(p.photo)}" alt="" width="640" height="800" loading="lazy" decoding="async"></a>
      ${sold ? '<span class="badge">Sold</span>' : ""}
      <button class="pc__heart" type="button" data-wish="${esc(p.slug)}" aria-pressed="false" aria-label="Save ${esc(p.name)}"><svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z"/></svg></button>
      ${sold ? "" : `<button class="pc__add" type="button" data-add="${esc(p.slug)}" aria-label="Add ${esc(p.name)} to cart"><svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`}
    </div>
    <a class="pc__body" href="${href}">
      <span class="pc__brand">${esc(p.brand)}</span>
      <h3 class="pc__title">${esc(p.name)}</h3>
      <span class="pc__meta">EU ${esc(p.euLabel)} · UK ${esc(uk)} · ${esc(p.condition)}/10</span>
      <span class="pc__price">${rs(p.price)}</span>
    </a>
  </li>`;
}

export function matches(p: Item, q: string) {
  const hay = `${p.name} ${p.brand} ${p.colour} eu ${p.eu} size ${p.eu} ${p.euLabel} uk ${p.uk}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
}

/* ---------- shared UI ---------- */
const body = document.body;
let lastOpener: HTMLElement | null = null;
const panels: Record<string, string> = { menu: "panel-menu", cart: "panel-cart", search: "panel-search" };

function setPanel(name: string) {
  Object.entries(panels).forEach(([n, id]) => {
    const el = document.getElementById(id);
    if (el) (el as HTMLElement & { inert: boolean }).inert = n !== name;
  });
  document.querySelectorAll<HTMLElement>("[data-open]").forEach((b) =>
    b.setAttribute("aria-expanded", String(b.dataset.open === name)));
  if (name) body.dataset.panel = name; else delete body.dataset.panel;
}

function openPanel(name: string, from?: HTMLElement | null) {
  lastOpener = from ?? (document.activeElement as HTMLElement | null);
  setPanel(name);
  if (name === "cart") renderDrawer();
  const el = document.getElementById(panels[name]);
  const focus = el?.querySelector<HTMLElement>(name === "search" ? "input" : "button, a");
  setTimeout(() => focus?.focus(), 60);
}
function closePanel() {
  if (!body.dataset.panel) return;
  setPanel("");
  lastOpener?.focus?.();
}

async function renderDrawer() {
  const box = document.querySelector<HTMLElement>("[data-cart-items]");
  const foot = document.querySelector<HTMLElement>("[data-cart-foot]");
  if (!box || !foot) return;
  const slugs = getCart();
  if (slugs.length === 0) {
    box.innerHTML = `<p class="muted" style="padding:24px 0">Your cart is empty.</p><a class="btn btn--block" href="/shoes/">Shop all shoes</a>`;
    foot.hidden = true;
    return;
  }
  const items = await catalog();
  let sub = 0;
  box.innerHTML = `<div class="cart-lines">` + slugs.map((s) => {
    const p = items.find((i) => i.slug === s);
    if (!p) return "";
    const gone = p.status === "sold";
    if (!gone) sub += p.price;
    return `<div class="line ${gone ? "gone" : ""}">
      <a href="/shoe/${esc(p.slug)}/"><img src="${esc(p.photo)}" alt="" width="76" height="95"></a>
      <div><a href="/shoe/${esc(p.slug)}/"><b>${esc(p.name)}</b></a>
        <span class="m">EU ${esc(p.euLabel)} · ${esc(p.condition)}/10</span>
        ${gone ? '<span class="m" style="color:var(--danger)">Sold, please remove</span>' : ""}
        <button class="rm" type="button" data-remove="${esc(p.slug)}">Remove</button></div>
      <span class="pr">${rs(p.price)}</span></div>`;
  }).join("") + `</div>`;
  (document.querySelector("[data-cart-subtotal]") as HTMLElement).textContent = rs(sub);
  foot.hidden = false;
}

async function renderSuggest(q: string) {
  const box = document.querySelector<HTMLElement>("[data-suggest]");
  if (!box) return;
  if (q.trim().length < 2) { box.innerHTML = ""; return; }
  const hits = (await catalog()).filter((p) => matches(p, q)).slice(0, 6);
  box.innerHTML = hits.length
    ? hits.map((p) => `<a class="sugg" href="/shoe/${esc(p.slug)}/"><img src="${esc(p.photo)}" alt="" width="56" height="70"><div><b>${esc(p.name)}</b><span>EU ${esc(p.euLabel)} · ${esc(p.condition)}/10</span></div><b>${rs(p.price)}</b></a>`).join("")
    : `<p class="muted" style="padding:8px 0">No pairs match "${esc(q)}". Try a brand or a size, for example "Nike" or "43".</p>`;
}

export function syncState() {
  const cart = getCart(), wish = getWish();
  document.querySelectorAll<HTMLElement>(".js-cart-count").forEach((e) => { e.textContent = String(cart.length); e.hidden = cart.length === 0; });
  document.querySelectorAll<HTMLElement>(".js-wish-count").forEach((e) => { e.textContent = String(wish.length); e.hidden = wish.length === 0; });
  document.querySelectorAll<HTMLElement>("[data-wish]").forEach((b) => b.setAttribute("aria-pressed", String(wish.includes(b.dataset.wish!))));
  document.querySelectorAll<HTMLElement>("[data-add]").forEach((b) => {
    const inCart = cart.includes(b.dataset.add!);
    b.classList.toggle("in", inCart);
    const label = b.querySelector<HTMLElement>("[data-label]");
    if (label) label.textContent = inCart ? (b.dataset.inLabel ?? "In your cart") : (b.dataset.outLabel ?? "Add to cart");
  });
}

document.addEventListener("click", (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>("[data-open],[data-close],[data-add],[data-buy],[data-wish],[data-remove]");
  if (!t) return;
  if (t.dataset.open) { openPanel(t.dataset.open, t); return; }
  if (t.hasAttribute("data-close")) { closePanel(); return; }
  if (t.dataset.remove) { removeFromCart(t.dataset.remove); return; }
  if (t.dataset.wish) { toggleWish(t.dataset.wish); return; }
  if (t.dataset.add) {
    addToCart(t.dataset.add);
    openPanel("cart", t);
    return;
  }
  if (t.dataset.buy) { addToCart(t.dataset.buy); location.href = "/checkout/"; }
});

document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });
document.querySelector<HTMLInputElement>("[data-search-input]")?.addEventListener("input", (e) => renderSuggest((e.target as HTMLInputElement).value));

window.addEventListener("store:change", () => { syncState(); if (body.dataset.panel === "cart") renderDrawer(); });
window.addEventListener("storage", () => { syncState(); if (body.dataset.panel === "cart") renderDrawer(); });
window.addEventListener("pageshow", syncState);

// announcement bar: rotate the messages
const ann = document.querySelector<HTMLElement>("[data-ann]");
if (ann) {
  try {
    const msgs = JSON.parse(ann.dataset.ann ?? "[]") as string[];
    const el = ann.querySelector<HTMLElement>(".ann__msg");
    if (el && msgs.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      let i = 0;
      setInterval(() => {
        el.style.opacity = "0";
        setTimeout(() => { i = (i + 1) % msgs.length; el.textContent = msgs[i]; el.style.opacity = "1"; }, 300);
      }, 4500);
    }
  } catch { /* keep the first message */ }
}

// Drop cart and saved entries for pairs that no longer exist (deleted from the catalogue), so the badges
// never count something the customer cannot see. Skipped when the catalogue could not be loaded.
catalog().then((items) => {
  if (items.length === 0) return;
  const known = new Set(items.map((i) => i.slug));
  const cart = getCart(), wish = getWish();
  const cleanCart = cart.filter((s) => known.has(s)), cleanWish = wish.filter((s) => known.has(s));
  if (cleanCart.length !== cart.length) write(K.cart, cleanCart);
  if (cleanWish.length !== wish.length) write(K.wish, cleanWish);
  if (cleanCart.length !== cart.length || cleanWish.length !== wish.length) emit();
});

setPanel("");
syncState();
