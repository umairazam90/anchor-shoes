// Small helpers shared by the admin pages (runs in the browser).

type ApiResult = { ok: boolean; status: number; data: any };

/** JSON request to the admin API. Never throws: a dead network or an expired sign-in comes back as ok:false. */
export async function api(url: string, method: string, body?: unknown): Promise<ApiResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    if (res.type === "opaqueredirect") return { ok: false, status: 401, data: { error: "Your sign-in has expired. Reload this page to sign in again." } };
    let data: any = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Could not reach the server. Check your internet and try again." } };
  }
}

let timer: number | undefined;
export function toast(message: string, kind: "ok" | "err" = "ok") {
  const el = document.querySelector<HTMLElement>("[data-toast]");
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
  el.hidden = false;
  clearTimeout(timer);
  timer = window.setTimeout(() => (el.hidden = true), kind === "err" ? 7000 : 3500);
}

/** shows server-side validation messages under the matching fields; returns true when there were any */
export function showErrors(form: HTMLElement, errors: Record<string, string> | undefined): boolean {
  form.querySelectorAll<HTMLElement>("[data-err]").forEach((e) => { e.textContent = ""; e.hidden = true; });
  form.querySelectorAll("[aria-invalid]").forEach((e) => e.removeAttribute("aria-invalid"));
  if (!errors) return false;
  let first: HTMLElement | null = null;
  for (const [key, msg] of Object.entries(errors)) {
    const slot = form.querySelector<HTMLElement>(`[data-err="${key}"]`);
    if (slot) { slot.textContent = msg; slot.hidden = false; first ??= slot; }
    form.querySelector(`[name="${key}"]`)?.setAttribute("aria-invalid", "true");
  }
  first?.scrollIntoView({ block: "center", behavior: "smooth" });
  return Object.keys(errors).length > 0;
}

/** one tap arms the button, a second tap within 4 seconds confirms (used for delete: no pop-up dialogs) */
export function confirmTap(btn: HTMLButtonElement, armedText: string, run: () => void) {
  const original = btn.textContent ?? "";
  let armed = false;
  let t: number | undefined;
  btn.addEventListener("click", () => {
    if (!armed) {
      armed = true;
      btn.textContent = armedText;
      btn.classList.add("is-armed");
      t = window.setTimeout(() => { armed = false; btn.textContent = original; btn.classList.remove("is-armed"); }, 4000);
      return;
    }
    clearTimeout(t);
    run();
  });
}

/** hides a field's error message (and red border) as soon as that field is edited */
export function clearErrorsOnEdit(form: HTMLElement) {
  const clear = (e: Event) => {
    const el = e.target as HTMLInputElement | null;
    if (!el?.name) return;
    el.removeAttribute("aria-invalid");
    const slot = form.querySelector<HTMLElement>(`[data-err="${el.name}"]`);
    if (slot) { slot.textContent = ""; slot.hidden = true; }
  };
  form.addEventListener("input", clear);
  form.addEventListener("change", clear);
}
