// Tablele Fichas — reglas puras (SPEC-fichas.md §5).
// Sin dependencias de servidor ni de navegador: lo usan la API, las pantallas
// y los tests (lib/fichas.run-tests.ts).

export type TipoFicha = "estrella" | "doble" | "feliz" | "triste";

export const TIPOS: readonly TipoFicha[] = ["estrella", "doble", "feliz", "triste"];

/** Cuánto suma cada tipo. Lo fija SIEMPRE el servidor: el cliente no manda valor. */
export const VALOR: Record<TipoFicha, number> = { estrella: 1, doble: 2, feliz: 0, triste: 0 };

/** Si fue algo grande o algo malo, que quede escrito qué fue. */
export const COMENTARIO_OBLIGATORIO: Record<TipoFicha, boolean> = {
  estrella: false,
  doble: true,
  feliz: false,
  triste: true,
};

export const ETIQUETA: Record<TipoFicha, string> = {
  estrella: "una estrella",
  doble: "un Vale Doble",
  feliz: "una carita feliz",
  triste: "una carita triste",
};

export const EMOJI: Record<TipoFicha, string> = {
  estrella: "⭐",
  doble: "⭐⭐",
  feliz: "🙂",
  triste: "🙁",
};

export const MAX_COMENTARIO = 200;
export const MAX_NOMBRE_VINCULO = 40;
export const MAX_PREMIO = 120;
export const MAX_META = 1000;
/** Ventana en la que un vinculado puede anular lo que dio (para un toque equivocado). */
export const VENTANA_ANULAR_MS = 15 * 60 * 1000;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Token de invitación: 32 bytes en base64url. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export type Ficha = {
  id: string;
  tipo: TipoFicha;
  valor: number;
  comentario: string | null;
  dada_por: string;
  dada_por_nombre: string;
  created_at: string;
  anulada_at: string | null;
};

export type Objetivo = {
  id: string;
  meta: number;
  premio: string;
  inicio: string; // YYYY-MM-DD
  fin: string; // YYYY-MM-DD
  cerrado_at: string | null;
  cumplido: boolean | null;
};

export function esTipo(x: unknown): x is TipoFicha {
  return typeof x === "string" && (TIPOS as readonly string[]).includes(x);
}

/** Recorta espacios y colapsa vacío a null. */
export function limpiarTexto(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/\s+/g, " ").trim();
  return t.length ? t : null;
}

/** Devuelve un mensaje de error para la persona, o null si la ficha es válida. */
export function validarFicha(tipo: unknown, comentario: string | null): string | null {
  if (!esTipo(tipo)) return "Tipo de ficha inválido.";
  if (comentario && comentario.length > MAX_COMENTARIO) {
    return `El comentario puede tener hasta ${MAX_COMENTARIO} letras.`;
  }
  if (COMENTARIO_OBLIGATORIO[tipo] && !comentario) {
    return tipo === "doble"
      ? "Contá qué hizo para ganarse el Vale Doble."
      : "Contá qué pasó, así después se puede conversar.";
  }
  return null;
}

// --- Fechas en hora de Argentina -------------------------------------------
// Argentina es UTC-3 todo el año (sin horario de verano), así que alcanza con
// un corrimiento fijo y no hace falta una base de zonas horarias.

const OFFSET_AR_MS = 3 * 60 * 60 * 1000;

/** Fecha calendario (YYYY-MM-DD) en Argentina de un instante. */
export function fechaArgentina(d: Date | string | number): string {
  const t = new Date(d).getTime() - OFFSET_AR_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** Primer instante (UTC, ISO) del día argentino `fecha`. */
export function inicioDelDiaAR(fecha: string): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + OFFSET_AR_MS).toISOString();
}

/** Suma días a una fecha YYYY-MM-DD. */
export function sumarDias(fecha: string, dias: number): string {
  const t = Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Rango [desde, hasta) en UTC que cubre del día `inicio` al día `fin`, inclusive. */
export function rangoUTC(inicio: string, fin: string): { desde: string; hasta: string } {
  return { desde: inicioDelDiaAR(inicio), hasta: inicioDelDiaAR(sumarDias(fin, 1)) };
}

/** Días que quedan hasta `fin`, contando hoy. 0 si ya pasó. */
export function diasRestantes(fin: string, hoy: string): number {
  const d = (Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000 + 1;
  return Math.max(0, Math.round(d));
}

// --- Estrellas y objetivo ---------------------------------------------------

/**
 * Estrellas que cuentan para el objetivo: suma de `valor` de las fichas no
 * anuladas dentro del período. Recalcula el valor desde el tipo: aunque una
 * fila trajera un valor raro, una carita nunca suma.
 */
export function sumarEstrellas(
  fichas: Pick<Ficha, "tipo" | "created_at" | "anulada_at">[],
  obj: Pick<Objetivo, "inicio" | "fin">
): number {
  let total = 0;
  for (const f of fichas) {
    if (f.anulada_at) continue;
    if (!esTipo(f.tipo)) continue;
    const dia = fechaArgentina(f.created_at);
    if (dia < obj.inicio || dia > obj.fin) continue;
    total += VALOR[f.tipo];
  }
  return total;
}

/** Un objetivo activo cuyo último día ya pasó tiene que cerrarse. */
export function estaVencido(obj: Pick<Objetivo, "fin" | "cerrado_at">, hoy: string): boolean {
  return !obj.cerrado_at && obj.fin < hoy;
}

export function validarObjetivo(
  meta: unknown,
  premio: string | null,
  inicio: unknown,
  fin: unknown,
  hoy: string
): string | null {
  const m = Number(meta);
  if (!Number.isInteger(m) || m < 1 || m > MAX_META) return "La meta tiene que ser un número de estrellas.";
  if (!premio) return "Escribí cuál es el premio.";
  if (premio.length > MAX_PREMIO) return `El premio puede tener hasta ${MAX_PREMIO} letras.`;
  if (typeof inicio !== "string" || !FECHA_RE.test(inicio)) return "Fecha de inicio inválida.";
  if (typeof fin !== "string" || !FECHA_RE.test(fin)) return "Fecha de fin inválida.";
  if (fin < inicio) return "El fin tiene que ser después del inicio.";
  if (fin < hoy) return "El objetivo no puede terminar en el pasado.";
  return null;
}

export function validarNombreVinculo(nombre: string | null): string | null {
  if (!nombre) return "Escribí el nombre de la persona.";
  if (nombre.length > MAX_NOMBRE_VINCULO) return `El nombre puede tener hasta ${MAX_NOMBRE_VINCULO} letras.`;
  return null;
}

// --- Anulación --------------------------------------------------------------

/** Un vinculado sólo anula lo suyo, y sólo dentro de la ventana. */
export function puedeAnularVinculado(
  f: Pick<Ficha, "dada_por" | "created_at" | "anulada_at">,
  vinculoId: string,
  ahora: number
): boolean {
  if (f.anulada_at) return false;
  if (f.dada_por !== `vinculo:${vinculoId}`) return false;
  return ahora - Date.parse(f.created_at) <= VENTANA_ANULAR_MS;
}

// --- Texto para el chico ----------------------------------------------------

/** Lo que se lee en voz alta en el modo chico. */
export function fraseParaChico(f: Pick<Ficha, "tipo" | "dada_por_nombre" | "comentario">): string {
  const quien = f.dada_por_nombre;
  const por = f.comentario ? `: ${f.comentario}` : "";
  if (f.tipo === "triste") return `${quien} anotó una carita triste${por}`;
  return `${quien} te dio ${ETIQUETA[f.tipo]}${por}`;
}
