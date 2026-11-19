"use client";

// Tablele Fichas — estado del dispositivo y llamadas a la API (lado navegador).
// Claves con prefijo `fichas.` para no chocar con las de Tablele: en localhost
// las dos apps comparten origen.

import type { Conducta, Ficha, Movimiento, Premio, TipoFicha } from "@/lib/fichas";

const K_ADMIN = "fichas.admin";
const K_VINCULO = "fichas.vinculo";
/**
 * Qué pantalla se ve cuando el dispositivo tiene las dos cosas: una invitación
 * guardada y una administradora. Pasa cuando la mamá abre en su propio
 * navegador el enlace que generó (para probarlo o porque se lo reenviaron).
 */
const K_MODO = "fichas.modo";

export type Modo = "vinculo" | "admin";
export function getModo(): Modo | null {
  const m = localStorage.getItem(K_MODO);
  return m === "admin" || m === "vinculo" ? m : null;
}
export function setModo(m: Modo) {
  localStorage.setItem(K_MODO, m);
}

export type ChicoAdmin = { accountId: string; username: string; rol: "titular" | "tutor" };

export type SesionAdmin = {
  email: string;
  /** Cómo la ve el chico en sus fichas: "Mamá", "Seño Leti". */
  miNombre: string;
  chicos: ChicoAdmin[];
  /** Índice del chico elegido. */
  actual: number;
};

function leer<T>(k: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(k) || "null") as T | null;
  } catch {
    return null;
  }
}

export function getAdmin(): SesionAdmin | null {
  const s = leer<SesionAdmin>(K_ADMIN);
  if (!s || typeof s.email !== "string" || !Array.isArray(s.chicos)) return null;
  return s;
}
export function setAdmin(s: SesionAdmin) {
  localStorage.setItem(K_ADMIN, JSON.stringify(s));
}
export function salirAdmin() {
  localStorage.removeItem(K_ADMIN);
}

export function getToken(): string | null {
  const t = localStorage.getItem(K_VINCULO);
  return t && t.length > 0 ? t : null;
}
export function setToken(t: string) {
  localStorage.setItem(K_VINCULO, t);
}
export function borrarToken() {
  localStorage.removeItem(K_VINCULO);
}

/** Prefijo de las rutas: vacío en fichas.*, "/fichas" en localhost o previews. */
export function base(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname.startsWith("fichas.") ? "" : "/fichas";
}

/** Enlace de invitación para un token, en el host donde se va a abrir. */
export function enlaceInvitacion(token: string): string {
  const { protocol, host, hostname } = window.location;
  if (hostname.startsWith("fichas.")) return `${protocol}//${host}/v/${token}`;
  if (hostname === "tablele.com.ar" || hostname === "www.tablele.com.ar") {
    return `https://fichas.tablele.com.ar/v/${token}`;
  }
  return `${protocol}//${host}/fichas/v/${token}`;
}

export function nuevoId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Fuera de un contexto seguro (http en la red local) randomUUID no existe.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// --- API --------------------------------------------------------------------

export type Respuesta<T> = ({ ok: true } & T) | { ok: false; motivo?: string; message?: string };

async function post<T>(url: string, body: unknown, headers: Record<string, string> = {}) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    return (await res.json()) as Respuesta<T>;
  } catch {
    return { ok: false, motivo: "red", message: "Sin conexión. Probá de nuevo." } as Respuesta<T>;
  }
}

function auth(s: SesionAdmin) {
  const c = s.chicos[s.actual];
  return { email: s.email, accountId: c?.accountId, username: c?.username };
}

export type Tablero = {
  rol: "titular" | "tutor";
  hoy: string;
  chico: { nombre: string };
  rango: { inicio: string; fin: string };
  conductas: Conducta[];
  premios: Premio[];
  saldo: number;
  fichas: Ficha[];
  movimientos: Movimiento[];
};

export type VinculoListado = {
  id: string;
  nombre: string;
  activo: boolean;
  created_at: string;
  revocado_at: string | null;
  fichas: number;
};

