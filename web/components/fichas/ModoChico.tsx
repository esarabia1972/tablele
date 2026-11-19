"use client";

import { useEffect, useRef } from "react";
import { EMOJI, fraseParaChico, type Ficha } from "@/lib/fichas";
import { sndWin, speak } from "@/lib/audio";
import type { Tablero } from "@/lib/fichas-cliente";
import Picto from "./Picto";
import Tienda from "./Tienda";
import { fechaCorta } from "./ui";

/**
 * Lo que ve el chico, en el dispositivo de una administradora: su saldo, la
 * tienda (lo que ya le alcanza, resaltado) y cada ficha con su "¡Gracias por…!".
 * Las caritas tristes aparecen igual pero en tono neutro: están para
 * conversarlas, no para castigar. Se sale manteniendo apretado.
 */
export default function ModoChico({ tablero, onSalir }: { tablero: Tablero; onSalir: () => void }) {
  const premios = tablero.premios.filter((p) => p.activo);
  const saldo = Math.max(0, tablero.saldo);
  const alcanza = premios.filter((p) => p.precio <= saldo);
  const festejado = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pictoDe = new Map(tablero.conductas.map((c) => [c.id, c.picto]));

  useEffect(() => {
    if (alcanza.length && !festejado.current) {
      festejado.current = true;
      sndWin();
      speak(`¡Muy bien ${tablero.chico.nombre}! Tenés ${saldo} estrellas. Ya te alcanza para ${alcanza.map((p) => p.nombre).join(", ")}.`);
    }
  }, [alcanza, saldo, tablero.chico.nombre]);

  const visibles = tablero.fichas.filter((f) => !f.anulada_at);

  const leer = (f: Ficha) => speak(fraseParaChico(f));

  return (
    <div className="w-full flex flex-col gap-5 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-brand-dark text-[2.2rem] font-bold drop-shadow-[2px_2px_0_#fff]">¡Hola {tablero.chico.nombre}! 🏅</h1>
        <button
          type="button"
          onPointerDown={() => {
            timer.current = setTimeout(onSalir, 1200);
          }}
          onPointerUp={() => timer.current && clearTimeout(timer.current)}
          onPointerLeave={() => timer.current && clearTimeout(timer.current)}
          onContextMenu={(e) => e.preventDefault()}
          className="text-sm text-brand-dark/50 px-3 py-2 rounded-full bg-white/50"
          aria-label="Mantener apretado para salir"
        >
          mantené para salir
        </button>
      </div>

      <div className="bg-white/85 p-6 rounded-[26px] shadow-[0_6px_0_rgba(0,0,0,0.12)]">
        <Tienda grande saldo={tablero.saldo} premios={premios} />
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
            {f.conducta_id && pictoDe.get(f.conducta_id) ? (
              <Picto id={pictoDe.get(f.conducta_id)} tam={64} />
            ) : (
              <span className="text-5xl leading-none">{EMOJI[f.tipo]}</span>
            )}
            <span className="flex-1 min-w-0">
              <span className="block text-xl text-brand-dark font-bold">{f.dada_por_nombre}</span>
              {f.conducta_texto && (
                <span className="block text-lg text-brand-dark">
                  ¡Gracias por {f.conducta_texto}! {EMOJI[f.tipo]}
                </span>
              )}
              {f.comentario && <span className="block text-lg text-gray-700 break-words">{f.comentario}</span>}
              <span className="block text-sm opacity-50">{fechaCorta(f.created_at)}</span>
            </span>
            <span className="text-2xl" aria-hidden>
              🔊
            </span>
          </button>
        ))}
      </div>
      {visibles.length === 0 && <p className="text-xl text-center text-brand-blue">Todavía no hay fichas. ¡Vamos que se puede!</p>}
    </div>
  );
}
