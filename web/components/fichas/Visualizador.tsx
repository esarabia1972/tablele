"use client";

import { fechaDia } from "./ui";

/** Barra que se llena hacia la meta. `grande` es la versión del modo chico. */
export default function Visualizador({
  acumuladas,
  meta,
  premio,
  fin,
  diasRestantes,
  grande = false,
}: {
  acumuladas: number;
  meta: number;
  premio: string;
  fin: string;
  diasRestantes: number;
  grande?: boolean;
}) {
  const pct = Math.min(100, Math.round((acumuladas / meta) * 100));
  const cumplido = acumuladas >= meta;
  const faltan = Math.max(0, meta - acumuladas);

  return (
    <div className="w-full flex flex-col gap-2">
      <div className={`flex items-end justify-between ${grande ? "text-2xl" : "text-lg"} text-brand-dark font-bold`}>
        <span>
          ⭐ {acumuladas} <span className="opacity-60">de {meta}</span>
        </span>
        <span className="text-base opacity-70">
          {diasRestantes === 1 ? "último día" : `quedan ${diasRestantes} días`} · hasta el {fechaDia(fin)}
        </span>
      </div>
      <div
        className={`w-full ${grande ? "h-12" : "h-7"} bg-white rounded-full border-4 border-[#ffd23f] overflow-hidden`}
        role="progressbar"
        aria-valuenow={acumuladas}
        aria-valuemax={meta}
      >
        <div
          className={`h-full bg-[#ffd23f] transition-[width] duration-700 ${cumplido ? "animate-glow" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className={`text-center ${grande ? "text-2xl" : "text-lg"} text-brand-dark`}>
        {cumplido ? (
          <b>🎉 ¡Lo lograste! Premio: {premio}</b>
        ) : (
          <>
            Faltan <b>{faltan}</b> {faltan === 1 ? "estrella" : "estrellas"} para: <b>{premio}</b> 🎁
          </>
        )}
      </div>
    </div>
  );
}