export const api = {
  cuenta: (email: string) =>
    post<{ email: string; chicos: ChicoAdmin[] }>("/api/cuenta", { email }),
  tablero: (s: SesionAdmin) => post<Tablero>("/api/fichas/tablero", auth(s)),
  dar: (s: SesionAdmin, tipo: TipoFicha, comentario: string, conductaId: string | null, id = nuevoId()) =>
    post<{ id: string }>("/api/fichas/dar", { ...auth(s), id, tipo, comentario, conductaId, nombre: s.miNombre }),
  anular: (s: SesionAdmin, fichaId: string) => post("/api/fichas/anular", { ...auth(s), fichaId }),
  vinculos: (s: SesionAdmin) =>
    post<{ vinculos: VinculoListado[] }>("/api/fichas/vinculos", { ...auth(s), accion: "listar" }),
  invitar: (s: SesionAdmin, nombre: string) =>
    post<{ token: string }>("/api/fichas/vinculos", { ...auth(s), accion: "crear", nombre }),
  revocar: (s: SesionAdmin, vinculoId: string) =>
    post("/api/fichas/vinculos", { ...auth(s), accion: "revocar", vinculoId }),
  conducta: (s: SesionAdmin, accion: "crear" | "editar" | "archivar" | "activar" | "ordenar", datos: Record<string, unknown>) =>
    post("/api/fichas/conductas", { ...auth(s), accion, ...datos }),
  premio: (s: SesionAdmin, accion: "crear" | "editar" | "archivar" | "activar", datos: Record<string, unknown>) =>
    post("/api/fichas/premios", { ...auth(s), accion, ...datos }),
  canjear: (s: SesionAdmin, premioId: string, id = nuevoId()) =>
    post<{ saldo: number }>("/api/fichas/movimiento", { ...auth(s), accion: "canjear", id, premioId, nombre: s.miNombre }),
  cero: (s: SesionAdmin, id = nuevoId()) =>
    post("/api/fichas/movimiento", { ...auth(s), accion: "cero", id, nombre: s.miNombre }),
  foto: (s: SesionAdmin, dataUrl: string) => post<{ url: string }>("/api/fichas/foto", { ...auth(s), dataUrl }),
  anularMovimiento: (s: SesionAdmin, movimientoId: string) =>
    post("/api/fichas/movimiento", { ...auth(s), accion: "anular", movimientoId }),

  // Vinculado
  yo: async (token: string) => {
    try {
      const res = await fetch("/api/fichas/v/yo", { headers: { "X-Fichas-Token": token }, cache: "no-store" });
      return (await res.json()) as Respuesta<{
        vinculo: { id: string; nombre: string };
        chico: { nombre: string };
        conductas: Conducta[];
        mias: Ficha[];
      }>;
    } catch {
      return { ok: false, motivo: "red", message: "Sin conexión. Probá de nuevo." } as Respuesta<never>;
    }
  },
  vDar: (token: string, tipo: TipoFicha, comentario: string, conductaId: string | null, id = nuevoId()) =>
    post<{ id: string }>("/api/fichas/v/dar", { id, tipo, comentario, conductaId }, { "X-Fichas-Token": token }),
  vAnular: (token: string, fichaId: string) =>
    post("/api/fichas/v/anular", { fichaId }, { "X-Fichas-Token": token }),
};

// --- ARASAAC -------------------------------------------------------------------

/** Busca pictogramas en ARASAAC (los mismos que usa MiraVoz). Devuelve ids. */
export async function buscarPictos(q: string): Promise<number[]> {
  const t = q.trim();
  if (!t) return [];
  try {
    const res = await fetch(`https://api.arasaac.org/v1/pictograms/es/search/${encodeURIComponent(t)}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { _id: number }[];
    return data.slice(0, 18).map((p) => p._id);
  } catch {
    return [];
  }
}

/** Reduce una foto a `max` px y la devuelve como JPEG base64 (igual que Tablele). */
export async function comprimirImagen(file: File, max = 600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; // un PNG con transparencia no queda negro al pasar a JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
