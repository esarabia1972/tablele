"use client";

import { PalabraDefault, PALABRAS_DEFAULT } from "@/data/palabras-default";
import { schedulePush } from "@/lib/sync";

export type ConfigTablero = {
  nombre?: string;
  metodo: string;
  nivel: string; // etapa: Global | Silábica
  nivelPalabra?: "inicial" | "intermedio"; // inicial = solo primera letra
  palabras: PalabraDefault[];
};

// Un evento por cada intento de respuesta en los juegos
export type Evento = {
  t: number;        // timestamp (ms)
  juego: string;    // wp | pw | listen | memo
  palabra: string;  // palabra objetivo
  elegida: string;  // qué eligió (para detectar confusiones)
  ok: boolean;
  intento: number;  // 1 = primer intento
  ms: number;       // tiempo desde que apareció la ronda hasta este intento
  ayuda: boolean;   // la opción correcta ya estaba brillando (hint)
};

const MAX_EVENTOS = 2000;
const MAX_DIAS_USO = 90;

export function getSessionData(): { username: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const data = localStorage.getItem("tablele.session");
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
  localStorage.setItem("tablele.session", JSON.stringify(data));
}

export function clearSessionData() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("tablele.session");
}

export function getConfig(): ConfigTablero {
  if (typeof window !== "undefined") {
    try {
      const data = localStorage.getItem("tablele.config");
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
    palabras: PALABRAS_DEFAULT,
  };
}

export function saveConfig(config: ConfigTablero) {
  if (typeof window === "undefined") return;
  localStorage.setItem("tablele.config", JSON.stringify(config));
  schedulePush();
}

export function getStars(): number {
  if (typeof window === "undefined") return 0;
  try {
    return Math.min(parseInt(localStorage.getItem('tablele.stars') || '0'), 20);
  } catch (e) {
    return 0;
  }
}

export function setStars(n: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem('tablele.stars', n.toString());
  schedulePush();
}

export function getEventos(): Evento[] {
  if (typeof window === "undefined") return [];
  try {
    const e = JSON.parse(localStorage.getItem('tablele.eventos') || '[]');
    return Array.isArray(e) ? e : [];
  } catch (e) {
    return [];
  }
}

export function recordEvento(e: Evento) {
  if (typeof window === "undefined" || !e.palabra) return;
  const eventos = getEventos();
  eventos.push(e);
  localStorage.setItem('tablele.eventos', JSON.stringify(eventos.slice(-MAX_EVENTOS)));
  schedulePush();
}

// --- Tiempo de uso (segundos por día, clave YYYY-MM-DD local) ---

export function fechaLocal(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getUso(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem('tablele.uso') || '{}');
  } catch (e) {
    return {};
  }
}

export function addUso(segundos: number) {
  if (typeof window === "undefined") return;
  const uso = getUso();
  const hoy = fechaLocal();
  uso[hoy] = (uso[hoy] || 0) + segundos;
  // Conservar solo los últimos 90 días
  const keys = Object.keys(uso).sort();
  while (keys.length > MAX_DIAS_USO) {
    delete uso[keys.shift()!];
  }
  localStorage.setItem('tablele.uso', JSON.stringify(uso));
  schedulePush();
}

export function clearMetricas() {
  if (typeof window === "undefined") return;
  localStorage.removeItem('tablele.eventos');
  localStorage.removeItem('tablele.uso');
  localStorage.removeItem('tablele.stats'); // formato viejo
  schedulePush();
}
