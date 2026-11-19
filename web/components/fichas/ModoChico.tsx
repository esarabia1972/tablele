"use client";

import { useEffect, useRef } from "react";
import { EMOJI, fraseParaChico, type Ficha } from "@/lib/fichas";
import { sndWin, speak } from "@/lib/audio";
import type { Tablero } from "@/lib/fichas-cliente";
import Visualizador from "./Visualizador";
import { fechaCorta } from "./ui";

/**
 * Lo que ve el chico, en el dispositivo de una administradora. Sin botones de
 * administración. Las caritas tristes aparecen igual pero en tono neutro: están
 * para conversarlas, no para castigar. Se sale manteniendo apretado.
 */
export default function ModoChico({ tablero, onSalir }: { tablero: Tablero; onSalir: () => void }) {
  const obj = tablero.objetivo;
  const cumplido = !!obj && obj.acumuladas >= obj.meta;
  const festejado = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (cumplido && !festejado.current) {
      festejado.current = true;
      sndWin();
      speak(`¡Muy bien ${tablero.chico.nombre}! ¡Lograste el premio: ${obj?.premio}!`);
    }
  }, [cumplido, obj?.premio, tablero.chico.nombre]);

  const visibles = tablero.fichas.filter((f) => !f.anulada_at);

  const empezarSalida = () => {
    timer.current = setTimeout(onSalir, 1200);
  };
  const cancelarSalida = () => {
    if (timer.current) clearTimeout(timer.current);
  };

  const leer = (f: Ficha) => speak(fraseParaChico(f));

  return (
    <div className="w-full flex flex-col gap-5 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-brand-dark text-[2.2rem] font-bold drop-shadow-[2px_2px_0_#fff]">
          ¡Hola {tablero.chico.nombre}! 🏅
        </h1>
        <button
          type="button"
          onPointerDown={empezarSalida}
          onPointerUp={cancelarSalida}
          onPointerLeave={cancelarSalida}
          onContextMenu={(e) => e.preventDefault()}
          className="text-sm text-brand-dark/50 px-3 py-2 rounded-full bg-white/50"
          aria-label="Mantener apretado para salir"
        >
          mantené para salir
        </button>
      </div>

      <div className="bg-white/85 p-6 rounded-[26px] shadow-[0_6px_0_rgba(0,0,0,0.12)]">
        {obj ? (
          <Visualizador
            grande
            acumuladas={obj.acumuladas}
            meta={obj.meta}
            premio={obj.premio}
            fin={obj.fin}
            diasRestantes={obj.diasRestantes}
          />
        ) : (
          <p className="text-2xl text-center text-brand-dark">Todavía no hay un objetivo. ¡Pronto!</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {visibles.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => leer(f)}
            className={`text-left rounded-[22px] p-4 shadow-[0_5px_0_rgba(0,0,0,0.12)] active:translate-y-1 active:shadow-none transition-transform flex gap-4 items-center ${
              f.tipo === "triste" ? "bg-gray-100" : f.tipo === "feliz" ? "bg-white" : "bg-[#fff6cf]"
            }`}
          >
            <span className="text-5xl leading-none">{EMOJI[f.tipo]}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-xl text-brand-dark font-bold">{f.dada_por_nombre}</span>
              {f.comentario && <span className="block text-lg text-gray-700 break-words">{f.comentario}</span>}
              <span className="block text-sm opacity-50">{fechaCorta(f.created_at)}</span>
            </span>
            <span className="text-2xl" aria-hidden>
              🔊
            </span>
          </button>
        ))}
      </div>
      {visibles.length === 0 && (
        <p className="text-xl text-center text-brand-blue">Todavía no hay fichas. ¡Vamos que se puede!</p>
      )}
    </div>
  );
}
