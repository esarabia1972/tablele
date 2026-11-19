"use client";

/**
 * La estrella (o las dos del Vale Doble) del mismo tamaño que el pictograma
 * que la acompaña, para que se lea como "esta conducta vale esto".
 */
export default function Estrellas({ doble, tam = 56 }: { doble: boolean; tam?: number }) {
  return (
    <span
      aria-label={doble ? "dos estrellas" : "una estrella"}
      className="inline-flex items-center justify-center shrink-0 leading-none"
      style={{ height: tam, minWidth: tam, fontSize: doble ? tam * 0.62 : tam * 0.85 }}
    >
      {doble ? (
        <>
          <span>⭐</span>
          <span style={{ marginLeft: -tam * 0.12 }}>⭐</span>
        </>
      ) : (
        "⭐"
      )}
    </span>
  );
}
