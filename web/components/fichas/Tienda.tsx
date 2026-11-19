"use client";

import type { Premio } from "@/lib/fichas";
import Picto from "./Picto";

/** Saldo y tienda de premios. Con `onCanjear`, cada premio que alcanza tiene botón. */
export default function Tienda({
  saldo,
  premios,
  onCanjear,
  onElegir,
  grande = false,
}: {
  saldo: number;
  /** Sólo los activos. */
  premios: Premio[];
  onCanjear?: (p: Premio) => void;
  /** Modo chico: tocar la tarjeta entera (lee el premio y, si alcanza, ofrece canjearlo). */
  onElegir?: (p: Premio) => void;
  grande?: boolean;
}) {
  const s = Math.max(0, saldo);
  return (
    <div className="flex flex-col gap-4 w-full">
      <div className={`text-center text-brand-dark font-bold ${grande ? "text-5xl" : "text-3xl"}`}>
        ⭐ {s} <span className={`${grande ? "text-2xl" : "text-lg"} font-normal opacity-70`}>{s === 1 ? "estrella" : "estrellas"}</span>
      </div>
      {premios.length === 0 ? (
        <p className="text-center text-brand-blue opacity-80">Todavía no hay premios en la tienda.</p>
      ) : (
        <div className={`grid gap-3 ${grande ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3"}`}>
          {premios.map((p) => {
            const alcanza = s >= p.precio;
            const pct = Math.min(100, Math.round((s / p.precio) * 100));
            return (
              <div
                key={p.id}
                role={onElegir ? "button" : undefined}
                tabIndex={onElegir ? 0 : undefined}
                onClick={onElegir ? () => onElegir(p) : undefined}
                onKeyDown={onElegir ? (e) => e.key === "Enter" && onElegir(p) : undefined}
                className={`rounded-2xl p-3 flex flex-col items-center gap-1 text-center border-4 ${
                  alcanza ? "bg-[#fff6cf] border-[#ffd23f] animate-glow" : "bg-white border-transparent"
                } ${onElegir ? "cursor-pointer active:scale-95 transition-transform" : ""}`}
              >
                <Picto id={p.picto} foto={p.foto} tam={grande ? 80 : 56} respaldo="🎁" />
                <div className={`font-bold text-brand-dark leading-tight ${grande ? "text-xl" : ""}`}>{p.nombre}</div>
                <div className="text-sm text-brand-dark">{p.precio} ⭐</div>
                {alcanza ? (
                  <div className="text-sm font-bold text-brand-green">¡Te alcanza!</div>
                ) : (
                  <>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-[#ffd23f]" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-xs opacity-70">faltan {p.precio - s}</div>
                  </>
                )}
                {onCanjear && alcanza && (
                  <button
                    type="button"
                    onClick={() => onCanjear(p)}
                    className="mt-1 bg-brand-green text-white rounded-xl px-3 py-1 font-bold text-sm shadow-[0_3px_0_rgba(0,0,0,0.15)]"
                  >
                    Canjear
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
