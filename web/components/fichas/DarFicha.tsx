"use client";

import { useState } from "react";
import {
  COMENTARIO_OBLIGATORIO,
  MAX_COMENTARIO,
  tipoDeConducta,
  validarFicha,
  type Conducta,
  type TipoFicha,
} from "@/lib/fichas";
import Estrellas from "./Estrellas";
import Picto from "./Picto";
import { btn, card, errorTxt, input } from "./ui";

type Eleccion = { clase: "conducta"; c: Conducta } | { clase: "carita"; tipo: "feliz" | "triste" };

/**
 * Dar una ficha (SPEC-fichas-v3.md §5). Se toca directamente la conducta que
 * se trabaja: el valor lo pone ella (1 ⭐, o 2 si es Vale Doble, resaltada).
 * Aparte, las caritas, libres y con texto. Nada se manda hasta tocar "Dar".
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
  /** Qué decir si no hay conductas activas. */
  sinConductas: string;
  onDar: (tipo: TipoFicha, comentario: string, conductaId: string | null) => Promise<string | null>;
}) {
  const [eleccion, setEleccion] = useState<Eleccion | null>(null);
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState("");

  const limpiar = () => {
    setEleccion(null);
    setComentario("");
    setError("");
  };

  const tipo: TipoFicha | null = !eleccion ? null : eleccion.clase === "conducta" ? tipoDeConducta(eleccion.c) : eleccion.tipo;

  const enviar = async () => {
    if (!eleccion || !tipo) return;
    const c = comentario.trim();
    const err = validarFicha(tipo, c || null);
    if (err) {
      setError(err);
      return;
    }
    setEnviando(true);
    const e = await onDar(tipo, c, eleccion.clase === "conducta" ? eleccion.c.id : null);
    setEnviando(false);
    if (e) {
      setError(e);
      return;
    }
    setListo(
      eleccion.clase === "conducta"
        ? `¡Listo! ${eleccion.c.doble ? "⭐⭐" : "⭐"} por ${eleccion.c.texto}.`
        : eleccion.tipo === "triste"
          ? "Quedó anotado."
          : `¡Listo! ${nombreChico} va a ver tu carita.`
    );
    limpiar();
    setTimeout(() => setListo(""), 3500);
  };

  const elegir = (e: Eleccion) => {
    setEleccion(e);
    setError("");
    setListo("");
  };

  const elegida = (c: Conducta) => eleccion?.clase === "conducta" && eleccion.c.id === c.id;

  return (
    <div className={card}>
      <div className="text-brand-dark font-bold text-lg">Hoy trabajamos con {nombreChico}</div>
      {conductas.length === 0 ? (
        <p className="text-brand-pink font-bold">{sinConductas}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {conductas.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => elegir({ clase: "conducta", c })}
              className={`relative rounded-[22px] p-3 pt-4 flex flex-col items-center gap-2 text-center border-4 shadow-[0_4px_0_rgba(0,0,0,0.12)] active:translate-y-1 active:shadow-none transition-all ${
                c.doble ? "bg-[#fff1e4] border-brand-orange" : "bg-[#fff6cf] border-[#ffd23f]"
              } ${elegida(c) ? "ring-4 ring-brand-blue ring-offset-2" : eleccion ? "opacity-70" : ""}`}
            >
              {elegida(c) && (
                <span className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-brand-blue text-white font-bold flex items-center justify-center shadow">
                  ✓
                </span>
              )}
              {/* Pictograma y estrellas del mismo tamaño, lado a lado. */}
              <span className="flex items-center justify-center gap-2">
                <Picto id={c.picto} foto={c.foto} tam={64} respaldo="🙂" />
                <Estrellas doble={c.doble} tam={64} />
              </span>
              <span className="font-bold text-brand-dark leading-tight text-[1.05rem]">{c.texto}</span>
              {c.doble && (
                <span className="rounded-full px-3 py-0.5 text-xs font-bold bg-brand-orange text-white">Vale doble</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-brand-dark/70 text-sm">o anotar una carita:</span>
        {(
          [
            ["feliz", "🙂 Contento", "bg-brand-green"],
            ["triste", "🙁 Triste", "bg-brand-purple"],
          ] as const
        ).map(([t, txt, color]) => (
          <button
            key={t}
            type="button"
            onClick={() => elegir({ clase: "carita", tipo: t })}
            className={`${color} text-white rounded-[16px] px-4 py-2 font-bold shadow-[0_3px_0_rgba(0,0,0,0.18)] active:translate-y-0.5 ${
              eleccion?.clase === "carita" && eleccion.tipo === t ? "ring-4 ring-brand-blue" : eleccion ? "opacity-60" : ""
            }`}
          >
            {txt}
          </button>
        ))}
      </div>

      {eleccion && tipo && (
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
                : eleccion.clase === "conducta"
                  ? "Algo más para contarle (opcional)"
                  : "¿Por qué? (opcional)"
            }
            className={`${input} resize-none`}
          />
          <div className="flex gap-3">
            <button type="button" disabled={enviando} onClick={() => void enviar()} className={`${btn} flex-1`}>
              {enviando
                ? "Enviando..."
                : eleccion.clase === "conducta"
                  ? `Dar ${eleccion.c.doble ? "⭐⭐" : "⭐"}`
                  : "Anotar"}
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
