/* ============================================================
   JXL Convert — .jxl viewer (client-side)
   Opens and displays a .jxl (or any image) on screen, no upload.
   Optional download as JPG/PNG. JXL decoded via jSquash (WASM).
   ============================================================ */
const JXL_MODULE = "/assets/vendor/jxl/index.js";
let _jxl = null;
async function getJxl() { if (!_jxl) _jxl = await import(JXL_MODULE); return _jxl; }

const LANG = (document.documentElement.lang || "en").slice(0, 2);
const T = {
  en: { loading: "Opening…", fail: "Could not open this file", dl: "Download as", dim: "Dimensions", size: "Size" },
  es: { loading: "Abriendo…", fail: "No se pudo abrir este archivo", dl: "Descargar como", dim: "Dimensiones", size: "Tamaño" },
  de: { loading: "Öffne…", fail: "Datei konnte nicht geöffnet werden", dl: "Herunterladen als", dim: "Abmessungen", size: "Größe" },
  fr: { loading: "Ouverture…", fail: "Impossible d'ouvrir ce fichier", dl: "Télécharger en", dim: "Dimensions", size: "Taille" },
};
const t = (k) => (T[LANG] || T.en)[k];
const isJxl = (f) => /\.jxl$/i.test(f.name) || f.type === "image/jxl";
const fmtBytes = (b) => (b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(1) + " KB" : (b / 1048576).toFixed(2) + " MB");

function idToCanvas(id) {
  const c = document.createElement("canvas");
  c.width = id.width; c.height = id.height;
  c.getContext("2d").putImageData(id, 0, 0);
  return c;
}
function idToBlob(id, mime, q) {
  return new Promise((res) => idToCanvas(id).toBlob(res, mime, q));
}

function init() {
  const dz = document.getElementById("dropzone");
  const input = document.getElementById("file-input");
  const stage = document.getElementById("viewer-stage");
  const info = document.getElementById("viewer-info");
  const dlbox = document.getElementById("viewer-dl");
  if (!dz || !stage) return;

  dz.addEventListener("click", () => input.click());
  input.addEventListener("change", () => input.files[0] && open(input.files[0]));
  ["dragenter", "dragover"].forEach((e) => dz.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((e) => dz.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.remove("drag"); }));
  dz.addEventListener("drop", (ev) => { const f = ev.dataTransfer && ev.dataTransfer.files[0]; if (f) open(f); });

  async function open(file) {
    stage.innerHTML = `<div class="spin"><span class="spinner"></span>${t("loading")}</div>`;
    info.textContent = ""; dlbox.innerHTML = "";
    try {
      let id;
      if (isJxl(file)) {
        const { decode } = await getJxl();
        id = await decode(await file.arrayBuffer());
      } else {
        const bmp = await createImageBitmap(file);
        const c = document.createElement("canvas");
        c.width = bmp.width; c.height = bmp.height;
        const ctx = c.getContext("2d"); ctx.drawImage(bmp, 0, 0);
        id = ctx.getImageData(0, 0, bmp.width, bmp.height);
      }
      stage.innerHTML = ""; stage.appendChild(idToCanvas(id));
      info.textContent = `${file.name} · ${t("dim")}: ${id.width}×${id.height} · ${t("size")}: ${fmtBytes(file.size)}`;
      for (const [label, mime, ext, q] of [["JPG", "image/jpeg", "jpg", 0.92], ["PNG", "image/png", "png", undefined]]) {
        const a = document.createElement("a");
        a.className = "btn-dl"; a.href = "#"; a.textContent = `${t("dl")} ${label}`;
        a.addEventListener("click", async (e) => {
          e.preventDefault();
          const blob = await idToBlob(id, mime, q);
          const u = URL.createObjectURL(blob);
          const dl = document.createElement("a");
          dl.href = u; dl.download = file.name.replace(/\.[^.]+$/, "") + "." + ext; dl.click();
        });
        dlbox.appendChild(a);
      }
    } catch (err) {
      console.error(err);
      stage.innerHTML = `<div class="err">${t("fail")}</div>`;
    }
  }
}
if (document.readyState !== "loading") init();
else document.addEventListener("DOMContentLoaded", init);
