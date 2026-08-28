// Merge de métricas. Módulo puro (sin React, sin localStorage): lo usan tanto
// el cliente (lib/sync.ts, al bajar del servidor) como el servidor
// (app/api/datos/route.ts, al recibir un push), para que la regla de fusión
// sea UNA sola y no dos implementaciones que se desincronizan.

/** Tope de eventos guardados por usuario (límite de ~5 MB de localStorage). */
export const MAX_EVENTOS = 2000;
/** Días de historial de uso que se conservan. */
export const MAX_DIAS_USO = 90;

export type EventoCrudo = {
  id?: string;
  t: number;
  juego: string;
  palabra: string;
  elegida: string;
  ok: boolean;
  intento: number;
  ms: number;
  ayuda: boolean;
};

export type Stats = {
  eventos: EventoCrudo[];
  uso: Record<string, number>;
};

/**
 * Identidad de un evento. Los eventos nuevos traen `id` (uuid de cliente);
 * los guardados antes de este cambio no, así que se los identifica por su
 * contenido — con la marca de tiempo en milisegundos, dos eventos distintos
 * no colisionan en la práctica.
 */
export function idEvento(e: EventoCrudo): string {
  return e.id || `${e.t}|${e.juego}|${e.palabra}|${e.intento}`;
}

function esEvento(e: unknown): e is EventoCrudo {
  return !!e && typeof e === "object" && typeof (e as EventoCrudo).t === "number";
}

/**
 * Une dos listas de eventos sin perder ninguno.
 * Los eventos son append-only (nunca se editan), así que el merge es una
 * unión por identidad: ante colisión gana `local`, que es el más reciente.
 * `borradoAt` descarta lo anterior a un "Borrar historial", para que el
 * merge no resucite lo que el adulto borró a propósito.
 */
export function mergeEventos(
  local: unknown,
  remoto: unknown,
  borradoAt = 0
): EventoCrudo[] {
  const map = new Map<string, EventoCrudo>();
  const listas = [remoto, local]; // el segundo pisa al primero
  for (const lista of listas) {
    if (!Array.isArray(lista)) continue;
    for (const e of lista) {
      if (!esEvento(e)) continue;
      if (borradoAt && e.t <= borradoAt) continue;
      map.set(idEvento(e), e);
    }
  }
  return [...map.values()].sort((a, b) => a.t - b.t).slice(-MAX_EVENTOS);
}

/**
 * Une el uso por día tomando el MÁXIMO de cada fecha, nunca la suma:
 * sincronizar dos veces no puede inflar el tiempo de uso.
 */
export function mergeUso(
  local: unknown,
  remoto: unknown,
  diaBorrado = ""
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const fuente of [remoto, local]) {
    if (!fuente || typeof fuente !== "object") continue;
    for (const [dia, seg] of Object.entries(fuente as Record<string, unknown>)) {
      if (typeof seg !== "number" || !Number.isFinite(seg) || seg < 0) continue;
      if (diaBorrado && dia < diaBorrado) continue;
      out[dia] = Math.max(out[dia] ?? 0, seg);
    }
  }
  // Conservar sólo los últimos MAX_DIAS_USO días
  const dias = Object.keys(out).sort();
  while (dias.length > MAX_DIAS_USO) delete out[dias.shift()!];
  return out;
}

export function mergeStats(local: unknown, remoto: unknown, borradoAt = 0, diaBorrado = ""): Stats {
  const l = (local ?? {}) as Partial<Stats>;
  const r = (remoto ?? {}) as Partial<Stats>;
  return {
    eventos: mergeEventos(l.eventos, r.eventos, borradoAt),
    uso: mergeUso(l.uso, r.uso, diaBorrado),
  };
}
