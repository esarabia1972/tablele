"use client";

import { useRef, useState } from "react";

/**
 * Botón que hay que mantener apretado: se llena mientras tanto y dispara al
 * completarse. Al soltar antes, vuelve a cero al instante. Sirve para que el
 * chico no haga sin querer algo que es decisión de un adulto.
 */
export default function MantenerApretado({
  ms = 1500,
  onListo,
  children,
  apretandoTexto = "seguí apretando…",
  className = "",
  relleno = "bg-brand-dark/25",
}: {
  ms?: number;
  onListo: () => void;
  children: React.ReactNode;
  apretandoTexto?: string;
  className?: string;
  relleno?: string;
}) {
  const [apretando, setApretando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const empezar = () => {
    setApretando(true);
    timer.current = setTimeout(() => {
      setApretando(false);
      onListo();
    }, ms);
  };
  const soltar = () => {
    setApretando(false);
    if (timer.current) clearTimeout(timer.current);
  };

  return (
    <button
      type="button"
      onPointerDown={empezar}
      onPointerUp={soltar}
      onPointerLeave={soltar}
      onPointerCancel={soltar}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative overflow-hidden touch-none select-none ${className}`}
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 ${relleno}`}
        style={{ width: apretando ? "100%" : "0%", transition: apretando ? `width ${ms}ms linear` : "none" }}
      />
      <span className="relative">{apretando ? apretandoTexto : children}</span>
    </button>
  );
}
