// Divide una palabra en sílabas siguiendo las reglas estándar del español
// (diptongo/hiato, dígrafos, grupos consonánticos inseparables).
// Sin dependencias de React: la usan tanto GameEngine (para armar la lista de
// sílabas objetivo) como, potencialmente, cualquier otro lugar que necesite
// saber cuántas sílabas tiene una palabra (ver esNivelSilabica en storage.ts).

type TipoVocal = "fuerte" | "debil" | "debilTilde";

type Unidad = {
  texto: string; // texto original: 1 letra, o 2 si es dígrafo (qu/gu/ch/ll/rr)
  esVocal: boolean;
  tipoVocal?: TipoVocal;
};

// á/é/ó (con o sin tilde) son vocales fuertes: la tilde ahí solo marca acento,
// no cambia su "fuerza" para las reglas de diptongo/hiato.
const FUERTES = "aeoAEOáéóÁÉÓ";
// í/ú con tilde: fuerzan hiato aunque estén junto a una vocal fuerte (ej: día -> dí-a)
const DEBILES_TILDE = "íúÍÚ";
// i/u/ü sin tilde: vocales débiles "normales"
const DEBILES = "iuIUüÜ";
const VOCALES = FUERTES + DEBILES + DEBILES_TILDE;
// e/i (con o sin tilde) para detectar los dígrafos qu/gu
const E_O_I = "eiéíEIÉÍ";

// Grupos consonánticos que SIEMPRE se llevan a la sílaba siguiente
// (nunca se separan entre dos sílabas): pl, bl, cl, gl, fl, pr, br, cr, gr, fr, tr, dr, tl
// ("tl" sigue la convención americana del español rioplatense: a-tlas, a-tle-ta)
const BLENDS = new Set([
  "pl", "bl", "cl", "gl", "fl",
  "pr", "br", "cr", "gr", "fr", "tr", "dr", "tl",
]);

function tipoDeVocal(c: string): TipoVocal {
  if (DEBILES_TILDE.includes(c)) return "debilTilde";
  if (FUERTES.includes(c)) return "fuerte";
  return "debil";
}

// Separa la palabra en "unidades": letras sueltas, o dígrafos tratados como
// una sola consonante (qu/gu delante de e,i -> la u no suena; ch/ll/rr -> son
// un solo sonido consonántico y nunca se cortan entre sílabas).
function tokenizar(palabra: string): Unidad[] {
  const chars = Array.from(palabra);
  const unidades: Unidad[] = [];
  let i = 0;
  while (i < chars.length) {
    const c = chars[i];
    const c1 = chars[i + 1];
    const c2 = chars[i + 2];

    // qu/gu + e,i: dígrafo consonántico (la "u" no cuenta como vocal)
    if (
      (c === "q" || c === "Q" || c === "g" || c === "G") &&
      (c1 === "u" || c1 === "U") &&
      c2 !== undefined &&
      E_O_I.includes(c2)
    ) {
      unidades.push({ texto: c + c1, esVocal: false });
      i += 2;
      continue;
    }

    // Dígrafos consonánticos inseparables: ch, ll, rr
    if (
      ((c === "c" || c === "C") && (c1 === "h" || c1 === "H")) ||
      ((c === "l" || c === "L") && (c1 === "l" || c1 === "L")) ||
      ((c === "r" || c === "R") && (c1 === "r" || c1 === "R"))
    ) {
      unidades.push({ texto: c + c1, esVocal: false });
      i += 2;
      continue;
    }

    if (VOCALES.includes(c)) {
      unidades.push({ texto: c, esVocal: true, tipoVocal: tipoDeVocal(c) });
    } else {
      // ñ, k, w, x, y y el resto de las consonantes: normales
      unidades.push({ texto: c, esVocal: false });
    }
    i += 1;
  }
  return unidades;
}

type Nucleo = { unidades: Unidad[]; startIdx: number; endIdx: number };

// Agrupa vocales adyacentes en núcleos silábicos: fuerte+fuerte e hiatos por
// tilde (í/ú) quedan en núcleos separados; el resto de combinaciones forman
// diptongo (mismo núcleo). No se contemplan triptongos.
function agruparNucleos(unidades: Unidad[]): Nucleo[] {
  const nucleos: Nucleo[] = [];
  let actual: Nucleo | null = null;
  for (let i = 0; i < unidades.length; i++) {
    const u = unidades[i];
    if (!u.esVocal) {
      // Cierra el núcleo pendiente (si había uno) antes de "olvidarlo":
      // si no, se pierde el núcleo anterior cuando aparece una consonante.
      if (actual) {
        nucleos.push(actual);
        actual = null;
      }
      continue;
    }
    if (actual && actual.endIdx === i - 1) {
      const prev = actual.unidades[actual.unidades.length - 1];
      const esHiato =
        prev.tipoVocal === "debilTilde" ||
        u.tipoVocal === "debilTilde" ||
        (prev.tipoVocal === "fuerte" && u.tipoVocal === "fuerte");
      if (esHiato) {
        nucleos.push(actual);
        actual = { unidades: [u], startIdx: i, endIdx: i };
      } else {
        actual.unidades.push(u);
        actual.endIdx = i;
      }
    } else {
      if (actual) nucleos.push(actual);
      actual = { unidades: [u], startIdx: i, endIdx: i };
    }
  }
  if (actual) nucleos.push(actual);
  return nucleos;
}

