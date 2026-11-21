// The "Write a review" form on the home page (runs in the browser).
import { LIMITS, RATING_WORDS } from "../lib/reviews";

type Picked = { blob: Blob; url: string };

/** phone photos are 3 to 8 MB: shrink to about 1400 px and 85% JPEG (roughly 200 KB) before sending */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.85));
}

function init() {
  const f0 = document.querySelector<HTMLFormElement>("[data-rev-form]");
  const o0 = document.querySelector<HTMLButtonElement>("[data-rev-open]");
  const c0 = document.querySelector<HTMLElement>("[data-rev-cta]");
  const t0 = document.querySelector<HTMLElement>("[data-rev-thanks]");
  if (!f0 || !o0 || !c0 || !t0) return;
  // fixed (non-null) names, so the functions below do not need to re-check them
  const form: HTMLFormElement = f0;
  const open: HTMLButtonElement = o0;
  const cta: HTMLElement = c0;
  const thanks: HTMLElement = t0;

  const q = <T extends HTMLElement>(sel: string) => form.querySelector<T>(sel)!;
  const send = q<HTMLButtonElement>("[data-rev-send]");
  const msg = q<HTMLElement>("[data-rev-msg]");
  const previews = q<HTMLElement>("[data-rev-previews]");
  const fileInput = q<HTMLInputElement>("[data-rev-file]");
  const addLabel = q<HTMLElement>("[data-rev-add]");
  const note = q<HTMLElement>("[data-rev-note]");
  const comment = q<HTMLTextAreaElement>("[name=comment]");
  const count = q<HTMLElement>("[data-rev-count]");

  const picked: Picked[] = [];
  let busy = 0;

  /* ---------- open / close ---------- */
  open.addEventListener("click", () => {
    const show = form.hidden;
    form.hidden = !show;
    open.setAttribute("aria-expanded", String(show));
    open.textContent = show ? "Close" : "Write a review";
    if (show) {
      form.scrollIntoView({ block: "start", behavior: "smooth" });
      form.querySelector<HTMLInputElement>("[name=name]")?.focus({ preventScroll: true });
    }
  });

  /* ---------- stars, counter ---------- */
  form.querySelectorAll<HTMLInputElement>("[name=rating]").forEach((r) =>
    r.addEventListener("change", () => (note.textContent = `${r.value} – ${RATING_WORDS[Number(r.value)]}`)),
  );
  const tally = () => (count.textContent = String(comment.value.length));
  comment.addEventListener("input", tally);

  /* ---------- errors ---------- */
  function showErrors(errors: Record<string, string> | undefined) {
    form.querySelectorAll<HTMLElement>("[data-err]").forEach((e) => { e.textContent = ""; e.hidden = true; });
    form.querySelectorAll("[aria-invalid]").forEach((e) => e.removeAttribute("aria-invalid"));
    let first: HTMLElement | null = null;
    for (const [key, text] of Object.entries(errors ?? {})) {
      const slot = form.querySelector<HTMLElement>(`[data-err="${key}"]`);
      if (slot) { slot.textContent = text; slot.hidden = false; first ??= slot; }
      form.querySelector(`[name="${key}"]`)?.setAttribute("aria-invalid", "true");
    }
    first?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  const say = (text: string, kind: "ok" | "err" = "err") => {
    msg.textContent = text;
    msg.dataset.kind = kind;
    msg.hidden = !text;
  };
  const clearOnEdit = (e: Event) => {
    const el = e.target as HTMLInputElement | null;
    if (!el?.name) return;
    el.removeAttribute("aria-invalid");
    const slot = form.querySelector<HTMLElement>(`[data-err="${el.name}"]`);
    if (slot) { slot.textContent = ""; slot.hidden = true; }
  };
  form.addEventListener("input", clearOnEdit);
  form.addEventListener("change", clearOnEdit);

  /* ---------- photos ---------- */
  function drawPreviews() {
    previews.replaceChildren(
      ...picked.map((p, i) => {
        const li = document.createElement("li");
        const img = document.createElement("img");
        img.src = p.url;
        img.alt = `Photo ${i + 1}`;
        const x = document.createElement("button");
        x.type = "button";
        x.textContent = "×";
        x.setAttribute("aria-label", `Remove photo ${i + 1}`);
        x.addEventListener("click", () => {
          URL.revokeObjectURL(p.url);
          picked.splice(picked.indexOf(p), 1);
          drawPreviews();
        });
        li.append(img, x);
        return li;
      }),
    );
    addLabel.hidden = picked.length + busy >= LIMITS.photos;
  }

  fileInput.addEventListener("change", async () => {
    const files = [...(fileInput.files ?? [])];
    fileInput.value = "";
    const room = Math.max(LIMITS.photos - picked.length - busy, 0);
    const slot = form.querySelector<HTMLElement>('[data-err="photos"]')!;
    slot.hidden = true;
    if (files.length > room) { slot.textContent = `You can add ${LIMITS.photos} photos at most. The extra ones were skipped.`; slot.hidden = false; }
    for (const f of files.slice(0, room)) {
      busy++;
      send.disabled = true;
      try {
        const blob = await shrink(f);
        if (blob.size > LIMITS.photoBytes) throw new Error("big");
        picked.push({ blob, url: URL.createObjectURL(blob) });
      } catch {
        slot.textContent = "One of the photos could not be used. Please try a JPG or PNG photo.";
        slot.hidden = false;
      } finally {
        busy--;
        send.disabled = busy > 0;
        drawPreviews();
      }
    }
  });

  /* ---------- send ---------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy > 0) return;
    say("");
    const data = new FormData(form);
    // quick checks so people do not wait for the server; the server checks everything again
    const local: Record<string, string> = {};
    if (!data.get("rating")) local.rating = "Please tap a star to rate your pair.";
    if (String(data.get("name") ?? "").trim().length < LIMITS.nameMin) local.name = "Please enter your name.";
    if (String(data.get("comment") ?? "").trim().length < LIMITS.commentMin) local.comment = `Please write at least ${LIMITS.commentMin} letters about your experience.`;
    if (Object.keys(local).length) return showErrors(local);
    showErrors(undefined);

    data.delete("photos");
    picked.forEach((p, i) => data.append("photos", p.blob, `photo-${i + 1}.jpg`));

    send.disabled = true;
    const label = send.textContent;
    send.textContent = "Sending…";
    try {
      const res = await fetch("/api/reviews/", { method: "POST", body: data });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        picked.forEach((p) => URL.revokeObjectURL(p.url));
        picked.length = 0;
        form.reset();
        tally();
        drawPreviews();
        note.textContent = "Tap a star";
        form.hidden = true;
        cta.hidden = true;
        thanks.hidden = false;
        thanks.scrollIntoView({ block: "center", behavior: "smooth" });
      } else if (res.status === 422 && body.errors) {
        showErrors(body.errors);
      } else {
        say(body.error ?? "Your review could not be sent. Please try again.");
      }
    } catch {
      say("Could not reach the shop. Please check your internet and try again.");
    } finally {
      send.disabled = busy > 0;
      send.textContent = label;
    }
  });

  drawPreviews();
}

init();
