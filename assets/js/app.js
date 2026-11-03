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

// libjxl cjxl — true lossless JPEG transcoding. Custom single-thread WASM build
// (no pthreads, so no cross-origin-isolation headers needed). Lazy-loaded only
// when a JPEG is converted to JXL losslessly: it repacks the original JPEG
// bitstream instead of re-encoding pixels, so the result is bit-identical to the
// source JPEG and ~10-20% smaller (a plain pixel "lossless" encode would be bigger).
const CJXL_DIR = "/assets/vendor/jxl-enc/";
let _cjxlFactory = null;
function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("load " + src));
    document.head.appendChild(s);
  });
}
async function getCjxl() {
  if (!_cjxlFactory) { await loadScriptOnce(CJXL_DIR + "cjxl.js"); _cjxlFactory = globalThis.createCjxl; }
  // Fresh module instance per file so batches stay clean.
  return _cjxlFactory({ noInitialRun: true, locateFile: (p) => CJXL_DIR + p, print: () => {}, printErr: () => {} });
}
async function transcodeJpegToJxl(file) {
  const mod = await getCjxl();
  const bytes = new Uint8Array(await file.arrayBuffer());
  mod.FS.writeFile("in.jpg", bytes);
  try { mod.callMain(["in.jpg", "out.jxl", "--num_threads", "0", "--lossless_jpeg=1"]); } catch (e) { /* emscripten exits via throw */ }
  return mod.FS.readFile("out.jxl"); // Uint8Array
}

// Pixel → JXL encoding also goes through cjxl: the jSquash encoder WASM runs out
// of heap and aborts somewhere between 12 and 16 MP (a 22 MP camera JPEG dies with
// "RuntimeError: index out of bounds"), and at effort 7 it needs ~20 s for a 12 MP
// photo anyway. cjxl fed with raw PPM/PAM pixels at effort 4 handles 22 MP in ~3 s.
// The browser does the decoding, cjxl only encodes; PAM is used when alpha matters.
async function encodePixelsViaCjxl(imageData, { quality, lossless }) {
  const { width: w, height: h, data } = imageData;
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) { hasAlpha = true; break; }
  let name, input;
  if (hasAlpha) {
    const header = new TextEncoder().encode(`P7\nWIDTH ${w}\nHEIGHT ${h}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n`);
    input = new Uint8Array(header.length + data.length);
    input.set(header, 0); input.set(data, header.length);
    name = "in.pam";
  } else {
    const header = new TextEncoder().encode(`P6\n${w} ${h}\n255\n`);
    input = new Uint8Array(header.length + w * h * 3);
    input.set(header, 0);
    for (let i = 0, o = header.length, n = w * h; i < n; i++) {
      const s = i * 4;
      input[o++] = data[s]; input[o++] = data[s + 1]; input[o++] = data[s + 2];
    }
    name = "in.ppm";
  }
  const mod = await getCjxl();
  mod.FS.writeFile(name, input);
  const q = lossless ? "100" : String(quality);
  try { mod.callMain([name, "out.jxl", "--num_threads", "0", "-q", q, "-e", "4"]); } catch (e) { /* emscripten exits via throw */ }
  return mod.FS.readFile("out.jxl"); // throws if cjxl produced nothing
}

