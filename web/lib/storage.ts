"use client";

import { type PalabraDefault, palabrasDefault } from "@/data/palabras-default";
import { schedulePush, borrarEnServidor } from "@/lib/sync";
import { MAX_DIAS_USO, MAX_EVENTOS } from "@/lib/eventos";
import {
  BASES,
  GOAL as GOAL_CONST,
  K_MIGRADO,
  K_SESSION,
  K_USUARIOS,
  claveDe,
  fechaLocal as fechaLocalPura,
} from "@/lib/claves";

export type ConfigTablero = {
  nombre?: string;
  metodo: string;
  nivel: string; // etapa: Global | Silábica
  nivelPalabra?: "inicial" | "intermedio"; // inicial = solo primera letra
  palabras: PalabraDefault[];
};

// Un evento por cada intento de respuesta en los juegos
export type Evento = {
  /** uuid de cliente. Opcional al leer: los eventos viejos no lo tienen. */
  id?: string;
  t: number;        // timestamp (ms)
  juego: string;    // wp | pw | listen | memo | silabas
  palabra: string;  // palabra objetivo
  elegida: string;  // qué eligió (para detectar confusiones)
  ok: boolean;
  intento: number;  // 1 = primer intento
  ms: number;       // tiempo desde que apareció la ronda hasta este intento
  ayuda: boolean;   // la opción correcta ya estaba brillando (hint)
};

export const GOAL = GOAL_CONST;
const STARS_TTL_MS = 60 * 60 * 1000; // 1 hora sin jugar resetea la partida a medias

export const fechaLocal = fechaLocalPura;

// --- Sesión -----------------------------------------------------------------

export function getSessionData(): { username: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const data = localStorage.getItem(K_SESSION);
    const parsed = data ? JSON.parse(data) : null;
    // Sesiones viejas (por email) quedan invalidadas
    if (!parsed || typeof parsed.username !== "string") return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

export function setSessionData(data: { username: string }) {
  if (typeof window === "undefined") return;
  localStorage.setItem(K_SESSION, JSON.stringify(data));
}

export function clearSessionData() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(K_SESSION);
}

/**
 * Clave de este usuario, o null si NO hay sesión.
 *
 * Devolver null (y no la clave "pelada") es deliberado: antes, sin sesión se
 * leía y escribía en `tablele.config` sin sufijo —un bucket compartido por
 * todos los chicos— y eso era la vía por la que la configuración de uno
 * terminaba apareciéndole a otro.
 */
function userKey(base: string): string | null {
  const session = getSessionData();
  return session?.username ? claveDe(base, session.username) : null;
}

// --- Usuarios conocidos en este dispositivo ---------------------------------

/** Usuarios que ya entraron acá. Sólo para ofrecerlos en el login. */
export function listarUsuariosLocales(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(K_USUARIOS) || "[]");
    return Array.isArray(raw) ? raw.filter((u) => typeof u === "string") : [];
  } catch {
    return [];
  }
}

export function recordarUsuario(username: string) {
  if (typeof window === "undefined") return;
  const lista = listarUsuariosLocales().filter((u) => u !== username);
  lista.unshift(username);
  localStorage.setItem(K_USUARIOS, JSON.stringify(lista.slice(0, 12)));
}

export function olvidarUsuario(username: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    K_USUARIOS,
    JSON.stringify(listarUsuariosLocales().filter((u) => u !== username))
  );
}

/**
 * Adopta las claves legacy sin sufijo (de la versión de un solo chico) para el
 * primer usuario que entra en este dispositivo. Corre UNA vez.
 *
 * Reemplaza al bloque que hacía esto mismo a nivel de módulo y hacia un
 * username fijo (`manu`): con eso, cualquier dato escrito sin sesión terminaba
 * siendo de ese usuario. Acá nada se borra: lo legacy queda respaldado bajo
 * `tablele.legacy.*` por si hiciera falta recuperarlo a mano.
 */
export function migrarLegacy(username: string) {
  if (typeof window === "undefined" || !username) return;
  if (localStorage.getItem(K_MIGRADO)) return;

  const bases = [BASES.config, BASES.stars, BASES.lastPlayed, BASES.eventos, BASES.uso];
  for (const base of bases) {
    const legacy = localStorage.getItem(base);
    if (legacy === null) continue;
    const destino = claveDe(base, username);
    if (localStorage.getItem(destino) === null) {
      localStorage.setItem(destino, legacy);
    }
    // No se borra: se archiva.
    localStorage.setItem(base.replace("tablele.", "tablele.legacy."), legacy);
    localStorage.removeItem(base);
  }
  // Residuo de un esquema todavía más viejo; nunca se escribe.
  localStorage.removeItem("tablele.stats");
  localStorage.setItem(K_MIGRADO, "1");
}

/** Borra los datos de un usuario SÓLO en este dispositivo (el servidor no se toca). */
export function limpiarDatosLocales(username: string) {
  if (typeof window === "undefined" || !username) return;
  Object.values(BASES).forEach((base) => {
    localStorage.removeItem(claveDe(base, username));
  });
  olvidarUsuario(username);
}

// --- Configuración ----------------------------------------------------------

