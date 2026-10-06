// Widgets de la guía. Cuatro: CRC paso a paso en `<div class="cdd-crc" data-m="…" data-g="…">`,
// calculadora de capacidad en `<div class="cdd-calc" data-df="…" data-sn="…" data-unidad="dB|veces" data-n="…">`,
// constelación M-PSK en `<div class="cdd-constelacion" data-m="4|8|16">`
// y códigos de línea en `<div class="cdd-linea" data-bits="0 1 1 0 …">`.
// Necesita cdd.js cargado antes (window.CDD). Sin dependencias ni estilos externos.
(function () {
  function el(tag, props, hijos) {
    const e = document.createElement(tag);
    Object.assign(e, props || {});
    (hijos || []).forEach((h) => e.append(h));
    return e;
  }

  function campo(etiqueta, valor) {
    const input = el("input", { type: "text", value: valor, size: 24, spellcheck: false });
    input.style.fontFamily = "monospace";
    return { input, fila: el("label", {}, [etiqueta + " ", input]) };
  }

  function armarCrc(raiz) {
    if (raiz.dataset.listo) return; // el tema puede volver a disparar document$
    raiz.dataset.listo = "1";

    const M = campo("M", raiz.dataset.m || "");
    const G = campo("G", raiz.dataset.g || "");
    const boton = el("button", { type: "button", textContent: "Calcular" });
    const aviso = el("div", { role: "alert" });
    const division = el("pre");
    const salida = el("div");
    const T = campo("T recibido", "");
    const veredicto = el("div");

    function verificar() {
      veredicto.textContent = "";
      if (!T.input.value) return;
      try {
        const resto = window.CDD.restoCrc(T.input.value, G.input.value);
        const ok = /^0+$/.test(resto);
        veredicto.textContent = `Resto del receptor: ${resto} → ${ok ? "sin errores" : "error detectado"}`;
      } catch (e) {
        veredicto.textContent = e.message;
      }
    }

    function calcular() {
      aviso.textContent = "";
      division.textContent = "";
      salida.textContent = "";
      veredicto.textContent = "";
      try {
        const m = M.input.value;
        const g = G.input.value;
        const { r, t, pasos } = window.CDD.crc(m, g);
        const dividendo = m + "0".repeat(g.length - 1);
        const lineas = [`M·x^${g.length - 1}: ${dividendo}`, `G: ${g}`, ""];
        lineas.push(dividendo);
        pasos.forEach((p) => {
          lineas.push(" ".repeat(p.desde) + g);
          lineas.push(" ".repeat(p.desde) + p.fila);
        });
        division.textContent = lineas.join("\n");
        salida.textContent = `R(x) = ${r}    T(x) = ${t}`;
        T.input.value = t; // editable: cambiá un bit para simular un error
        verificar();
      } catch (e) {
        aviso.textContent = e.message;
      }
    }

    boton.addEventListener("click", calcular);
    T.input.addEventListener("input", verificar);
    raiz.append(M.fila, el("br"), G.fila, el("br"), boton, aviso, division, salida, T.fila, veredicto);
    calcular();
  }

  // Calculadora de capacidad en `<div class="cdd-calc" data-df="3000" data-sn="30" data-unidad="dB" data-n="2">`.
  // Acepta coma decimal y muestra siempre coma decimal. El punto solo vale como separador de miles
  // bien formado (26.632, 29.901,7: grupos de 3 dígitos, primer grupo sin 0 inicial). Cualquier otro
  // punto (0.001, 3.5) es un error visible, nunca otro número en silencio. "1.995" se lee como 1995.
  function numero(s) {
    const t = String(s).trim();
    if (t === "") return NaN;
    if (/^-?[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(t)) return Number(t.replace(/\./g, "").replace(",", "."));
    if (t.includes(".")) throw new Error(`«${t}»: usá coma decimal; el punto solo separa miles (26.632)`);
    return Number(t.replace(",", "."));
  }

  // Coma decimal; `miles` agrega el punto de miles. La cátedra trunca los resultados: acá se redondea.
  function texto(x, decimales, miles) {
    const [entero, decimal] = Math.abs(x).toFixed(decimales).split(".");
    const e = miles ? entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : entero;
    return (x < 0 ? "-" : "") + e + (decimal ? "," + decimal : "");
  }

  // Hasta 4 decimales, sin ceros de más: 1000 → "1000"; 251,1886.
  function corto(x) {
    return texto(x, 4).replace(/,?0+$/, "");
  }

  function armarCalc(raiz) {
    if (raiz.dataset.listo) return;
    raiz.dataset.listo = "1";

    function campoNombrado(nombre, etiqueta, valor) {
      const c = campo(etiqueta, valor);
      c.input.name = nombre;
      return c;
    }
    const veces = campoNombrado("veces", "Veces (potencia)", "1000");
    const db = campoNombrado("db", "dB", "30");
    const df = campoNombrado("df", "Δf [Hz]", raiz.dataset.df || "3000");
    const n = campoNombrado("n", "n (niveles)", raiz.dataset.n || "2");
    const sn = campoNombrado("sn", "S/N", raiz.dataset.sn || "30");
    const unidad = el("select", { name: "unidad" }, ["dB", "veces"].map((u) => el("option", { value: u, textContent: u })));
    unidad.value = raiz.dataset.unidad || "dB";
    const aviso = el("div", { role: "alert" });
    const nyq = el("div", { className: "cdd-calc-nyquist" });
    const sha = el("div", { className: "cdd-calc-shannon" });

    function convertir(origen, destino, f) {
      aviso.textContent = "";
      try {
        destino.input.value = corto(f(numero(origen.input.value)));
      } catch (e) {
        aviso.textContent = e.message;
      }
    }

    function mostrar(salida, f) {
      try {
        salida.textContent = f();
      } catch (e) {
        salida.textContent = e.message;
      }
    }

    function capacidad() {
      mostrar(nyq, () => {
        const c = window.CDD.nyquist(numero(df.input.value), numero(n.input.value));
        return `Nyquist (canal ideal, sin ruido): C = 2·Δf·log₂ n = ${texto(c, 1, true)} bps`;
      });
      mostrar(sha, () => {
        const v = numero(sn.input.value);
        const snVeces = unidad.value === "dB" ? window.CDD.veces(v) : v;
        const c = window.CDD.shannon(numero(df.input.value), snVeces);
        return `Shannon-Hartley (canal real): S/N = ${corto(snVeces)} veces; C = Δf·log₂(1 + S/N) = ${texto(c, 1, true)} bps = ${texto(c / 1000, 1)} kbps`;
      });
    }

    veces.input.addEventListener("input", () => convertir(veces, db, window.CDD.dB));
    db.input.addEventListener("input", () => convertir(db, veces, window.CDD.veces));
    [df, n, sn].forEach((c) => c.input.addEventListener("input", capacidad));
    unidad.addEventListener("change", capacidad);
    raiz.append(
      el("div", {}, ["dB ↔ veces de potencia (10·log₁₀)"]),
      veces.fila, el("br"), db.fila, aviso,
      el("div", {}, ["Capacidad del canal (S/N en veces o en dB)"]),
      df.fila, el("br"), n.fila, el("br"), sn.fila, " ", el("label", {}, ["unidad de S/N ", unidad]), nyq, sha,
    );
    capacidad();
  }

  // Constelación M-PSK (P14). Dibuja CDD.constelacionPSK(M) en un SVG: bits afuera de la circunferencia y fase
  // en grados (coma decimal) adentro. La fase crece en sentido antihorario desde el eje derecho (0°).
  const SVG_NS = "http://www.w3.org/2000/svg";
  const FUENTE_PSK = { 4: "Unidad IV-1 p.27", 8: "Clase-TP-08-RTAS p.10 (000 en 0°)", 16: "Clase-TP-08-RTAS p.13" };

  function svg(tag, atributos, hijos) {
    const e = document.createElementNS(SVG_NS, tag);
    Object.entries(atributos || {}).forEach(([k, v]) => e.setAttribute(k, String(v)));
    (hijos || []).forEach((h) => e.append(h));
    return e;
  }

  function dibujoPSK(m, puntos) {
    const R = 100;
    const trazo = { stroke: "currentColor", "stroke-opacity": 0.4, fill: "none" };
    const hijos = [
      svg("line", { x1: -R - 20, y1: 0, x2: R + 20, y2: 0, ...trazo }),
      svg("line", { x1: 0, y1: -R - 20, x2: 0, y2: R + 20, ...trazo }),
      svg("circle", { cx: 0, cy: 0, r: R, ...trazo }),
    ];
    puntos.forEach(({ fase, bits }) => {
      const a = (fase * Math.PI) / 180;
      const pos = (radio) => ({ x: (radio * Math.cos(a)).toFixed(1), y: (-radio * Math.sin(a)).toFixed(1) }); // y del SVG crece hacia abajo
      const p = pos(R);
      const b = pos(R + 16);
      const f = pos(R - 16);
      hijos.push(
        svg("circle", { cx: p.x, cy: p.y, r: 3, fill: "currentColor" }),
        svg("text", { x: b.x, y: Number(b.y) + 4, "text-anchor": "middle", "font-size": 11, "font-family": "monospace", fill: "currentColor" }, [bits]),
        svg("text", { x: f.x, y: Number(f.y) + 3, "text-anchor": "middle", "font-size": 9, fill: "currentColor" }, [`${String(fase).replace(".", ",")}°`]),
      );
    });
    const descripcion = puntos.map((q) => `${String(q.fase).replace(".", ",")}°: ${q.bits}`).join("; ");
    return svg("svg", { viewBox: "-150 -140 300 280", width: 340, role: "img", "aria-label": `Constelación ${m}-PSK. ${descripcion}` }, hijos);
  }

  function armarConstelacion(raiz) {
    if (raiz.dataset.listo) return;
    raiz.dataset.listo = "1";

    const select = el("select", { name: "m" }, [4, 8, 16].map((m) => el("option", { value: String(m), textContent: String(m) })));
    const inicial = Number(raiz.dataset.m);
    select.value = String(FUENTE_PSK[inicial] ? inicial : 8);
    const dibujo = el("div", { className: "cdd-constelacion-dibujo" });
    const fuente = el("div", { className: "cdd-constelacion-fuente" });

    function dibujar() {
      const m = Number(select.value);
      dibujo.replaceChildren(dibujoPSK(m, window.CDD.constelacionPSK(m)));
      fuente.textContent = `Tabla de ${m}-PSK: ${FUENTE_PSK[m]}.`;
    }

    select.addEventListener("change", dibujar);
    raiz.append(el("label", {}, ["M (cantidad de fases) ", select]), dibujo, fuente);
    dibujar();
  }

  // Código de línea (P3) en `<div class="cdd-linea" data-bits="0 1 1 0 …">`. Dibuja CDD.linea(código, bits) en un
  // SVG: un tramo por bit, o dos si la celda es "a/b" (mitades). "+" arriba, "0" al medio, "-" abajo.
  // HDB-3 marca los pulsos sustituidos con V y R. Si la regla falla (HDB-3 sin un 1 previo) muestra el mensaje.
  const CODIGOS_LINEA = [
    ["unipolarNRZ", "Unipolar NRZ"], ["polarNRZ", "Polar NRZ"], ["unipolarRZ", "Unipolar RZ"], ["polarRZ", "Polar RZ"],
    ["diferencial", "Diferencial (polar, inicia en -)"], ["ami", "AMI"], ["bipolarRZ", "Bipolar RZ"], ["hdb3", "HDB-3"],
    ["manchester", "Manchester (IEEE 802.3)"], ["manchesterDif", "Manchester diferencial"], ["miller", "Miller"],
  ];

  function dibujoLinea(bits, celdas) {
    const W = 40; // ancho de un bit
    const X0 = 10;
    const Y = { "+": 25, 0: 55, "-": 85 };
    const trazo = { stroke: "currentColor", "stroke-opacity": 0.3, fill: "none" };
    const hijos = [svg("line", { x1: X0, y1: Y[0], x2: X0 + W * bits.length, y2: Y[0], ...trazo, "stroke-dasharray": "2 3" })];
    let d = "";
    let previo = null;
    celdas.forEach((celda, i) => {
      const x = X0 + i * W;
      const limpia = celda.replace(/^[VR]/, "");
      const mitades = limpia.split("/");
      mitades.forEach((nivel, j) => {
        const xi = x + (j * W) / mitades.length;
        const xf = x + ((j + 1) * W) / mitades.length;
        d += previo === null ? `M${xi} ${Y[nivel]}` : `V${Y[nivel]}`; // el salto vertical ocurre en xi
        d += `H${xf}`;
        previo = nivel;
      });
      hijos.push(
        svg("line", { x1: x, y1: 10, x2: x, y2: 100, ...trazo, "stroke-dasharray": "2 3" }),
        svg("text", { x: x + W / 2, y: 118, "text-anchor": "middle", "font-size": 12, "font-family": "monospace", fill: "currentColor" }, [bits[i]]),
      );
      if (/^[VR]/.test(celda)) {
        const nivel = limpia;
        hijos.push(svg("text", {
          x: x + W / 2, y: nivel === "+" ? Y["+"] - 8 : Y["-"] + 16, "text-anchor": "middle", "font-size": 12,
          "font-weight": "bold", "font-family": "monospace", fill: "currentColor",
        }, [celda[0]]));
      }
    });
    hijos.push(svg("path", { d, stroke: "currentColor", "stroke-width": 2, fill: "none" }));
    hijos.push(svg("line", { x1: X0 + W * bits.length, y1: 10, x2: X0 + W * bits.length, y2: 100, ...trazo, "stroke-dasharray": "2 3" }));
    const ancho = X0 * 2 + W * bits.length;
    return svg("svg", { viewBox: `0 0 ${ancho} 128`, width: ancho, height: 128, role: "img", "aria-label": `Forma de onda: ${celdas.join(" ")}` }, hijos);
  }

  function armarLinea(raiz) {
    if (raiz.dataset.listo) return;
    raiz.dataset.listo = "1";

    const B = campo("Bits", raiz.dataset.bits || "");
    const select = el("select", { name: "codigo" }, CODIGOS_LINEA.map(([v, t]) => el("option", { value: v, textContent: t })));
    select.value = "hdb3";
    const aviso = el("div", { role: "alert" });
    const dibujo = el("div", { className: "cdd-linea-dibujo" });
    dibujo.style.overflowX = "auto";
    const celdasTexto = el("div", { className: "cdd-linea-celdas" });
    celdasTexto.style.fontFamily = "monospace";

    function dibujar() {
      aviso.textContent = "";
      try {
        const bits = B.input.value.replace(/\s+/g, "").split("");
        const celdas = window.CDD.linea(select.value, B.input.value);
        dibujo.replaceChildren(dibujoLinea(bits, celdas));
        celdasTexto.textContent = celdas.join(" ");
      } catch (e) {
        dibujo.replaceChildren();
        celdasTexto.textContent = "";
        aviso.textContent = e.message;
      }
    }

    B.input.addEventListener("input", dibujar);
    select.addEventListener("change", dibujar);
    raiz.append(B.fila, el("br"), el("label", {}, ["Código ", select]), aviso, dibujo, celdasTexto);
    dibujar();
  }

  document$.subscribe(() => {
    document.querySelectorAll(".cdd-crc").forEach(armarCrc);
    document.querySelectorAll(".cdd-calc").forEach(armarCalc);
    document.querySelectorAll(".cdd-constelacion").forEach(armarConstelacion);
    document.querySelectorAll(".cdd-linea").forEach(armarLinea);
  });
})();
