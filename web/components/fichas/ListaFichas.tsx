"use client";

import { EMOJI, type Ficha, type Movimiento } from "@/lib/fichas";
import { fechaCorta } from "./ui";

export type Item = { clase: "ficha"; f: Ficha } | { clase: "mov"; m: Movimiento };

/** Fichas (y opcionalmente canjes y ceros) por fecha, más nuevo arriba. */
export default function ListaFichas({
  fichas,
  movimientos = [],
  puedeAnular,
  onAnular,
  onAnularMov,
  vacio = "Todavía no hay fichas.",
}: {
  fichas: Ficha[];
  movimientos?: Movimiento[];
  puedeAnular?: (f: Ficha) => boolean;
  onAnular?: (f: Ficha) => void;
  onAnularMov?: (m: Movimiento) => void;
  vacio?: string;
}) {
  const items: Item[] = [
    ...fichas.map((f) => ({ clase: "ficha" as const, f })),
    ...movimientos.map((m) => ({ clase: "mov" as const, m })),
  ].sort((a, b) => {
    const ta = a.clase === "ficha" ? a.f.created_at : a.m.created_at;
    const tb = b.clase === "ficha" ? b.f.created_at : b.m.created_at;
    return tb.localeCompare(ta);
  });

  if (items.length === 0) return <p className="text-brand-blue text-center opacity-80">{vacio}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it) => {
        if (it.clase === "mov") {
          const m = it.m;
          const anulado = !!m.anulado_at;
          return (
            <li key={`m-${m.id}`} className={`flex gap-3 items-center bg-[#e8f4ff] rounded-2xl p-3 ${anulado ? "opacity-50" : ""}`}>
              <span className="text-2xl w-12 text-center shrink-0">{m.tipo === "canje" ? "🎁" : "0️⃣"}</span>
              <div className={`flex-1 min-w-0 ${anulado ? "line-through" : ""}`}>
                <div className="text-brand-dark">
                  {m.tipo === "canje" ? (
                    <>
                      <b>Canjeó {m.premio_nombre}</b> por {m.costo} ⭐
                    </>
                  ) : (
                    <b>Puesto en cero</b>
                  )}{" "}
                  <span className="text-sm opacity-60">
                    · tenía {Math.max(0, m.saldo_antes)} · {m.hecho_por_nombre} · {fechaCorta(m.created_at)}
                  </span>
                </div>
              </div>
              {!anulado && onAnularMov && (
                <button type="button" onClick={() => onAnularMov(m)} className="text-sm text-brand-pink font-bold shrink-0 px-2 py-1">
                  Deshacer
                </button>
              )}
            </li>
          );
        }
        const f = it.f;
        const anulada = !!f.anulada_at;
        return (
          <li
            key={f.id}
            className={`flex gap-3 items-start bg-white rounded-2xl p-3 shadow-[0_3px_0_rgba(0,0,0,0.08)] ${anulada ? "opacity-50" : ""}`}
          >
            <span className="text-2xl leading-none w-12 text-center shrink-0">{EMOJI[f.tipo]}</span>
            <div className={`flex-1 min-w-0 ${anulada ? "line-through" : ""}`}>
              <div className="text-brand-dark">
                <b>{f.dada_por_nombre}</b> <span className="text-sm opacity-60">· {fechaCorta(f.created_at)}</span>
              </div>
              {f.conducta_texto && <div className="text-brand-dark">¡Gracias por {f.conducta_texto}!</div>}
              {f.comentario && <div className="text-gray-700 break-words">{f.comentario}</div>}
              {anulada && <div className="text-xs">anulada</div>}
            </div>
            {!anulada && onAnular && puedeAnular?.(f) && (
              <button type="button" onClick={() => onAnular(f)} className="text-sm text-brand-pink font-bold shrink-0 px-2 py-1">
                Anular
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