export function getConfig(): ConfigTablero {
  const key = typeof window !== "undefined" ? userKey(BASES.config) : null;
  if (key) {
    try {
      const data = localStorage.getItem(key);
      if (data) {
        return { nombre: "", nivelPalabra: "intermedio", ...JSON.parse(data) };
      }
    } catch (e) {}
  }
  return {
    nombre: "",
    metodo: "SELEC",
    nivel: "Global",
    nivelPalabra: "intermedio",
    // Copia propia: el default del módulo es inmutable y no se comparte entre
    // usuarios (si se devolviera por referencia, una mutación in-place se le
    // pegaría al chico siguiente).
    palabras: palabrasDefault(),
  };
}

export function saveConfig(config: ConfigTablero) {
  const key = userKey(BASES.config);
  if (!key) return; // sin sesión no se escribe nada
  localStorage.setItem(key, JSON.stringify(config));
  schedulePush("config");
}

// --- Estrellas --------------------------------------------------------------

export function getStars(): number {
  const key = typeof window !== "undefined" ? userKey(BASES.stars) : null;
  if (!key) return 0;
  try {
    const n = parseInt(localStorage.getItem(key) || "0", 10);
    return Number.isFinite(n) ? Math.max(0, Math.min(n, GOAL)) : 0;
  } catch (e) {
    return 0;
  }
}

export function setStars(n: number) {
  const key = userKey(BASES.stars);
  const keyLast = userKey(BASES.lastPlayed);
  if (!key || !keyLast) return;
  localStorage.setItem(key, n.toString());
  if (n > 0) localStorage.setItem(keyLast, Date.now().toString());
  schedulePush("stars");
}

// Nueva partida automática: si quedaron estrellas a medias y pasó el TTL
// sin jugar (o venían del esquema viejo de 20), arrancamos de cero.
// Llamar al entrar a la pantalla de juego, después de sincronizar.
export function expirarEstrellas() {
  const key = userKey(BASES.stars);
  const keyLast = userKey(BASES.lastPlayed);
  if (!key || !keyLast) return;
  const raw = parseInt(localStorage.getItem(key) || "0", 10) || 0;
  if (raw <= 0) return;
  const last = parseInt(localStorage.getItem(keyLast) || "0", 10) || 0;
  if (raw > GOAL || (last > 0 && Date.now() - last > STARS_TTL_MS)) {
    setStars(0);
  } else if (!last) {
    // Datos sin timestamp (versión anterior): arranca a contar desde ahora
    localStorage.setItem(keyLast, Date.now().toString());
  }
}

// --- Eventos (informe) ------------------------------------------------------

export function getEventos(): Evento[] {
  const key = typeof window !== "undefined" ? userKey(BASES.eventos) : null;
  if (!key) return [];
  try {
    const e = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(e) ? e : [];
  } catch (e) {
    return [];
  }
}

function nuevoId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function recordEvento(e: Evento) {
  const key = userKey(BASES.eventos);
  if (!key || !e.palabra) return;
  const eventos = getEventos();
  // El id hace que el merge entre dispositivos sea una unión exacta.
  eventos.push({ ...e, id: e.id || nuevoId() });
  localStorage.setItem(key, JSON.stringify(eventos.slice(-MAX_EVENTOS)));
  schedulePush("stats");
}

// --- Tiempo de uso (segundos por día, clave YYYY-MM-DD local) ---------------

export function getUso(): Record<string, number> {
  const key = typeof window !== "undefined" ? userKey(BASES.uso) : null;
  if (!key) return {};
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch (e) {
    return {};
  }
}

export function addUso(segundos: number) {
  const key = userKey(BASES.uso);
  if (!key) return;
  const uso = getUso();
  const hoy = fechaLocal();
  uso[hoy] = (uso[hoy] || 0) + segundos;
  // Conservar solo los últimos 90 días
  const keys = Object.keys(uso).sort();
  while (keys.length > MAX_DIAS_USO) {
    delete uso[keys.shift()!];
  }
  localStorage.setItem(key, JSON.stringify(uso));
  schedulePush("uso");
}

// --- Etapa ------------------------------------------------------------------

// Nombre de la etapa "Silábica" tal como se guarda en config.nivel
export const NIVEL_SILABICA = "Silabica";

// Compara sin tildes y case-insensitive: así "Silábica"/"Silabica"/"silabica"
// configurados en distintos momentos siguen reconociéndose como la misma etapa.
export function esNivelSilabica(nivel?: string): boolean {
  return !!nivel && nivel.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().startsWith("silab");
}

// --- Borrado del historial (candado adulto) ---------------------------------

/**
 * Borra el historial del usuario activo, local Y en el servidor.
 *
 * La marca `borradoAt` es lo que evita que el merge del próximo pull resucite
 * lo borrado si el POST no llegó (offline).
 */
export function clearMetricas() {
  const session = getSessionData();
  if (typeof window === "undefined" || !session) return;
  const { username } = session;

  localStorage.setItem(claveDe(BASES.borradoAt, username), String(Date.now()));
  [BASES.eventos, BASES.uso, BASES.stars, BASES.lastPlayed].forEach((base) => {
    localStorage.removeItem(claveDe(base, username));
  });
  localStorage.removeItem(claveDe("tablele.stats", username)); // formato viejo

  void borrarEnServidor(username);
}
