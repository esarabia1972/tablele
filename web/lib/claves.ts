// Claves de localStorage y helpers puros, SIN dependencias.
// Vive aparte de storage.ts para que lib/sync.ts pueda componer claves de
// cualquier usuario (no sólo el de la sesión activa) sin importar storage.ts
// —que a su vez importa sync.ts— y crear un ciclo de módulos.

/** Versión visible de la app. Única fuente: no repetirla en el JSX. */
export const VERSION = "1.0.0";

export const K_SESSION = "tablele.session";
/** La cuenta validada en ESTE dispositivo. Sobrevive al "Salir" del chico. */
export const K_CUENTA = "tablele.cuenta";
/** Flag de la migración de claves legacy sin sufijo de usuario. */
export const K_MIGRADO = "tablele.migradoLegacy";
/** Flag de la migración de claves de un solo chico a (cuenta, chico). */
export const K_MIGRADO_CUENTAS = "tablele.migradoCuentas";
/** Lista de chicos por dispositivo, del esquema anterior. Sólo se borra. */
export const K_USUARIOS_VIEJO = "tablele.usuarios";

/** Bases de las claves por usuario: la clave real es `${base}_${username}`. */
export const BASES = {
  config: "tablele.config",
  stars: "tablele.stars",
  lastPlayed: "tablele.lastPlayed",
  eventos: "tablele.eventos",
  uso: "tablele.uso",
  /** `updated_at` del último pull OK. Su presencia = el usuario está hidratado. */
  syncAt: "tablele.syncAt",
  /** Timestamp de la última escritura local todavía no confirmada por el server. */
  dirtyAt: "tablele.dirtyAt",
  /** Timestamp del "Borrar historial" local, para no resucitarlo en el merge. */
  borradoAt: "tablele.borradoAt",
} as const;

export type Base = (typeof BASES)[keyof typeof BASES];

/**
 * Clave de localStorage de un chico.
 *
 * Lleva la cuenta además del nombre porque el nombre dejó de ser una identidad
 * global: dos adultos distintos pueden tener cada uno su Manu, y sus datos no
 * pueden tocarse.
 */
export function claveDe(base: string, accountId: string, username: string): string {
  return `${base}_${accountId}_${username}`;
}

/** Meta de estrellas: 1 por juego terminado, con GOAL llega al premio. */
export const GOAL = 5;

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/**
 * Quién es el adulto frente a un chico.
 * - titular: dueño de la cuenta. Puede todo.
 * - tutor:   adulto a cargo. Juega y mira; nunca escribe `config`.
 */
export type Rol = "titular" | "tutor";

/** Cuántos adultos a cargo admite un chico (columnas tutor1 y tutor2). */
export const MAX_TUTORES = 2;
/**
 * Charset conservador a propósito. El correo se usa en el filtro `or=(...)` de
 * PostgREST para buscar tutores, y comillas, comas y paréntesis son los
 * metacaracteres de esa sintaxis. Un regex permisivo acá es una inyección.
 */
export const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
/** uuid v4 de Postgres. Se valida SIEMPRE antes de mandarlo a PostgREST. */
export const ACCOUNT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizarEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Normaliza lo que tipea el adulto a un username válido:
 * minúsculas, sin tildes, sin espacios ni símbolos.
 * "Ana Peña" -> "anapena"
 */
export function normalizarUsername(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
}

/** Fecha local en formato YYYY-MM-DD (la usan el informe y el registro de uso). */
export function fechaLocal(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
