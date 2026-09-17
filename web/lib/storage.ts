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
  type Rol,
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

export type ChicoDeCuenta = { accountId: string; username: string; rol: Rol };

/**
 * El adulto validado en este dispositivo. No se borra al salir de un chico.
 *
 * NO tiene un accountId propio: un adulto puede llegar a chicos de varias
 * cuentas —los suyos y los que tiene a cargo de otra profesional— así que cada
 * chico viaja con el suyo.
 */
export type Cuenta = {
  email: string;
  nombre?: string;
  /** id de la cuenta propia. Ausente si entra sólo como adulto a cargo. */
  titularId?: string;
  chicos: ChicoDeCuenta[];
};

export function getCuenta(): Cuenta | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(K_CUENTA) || "null");
    // Las cuentas guardadas por la versión anterior traían `accountId` y una
    // lista de nombres sueltos: no sirven, y mandan al login a revalidar.
    if (!parsed || typeof parsed.email !== "string") return null;
    if (!Array.isArray(parsed.chicos)) return null;
    if (parsed.chicos.some((c: unknown) => typeof c !== "object" || c === null)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setCuenta(c: Cuenta) {
  if (typeof window === "undefined") return;
  localStorage.setItem(K_CUENTA, JSON.stringify(c));
}

/** Puede dar de alta chicos sólo quien tiene cuenta propia. */
export function puedeCrearChicos(c: Cuenta | null): boolean {
  return !!c?.titularId;
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
    // Un adulto puede tener chicos de varias cuentas, así que el barrido va por
    // cada par (cuenta, chico) de su lista y no por un accountId único.
    const prefijos = c.chicos.flatMap((ch) =>
      Object.values(BASES).map((b) => claveDe(b, ch.accountId, ch.username))
    );
    // Recorrido con key(i)/length —la API estándar de Storage— y no con
    // Object.keys(localStorage), que depende de que las claves sean
    // enumerables. Se juntan primero y se borran después, porque borrar
    // mientras se recorre corre los índices.
    const aBorrar: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && prefijos.includes(k)) aBorrar.push(k);
    }
    aBorrar.forEach((k) => localStorage.removeItem(k));
  }
  localStorage.removeItem(K_CUENTA);
  localStorage.removeItem(K_SESSION);
}

// --- Sesión (qué chico está jugando) ----------------------------------------

export type Sesion = { accountId: string; username: string; rol: Rol };

export function getSessionData(): Sesion | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(K_SESSION) || "null");
    // Sin cuenta no hay sesión válida: las sesiones del esquema anterior
    // (sólo username, y antes sólo email) caen acá y mandan al login.
    if (!parsed || typeof parsed.username !== "string") return null;
    if (!ACCOUNT_ID_RE.test(parsed.accountId || "")) return null;
    return {
      accountId: parsed.accountId,
      username: parsed.username,
      // Las sesiones abiertas antes de los tutores no traen rol, y en ese
      // momento todos eran titulares.
      rol: parsed.rol === "tutor" ? "tutor" : "titular",
    };
  } catch {
    return null;
  }
}

/** true si el adulto de esta sesión puede tocar la configuración del chico. */
export function esTitular(): boolean {
  return getSessionData()?.rol !== "tutor";
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
  // Un adulto a cargo nunca escribe config. El servidor ya lo descarta; este
  // guard evita que un bug de UI genere pushes que van a ser ignorados y deje
  // la copia local desincronizada de la del titular.
  if (!esTitular()) return;
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
  if (session.rol === "tutor") return; // borrar el informe es sólo del titular
  const { accountId, username } = session;

  localStorage.setItem(claveDe(BASES.borradoAt, accountId, username), String(Date.now()));
  [BASES.eventos, BASES.uso, BASES.stars, BASES.lastPlayed].forEach((base) => {
    localStorage.removeItem(claveDe(base, accountId, username));
  });

  void borrarEnServidor(accountId, username);
}
