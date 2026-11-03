/* ¿Tu navegador soporta JPEG XL? — prueba en vivo de /en/jpeg-xl-browser-test/.
   El navegador intenta mostrar tres imágenes JPEG XL diminutas incrustadas aquí mismo
   (data: URI, nada sale a la red): una normal, una con transparencia y una animada.
   Fabricadas con jpegxl-build/test-navegador/hacer-imagenes.py + cjxl 0.12.0 -d 0.
   Cada una tiene un tamaño propio y se comprueba al cargar, para no dar un falso «sí». */
(function () {
  "use strict";
  var box = document.getElementById("jxl-test");
  if (!box) return;

  var IMG = {
    basic: { w: 96, h: 48, src: "data:image/jxl;base64,/wrLQSQIAAEAWAFLKCXWISSGkpAwYQGaACMGi4sxXmTU+I3B2BAiYFzRzFsgBABAKkgOf4S9YwWQiOYqNjHvuc3qL57kfkBwgMfOGQAqwIdJXyrfodYfKrzmyM+rIY1uDw==" },
    alpha: { w: 64, h: 64, src: "data:image/jxl;base64,/wpPwEoIABAAkAJLKDXGPuRhPpSChISEEUTAHUYMFhl0qHG3MWhDiIBxRTNvARkAAIkRnfwPDbih4EgQ4igiWzMzBBgCQmy90pYkD81zI4CAlumVLRaGwI0Ca1V0VO5GmwwmDsZwNvA0CRL7xid05MybZBijqM8kz61+YERoIXLkHIgl9phuIW8c4ZoYoEJXlIV9GqwcE1DHUmFQVnJr8hToWB2exOiFg3W/+x615A==" },
    anim: { w: 80, h: 40, src: "data:image/jxl;base64,/wrJBQOICQgA0wcAAAgAAHwASxiLFQDUiHF3Y9w9wBAAkQDATZ2NGhYLTvfx/QXrEwgA0wcAAAQAdABLGIsVANSIMW7cjXuAIcCJexuCji7t0uHI1T8URg==" }
  };

  var lang = (document.documentElement.lang || "en").slice(0, 2);
  var T = {
    en: {
      basic: "Basic image", alpha: "Transparency", anim: "Animation",
      yes: "Supported", no: "Not supported", still: "Shows, but does not animate", wait: "Testing…",
      look: "Can’t be checked automatically here: if the square switches between purple and green, it animates.",
      sumYes: "Your browser displays JPEG XL natively.",
      sumNo: "Your browser cannot display JPEG XL on its own.",
      sumPart: "Your browser displays JPEG XL, with gaps (see the tests).",
      browser: "Detected browser", viewer: "Open a .jxl in our viewer instead", viewerUrl: "/en/jxl-viewer/",
      priv: "Nothing is uploaded: the three test images are embedded in this page."
    },
    es: {
      basic: "Imagen básica", alpha: "Transparencia", anim: "Animación",
      yes: "Funciona", no: "No funciona", still: "Se ve, pero no se mueve", wait: "Probando…",
      look: "Aquí no se puede comprobar solo: si el cuadro cambia de morado a verde, se anima.",
      sumYes: "Tu navegador muestra JPEG XL de forma nativa.",
      sumNo: "Tu navegador no puede mostrar JPEG XL por sí solo.",
      sumPart: "Tu navegador muestra JPEG XL, pero con huecos (mira las pruebas).",
      browser: "Navegador detectado", viewer: "Abre tu .jxl en nuestro visor", viewerUrl: "/es/visor-jxl/",
      priv: "No se sube nada: las tres imágenes de prueba van dentro de esta página."
    }
  }[lang] || null;
  if (!T) return;

  function navegador() {
    var ua = navigator.userAgent, m;
    var marcas = navigator.userAgentData && navigator.userAgentData.brands;
    if (marcas) {
      var pref = ["Microsoft Edge", "Opera", "Brave", "Google Chrome", "Chromium"];
      for (var i = 0; i < pref.length; i++) {
        for (var j = 0; j < marcas.length; j++) {
          if (marcas[j].brand === pref[i]) return pref[i] + " " + marcas[j].version;
        }
      }
    }
    if ((m = ua.match(/Firefox\/(\d+)/))) return "Firefox " + m[1];
    if ((m = ua.match(/Edg\/(\d+)/))) return "Microsoft Edge " + m[1];
    if ((m = ua.match(/SamsungBrowser\/(\d+)/))) return "Samsung Internet " + m[1];
    if ((m = ua.match(/OPR\/(\d+)/))) return "Opera " + m[1];
    if ((m = ua.match(/Chrome\/(\d+)/))) return "Chrome " + m[1];
    if ((m = ua.match(/Version\/([\d.]+).*Safari/))) return "Safari " + m[1];
    return ua;
  }

  function tarjeta(clave) {
    var d = document.createElement("div");
    d.className = "feature";
    d.innerHTML = '<div class="fi" style="height:64px;display:flex;align-items:center;justify-content:center"></div>' +
      "<h3></h3><p></p>";
    d.querySelector("h3").textContent = T[clave];
    d.querySelector("p").textContent = T.wait;
    box.appendChild(d);
    return d;
  }

  function probar(clave) {
    return new Promise(function (resolve) {
      var card = tarjeta(clave), img = new Image(), hecho = false;
      img.alt = T[clave];
      img.style.maxHeight = "64px";
      function fin(r) {
        if (hecho) return;
        hecho = true;
        card.querySelector("p").textContent = r === "yes" ? "✅ " + T.yes : r === "still" ? "⚠️ " + T.still
          : r === "look" ? "👀 " + T.look : "❌ " + T.no;
        if (r !== "no") card.querySelector(".fi").appendChild(img);
        resolve(r);
      }
      img.onload = function () {
        if (img.naturalWidth !== IMG[clave].w || img.naturalHeight !== IMG[clave].h) return fin("no");
        var c = document.createElement("canvas");
        c.width = IMG[clave].w; c.height = IMG[clave].h;
        var x = c.getContext("2d");
        var pixel = function (px, py) { x.clearRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0); return x.getImageData(px, py, 1, 1).data; };
        if (clave === "basic") return fin("yes");
        if (clave === "alpha") {
          // la esquina tiene que salir transparente y el centro del círculo, opaco
          return fin(pixel(1, 1)[3] === 0 && pixel(32, 32)[3] === 255 ? "yes" : "no");
        }
        // ¿Se mueve? Mirar píxeles en un canvas NO sirve como prueba: medido el 15-oct
        // en Chrome 155, ni un GIF ni un WebP animados avanzan de fotograma así. Lo que
        // sí responde es ImageDecoder (WebCodecs): cuenta los fotogramas que el propio
        // navegador decodifica. Donde no existe, se pide al lector que mire el cuadro,
        // en vez de dar un «no» que podría ser falso.
        card.querySelector(".fi").appendChild(img);
        if (!("ImageDecoder" in window)) return fin("look");
        ImageDecoder.isTypeSupported("image/jxl").then(function (ok) {
          if (!ok) return fin("look");
          return fetch(IMG.anim.src).then(function (r) { return r.arrayBuffer(); }).then(function (data) {
            var dec = new ImageDecoder({ data: data, type: "image/jxl" });
            return dec.tracks.ready.then(function () {
              var t = dec.tracks.selectedTrack;
              fin(t && t.animated && t.frameCount > 1 ? "yes" : "still");
            });
          });
        }).catch(function () { fin("look"); });
      };
      img.onerror = function () { fin("no"); };
      setTimeout(function () { fin("no"); }, 4000);
      img.src = IMG[clave].src;
    });
  }

  box.innerHTML = "";
  var resumen = document.createElement("p");
  resumen.className = "lead";
  resumen.setAttribute("role", "status");
  box.parentNode.insertBefore(resumen, box);

  function empezar() {
    resumen.textContent = T.wait;
    Promise.all([probar("basic"), probar("alpha"), probar("anim")]).then(function (r) {
      // "look" (no se pudo comprobar la animación) no cuenta como hueco
      var todo = r.every(function (v) { return v === "yes" || v === "look"; });
      var nada = r[0] === "no";
      resumen.innerHTML = "<strong></strong> " + "<span></span>";
      resumen.querySelector("strong").textContent = todo ? T.sumYes : nada ? T.sumNo : T.sumPart;
      resumen.querySelector("span").textContent = T.browser + ": " + navegador() + ". " + T.priv;
      if (nada) {
        var a = document.createElement("a");
        a.href = T.viewerUrl;
        a.textContent = " " + T.viewer + " →";
        resumen.appendChild(a);
      }
    });
  }

  // En una pestaña de fondo el navegador congela las animaciones y frena los
  // temporizadores: la prueba de animación daría un falso «no se mueve». Se espera
  // a que la pestaña esté a la vista.
  if (document.visibilityState !== "hidden") empezar();
  else document.addEventListener("visibilitychange", function alVer() {
    if (document.visibilityState === "hidden") return;
    document.removeEventListener("visibilitychange", alVer);
    empezar();
  });
})();
