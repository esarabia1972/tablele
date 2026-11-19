"use client";

import { useState } from "react";
import { urlPicto } from "@/lib/fichas";

/**
 * Imagen de una conducta o un premio: la foto propia si hay, si no el
 * pictograma de ARASAAC, y si no (o si no carga) el respaldo en texto.
 */
export default function Picto({
  id,
  foto,
  tam = 40,
  respaldo = "",
  className = "",
}: {
  id: number | null | undefined;
  foto?: string | null;
  tam?: number;
  respaldo?: string;
  className?: string;
}) {
  const [fallo, setFallo] = useState<string | null>(null);
  const src = foto && fallo !== foto ? foto : id && fallo !== `p${id}` ? urlPicto(id) : null;
  if (!src) {
    return respaldo ? (
      <span className={`inline-flex items-center justify-center ${className}`} style={{ width: tam, height: tam, fontSize: tam * 0.6 }}>
        {respaldo}
      </span>
    ) : null;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- imagen externa (ARASAAC o Storage), sin optimizador
    <img
      src={src}
      alt=""
      width={tam}
      height={tam}
      loading="lazy"
      onError={() => setFallo(src === foto ? foto : `p${id}`)}
      className={`${foto && src === foto ? "object-cover rounded-lg" : "object-contain"} ${className}`}
      style={{ width: tam, height: tam }}
    />
  );
}
