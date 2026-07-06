"use client";

// Sincronización con el servidor (/api/datos).
// localStorage sigue siendo la fuente inmediata (funciona offline);
// esto baja los datos al entrar y sube los cambios con un pequeño debounce.

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInstalled = false;

function getUsername(): string | null {
  try {
    const s = localStorage.getItem("tablele.session");
    return s ? (JSON.parse(s).username ?? null) : null;
  } catch {
    return null;
  }
}

function collectPayload(username: string) {
  const payload: Record<string, unknown> = { username };
  try {
    const config = localStorage.getItem("tablele.config");
    if (config) payload.config = JSON.parse(config);
  } catch {}
  payload.stars = parseInt(localStorage.getItem("tablele.stars") || "0") || 0;
  // stats = { eventos: [...], uso: { "YYYY-MM-DD": segundos } }
  try {
    payload.stats = {
      eventos: JSON.parse(localStorage.getItem("tablele.eventos") || "[]"),
      uso: JSON.parse(localStorage.getItem("tablele.uso") || "{}"),
    };
  } catch {
    payload.stats = { eventos: [], uso: {} };
  }
  return payload;
}

/** Sube ya mismo cualquier cambio pendiente (sin esperar el debounce). */
export async function flushPush(): Promise<void> {
  if (typeof window === "undefined") return;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  await pushNow();
}

/** Baja config/estrellas/stats del servidor y las vuelca a localStorage. */
export async function syncFromServer(username: string): Promise<void> {
  if (typeof window === "undefined") return;
  // Si hay una subida pendiente, mandarla ANTES de bajar,
  // para no pisar cambios locales con datos viejos del servidor.
  if (pushTimer) {
    await flushPush();
  }
  try {
    const res = await fetch(`/api/datos?username=${encodeURIComponent(username)}`, {
      cache: "no-store",
    });
    const json = await res.json();
    if (json.ok && json.data) {
      const { config, stars, stats } = json.data;
      if (config) localStorage.setItem("tablele.config", JSON.stringify(config));
      if (typeof stars === "number") localStorage.setItem("tablele.stars", String(stars));
      if (stats && typeof stats === "object") {
        localStorage.setItem("tablele.eventos", JSON.stringify(stats.eventos ?? []));
        localStorage.setItem("tablele.uso", JSON.stringify(stats.uso ?? {}));
      }
    }
  } catch {
    // sin conexión o storage no configurado: seguimos con lo local
  }
}

/** Programa una subida al servidor (debounce 600 ms). */
export function schedulePush() {
  if (typeof window === "undefined") return;
  installFlush();
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 600);
}

async function pushNow() {
  pushTimer = null;
  const username = getUsername();
  if (!username) return;
  try {
    await fetch("/api/datos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectPayload(username)),
      keepalive: true,
    });
  } catch {}
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
  if (!pushTimer) return;
  clearTimeout(pushTimer);
  pushTimer = null;
  const username = getUsername();
  if (!username) return;
  try {
    navigator.sendBeacon(
      "/api/datos",
      new Blob([JSON.stringify(collectPayload(username))], { type: "application/json" })
    );
  } catch {}
}
