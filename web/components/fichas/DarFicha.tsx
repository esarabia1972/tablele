"use client";

import { useState } from "react";
import { COMENTARIO_OBLIGATORIO, MAX_COMENTARIO, validarFicha, type TipoFicha } from "@/lib/fichas";
import { btn, card, errorTxt, input } from "./ui";

const BOTONES: { tipo: TipoFicha; emoji: string; texto: string; clase: string }[] = [
  { tipo: "estrella", emoji: "⭐", texto: "Estrella", clase: "bg-[#ffd23f] text-brand-dark" },
  { tipo: "doble", emoji: "⭐⭐", texto: "Vale Doble", clase: "bg-brand-orange text-white" },
  { tipo: "feliz", emoji: "🙂", texto: "Contento", clase: "bg-brand-green text-white" },
  { tipo: "triste", emoji: "🙁", texto: "Triste", clase: "bg-brand-purple text-white" },
];

/**
 * Los cuatro botones y el comentario. Elegir un botón no manda nada: hay que
 * confirmar, así un toque sin querer no queda registrado.
 */
export default function DarFicha({
  nombreChico,
  onDar,
}: {
  nombreChico: string;
  onDar: (tipo: TipoFicha, comentario: string) => Promise<string | null>;
}) {
  const [tipo, setTipo] = useState<TipoFicha | null>(null);
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState("");

  const enviar = async () => {
    if (!tipo) return;
    const c = comentario.trim();
    const err = validarFicha(tipo, c || null);
    if (err) {
      setError(err);
      return;
    }
    setEnviando(true);
    const e = await onDar(tipo, c);
    setEnviando(false);
    if (e) {
      setError(e);
      return;
    }
    setListo(tipo === "triste" ? "Quedó anotado." : `¡Listo! ${nombreChico} va a ver tu ficha.`);
    setTipo(null);
    setComentario("");
    setTimeout(() => setListo(""), 3000);
  };

  return (
    <div className={card}>
      <div className="text-brand-dark font-bold text-lg">Darle una ficha a {nombreChico}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {BOTONES.map((b) => (
          <button
            key={b.tipo}
            type="button"
            onClick={() => {
              setTipo(b.tipo);
              setError("");
              setListo("");
            }}
            className={`${b.clase} rounded-[20px] py-3 px-2 font-bold shadow-[0_5px_0_rgba(0,0,0,0.18)] active:translate-y-1 active:shadow-none transition-transform flex flex-col items-center gap-1 ${
              tipo === b.tipo ? "ring-4 ring-brand-blue scale-105" : tipo ? "opacity-60" : ""
            }`}
          >
            <span className="text-3xl leading-none">{b.emoji}</span>
            <span>{b.texto}</span>
          </button>
        ))}
      </div>

      {tipo && (
        <>
          <textarea
            value={comentario}
            onChange={(e) => {
              setComentario(e.target.value);
              setError("");
            }}
            maxLength={MAX_COMENTARIO}
            rows={2}
            placeholder={
              COMENTARIO_OBLIGATORIO[tipo]
                ? tipo === "doble"
                  ? "¿Qué hizo? (obligatorio)"
                  : "¿Qué pasó? (obligatorio)"
                : "¿Por qué? (opcional)"
            }
            className={`${input} resize-none`}
          />
          <div className="flex gap-3">
            <button type="button" disabled={enviando} onClick={() => void enviar()} className={`${btn} flex-1`}>
              {enviando ? "Enviando..." : "Dar"}
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={() => {
                setTipo(null);
                setComentario("");
                setError("");
              }}
              className="bg-gray-200 text-gray-700 rounded-[20px] px-5 font-bold"
            >
              Cancelar
            </button>
          </div>
        </>
      )}
      {error && <div className={errorTxt}>{error}</div>}
      {listo && <div className="text-brand-green font-bold text-center">{listo}</div>}
    </div>
  );
}