// ---- tiny i18n for dynamic strings (keyed by <html lang>) ----
const LANG = (document.documentElement.lang || "en").slice(0, 2);
const T = {
  en: { converting: "Converting…", saved: "smaller", bigger: "bigger", download: "Download",
        downloadAll: "Download all", failed: "Could not convert this file", same: "same size",
        drop: "Drop your images here",
        done: "Done", total: "Total", zipping: "Preparing ZIP…", share: "Share", linkCopied: "Link copied!", shareText: "Free in-browser JPEG XL converter — no upload, no sign-up." },
  es: { converting: "Convirtiendo…", saved: "más pequeño", bigger: "más grande", download: "Descargar",
        downloadAll: "Descargar todo", failed: "No se pudo convertir este archivo", same: "mismo tamaño",
        drop: "Suelta tus imágenes aquí",
        done: "Listo", total: "Total", zipping: "Preparando ZIP…", share: "Compartir", linkCopied: "¡Enlace copiado!", shareText: "Conversor JPEG XL gratis en el navegador — sin subidas, sin registro." },
  de: { converting: "Konvertiere…", saved: "kleiner", bigger: "größer", download: "Herunterladen",
        downloadAll: "Alle herunterladen", failed: "Datei konnte nicht konvertiert werden", same: "gleiche Größe",
        drop: "Bilder hier ablegen",
        done: "Fertig", total: "Gesamt", zipping: "ZIP wird erstellt…", share: "Teilen", linkCopied: "Link kopiert!", shareText: "Kostenloser JPEG-XL-Konverter im Browser — kein Upload, keine Anmeldung." },
  fr: { converting: "Conversion…", saved: "plus petit", bigger: "plus grand", download: "Télécharger",
        downloadAll: "Tout télécharger", failed: "Impossible de convertir ce fichier", same: "même taille",
        drop: "Déposez vos images ici",
        done: "Terminé", total: "Total", zipping: "Préparation du ZIP…", share: "Partager", linkCopied: "Lien copié !", shareText: "Convertisseur JPEG XL gratuit dans le navigateur — sans téléversement, sans inscription." },
  ru: { converting: "Конвертируем…", saved: "меньше", bigger: "больше", download: "Скачать",
        downloadAll: "Скачать все", failed: "Не удалось конвертировать этот файл", same: "тот же размер",
        drop: "Перетащите изображения сюда",
        done: "Готово", total: "Всего", zipping: "Готовим ZIP…", share: "Поделиться", linkCopied: "Ссылка скопирована!", shareText: "Бесплатный конвертер JPEG XL в браузере — без загрузки на сервер и без регистрации." },
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

// ---- ZIP (store method, no deps) + text manifest ----
// A batch downloads as ONE .zip that also bundles a manifest.txt report, so the
// user can check original vs output size (per file + total) before deleting the
// originals. Store method (no deflate): the payloads are already-compressed
// images, so compressing again only burns CPU for ~0 gain.
const _crcTable = (() => {
  const tbl = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    tbl[n] = c >>> 0;
  }
  return tbl;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = _crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zipStore(files) {
  // files: [{ name, data: Uint8Array }] -> application/zip Blob
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | ((now.getSeconds() >> 1) & 0x1f);
  const dosDate = (((now.getFullYear() - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0x0f) << 5) | (now.getDate() & 0x1f);
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data), size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
    lh.setUint16(26, nameBytes.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nameBytes, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true);
    ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true);
    ch.setUint32(24, size, true); ch.setUint16(28, nameBytes.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameBytes);
    offset += 30 + nameBytes.length + size;
  }
  let centralSize = 0; for (const c of central) centralSize += c.length;
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true); eocd.setUint32(12, centralSize, true); eocd.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(eocd.buffer)], { type: "application/zip" });
}
function buildManifest(rows) {
  // rows: [{ from, to, origSize, outSize }]
  const pad = (n) => String(n).padStart(2, "0");
  const d = new Date();
  const lines = [
    "jpegxlconvert.com — conversion report",
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
    "",
  ];
  let to = 0, ot = 0;
  for (const r of rows) {
    to += r.origSize; ot += r.outSize;
    const pct = r.origSize ? Math.round((1 - r.outSize / r.origSize) * 100) : 0;
    const tag = pct > 0 ? `-${pct}%` : (pct < 0 ? `+${-pct}%` : "0%");
    lines.push(`${r.from} (${fmtBytes(r.origSize)})  ->  ${r.to} (${fmtBytes(r.outSize)})   ${tag}`);
  }
  const totPct = to ? Math.round((1 - ot / to) * 100) : 0;
  lines.push("");
  lines.push(`TOTAL: ${fmtBytes(to)}  ->  ${fmtBytes(ot)}   ${totPct >= 0 ? "saved" : "added"} ${fmtBytes(Math.abs(to - ot))} (${totPct >= 0 ? "-" : "+"}${Math.abs(totPct)}%)`);
  lines.push("");
  lines.push("All conversions ran 100% in your browser — nothing was uploaded.");
  lines.push("Lossless JPEG->JXL output is bit-identical to the source JPEG.");
  lines.push("Check these numbers before deleting your originals.");
  return new TextEncoder().encode(lines.join("\n"));
}

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
    // Lossless JPEG → JXL: repack the original JPEG (true lossless transcoding),
    // which is bit-identical and smaller. Falls back to the pixel path on error.
    const isJpeg = !fromJxl && !fromHeic && (file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name));
    if (lossless && isJpeg) {
      try {
        const tbuf = await transcodeJpegToJxl(file);
        if (tbuf && tbuf.length) return { blob: new Blob([tbuf], { type: "image/jxl" }), ext: "jxl" };
      } catch (e) { /* fall through to pixel encode */ }
    }
    const imageData = fromJxl ? (await getJxl()).decode(await file.arrayBuffer()) : await fileToImageData(file);
    const id = (imageData instanceof Promise) ? await imageData : imageData;
    try {
      const buf = await encodePixelsViaCjxl(id, { quality, lossless });
      return { blob: new Blob([buf], { type: "image/jxl" }), ext: "jxl" };
    } catch (e) {
      // cjxl failed (bad load, unexpected input) — fall back to the jSquash
      // encoder, which still covers small/medium images.
      const { encode } = await getJxl();
      const buf = await encode(id, { quality: lossless ? 100 : quality });
      return { blob: new Blob([buf], { type: "image/jxl" }), ext: "jxl" };
    }
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
  const syncLossless = () => {
    state.lossless = lossless.checked;
    if (qRange) qRange.disabled = lossless.checked;
  };
  // La pagina JPG -> JXL trae la casilla marcada (promete reempaquetar sin perdida);
  // y el navegador puede restaurarla al volver atras: se lee al arrancar, no solo al cambiar.
  if (lossless) { syncLossless(); lossless.addEventListener("change", syncLossless); }

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
    if (!files.length) return;
    const prog = ensureProgress();
    const bar = prog.querySelector(".cp-fill");
    const plabel = prog.querySelector(".cp-label");
    const total = files.length;
    let done = 0;
    prog.classList.add("on");
    prog.classList.toggle("indet", total === 1);
    bar.style.width = total === 1 ? "" : "0%";
    plabel.textContent = `${t("converting")} 0/${total}`;

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
        state.produced.push({ name: outName, url, blob, origName: file.name, origSize: file.size, outSize: blob.size });
        updateActions();
      } catch (err) {
        console.error(err);
        row.querySelector(".sizes").innerHTML = `<span class="err">${t("failed")}</span>`;
      }

      done++;
      if (total > 1) bar.style.width = Math.round((done / total) * 100) + "%";
      plabel.textContent = done < total ? `${t("converting")} ${done}/${total}` : t("done");
    }

    prog.classList.remove("indet");
    bar.style.width = "100%";
    setTimeout(() => { prog.classList.remove("on"); }, 700);
  }

  function updateActions() {
    if (!actions) return;
    actions.innerHTML = "";
    if (!state.produced.length) return;
    if (state.produced.length > 1) {
      // aggregate size summary so the whole batch's saving is visible at a glance
      const to = state.produced.reduce((s, p) => s + (p.origSize || 0), 0);
      const ot = state.produced.reduce((s, p) => s + (p.outSize || 0), 0);
      const pct = to ? Math.round((1 - ot / to) * 100) : 0;
      const cls = pct > 0 ? "good" : (pct < 0 ? "bad" : "");
      const word = pct === 0 ? t("same") : `${Math.abs(pct)}% ${pct > 0 ? t("saved") : t("bigger")}`;
      const summary = document.createElement("div");
      summary.className = "results-total";
      summary.innerHTML = `${t("total")}: ${fmtBytes(to)} → <b>${fmtBytes(ot)}</b> · <span class="saved ${cls}">${word}</span>`;
      actions.appendChild(summary);

      const all = document.createElement("button");
      all.className = "btn-dl ghost"; all.textContent = t("downloadAll");
      all.addEventListener("click", () => downloadZip(all));
      actions.appendChild(all);
    }
    // share-this-tool CTA, shown after at least one successful conversion
    const share = document.createElement("button");
    share.className = "btn-dl ghost share-btn"; share.textContent = t("share");
    share.addEventListener("click", () => shareTool(share));
    actions.appendChild(share);
  }

  // Bundle every converted file + a manifest.txt report into one .zip download.
  async function downloadZip(btn) {
    if (!state.produced.length) return;
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = t("zipping");
    try {
      const used = new Map();
      const files = [], rows = [];
      for (const p of state.produced) {
        let name = p.name;
        if (used.has(name)) {           // dedupe names inside the archive
          const n = used.get(name) + 1; used.set(name, n);
          const dot = name.lastIndexOf(".");
          name = dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
        } else used.set(name, 1);
        files.push({ name, data: new Uint8Array(await p.blob.arrayBuffer()) });
        rows.push({ from: p.origName, to: name, origSize: p.origSize, outSize: p.outSize });
      }
      files.push({ name: "manifest.txt", data: buildManifest(rows) });
      const url = URL.createObjectURL(zipStore(files));
      const a = document.createElement("a"); a.href = url; a.download = "jpegxlconvert.zip"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      console.error(e);
    } finally {
      btn.disabled = false; btn.textContent = old;
    }
  }

  function ensureProgress() {
    let p = document.getElementById("conv-progress");
    if (!p) {
      p = document.createElement("div");
      p.id = "conv-progress"; p.className = "conv-progress";
      p.innerHTML = '<div class="cp-bar"><span class="cp-fill"></span></div><div class="cp-label"></div>';
      results.parentNode.insertBefore(p, results);
    }
    return p;
  }

  async function shareTool(btn) {
    const url = location.href;
    if (navigator.share) {
      try { await navigator.share({ title: document.title, text: t("shareText"), url }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      const old = btn.textContent;
      btn.textContent = t("linkCopied"); btn.classList.add("copied");
      setTimeout(() => { btn.textContent = old; btn.classList.remove("copied"); }, 1800);
    } catch (e) {
      window.prompt(t("share"), url);
    }
  }
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

if (document.readyState !== "loading") init();
else document.addEventListener("DOMContentLoaded", init);
