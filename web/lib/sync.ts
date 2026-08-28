"use client";

// Sincronización con el servidor (/api/datos).
// localStorage sigue siendo la fuente inmediata (funciona offline);
// esto baja los datos al entrar y sube los cambios con un pequeño debounce.
//
// Tres reglas que este módulo NO puede romper (cada una tapa un bug real):
//
// 1. Un push pertenece al usuario que lo generó. El username se captura al
//    programarlo, no al dispararlo: si el adulto cambia de chico con algo
//    pendiente, eso se sube bajo el nombre del chico que SALE.
// 2. Nunca se sube una parte que no existe localmente. Un usuario todavía no
//    hidratado desde el servidor no puede pisar su propia fila con vacío.
// 3. Ningún payload con `keepalive` puede superar los 64 KiB que impone el
//    estándar Fetch, o el navegador lo rechaza en silencio. El informe entero
//    (hasta 2000 eventos) viaja en un POST normal, nunca con keepalive.

import {
  BASES,
  K_SESSION,
  claveDe,
} from "@/lib/claves";
import { mergeEventos, mergeUso } from "@/lib/eventos";

/**
 * Qué cambió. "uso" escribe lo mismo que "stats" pero con un debounce mucho
 * más largo: el contador de tiempo late cada 15 s y no vale un POST cada vez.
 */
export type Parte = "config" | "stars" | "stats" | "uso";

type Pendiente = {
  username: string;
  config: boolean;
  stars: boolean;
  stats: boolean;
};

/**
 * Límite duro del estándar Fetch para `keepalive` y para `sendBeacon`:
 * 64 KiB de body. Dejamos margen.
 */
const LIMITE_KEEPALIVE = 60 * 1024;

/** Los eventos se acumulan de a muchos: no hace falta subirlos tan seguido. */
const DEBOUNCE_MS: Record<Parte, number> = {
  config: 600,
  stars: 600,
  stats: 3000,
  uso: 30000,
};

let pendiente: Pendiente | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInstalled = false;

function getUsername(): string | null {
  try {
    const s = localStorage.getItem(K_SESSION);
    return s ? (JSON.parse(s).username ?? null) : null;
  } catch {
    return null;
  }
}

function leer(base: string, username: string): string | null {
  try {
    return localStorage.getItem(claveDe(base, username));
  } catch {
    return null;
  }
}

function parsear<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Un usuario está "hidratado" cuando ya se bajó su fila del servidor en este
 * navegador. Hasta que eso pase no se le sube el informe: si no, entrar con un
 * usuario en un dispositivo nuevo le borraría el historial en el servidor.
 */
function estaHidratado(username: string): boolean {
  return leer(BASES.syncAt, username) !== null;
}

function marcarSucio(username: string) {
  try {
    localStorage.setItem(claveDe(BASES.dirtyAt, username), String(Date.now()));
  } catch {}
}

function limpiarSucio(username: string) {
  try {
    localStorage.removeItem(claveDe(BASES.dirtyAt, username));
  } catch {}
}

function collectPayload(p: Pendiente, opts: { sinStats?: boolean } = {}): Record<string, unknown> {
  const { username } = p;
  const payload: Record<string, unknown> = { username };

  // La config tampoco se sube desde un dispositivo que no bajó al usuario:
  // si el pull falló, subirla pisaría en el servidor las palabras buenas con
  // las de acá. Queda marcada como sucia y sube tras el primer pull OK.
  if (p.config && !opts.sinStats && estaHidratado(username)) {
    const raw = leer(BASES.config, username);
    if (raw) payload.config = parsear(raw, undefined);
  }
  if (p.stars) {
    const raw = leer(BASES.stars, username);
    if (raw !== null) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) payload.stars = n;
    }
  }
  // Regla 2: el informe sólo se sube si este navegador ya bajó al usuario.
  if (p.stats && !opts.sinStats && estaHidratado(username)) {
    payload.stats = {
      eventos: parsear(leer(BASES.eventos, username), [] as unknown[]),
      uso: parsear(leer(BASES.uso, username), {} as Record<string, number>),
    };
  }
  return payload;
}

