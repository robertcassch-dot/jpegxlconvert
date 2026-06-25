/* ============================================================
   JPEG XL Converter — client-side engine (ES module)
   100% in-browser. Files never leave the device.
   JXL encode/decode via jSquash (libjxl compiled to WASM).
   JPG/PNG/WebP decode + PNG/JPG encode use the native browser.
   ============================================================ */

// jSquash JXL codec (WASM). For production, self-host these for
// reliability/privacy-optics instead of loading from the CDN.
const JXL_MODULE = "/assets/vendor/jxl/index.js";

let _jxl = null;
async function getJxl() {
  if (!_jxl) _jxl = await import(JXL_MODULE);
  return _jxl; // { encode, decode }
}

// heic-to (libheif compiled to WASM, decode-only). Self-hosted and lazy-loaded
// so the ~2.9 MB codec only downloads when the user actually drops a HEIC file.
const HEIC_MODULE = "/assets/vendor/heic/heic-to.js";
let _heic = null;
async function getHeic() {
  if (!_heic) _heic = await import(HEIC_MODULE);
  return _heic; // { heicTo, isHeic }
}

// ---- tiny i18n for dynamic strings (keyed by <html lang>) ----
const LANG = (document.documentElement.lang || "en").slice(0, 2);
const T = {
  en: { converting: "Converting…", saved: "smaller", bigger: "bigger", download: "Download",
        downloadAll: "Download all", failed: "Could not convert this file", same: "same size",
        drop: "Drop your images here" },
  es: { converting: "Convirtiendo…", saved: "más pequeño", bigger: "más grande", download: "Descargar",
        downloadAll: "Descargar todo", failed: "No se pudo convertir este archivo", same: "mismo tamaño",
        drop: "Suelta tus imágenes aquí" },
  de: { converting: "Konvertiere…", saved: "kleiner", bigger: "größer", download: "Herunterladen",
        downloadAll: "Alle herunterladen", failed: "Datei konnte nicht konvertiert werden", same: "gleiche Größe",
        drop: "Bilder hier ablegen" },
  fr: { converting: "Conversion…", saved: "plus petit", bigger: "plus grand", download: "Télécharger",
        downloadAll: "Tout télécharger", failed: "Impossible de convertir ce fichier", same: "même taille",
        drop: "Déposez vos images ici" },
};
const t = (k) => (T[LANG] || T.en)[k];

// ---- helpers ----
const isJxl = (f) => /\.jxl$/i.test(f.name) || f.type === "image/jxl";
// HEIC/HEIF detection by extension or MIME. iPhone files often arrive with an
// empty file.type, so the extension check is what actually catches them.
const isHeic = (f) => /\.hei[cf]$/i.test(f.name) || f.type === "image/heic" || f.type === "image/heif";
const fmtBytes = (b) => {
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / 1024 / 1024).toFixed(2) + " MB";
};

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
}

async function fileToImageData(file) {
  // HEIC isn't decodable by createImageBitmap in Chrome/Firefox/Edge, so route
  // it through heic-to (which applies EXIF/HEIF orientation for us); everything
  // else uses the native browser decoder.
  const bitmap = isHeic(file)
    ? await (await getHeic()).heicTo({ blob: file, type: "bitmap" })
    : await createImageBitmap(file);
  const canvas = makeCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close && bitmap.close();
  return data;
}

async function imageDataToBlob(imageData, mime, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width; canvas.height = imageData.height;
  canvas.getContext("2d").putImageData(imageData, 0, 0);
  return await new Promise((res) => canvas.toBlob(res, mime, quality));
}

// ---- core conversion ----
// target: "jxl" | "png" | "jpeg" | "auto"
async function convert(file, { target, quality, lossless }) {
  const fromJxl = isJxl(file);
  const fromHeic = isHeic(file);
  let out = target;
  // Auto: .jxl -> png, HEIC -> jpg (what people want from iPhone photos), else -> jxl.
  if (target === "auto") out = fromJxl ? "png" : (fromHeic ? "jpeg" : "jxl");

  if (out === "jxl") {
    const imageData = fromJxl ? (await getJxl()).decode(await file.arrayBuffer()) : await fileToImageData(file);
    const id = (imageData instanceof Promise) ? await imageData : imageData;
    const { encode } = await getJxl();
    const buf = await encode(id, { quality: lossless ? 100 : quality });
    return { blob: new Blob([buf], { type: "image/jxl" }), ext: "jxl" };
  }

  // output PNG or JPEG
  const mime = out === "jpeg" ? "image/jpeg" : "image/png";
  const ext = out === "jpeg" ? "jpg" : "png";
  let imageData;
  if (fromJxl) {
    const { decode } = await getJxl();
    imageData = await decode(await file.arrayBuffer());
  } else {
    imageData = await fileToImageData(file);
  }
  const q = out === "jpeg" ? (lossless ? 0.98 : quality / 100) : undefined;
  const blob = await imageDataToBlob(imageData, mime, q);
  return { blob, ext };
}

