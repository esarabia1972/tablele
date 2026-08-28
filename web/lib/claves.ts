// Claves de localStorage y helpers puros, SIN dependencias.
// Vive aparte de storage.ts para que lib/sync.ts pueda componer claves de
// cualquier usuario (no sólo el de la sesión activa) sin importar storage.ts
// —que a su vez importa sync.ts— y crear un ciclo de módulos.

export const K_SESSION = "tablele.session";
/** Usuarios que ya entraron en ESTE dispositivo (conveniencia de login). */
export const K_USUARIOS = "tablele.usuarios";
/** Flag de la migración de claves legacy sin sufijo de usuario. */
export const K_MIGRADO = "tablele.migradoLegacy";

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

export function claveDe(base: string, username: string): string {
  return `${base}_${username}`;
}

/** Meta de estrellas: 1 por juego terminado, con GOAL llega al premio. */
export const GOAL = 5;

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

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
