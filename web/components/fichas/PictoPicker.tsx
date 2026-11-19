"use client";

import { useRef, useState } from "react";
import { buscarPictos, comprimirImagen } from "@/lib/fichas-cliente";
import Picto from "./Picto";
import { input } from "./ui";

export type Imagen = { picto: number | null; foto: string | null };

/**
 * Elegir la imagen de una conducta o un premio: un pictograma de ARASAAC,
 * una foto propia (jpg/png, desde la compu o la cámara del celular), o las dos.
 * Si hay foto, es la que se muestra; el picto queda de respaldo.
 */
export default function PictoPicker({
  valor,
  onCambio,
  sugerencia = "",
  subirFoto,
}: {
  valor: Imagen;
  onCambio: (v: Imagen) => void;
  sugerencia?: string;
  /** Sube el dataUrl y devuelve la URL pública, o un error como texto. */
  subirFoto: (dataUrl: string) => Promise<{ url?: string; error?: string }>;
}) {
  const [q, setQ] = useState(sugerencia);
  const [res, setRes] = useState<number[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const archivo = useRef<HTMLInputElement>(null);

  const buscar = async () => {
    setBuscando(true);
    setRes(await buscarPictos(q || sugerencia));
    setBuscando(false);
  };

  const elegirFoto = async (f: File | undefined) => {
    if (!f) return;
    setError("");
    setSubiendo(true);
    try {
      const r = await subirFoto(await comprimirImagen(f));
      if (r.url) onCambio({ ...valor, foto: r.url });
      else setError(r.error || "No se pudo subir la foto.");
    } catch {
      setError("No pude leer esa imagen. Probá con un JPG o PNG.");
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-center flex-wrap">
        <div className="w-14 h-14 bg-white rounded-xl border-2 border-brand-blue/20 flex items-center justify-center shrink-0">
          {valor.foto || valor.picto ? (
            <Picto id={valor.picto} foto={valor.foto} tam={48} />
          ) : (
            <span className="text-xs opacity-50 text-center">sin imagen</span>
          )}
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
          placeholder="Buscar pictograma"
          className={`${input} flex-1 min-w-[140px]`}
        />
        <button type="button" onClick={() => void buscar()} className="bg-brand-blue text-white rounded-xl px-3 py-3 font-bold shrink-0">
          {buscando ? "…" : "Buscar"}
        </button>
        <button
          type="button"
          disabled={subiendo}
          onClick={() => archivo.current?.click()}
          className="bg-white border-2 border-brand-blue/30 text-brand-blue rounded-xl px-3 py-3 font-bold shrink-0 disabled:opacity-50"
        >
          {subiendo ? "Subiendo…" : "📷 Foto"}
        </button>
        <input
          ref={archivo}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          className="hidden"
          onChange={(e) => void elegirFoto(e.target.files?.[0])}
        />
      </div>
      {valor.foto && (
        <div className="flex items-center gap-2 text-sm">
          <span className="opacity-70">Se muestra tu foto{valor.picto ? " (el pictograma queda de respaldo)" : ""}.</span>
          <button type="button" className="text-brand-pink font-bold" onClick={() => onCambio({ ...valor, foto: null })}>
            Quitar foto
          </button>
        </div>
      )}
      {error && <div className="text-brand-pink font-bold text-sm">{error}</div>}
      {res && (
        <div className="flex flex-wrap gap-2">
          {res.length === 0 && <span className="text-sm opacity-60">No encontré pictogramas. Probá con otra palabra.</span>}
          {res.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                onCambio({ ...valor, picto: id });
                setRes(null);
              }}
              className={`bg-white rounded-xl p-1 border-2 ${valor.picto === id ? "border-brand-green" : "border-transparent"}`}
            >
              <Picto id={id} tam={56} />
            </button>
          ))}
          {valor.picto && (
            <button type="button" className="text-sm text-brand-pink font-bold px-2" onClick={() => onCambio({ ...valor, picto: null })}>
              Quitar pictograma
            </button>
          )}
        </div>
      )}
      <span className="text-[0.7rem] opacity-50">Pictogramas: ARASAAC (Gobierno de Aragón), CC BY-NC-SA.</span>
    </div>
  );
}
