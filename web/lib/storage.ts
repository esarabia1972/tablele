"use client";

import { PalabraDefault, PALABRAS_DEFAULT } from "@/data/palabras-default";
import { schedulePush } from "@/lib/sync";

export type ConfigTablero = {
  nombre?: string;
  metodo: string;
  nivel: string;
  palabras: PalabraDefault[];
};

export type PalabraStat = {
  ok: number;
  tot: number;
};

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
        return { nombre: "", ...JSON.parse(data) };
      }
    } catch (e) {}
  }
  return {
    nombre: "",
    metodo: "SELEC",
    nivel: "Global",
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

export function getStats(): Record<string, PalabraStat> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem('tablele.stats') || '{}');
  } catch (e) {
    return {};
  }
}

export function recordStat(word: string, ok: boolean) {
  if (typeof window === "undefined" || !word) return;
  const stats = getStats();
  stats[word] = stats[word] || { ok: 0, tot: 0 };
  stats[word].tot++;
  if (ok) stats[word].ok++;
  localStorage.setItem('tablele.stats', JSON.stringify(stats));
  schedulePush();
}

export function clearStats() {
  if (typeof window === "undefined") return;
  localStorage.removeItem('tablele.stats');
  schedulePush();
}
