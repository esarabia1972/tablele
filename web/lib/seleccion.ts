"use client";

import { PalabraDefault } from "@/data/palabras-default";
import { getEventos } from "@/lib/storage";

// Selección inteligente de palabras: pondera según las métricas registradas.
// - Palabras con bajo acierto al primer intento → aparecen más
// - Palabras lentas (mediana alta hasta acertar) → aparecen más
// - Palabras sin datos (nuevas) → prioridad media-alta para presentarlas
// - Palabras dominadas (últimos 3 primeros intentos OK y rápidas) → aparecen poco

type StatPalabra = {
  rondas: number;
  primerOk: number;
  tiemposOk: number[];
  ultimosPrimeros: boolean[]; // resultado de los últimos primeros-intentos (orden cronológico)
};

function mediana(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function statsPorPalabra(): Map<string, StatPalabra> {
  const map = new Map<string, StatPalabra>();
  for (const e of getEventos()) {
    if (e.juego === "memo") continue; // errar en memotest es memoria, no lectura
    const s = map.get(e.palabra) || {
      rondas: 0,
      primerOk: 0,
      tiemposOk: [],
      ultimosPrimeros: [],
    };
    if (e.intento === 1) {
      s.rondas++;
      if (e.ok) s.primerOk++;
      s.ultimosPrimeros.push(e.ok);
    }
    if (e.ok) s.tiemposOk.push(e.ms);
    map.set(e.palabra, s);
  }
  return map;
}

function peso(p: PalabraDefault, stats: Map<string, StatPalabra>): number {
  const s = stats.get(p.palabra);
  if (!s || s.rondas === 0) return 2; // nueva: hay que presentarla

  const rate = s.primerOk / s.rondas;
  const med = mediana(s.tiemposOk);

  // Dominada: últimos 3 primeros intentos OK y responde rápido
  const ult3 = s.ultimosPrimeros.slice(-3);
  if (ult3.length === 3 && ult3.every(Boolean) && med > 0 && med < 3000) {
    return 0.4;
  }

  let w = 0.5 + 3 * (1 - rate); // 0.5 (perfecta) a 3.5 (nunca acierta)
  if (med > 4000) w += 1;
  if (med > 8000) w += 1;
  return w;
}

/** Elige n palabras con muestreo ponderado sin repetición. */
export function elegirPalabras(activas: PalabraDefault[], n: number): PalabraDefault[] {
  const stats = statsPorPalabra();
  const pool = activas.map((p) => ({ p, w: peso(p, stats) }));
  const out: PalabraDefault[] = [];

  while (out.length < n && pool.length > 0) {
    const total = pool.reduce((acc, x) => acc + x.w, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].w;
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    out.push(pool[idx].p);
    pool.splice(idx, 1);
  }
  return out;
}