/**
 * Divide una palabra en sílabas. Puro (sin efectos, sin React).
 * String vacío o de 1 letra -> devuelve [palabra] tal cual.
 */
export function silabear(palabraOriginal: string): string[] {
  // trim(): si quedó un espacio accidental al configurar la palabra, evita
  // arrastrarlo pegado a la primera o última sílaba (" lu", "na ").
  const palabra = (palabraOriginal ?? "").trim();
  if (palabra.length <= 1) return [palabra];

  const unidades = tokenizar(palabra);
  const nucleos = agruparNucleos(unidades);

  // Sin vocales, o una sola sílaba: no hay nada que repartir
  if (nucleos.length <= 1) return [palabra];

  const silUnidades: Unidad[][] = nucleos.map((n) => [...n.unidades]);

  // Onset inicial: las consonantes antes del primer núcleo van todas a la 1ª sílaba
  const onsetInicial = unidades.slice(0, nucleos[0].startIdx);
  silUnidades[0] = [...onsetInicial, ...silUnidades[0]];

  // Repartir el cluster consonántico entre cada par de núcleos consecutivos
  for (let k = 0; k < nucleos.length - 1; k++) {
    const desde = nucleos[k].endIdx + 1;
    const hasta = nucleos[k + 1].startIdx; // exclusivo
    const cluster = unidades.slice(desde, hasta);

    if (cluster.length === 0) {
      // Hiato sin consonante en el medio (ej: fi-de-os entre "e" y "o")
      continue;
    } else if (cluster.length === 1) {
      // Incluye los dígrafos ch/ll/rr, que son una sola unidad: V.CV
      silUnidades[k + 1] = [cluster[0], ...silUnidades[k + 1]];
    } else if (cluster.length === 2) {
      const par = (cluster[0].texto + cluster[1].texto).toLowerCase();
      if (BLENDS.has(par)) {
        silUnidades[k + 1] = [cluster[0], cluster[1], ...silUnidades[k + 1]];
      } else {
        silUnidades[k] = [...silUnidades[k], cluster[0]];
        silUnidades[k + 1] = [cluster[1], ...silUnidades[k + 1]];
      }
    } else {
      const ultimoPar = (
        cluster[cluster.length - 2].texto + cluster[cluster.length - 1].texto
      ).toLowerCase();
      if (BLENDS.has(ultimoPar)) {
        silUnidades[k] = [...silUnidades[k], ...cluster.slice(0, -2)];
        silUnidades[k + 1] = [...cluster.slice(-2), ...silUnidades[k + 1]];
      } else {
        silUnidades[k] = [...silUnidades[k], ...cluster.slice(0, -1)];
        silUnidades[k + 1] = [cluster[cluster.length - 1], ...silUnidades[k + 1]];
      }
    }
  }

  // Coda final: las consonantes después del último núcleo van a la última sílaba
  const ultimoNucleo = nucleos[nucleos.length - 1];
  const codaFinal = unidades.slice(ultimoNucleo.endIdx + 1);
  silUnidades[silUnidades.length - 1] = [
    ...silUnidades[silUnidades.length - 1],
    ...codaFinal,
  ];

  return silUnidades.map((us) => us.map((u) => u.texto).join(""));
}

/** Cantidad de sílabas de una palabra (= silabear(palabra).length). */
export function contarSilabas(palabra: string): number {
  return silabear(palabra).length;
}

// Tipo estructural mínimo (en vez de importar PalabraDefault de
// data/palabras-default.ts): este archivo no debe depender de esa capa para
// no crear un ciclo de imports.
type PalabraConSilabas = { palabra: string; silabas?: string[] };

/**
 * Sílabas "efectivas" de una palabra: si tiene override manual (>=2 sílabas
 * cargadas a mano) se usa ese; si no, se calcula con silabear().
 * Centraliza una lógica que antes estaba duplicada en GameEngine.
 */
export function silabasDe(p: PalabraConSilabas): string[] {
  return p.silabas && p.silabas.length >= 2 ? p.silabas : silabear(p.palabra);
}

/**
 * Elegibilidad para "Armo la palabra": la palabra necesita 2+ sílabas, ya sea
 * por override manual o por el cálculo automático. Única fuente de verdad
 * para no repetir (y potencialmente desincronizar) el mismo criterio en
 * GameEngine, app/jugar y app/config.
 */
export function esElegibleSilabas(p: PalabraConSilabas): boolean {
  return !!(p.silabas && p.silabas.length >= 2) || contarSilabas(p.palabra) >= 2;
}
