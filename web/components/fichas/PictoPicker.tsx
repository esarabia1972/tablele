"use client";

import { useState } from "react";
import { buscarPictos } from "@/lib/fichas-cliente";
import Picto from "./Picto";
import { input } from "./ui";

/** Buscador de pictogramas de ARASAAC. `valor` es el id elegido. */
export default function PictoPicker({
  valor,
  onCambio,
  sugerencia = "",
}: {
  valor: number | null;
  onCambio: (id: number | null) => void;
  sugerencia?: string;
}) {
  const [q, setQ] = useState(sugerencia);
  const [res, setRes] = useState<number[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  const buscar = async () => {
    setBuscando(true);
    setRes(await buscarPictos(q || sugerencia));
    setBuscando(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-center">
        <div className="w-14 h-14 bg-white rounded-xl border-2 border-brand-blue/20 flex items-center justify-center shrink-0">
          {valor ? <Picto id={valor} tam={48} /> : <span className="text-xs opacity-50 text-center">sin picto</span>}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void buscar();
            }
          }}
          placeholder="Buscar pictograma (ARASAAC)"
          className={input}
        />
        <button type="button" onClick={() => void buscar()} className="bg-brand-blue text-white rounded-xl px-3 py-3 font-bold shrink-0">
          {buscando ? "…" : "Buscar"}
        </button>
      </div>
      {res && (
        <div className="flex flex-wrap gap-2">
          {res.length === 0 && <span className="text-sm opacity-60">No encontré pictogramas. Probá con otra palabra.</span>}
          {res.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                onCambio(id);
                setRes(null);
              }}
              className={`bg-white rounded-xl p-1 border-2 ${valor === id ? "border-brand-green" : "border-transparent"}`}
            >
              <Picto id={id} tam={56} />
            </button>
          ))}
          {valor && (
            <button type="button" className="text-sm text-brand-pink font-bold px-2" onClick={() => onCambio(null)}>
              Quitar picto
            </button>
          )}
        </div>
      )}
      <span className="text-[0.7rem] opacity-50">Pictogramas: ARASAAC (Gobierno de Aragón), CC BY-NC-SA.</span>
    </div>
  );
}