/** Sube un payload. Lanza si el servidor no confirmó: el que llama decide qué hacer. */
async function postDatos(
  payload: Record<string, unknown>,
  opts: { keepalive?: boolean } = {}
): Promise<{ updated_at?: string }> {
  const body = JSON.stringify(payload);
  // Regla 3: keepalive sólo si el body entra en la cuota.
  const keepalive = !!opts.keepalive && body.length <= LIMITE_KEEPALIVE;

  const res = await fetch("/api/datos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(
      `push rechazado (${res.status}): ${json ? JSON.stringify(json) : "sin cuerpo"}`
    );
  }
  return json as { updated_at?: string };
}

async function pushNow(p: Pendiente | null): Promise<void> {
  if (!p) return;

  // Nada bajó todavía de este usuario: no se sube nada que pueda pisar su fila.
  // Se avisa con un error para que la pantalla de Configuración pueda decir
  // "guardado acá, todavía sin sincronizar" en vez de mentir.
  if ((p.config || p.stats) && !estaHidratado(p.username)) {
    marcarSucio(p.username);
    throw new Error(`sin hidratar: ${p.username} todavía no se bajó del servidor`);
  }

  const payload = collectPayload(p);
  // Sólo `username`: no hay nada real que subir.
  if (Object.keys(payload).length <= 1) return;

  try {
    await postDatos(payload);
    limpiarSucio(p.username);
  } catch (err) {
    // Queda sucio: el próximo syncFromServer no lo va a pisar y lo reintenta.
    marcarSucio(p.username);
    if (process.env.NODE_ENV !== "production") console.warn("[sync]", err);
    throw err;
  }
}

/**
 * Programa una subida al servidor.
 * `parte` marca qué cambió, para no serializar 2000 eventos cuando lo único
 * que se movió fue una estrella.
 */
export function schedulePush(parte: Parte) {
  if (typeof window === "undefined") return;
  const username = getUsername();
  if (!username) return;

  marcarSucio(username);

  // Regla 1: si había algo pendiente de OTRO usuario, se manda ya, con SU nombre.
  if (pendiente && pendiente.username !== username) {
    const anterior = pendiente;
    pendiente = null;
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
    void pushNow(anterior).catch(() => {});
  }

  pendiente = pendiente ?? { username, config: false, stars: false, stats: false };
  pendiente[parte === "uso" ? "stats" : parte] = true;

  installFlush();
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const p = pendiente;
    pendiente = null;
    pushTimer = null;
    void pushNow(p).catch(() => {});
  }, DEBOUNCE_MS[parte]);
}

/** Sube ya mismo lo pendiente. Lanza si el servidor no confirmó. */
export async function flushPush(): Promise<void> {
  if (typeof window === "undefined") return;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  const p = pendiente;
  pendiente = null;
  await pushNow(p);
}

/**
 * Cierre de sesión: sube lo pendiente bajo el username del chico que SALE y
 * resetea el estado de módulo. Llamar SIEMPRE antes de clearSessionData().
 * No lanza: cerrar sesión nunca debe quedar bloqueado por la red.
 */
export async function cerrarSesionSync(): Promise<void> {
  if (typeof window === "undefined") return;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  const p = pendiente;
  pendiente = null;
  try {
    await pushNow(p);
  } catch {}
}

/**
 * Baja del servidor y FUSIONA con lo local (no sobrescribe a ciegas).
 * - config/stars: si hay cambios locales sin confirmar más nuevos que el
 *   servidor, gana lo local y se reencola la subida.
 * - eventos/uso: siempre merge. Son append-only, así que nunca se pierde nada.
 */
