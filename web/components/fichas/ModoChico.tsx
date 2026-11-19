"use client";

import { useEffect, useRef, useState } from "react";
import { EMOJI, fraseParaChico, type Ficha, type Premio } from "@/lib/fichas";
import { sndWin, speak } from "@/lib/audio";
import type { Tablero } from "@/lib/fichas-cliente";
import MantenerApretado from "./MantenerApretado";
import Picto from "./Picto";
import Tienda from "./Tienda";
import { fechaCorta } from "./ui";

/**
 * Lo que ve el chico, en el dispositivo de una administradora: su saldo, la
 * tienda y cada ficha con su "¡Gracias por…!". Las caritas tristes aparecen
 * igual pero en tono neutro: están para conversarlas, no para castigar.
 *
 * El chico ELIGE el premio tocándolo; el canje lo CONFIRMA un adulto
 * manteniendo apretado (la técnica: canjear es decisión de la familia).
 * Se sale también manteniendo apretado.
 */
export default function ModoChico({
  tablero,
  onSalir,
  onCanjear,
}: {
  tablero: Tablero;
  onSalir: () => void;
  /** Canjea el premio. Devuelve null si salió bien o el error como texto. */
  onCanjear: (p: Premio) => Promise<string | null>;
}) {
  const premios = tablero.premios.filter((p) => p.activo);
  const saldo = Math.max(0, tablero.saldo);
  const alcanza = premios.filter((p) => p.precio <= saldo);
  const festejado = useRef(false);
  const conductaDe = new Map(tablero.conductas.map((c) => [c.id, c]));
  const [elegido, setElegido] = useState<Premio | null>(null);
  const [canjeado, setCanjeado] = useState<Premio | null>(null);
  const [error, setError] = useState("");
  const [canjeando, setCanjeando] = useState(false);

  useEffect(() => {
    if (alcanza.length && !festejado.current) {
      festejado.current = true;
      sndWin();
      speak(`¡Muy bien ${tablero.chico.nombre}! Tenés ${saldo} estrellas. Ya te alcanza para ${alcanza.map((p) => p.nombre).join(", ")}.`);
    }
  }, [alcanza, saldo, tablero.chico.nombre]);

  const visibles = tablero.fichas.filter((f) => !f.anulada_at);

  const leer = (f: Ficha) => speak(fraseParaChico(f));

  const elegir = (p: Premio) => {
    if (p.precio <= saldo) {
      speak(`${p.nombre}. Cuesta ${p.precio} estrellas. ¡Te alcanza! ¿Lo querés?`);
      setError("");
      setElegido(p);
    } else {
      const faltan = p.precio - saldo;
      speak(`${p.nombre}. Cuesta ${p.precio} estrellas. Te ${faltan === 1 ? "falta una" : `faltan ${faltan}`}. ¡Vos podés!`);
    }
  };

  const confirmar = async () => {
    if (!elegido || canjeando) return;
    setCanjeando(true);
    const err = await onCanjear(elegido);
    setCanjeando(false);
    if (err) {
      setError(err);
      return;
    }
    sndWin();
    speak(`¡Canjeaste ${elegido.nombre}! ¡Felicitaciones ${tablero.chico.nombre}!`);
    setCanjeado(elegido);
    setElegido(null);
    setTimeout(() => setCanjeado(null), 4000);
  };

  return (
    <div className="w-full flex flex-col gap-5 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-brand-dark text-[2.2rem] font-bold drop-shadow-[2px_2px_0_#fff]">¡Hola {tablero.chico.nombre}! 🏅</h1>
        <MantenerApretado
          onListo={onSalir}
          className="text-sm text-brand-dark/70 px-4 py-2 rounded-full bg-white/60 border-2 border-brand-dark/20"
        >
          mantené para salir
        </MantenerApretado>
      </div>

      <div className="bg-white/85 p-6 rounded-[26px] shadow-[0_6px_0_rgba(0,0,0,0.12)]">
        <Tienda grande saldo={tablero.saldo} premios={premios} onElegir={elegir} />
        {premios.length > 0 && <p className="text-center text-brand-dark/60 mt-3">Tocá un premio para elegirlo</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {visibles.map((f) => {
          const c = f.conducta_id ? conductaDe.get(f.conducta_id) : undefined;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => leer(f)}
              className={`text-left rounded-[22px] p-4 shadow-[0_5px_0_rgba(0,0,0,0.12)] active:translate-y-1 active:shadow-none transition-transform flex gap-4 items-center ${
                f.tipo === "triste" ? "bg-gray-100" : f.tipo === "feliz" ? "bg-white" : "bg-[#fff6cf]"
              }`}
            >
              {c && (c.picto || c.foto) ? (
                <Picto id={c.picto} foto={c.foto} tam={64} />
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
          );
        })}
      </div>
      {visibles.length === 0 && <p className="text-xl text-center text-brand-blue">Todavía no hay fichas. ¡Vamos que se puede!</p>}

      {/* Elegido: el chico dice "lo quiero", un adulto confirma manteniendo apretado. */}
      {elegido && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setElegido(null)}>
          <div
            className="bg-[#fff6cf] rounded-[30px] p-6 w-full max-w-md flex flex-col items-center gap-4 text-center shadow-2xl border-4 border-[#ffd23f]"
            onClick={(e) => e.stopPropagation()}
          >
            <Picto id={elegido.picto} foto={elegido.foto} tam={140} respaldo="🎁" />
            <div className="text-3xl font-bold text-brand-dark">{elegido.nombre}</div>
            <div className="text-xl text-brand-dark">
              Cuesta {elegido.precio} ⭐ · te quedan {saldo - elegido.precio}
            </div>
            <MantenerApretado
              ms={1500}
              onListo={() => void confirmar()}
              apretandoTexto="confirmando…"
              relleno="bg-white/40"
              className="w-full bg-brand-green text-white text-xl font-bold rounded-[22px] py-4 shadow-[0_5px_0_rgba(0,0,0,0.18)]"
            >
              {canjeando ? "Canjeando…" : "¡Lo quiero!"}
            </MantenerApretado>
            <div className="text-sm text-brand-dark/70 -mt-2">Un adulto mantiene apretado para confirmar</div>
            {error && <div className="text-brand-pink font-bold">{error}</div>}
            <button type="button" className="text-brand-dark/70 underline" onClick={() => setElegido(null)}>
              Elegir otro
            </button>
          </div>
        </div>
      )}

      {canjeado && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4 pointer-events-none">
          <div className="bg-white rounded-[30px] p-8 flex flex-col items-center gap-3 shadow-2xl animate-pop">
            <div className="text-6xl">🎉</div>
            <Picto id={canjeado.picto} foto={canjeado.foto} tam={120} respaldo="🎁" />
            <div className="text-3xl font-bold text-brand-dark text-center">¡Canjeaste {canjeado.nombre}!</div>
          </div>
        </div>
      )}
    </div>
  );
}
