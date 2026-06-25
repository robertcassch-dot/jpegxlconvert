# JXL Convert — Free JPEG XL Converter & Viewer

**Live:** <https://jpegxlconvert.com>

A free, **100% client-side** JPEG XL converter and viewer. Convert images **to and from `.jxl`** — and open `.jxl` files — entirely in your browser. Your files never leave your device: no upload, no server, no sign-up, no limits, no watermark.

## Features
- **Convert to JXL**: JPG, PNG, WebP, GIF → JPEG XL (libjxl via WebAssembly).
- **Convert from JXL**: `.jxl` → PNG / JPG.
- **HEIC support**: open iPhone HEIC photos and convert them to JPG / PNG / JXL.
- **Viewer**: open and preview a `.jxl` file instantly, then save it as JPG/PNG.
- **Private by design**: everything runs locally in the browser. Nothing is uploaded.
- **Multilingual**: English, Español, Deutsch, Français, Русский — SEO-first with `hreflang`, canonical, structured data and Open Graph.

## How it works
- **JPG/PNG/WebP/GIF → JXL**: decoded natively by the browser, encoded to JXL with [`@jsquash/jxl`](https://github.com/jamsinclair/jSquash) (libjxl in WebAssembly).
- **.jxl → PNG/JPG**: decoded with `@jsquash/jxl`, re-encoded natively via `<canvas>`.
- **HEIC**: decoded in-browser, then converted.

Everything is static and serverless — deployable to any static host (this site runs on Cloudflare Pages).

## Structure
```
/                 root: language auto-detect + redirect
/en /es /de /fr /ru   localized tool pages (full content + FAQ)
/assets/css       styles.css (shared)
/assets/js        app.js (converter engine), viewer.js
/assets/vendor    self-hosted JXL WASM codec
/sitemap.xml      multilingual sitemap with hreflang alternates
```

## License
Free to use. The JPEG XL codec is provided by libjxl / `@jsquash/jxl` under their respective licenses.