export async function syncFromServer(username: string): Promise<void> {
  if (typeof window === "undefined") return;

  let json: {
    ok?: boolean;
    data?: {
      config?: unknown;
      stars?: unknown;
      stats?: { eventos?: unknown; uso?: unknown } | null;
      updated_at?: string;
    } | null;
  } | null = null;

  try {
    const res = await fetch(`/api/datos?username=${encodeURIComponent(username)}`, {
      cache: "no-store",
    });
    json = await res.json();
  } catch {
    // Sin conexión: seguimos con lo local, intacto.
    return;
  }

  if (!json?.ok) return;

  const data = json.data;
  const borradoAt = parseInt(leer(BASES.borradoAt, username) || "0", 10) || 0;
  const diaBorrado = borradoAt ? new Date(borradoAt).toISOString().slice(0, 10) : "";

  // Fila vacía (usuario recién creado): no hay nada que bajar, pero el usuario
  // queda hidratado igual — ya sabemos que el servidor no tiene nada suyo.
  if (!data) {
    try {
      localStorage.setItem(claveDe(BASES.syncAt, username), new Date(0).toISOString());
    } catch {}
    return;
  }

  const dirtyAt = parseInt(leer(BASES.dirtyAt, username) || "0", 10) || 0;
  const remotoAt = Date.parse(data.updated_at || "") || 0;
  // Hay cambios locales sin confirmar y son posteriores a lo que tiene el
  // servidor: el pull NO puede pisarlos (este era el bug de "guardo las
  // palabras y al volver aparecen las viejas").
  const localGana = dirtyAt > 0 && dirtyAt >= remotoAt;

  try {
    if (data.config && !localGana) {
      localStorage.setItem(claveDe(BASES.config, username), JSON.stringify(data.config));
    }
    if (typeof data.stars === "number" && !localGana) {
      localStorage.setItem(claveDe(BASES.stars, username), String(data.stars));
    }

    // Eventos y uso: merge siempre, gane quien gane.
    const eventos = mergeEventos(
      parsear(leer(BASES.eventos, username), [] as unknown[]),
      data.stats?.eventos,
      borradoAt
    );
    const uso = mergeUso(
      parsear(leer(BASES.uso, username), {} as Record<string, number>),
      data.stats?.uso,
      diaBorrado
    );
    localStorage.setItem(claveDe(BASES.eventos, username), JSON.stringify(eventos));
    localStorage.setItem(claveDe(BASES.uso, username), JSON.stringify(uso));

    localStorage.setItem(
      claveDe(BASES.syncAt, username),
      data.updated_at || new Date().toISOString()
    );
  } catch {}

  if (localGana) {
    // Lo local ganó: hay que subirlo.
    schedulePush("config");
    schedulePush("stats");
  } else {
    limpiarSucio(username);
  }
}

/**
 * Borrado explícito del historial (candado adulto). Es la ÚNICA vía por la que
 * el servidor acepta vaciar `stats`; cualquier otro push que llegue con el
 * informe vacío se fusiona en vez de pisar.
 */
export async function borrarEnServidor(username: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await postDatos({
      username,
      stats: { eventos: [], uso: {} },
      stars: 0,
      forzarBorrado: true,
    });
  } catch {
    // Sin conexión: la marca local `borradoAt` evita que el merge lo resucite.
  }
}

// Si cierran la pestaña con una subida pendiente, la mandamos con sendBeacon.
function installFlush() {
  if (flushInstalled) return;
  flushInstalled = true;
  window.addEventListener("pagehide", flushBeacon);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushBeacon();
  });
}

function flushBeacon() {
  const p = pendiente;
  if (!p) return;

  const payload = collectPayload(p);
  if (Object.keys(payload).length <= 1) return;

  // sendBeacon comparte la cuota de 64 KiB y devuelve false si no entra.
  // Si el informe completo no entra, mandamos al menos config+estrellas (que
  // son chicas y es lo que el adulto acaba de tocar) y dejamos el informe
  // marcado como sucio para la próxima carga, en vez de perder las dos cosas.
  let blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  let parcial = false;
  if (blob.size > LIMITE_KEEPALIVE) {
    const reducido = collectPayload(p, { sinStats: true });
    if (Object.keys(reducido).length <= 1) {
      marcarSucio(p.username);
      return;
    }
    blob = new Blob([JSON.stringify(reducido)], { type: "application/json" });
    parcial = true;
    if (blob.size > LIMITE_KEEPALIVE) {
      marcarSucio(p.username);
      return;
    }
  }

  let enviado = false;
  try {
    enviado = navigator.sendBeacon("/api/datos", blob);
  } catch {
    enviado = false;
  }
  if (!enviado) {
    marcarSucio(p.username);
    return;
  }

  if (parcial) {
    // El informe no viajó: queda pendiente y sucio.
    pendiente = { username: p.username, config: false, stars: false, stats: true };
    marcarSucio(p.username);
    return;
  }

  pendiente = null;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
}
