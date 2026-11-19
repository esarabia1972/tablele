"use client";

import { EMOJI, type Ficha } from "@/lib/fichas";
import { fechaCorta } from "./ui";

/** Lista de fichas: quién, cuándo, qué y por qué. Las anuladas, tachadas. */
export default function ListaFichas({
  fichas,
  puedeAnular,
  onAnular,
  vacio = "Todavía no hay fichas.",
}: {
  fichas: Ficha[];
  puedeAnular?: (f: Ficha) => boolean;
  onAnular?: (f: Ficha) => void;
  vacio?: string;
}) {
  if (fichas.length === 0) return <p className="text-brand-blue text-center opacity-80">{vacio}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {fichas.map((f) => {
        const anulada = !!f.anulada_at;
        return (
          <li
            key={f.id}
            className={`flex gap-3 items-start bg-white rounded-2xl p-3 shadow-[0_3px_0_rgba(0,0,0,0.08)] ${
              anulada ? "opacity-50" : ""
            }`}
          >
            <span className="text-2xl leading-none w-12 text-center shrink-0">{EMOJI[f.tipo]}</span>
            <div className={`flex-1 min-w-0 ${anulada ? "line-through" : ""}`}>
              <div className="text-brand-dark">
                <b>{f.dada_por_nombre}</b>{" "}
                <span className="text-sm opacity-60">· {fechaCorta(f.created_at)}</span>
              </div>
              {f.comentario && <div className="text-gray-700 break-words">{f.comentario}</div>}
              {anulada && <div className="text-xs no-underline">anulada</div>}
            </div>
            {!anulada && onAnular && puedeAnular?.(f) && (
              <button
                type="button"
                onClick={() => onAnular(f)}
                className="text-sm text-brand-pink font-bold shrink-0 px-2 py-1"
              >
                Anular
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
