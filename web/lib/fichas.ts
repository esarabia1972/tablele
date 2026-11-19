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
  doble: false, // v2: la conducta ya dice el por qué
  feliz: false,
  triste: true,
};

export const ETIQUETA: Record<TipoFicha, string> = {
  estrella: "una estrella",
  doble: "un Vale Doble",
  feliz: "una carita feliz",
  triste: "una carita triste",
};

/** Estrella y Vale Doble llevan conducta; las caritas son libres (v2). */
export const LLEVA_CONDUCTA: Record<TipoFicha, boolean> = {
  estrella: true,
  doble: true,
  feliz: false,
  triste: false,
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
export const MAX_TEXTO_CONDUCTA = 60;
export const MAX_NOMBRE_PREMIO = 60;
export const MAX_PRECIO = 1000;
/** La técnica recomienda 3 a 5; 8 da margen sin volver ilegible la grilla. */
export const MAX_CONDUCTAS_ACTIVAS = 8;
/** Ventana en la que un vinculado puede anular lo que dio (para un toque equivocado). */
export const VENTANA_ANULAR_MS = 15 * 60 * 1000;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
/**
 * Token de invitación en base64url: 16 bytes (22 caracteres, 128 bits) desde
 * que el enlace se acortó; se siguen aceptando los de 32 bytes (43) ya repartidos.
 */
export const TOKEN_RE = /^(?:[A-Za-z0-9_-]{22}|[A-Za-z0-9_-]{43})$/;

export type Ficha = {
  id: string;
  tipo: TipoFicha;
  valor: number;
  comentario: string | null;
  dada_por: string;
  dada_por_nombre: string;
  created_at: string;
  anulada_at: string | null;
  /** v2. Null en caritas y en las fichas de v1. */
  conducta_id?: string | null;
  conducta_texto?: string | null;
};

export type Conducta = {
  id: string;
  texto: string;
  picto: number | null;
  /** URL de una foto propia subida a Supabase Storage. Si está, manda sobre el picto. */
  foto: string | null;
  orden: number;
  activa: boolean;
};

export type Premio = {
  id: string;
  nombre: string;
  precio: number;
  picto: number | null;
  foto: string | null;
  orden: number;
  activo: boolean;
};

export type TipoMovimiento = "canje" | "cero";

export type Movimiento = {
  id: string;
  tipo: TipoMovimiento;
  premio_id: string | null;
  premio_nombre: string | null;
  costo: number;
  saldo_antes: number;
  hecho_por_nombre: string;
  created_at: string;
  anulado_at: string | null;
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

export function validarConducta(texto: string | null): string | null {
  if (!texto) return "Escribí la conducta.";
  if (texto.length > MAX_TEXTO_CONDUCTA) return `La conducta puede tener hasta ${MAX_TEXTO_CONDUCTA} letras.`;
  return null;
}

export function validarPremio(nombre: string | null, precio: unknown): string | null {
  if (!nombre) return "Escribí el premio.";
  if (nombre.length > MAX_NOMBRE_PREMIO) return `El premio puede tener hasta ${MAX_NOMBRE_PREMIO} letras.`;
  const p = Number(precio);
  if (!Number.isInteger(p) || p < 1 || p > MAX_PRECIO) return "El precio tiene que ser un número de estrellas.";
  return null;
}

/** Id de pictograma de ARASAAC: entero positivo, o null. */
export function limpiarPicto(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 10_000_000 ? n : null;
}

// --- Saldo (v2) ----------------------------------------------------------------

/** Instante del último "poner en cero" vigente, o null si nunca se puso en cero. */
export function ultimoCero(movs: Pick<Movimiento, "tipo" | "created_at" | "anulado_at">[]): string | null {
  let ultimo: string | null = null;
  for (const m of movs) {
    if (m.tipo !== "cero" || m.anulado_at) continue;
    // Date.parse y no comparación de texto: Postgres devuelve fracciones de
    // segundo de largo variable y "+00:00" en vez de "Z".
    if (!ultimo || Date.parse(m.created_at) > Date.parse(ultimo)) ultimo = m.created_at;
  }
  return ultimo;
}

/**
 * Estrellas disponibles: lo ganado desde el último cero menos lo canjeado desde
 * entonces. Puede dar negativo (se anuló una ficha después de un canje): la
 * pantalla lo muestra como 0 y el próximo canje lo descuenta igual.
 */
export function calcularSaldo(
  fichas: Pick<Ficha, "tipo" | "created_at" | "anulada_at">[],
  movs: Pick<Movimiento, "tipo" | "costo" | "created_at" | "anulado_at">[]
): number {
  const cero = ultimoCero(movs);
  const desde = cero ? Date.parse(cero) : null;
  let saldo = 0;
  for (const f of fichas) {
    if (f.anulada_at || !esTipo(f.tipo)) continue;
    if (desde !== null && Date.parse(f.created_at) <= desde) continue;
    saldo += VALOR[f.tipo];
  }
  for (const m of movs) {
    if (m.tipo !== "canje" || m.anulado_at) continue;
    if (desde !== null && Date.parse(m.created_at) <= desde) continue;
    saldo -= m.costo;
  }
  return saldo;
}

// --- Informe por conducta (v2) ----------------------------------------------

/** Lunes (YYYY-MM-DD, hora Argentina) de la semana de un instante. */
export function lunesDe(iso: string): string {
  const dia = fechaArgentina(iso);
  const dow = new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return sumarDias(dia, -((dow + 6) % 7));
}

export type FilaInforme = { clave: string; texto: string; porSemana: Record<string, number>; total: number };

/**
 * Estrellas por conducta y por semana. Las fichas sin conducta (v1) van en
 * una fila propia. Devuelve las semanas (lunes) de la más vieja a la más nueva.
 */
export function informePorConducta(
  fichas: Pick<Ficha, "tipo" | "created_at" | "anulada_at" | "conducta_id" | "conducta_texto">[],
  hoy: string,
  semanas = 8
): { semanas: string[]; filas: FilaInforme[] } {
  const lunesHoy = lunesDe(inicioDelDiaAR(hoy));
  const lista: string[] = [];
  for (let i = semanas - 1; i >= 0; i--) lista.push(sumarDias(lunesHoy, -7 * i));
  const filas = new Map<string, FilaInforme>();
  for (const f of fichas) {
    if (f.anulada_at || !esTipo(f.tipo) || VALOR[f.tipo] === 0) continue;
    const sem = lunesDe(f.created_at);
    if (sem < lista[0]) continue;
    const clave = f.conducta_id ?? "sin";
    const fila = filas.get(clave) ?? {
      clave,
      texto: f.conducta_id ? f.conducta_texto ?? "(conducta)" : "sin conducta",
      porSemana: {},
      total: 0,
    };
    fila.porSemana[sem] = (fila.porSemana[sem] ?? 0) + VALOR[f.tipo];
    fila.total += VALOR[f.tipo];
    filas.set(clave, fila);
  }
  return { semanas: lista, filas: Array.from(filas.values()).sort((a, b) => b.total - a.total) };
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
export function fraseParaChico(
  f: Pick<Ficha, "tipo" | "dada_por_nombre" | "comentario"> & { conducta_texto?: string | null }
): string {
  const quien = f.dada_por_nombre;
  const por = f.comentario ? `: ${f.comentario}` : "";
  if (f.tipo === "triste") return `${quien} anotó una carita triste${por}`;
  if (f.conducta_texto) {
    return `${quien}: ¡Gracias por ${f.conducta_texto}! Te dio ${ETIQUETA[f.tipo]}.${f.comentario ? ` ${f.comentario}` : ""}`;
  }
  return `${quien} te dio ${ETIQUETA[f.tipo]}${por}`;
}

/** URL del pictograma de ARASAAC (licencia CC BY-NC-SA, Gobierno de Aragón). */
export function urlPicto(id: number, tam: 300 | 500 = 300): string {
  return `https://static.arasaac.org/pictograms/${id}/${id}_${tam}.png`;
}
