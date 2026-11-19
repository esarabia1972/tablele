"use client";

import { useState } from "react";
import { urlPicto } from "@/lib/fichas";

/** Pictograma de ARASAAC por id. Sin id (o si no carga), muestra el respaldo. */
export default function Picto({
  id,
  tam = 40,
  respaldo = "",
  className = "",
}: {
  id: number | null | undefined;
  tam?: number;
  respaldo?: string;
  className?: string;
}) {
  const [fallo, setFallo] = useState(false);
  if (!id || fallo) {
    return respaldo ? (
      <span className={`inline-flex items-center justify-center ${className}`} style={{ width: tam, height: tam, fontSize: tam * 0.6 }}>
        {respaldo}
      </span>
    ) : null;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- imagen externa de ARASAAC, sin optimizador
    <img
      src={urlPicto(id)}
      alt=""
      width={tam}
      height={tam}
      loading="lazy"
      onError={() => setFallo(true)}
      className={`object-contain ${className}`}
      style={{ width: tam, height: tam }}
    />
  );
}
