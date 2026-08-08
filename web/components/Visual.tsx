"use client";

import { PalabraDefault } from "@/data/palabras-default";

// Imagen de una palabra: foto real si la cargaron, si no el emoji.
// Se extrajo de GameEngine para poder reutilizarla también en SilabasGame
// (tarjeta con la palabra completa antes de armarla en sílabas).
export default function Visual({ p, size = "grande" }: { p: PalabraDefault; size?: "grande" | "opcion" | "memo" }) {
  if (p.foto) {
    const cls =
      size === "grande"
        ? "mx-auto h-[clamp(7rem,28vw,11rem)] w-auto max-w-full rounded-2xl object-cover"
        : size === "opcion"
        ? "mx-auto h-[clamp(4.5rem,20vw,7rem)] w-full rounded-xl object-cover"
        : "absolute inset-0 w-full h-full rounded-[16px] object-cover";
    return <img src={p.foto} alt={p.palabra} className={cls} draggable={false} />;
  }
  const cls =
    size === "grande"
      ? "text-[clamp(4rem,16vw,6.5rem)] leading-[1.1]"
      : size === "opcion"
      ? "text-[3.4rem]"
      : "text-[clamp(1.8rem,7vw,2.4rem)]";
  return <span className={cls}>{p.emoji}</span>;
}
