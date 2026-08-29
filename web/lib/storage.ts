"use client";

import { type PalabraDefault, palabrasDefault } from "@/data/palabras-default";
import { schedulePush, borrarEnServidor } from "@/lib/sync";
import { MAX_DIAS_USO, MAX_EVENTOS } from "@/lib/eventos";
import {
  ACCOUNT_ID_RE,
  BASES,
  GOAL as GOAL_CONST,
  K_CUENTA,
  K_MIGRADO,
  K_MIGRADO_CUENTAS,
  K_SESSION,
  K_USUARIOS_VIEJO,
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

// --- Cuenta del adulto ------------------------------------------------------

/** La cuenta validada en este dispositivo. No se borra al salir de un chico. */
export type Cuenta = {
  accountId: string;
  email: string;
  nombre?: string;
  /** Último listado de chicos que devolvió el servidor, para abrir sin esperar. */
  chicos?: string[];
};

export function getCuenta(): Cuenta | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(K_CUENTA) || "null");
    if (!parsed || !ACCOUNT_ID_RE.test(parsed.accountId || "")) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setCuenta(c: Cuenta) {
  if (typeof window === "undefined") return;
  localStorage.setItem(K_CUENTA, JSON.stringify(c));
}

/** Guarda el listado de chicos sin tocar el resto de la cuenta. */
export function setChicosDeCuenta(chicos: string[]) {
  const c = getCuenta();
  if (!c) return;
  setCuenta({ ...c, chicos });
}

/**
 * Saca la cuenta de este dispositivo Y los datos de todos sus chicos.
 * Es lo que hace "Cambiar de cuenta": si quedaran, el próximo adulto vería
 * rastros de los chicos del anterior.
 */
export function salirDeCuenta() {
  if (typeof window === "undefined") return;
  const c = getCuenta();
  if (c) {
    const prefijos = Object.values(BASES).map((b) => `${b}_${c.accountId}_`);
    // Recorrido con key(i)/length —la API estándar de Storage— y no con
    // Object.keys(localStorage), que depende de que las claves sean
    // enumerables. Se juntan primero y se borran después, porque borrar
    // mientras se recorre corre los índices.
    const aBorrar: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && prefijos.some((pre) => k.startsWith(pre))) aBorrar.push(k);
    }
    aBorrar.forEach((k) => localStorage.removeItem(k));
  }
  localStorage.removeItem(K_CUENTA);
  localStorage.removeItem(K_SESSION);
}

// --- Sesión (qué chico está jugando) ----------------------------------------

export type Sesion = { accountId: string; username: string };

export function getSessionData(): Sesion | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(K_SESSION) || "null");
    // Sin cuenta no hay sesión válida: las sesiones del esquema anterior
    // (sólo username, y antes sólo email) caen acá y mandan al login.
    if (!parsed || typeof parsed.username !== "string") return null;
    if (!ACCOUNT_ID_RE.test(parsed.accountId || "")) return null;
    return { accountId: parsed.accountId, username: parsed.username };
  } catch {
    return null;
  }
}

export function setSessionData(data: Sesion) {
  if (typeof window === "undefined") return;
  localStorage.setItem(K_SESSION, JSON.stringify(data));
}

export function clearSessionData() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(K_SESSION);
}

/**
 * Clave de este chico, o null si NO hay sesión.
 *
 * Devolver null (y no una clave "pelada") es deliberado: sin eso, una escritura
 * sin sesión iría a un bucket compartido y la configuración de un chico
 * terminaría apareciéndole a otro.
 */
function userKey(base: string): string | null {
  const s = getSessionData();
  return s ? claveDe(base, s.accountId, s.username) : null;
}

// --- Migraciones de dispositivo ---------------------------------------------

/**
 * Adopta las claves legacy sin sufijo (de la versión de un solo chico) para el
 * chico que está jugando. Corre UNA vez. Nada se borra: lo legacy queda
 * respaldado bajo `tablele.legacy.*`.
 */
export function migrarLegacy(username: string) {
  if (typeof window === "undefined" || !username) return;
  if (localStorage.getItem(K_MIGRADO)) return;

  const bases = [BASES.config, BASES.stars, BASES.lastPlayed, BASES.eventos, BASES.uso];
  for (const base of bases) {
    const legacy = localStorage.getItem(base);
    if (legacy === null) continue;
    const destino = `${base}_${username}`;
    if (localStorage.getItem(destino) === null) {
      localStorage.setItem(destino, legacy);
    }
    localStorage.setItem(base.replace("tablele.", "tablele.legacy."), legacy);
    localStorage.removeItem(base);
  }
  localStorage.removeItem("tablele.stats");
  localStorage.setItem(K_MIGRADO, "1");
}

/**
 * Pasa las claves del esquema de un solo chico (`tablele.config_manu`) al de
 * (cuenta, chico) (`tablele.config_<cuenta>_manu`). Corre UNA vez.
 *
 * Se llama sólo después de un acceso exitoso, o sea con el par ya verificado
 * contra el servidor: no puede asignarle los datos de un chico a otra cuenta.
 * Acá sí se borra el original —a diferencia de migrarLegacy()— porque el dato
 * no es ambiguo y duplicar el informe entero llenaría el localStorage.
 */
export function migrarACuentas(accountId: string, username: string) {
  if (typeof window === "undefined" || !accountId || !username) return;
  if (localStorage.getItem(K_MIGRADO_CUENTAS)) return;

  for (const base of Object.values(BASES)) {
    const viejo = `${base}_${username}`;
    const valor = localStorage.getItem(viejo);
    if (valor === null) continue;
    const destino = claveDe(base, accountId, username);
    if (localStorage.getItem(destino) === null) {
      localStorage.setItem(destino, valor);
    }
    localStorage.removeItem(viejo);
  }
  // Las pills por dispositivo del esquema anterior: ahora los chicos los
  // devuelve /api/cuenta, que funciona en cualquier tablet.
  localStorage.removeItem(K_USUARIOS_VIEJO);
  localStorage.setItem(K_MIGRADO_CUENTAS, "1");
}

/** Borra los datos de un chico SÓLO en este dispositivo (el servidor no se toca). */
export function limpiarDatosLocales(accountId: string, username: string) {
  if (typeof window === "undefined" || !accountId || !username) return;
  Object.values(BASES).forEach((base) => {
    localStorage.removeItem(claveDe(base, accountId, username));
  });
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
  const { accountId, username } = session;

  localStorage.setItem(claveDe(BASES.borradoAt, accountId, username), String(Date.now()));
  [BASES.eventos, BASES.uso, BASES.stars, BASES.lastPlayed].forEach((base) => {
    localStorage.removeItem(claveDe(base, accountId, username));
  });

  void borrarEnServidor(accountId, username);
}
