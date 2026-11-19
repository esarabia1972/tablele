"use client";

import { useState } from "react";
import {
  COMENTARIO_OBLIGATORIO,
  LLEVA_CONDUCTA,
  MAX_COMENTARIO,
  validarFicha,
  type Conducta,
  type TipoFicha,
} from "@/lib/fichas";
import Picto from "./Picto";
import { btn, card, errorTxt, input } from "./ui";

const BOTONES: { tipo: TipoFicha; emoji: string; texto: string; clase: string }[] = [
  { tipo: "estrella", emoji: "⭐", texto: "Estrella", clase: "bg-[#ffd23f] text-brand-dark" },
  { tipo: "doble", emoji: "⭐⭐", texto: "Vale Doble", clase: "bg-brand-orange text-white" },
  { tipo: "feliz", emoji: "🙂", texto: "Contento", clase: "bg-brand-green text-white" },
  { tipo: "triste", emoji: "🙁", texto: "Triste", clase: "bg-brand-purple text-white" },
];

/**
 * Dar una ficha. Estrella y Vale Doble piden elegir la conducta (el por qué);
 * las caritas son libres, con texto. Nada se manda hasta tocar "Dar".
 */
export default function DarFicha({
  nombreChico,
  conductas,
  sinConductas,
  onDar,
}: {
  nombreChico: string;
  /** Sólo las activas, en orden. */
  conductas: Conducta[];
  /** Qué decir si no hay conductas cargadas. */
  sinConductas: string;
  onDar: (tipo: TipoFicha, comentario: string, conductaId: string | null) => Promise<string | null>;
}) {
  const [tipo, setTipo] = useState<TipoFicha | null>(null);
  const [conducta, setConducta] = useState<Conducta | null>(null);
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState("");

  const limpiar = () => {
    setTipo(null);
    setConducta(null);
    setComentario("");
    setError("");
  };

  const enviar = async () => {
    if (!tipo) return;
    if (LLEVA_CONDUCTA[tipo] && !conducta) {
      setError("Elegí por qué se gana la estrella.");
      return;
    }
    const c = comentario.trim();
    const err = validarFicha(tipo, c || null);
    if (err) {
      setError(err);
      return;
    }
    setEnviando(true);
    const e = await onDar(tipo, c, LLEVA_CONDUCTA[tipo] ? conducta?.id ?? null : null);
    setEnviando(false);
    if (e) {
      setError(e);
      return;
    }
    setListo(
      tipo === "triste"
        ? "Quedó anotado."
        : conducta && LLEVA_CONDUCTA[tipo]
          ? `¡Listo! Le diste ${tipo === "doble" ? "un Vale Doble" : "una estrella"} por ${conducta.texto}.`
          : `¡Listo! ${nombreChico} va a ver tu ficha.`
    );
    limpiar();
    setTimeout(() => setListo(""), 3500);
  };

  const pideConducta = tipo !== null && LLEVA_CONDUCTA[tipo];

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

      {pideConducta && (
        <div className="flex flex-col gap-2">
          <div className="font-bold text-brand-dark">¿Por qué? ¡Gracias por…</div>
          {conductas.length === 0 ? (
            <p className="text-brand-pink font-bold">{sinConductas}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {conductas.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setConducta(c);
                    setError("");
                  }}
                  className={`bg-white rounded-2xl p-2 flex items-center gap-2 text-left border-4 transition-transform active:translate-y-0.5 ${
                    conducta?.id === c.id ? "border-brand-green" : "border-transparent"
                  }`}
                >
                  <Picto id={c.picto} tam={44} respaldo="⭐" />
                  <span className="font-bold text-brand-dark leading-tight">{c.texto}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
                ? "¿Qué pasó? (obligatorio)"
                : pideConducta
                  ? "Algo más para contarle (opcional)"
                  : "¿Por qué? (opcional)"
            }
            className={`${input} resize-none`}
          />
          <div className="flex gap-3">
            <button
              type="button"
              disabled={enviando || (pideConducta && conductas.length === 0)}
              onClick={() => void enviar()}
              className={`${btn} flex-1`}
            >
              {enviando ? "Enviando..." : "Dar"}
            </button>
            <button type="button" disabled={enviando} onClick={limpiar} className="bg-gray-200 text-gray-700 rounded-[20px] px-5 font-bold">
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
