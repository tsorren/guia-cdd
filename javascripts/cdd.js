// Lógica pura de la guía de Comunicación de Datos (sin DOM): CRC, suma de verificación, capacidad del canal
// constelaciones M-PSK y códigos de línea.
// Script clásico: en el navegador queda en window.CDD; en Node se carga con require.
// Probado en herramientas/tests/u6-02-deteccion-errores.test.js (CRC y checksum),
// en herramientas/tests/u6-01-capacidad-canal.test.js (dB, Nyquist y Shannon-Hartley),
// en herramientas/tests/u4-02-modulacion-digital.test.js (Gray y constelación M-PSK)
// y en herramientas/tests/u2-04-banda-base.test.js (códigos de línea y `linea`).
(function (raiz) {
  function validarBits(nombre, s) {
    if (typeof s !== "string" || s.length === 0 || /[^01]/.test(s)) {
      throw new Error(`${nombre} debe ser una cadena no vacía de 0 y 1`);
    }
  }

  function validarG(g) {
    validarBits("G", g);
    if (g[0] !== "1") throw new Error("G debe empezar en 1");
    if (g.length < 2) throw new Error("G debe tener grado 1 o más (al menos 2 bits)");
  }

  // División en módulo 2 (XOR). Devuelve el resto (g.length - 1 bits) y los pasos con el formato
  // de las filas de Clase-TP-06-RTAS p.10 y p.11. `desde` es la posición del dividendo donde se
  // alinea G. `fila` es el resultado del XOR (g.length bits, con ceros a la izquierda) y los bits
  // bajados hasta que el próximo divisor queda alineado con un 1, o hasta agotar el dividendo.
  function dividir(dividendo, g) {
    const w = dividendo.split("");
    const n = w.length;
    const k = g.length;
    const pasos = [];
    let pos = w.indexOf("1");
    while (pos !== -1 && pos + k <= n) {
      for (let i = 0; i < k; i++) w[pos + i] = w[pos + i] === g[i] ? "0" : "1";
      const sig = w.indexOf("1", pos);
      const fin = sig !== -1 && sig + k <= n ? sig + k : n;
      pasos.push({ desde: pos, fila: w.slice(pos, fin).join("") });
      pos = sig;
    }
    // Fuera del bucle no queda ningún 1 antes de los últimos k - 1 bits: ese es el resto.
    const resto = w.slice(Math.max(0, n - (k - 1))).join("").padStart(k - 1, "0");
    return { resto, pasos };
  }

  // M(x)·x^r ÷ G(x). r = grado de G = cantidad de bits de R. T = M seguido de R.
  function crc(m, g) {
    validarBits("M", m);
    validarG(g);
    const { resto, pasos } = dividir(m + "0".repeat(g.length - 1), g);
    return { r: resto, t: m + resto, pasos };
  }

  // El receptor divide T completo (sin agregar ceros). Resto de ceros = sin errores detectados.
  function restoCrc(t, g) {
    validarBits("T", t);
    validarG(g);
    return dividir(t, g).resto;
  }

  function validarPalabras(palabras) {
    if (!Array.isArray(palabras) || palabras.length === 0) {
      throw new Error("Hace falta al menos una palabra");
    }
    palabras.forEach((p, i) => validarBits(`La palabra ${i + 1}`, p));
    if (palabras.some((p) => p.length !== palabras[0].length)) {
      throw new Error("Todas las palabras deben tener el mismo largo");
    }
  }

  // Suma en complemento a 1: el acarreo que sale del bit más significativo se vuelve a sumar.
  function sumaC1(palabras) {
    validarPalabras(palabras);
    const largo = palabras[0].length;
    const ancho = BigInt(largo);
    const mascara = (1n << ancho) - 1n;
    let suma = palabras.reduce((acc, p) => acc + BigInt("0b" + p), 0n);
    while (suma > mascara) suma = (suma & mascara) + (suma >> ancho);
    return suma.toString(2).padStart(largo, "0");
  }

  // Checksum = complemento a 1 (bit a bit) de la suma en complemento a 1.
  function checksum(palabras) {
    return sumaC1(palabras).replace(/[01]/g, (b) => (b === "1" ? "0" : "1"));
  }

  function validarNumero(nombre, x, minimo, estricto) {
    const ok = typeof x === "number" && Number.isFinite(x) && (estricto ? x > minimo : x >= minimo);
    if (!ok) throw new Error(`${nombre} debe ser un número ${estricto ? "mayor que" : "mayor o igual que"} ${minimo}`);
  }

  // Relación de potencias en dB: 10·log10(veces). Fixture: RTAS TP5 p.6, "30 = 10 log S/N" → 1000 veces.
  function dB(x) {
    validarNumero("Las veces", x, 0, true);
    return 10 * Math.log10(x);
  }

  // Inversa: veces = 10^(dB/10).
  function veces(db) {
    if (typeof db !== "number" || !Number.isFinite(db)) throw new Error("Los dB deben ser un número");
    return Math.pow(10, db / 10);
  }

  // Capacidad de un canal ideal multinivel (Nyquist-Hartley): C = 2·Δf·log2(n) [bps]. Δf en Hz.
  function nyquist(df, n) {
    validarNumero("Δf", df, 0, true);
    validarNumero("n", n, 1, false);
    return 2 * df * Math.log2(n);
  }

  // Capacidad de un canal real (Shannon-Hartley): C = Δf·log2(1 + S/N) [bps]. Δf en Hz, S/N en veces.
  function shannon(df, snVeces) {
    validarNumero("Δf", df, 0, true);
    validarNumero("S/N (en veces)", snVeces, 0, false);
    return df * Math.log2(1 + snVeces);
  }

  // Código de Gray por espejo (Unidad-IV-1 p.28): 0 1 → 00 01 11 10 → 000 001 011 010 110 111 101 100.
  // Devuelve las 2^nBits palabras en orden; vecinas (y la última con la primera) difieren en 1 bit.
  function gray(nBits) {
    if (!Number.isInteger(nBits) || nBits < 1 || nBits > 16) throw new Error("nBits debe ser un entero de 1 a 16");
    let lista = ["0", "1"];
    for (let i = 1; i < nBits; i++) {
      lista = [...lista.map((b) => "0" + b), ...[...lista].reverse().map((b) => "1" + b)];
    }
    return lista;
  }

  // Constelación M-PSK para M = 4, 8 o 16: [{ fase, bits }], fase en grados (antihoraria desde 0°).
  // Tablas de P4 (u3/01-velocidades.md): M = 4 Unidad-IV-1 p.27, M = 8 Clase-TP-08-RTAS p.10 (000 en 0°),
  // M = 16 Clase-TP-08-RTAS p.13. Las tres son la lista de Gray por espejo en orden de fase creciente, con
  // θ = 360°/M; el test las compara contra las tablas impresas. No es la tabla de 8-PSK de Unidad-IV-1 p.31.
  function constelacionPSK(M) {
    if (![4, 8, 16].includes(M)) throw new Error("M debe ser 4, 8 o 16");
    return gray(Math.log2(M)).map((bits, i) => ({ fase: (i * 360) / M, bits }));
  }

  // ---------- Códigos de línea (P3, guia/u2/04-banda-base.md) ----------
  // Niveles "+", "-", "0". Una celda "a/b" es primera mitad / segunda mitad del bit; una celda de un solo
  // nivel ocupa todo el bit. HDB-3 marca los pulsos sustituidos: "V+", "R-". Cada función recibe un arreglo
  // de "0" y "1" y devuelve un arreglo de celdas.
  const opuesto = (n) => (n === "+" ? "-" : "+");

  const unipolarNRZ = (b) => b.map((x) => (x === "1" ? "+" : "0")); // Unidad-II-3 p.16 y p.47
  const polarNRZ = (b) => b.map((x) => (x === "1" ? "+" : "-")); // Unidad-II-3 p.27 y p.47
  const unipolarRZ = (b) => b.map((x) => (x === "1" ? "+/0" : "0/0")); // pulso en la 1.ª mitad (p.22)
  const polarRZ = (b) => b.map((x) => (x === "1" ? "+/0" : "-/0")); // 1 V+, 0 V-, τ < T (p.47)

  // Diferencial: un 1 cambia de nivel, un 0 lo mantiene. El nivel inicial es convención.
  function diferencial(b, bajo = "-", alto = "+") {
    let nivel = bajo;
    return b.map((x) => {
      if (x === "1") nivel = nivel === bajo ? alto : bajo;
      return nivel;
    });
  }

  // AMI: el 0 es 0 y el 1 alterna; el primer 1 es "+" (figuras de la cátedra).
  function ami(b) {
    let u = "-";
    return b.map((x) => {
      if (x === "0") return "0";
      u = opuesto(u);
      return u;
    });
  }
  const bipolarRZ = (b) => ami(b).map((n) => `${n}/0`);

  // HDB-3 (Clase-05 p.43): cada cuatro ceros se sustituyen por 000V o R00V.
  // - unos pares desde la última V → R00V; impares → 000V.
  // - la primera V repite la polaridad del último 1; las V alternan entre sí; R tiene la polaridad de V.
  // - Primer grupo: siempre 000V. La figura oficial del TP4 ej. 5 lo dibuja así con 2 unos antes
  //   (par), y un R00V inicial haría que R repitiera la polaridad del último 1 (la fuente no lo resuelve).
  function hdb3(b) {
    const out = b.map(() => "0");
    let ultimo = null; // polaridad del último pulso transmitido (dato, R o V)
    let ultimaV = null; // polaridad de la última violación
    let unos = 0; // unos de datos desde la última violación
    let ceros = 0; // ceros seguidos
    b.forEach((x, i) => {
      if (x === "1") {
        ultimo = ultimo === null ? "+" : opuesto(ultimo);
        out[i] = ultimo;
        unos += 1;
        ceros = 0;
        return;
      }
      ceros += 1;
      if (ceros < 4) return;
      ceros = 0;
      if (ultimo === null) throw new Error("sin un 1 previo la fuente no fija la polaridad de V");
      const primera = ultimaV === null;
      const V = primera ? ultimo : opuesto(ultimaV);
      if (!primera && unos % 2 === 0) out[i - 3] = `R${V}`; // R00V
      out[i] = `V${V}`;
      ultimo = V;
      ultimaV = V;
      unos = 0;
    });
    return out;
  }

  // Manchester con la polaridad IEEE 802.3 de la cátedra: 1 = bajo→alto, 0 = alto→bajo.
  const manchester = (b) => b.map((x) => (x === "1" ? "-/+" : "+/-"));

  // Manchester diferencial: transición siempre en el medio; un 0 agrega transición al inicio.
  // "previo" es el nivel anterior al primer bit; con "-" un 0 inicial queda alto→bajo (Consulta TP4 p.5).
  function manchesterDif(b, previo = "-") {
    let p = previo;
    return b.map((x) => {
      const primera = x === "0" ? opuesto(p) : p;
      p = opuesto(primera);
      return `${primera}/${p}`;
    });
  }

  // Miller: 1 → transición en el medio; 0 → sin transición, y al final si el bit siguiente es 0.
  function miller(b, inicio = "+") {
    let n = inicio;
    return b.map((x, i) => {
      if (x === "1") {
        const c = `${n}/${opuesto(n)}`;
        n = opuesto(n);
        return c;
      }
      const c = n;
      if (b[i + 1] === "0") n = opuesto(n);
      return c;
    });
  }

  // Despacha a cada código por nombre. `bits`: cadena ("0 1 1 0" o "0110") o arreglo de "0"/"1".
  // Opciones: previo (Manchester diferencial), inicio (Miller), bajo y alto (diferencial).
  // Lanza Error con un código desconocido, con bits inválidos y, en HDB-3, sin un 1 previo.
  const CODIGOS_LINEA = {
    unipolarNRZ: (b) => unipolarNRZ(b),
    polarNRZ: (b) => polarNRZ(b),
    unipolarRZ: (b) => unipolarRZ(b),
    polarRZ: (b) => polarRZ(b),
    diferencial: (b, o) => diferencial(b, o.bajo, o.alto),
    ami: (b) => ami(b),
    bipolarRZ: (b) => bipolarRZ(b),
    hdb3: (b) => hdb3(b),
    manchester: (b) => manchester(b),
    manchesterDif: (b, o) => manchesterDif(b, o.previo),
    miller: (b, o) => miller(b, o.inicio),
  };

  function linea(codigo, bits, opciones) {
    if (!Object.prototype.hasOwnProperty.call(CODIGOS_LINEA, codigo)) {
      throw new Error(`Código de línea desconocido: ${codigo}`);
    }
    const s = (Array.isArray(bits) ? bits.join("") : String(bits)).replace(/\s+/g, "");
    validarBits("La secuencia de bits", s);
    return CODIGOS_LINEA[codigo](s.split(""), opciones || {});
  }

  const CDD = {
    crc, restoCrc, sumaC1, checksum, dB, veces, nyquist, shannon, gray, constelacionPSK,
    opuesto, unipolarNRZ, polarNRZ, unipolarRZ, polarRZ, diferencial, ami, bipolarRZ, hdb3, manchester, manchesterDif, miller,
    linea,
  };
  if (typeof module !== "undefined") module.exports = CDD;
  else raiz.CDD = CDD;
})(this);