// ---- UI wiring ----
function init() {
  const dz = document.getElementById("dropzone");
  const input = document.getElementById("file-input");
  const results = document.getElementById("results");
  const actions = document.getElementById("results-actions");
  if (!dz || !input) return;

  const state = {
    target: "auto",
    quality: 90,
    lossless: false,
    produced: [], // {name, blob, url}
  };

  // Conversion pages pre-select a target button (class "on"); honor it.
  const preset = document.querySelector("[data-target].on");
  if (preset) state.target = preset.dataset.target;

  // segmented target
  document.querySelectorAll("[data-target]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.target = btn.dataset.target;
      document.querySelectorAll("[data-target]").forEach((b) => b.classList.toggle("on", b === btn));
    });
  });
  // quality
  const qRange = document.getElementById("quality");
  const qOut = document.getElementById("quality-val");
  if (qRange) qRange.addEventListener("input", () => { state.quality = +qRange.value; qOut.textContent = qRange.value; });
  const lossless = document.getElementById("lossless");
  if (lossless) lossless.addEventListener("change", () => {
    state.lossless = lossless.checked;
    if (qRange) qRange.disabled = lossless.checked;
  });

  // file selection
  dz.addEventListener("click", () => input.click());
  input.addEventListener("change", () => handleFiles([...input.files]));
  ["dragenter", "dragover"].forEach((e) =>
    dz.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((e) =>
    dz.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.remove("drag"); }));
  dz.addEventListener("drop", (ev) => {
    const files = [...(ev.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/") || isJxl(f) || isHeic(f));
    if (files.length) handleFiles(files);
  });

  async function handleFiles(files) {
    for (const file of files) {
      const row = document.createElement("div");
      row.className = "result";
      row.innerHTML = `
        <img class="thumb" alt="">
        <div class="meta">
          <div class="fname">${escapeHtml(file.name)}</div>
          <div class="sizes"><span class="spin"><span class="spinner"></span>${t("converting")}</span></div>
        </div>`;
      results.appendChild(row);
      const thumb = row.querySelector(".thumb");
      // preview (only for browser-native formats; jxl/heic can't be shown raw)
      if (!isJxl(file) && !isHeic(file)) { try { thumb.src = URL.createObjectURL(file); } catch (_) {} }

      try {
        const { blob, ext } = await convert(file, state);
        const url = URL.createObjectURL(blob);
        const baseName = file.name.replace(/\.[^.]+$/, "");
        const outName = `${baseName}.${ext}`;
        const delta = file.size ? Math.round((1 - blob.size / file.size) * 100) : 0;
        const savedClass = delta > 0 ? "good" : "bad";
        const savedTxt = delta === 0 ? t("same") : `${Math.abs(delta)}% ${delta > 0 ? t("saved") : t("bigger")}`;
        row.querySelector(".sizes").innerHTML =
          `${fmtBytes(file.size)} → <b>${fmtBytes(blob.size)}</b> · <span class="saved ${savedClass}">${savedTxt}</span>`;
        const dl = document.createElement("a");
        dl.className = "btn-dl"; dl.href = url; dl.download = outName; dl.textContent = t("download");
        row.appendChild(dl);
        if ((isJxl(file) || isHeic(file)) && thumb) thumb.src = url; // now we can preview decoded output
        state.produced.push({ name: outName, url });
        updateActions();
      } catch (err) {
        console.error(err);
        row.querySelector(".sizes").innerHTML = `<span class="err">${t("failed")}</span>`;
      }
    }
  }

  function updateActions() {
    if (!actions) return;
    if (state.produced.length > 1) {
      actions.innerHTML = "";
      const all = document.createElement("button");
      all.className = "btn-dl ghost"; all.textContent = t("downloadAll");
      all.addEventListener("click", () => state.produced.forEach((p, i) => {
        setTimeout(() => { const a = document.createElement("a"); a.href = p.url; a.download = p.name; a.click(); }, i * 250);
      }));
      actions.appendChild(all);
    }
  }
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

if (document.readyState !== "loading") init();
else document.addEventListener("DOMContentLoaded", init);
