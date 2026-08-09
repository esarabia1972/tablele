"use client";

import { useEffect, useRef, useState } from "react";
import { PalabraDefault } from "@/data/palabras-default";

interface SilabasGameProps {
  target: PalabraDefault;
  correctas: string[];
  locked: boolean;
  hint: boolean;
  resetSignal: number;
  onSubmit: (orden: string[]) => void;
}

// Un solo estado como fuente de verdad para cada sílaba: dónde está (tray o
// una caja). Evita tener dos arrays (tray/slots) + un ref con el texto que
// haya que mantener sincronizados a mano, y evita leer refs durante el
// render (el linter de React lo prohíbe: rompe la pureza del render).
type TileState = { id: string; texto: string; slotIdx: number | null };

const shuffle = <T,>(a: T[]): T[] =>
  a.map((x) => [Math.random(), x] as const).sort((p, q) => p[0] - q[0]).map((p) => p[1]);

// Por debajo de esta distancia, un pointerdown+up en el mismo lugar cuenta
// como "toco la sílaba" (tap), no como un arrastre fallido.
const TAP_UMBRAL_PX = 8;

// Margen de tolerancia (F9) alrededor de cada caja destino al soltar un
// arrastre: compensa la motricidad imprecisa de niños con discapacidad
// intelectual, que suelen soltar el dedo unos píxeles afuera del blanco.
const HIT_TOLERANCIA_PX = 14;

// Arma el mazo mezclado a partir de las sílabas correctas.
// Ids únicos por índice (no por texto): así "nene" = ne-ne funciona con dos
// tiles de texto repetido sin confundirse entre sí.
const generarTiles = (silabas: string[]): TileState[] =>
  shuffle(silabas.map((texto, i) => ({ id: `${i}-${Math.random().toString(36).slice(2)}`, texto, slotIdx: null })));

// Juego de arrastre puro: arma la palabra ordenando sus sílabas.
// Usa Pointer Events (no HTML5 drag&drop, que no funciona bien en touch/iOS).
// El "por qué" del clon fantasma con transform directo en vez de setState:
// pointermove dispara hasta 60 veces por segundo, y re-renderizar React a esa
// velocidad se nota tildado en tablets viejas. Moviendo un <div> fuera de React
// con transform, el resto de la UI no se re-renderiza mientras se arrastra.
//
// IMPORTANTE: el padre (GameEngine) debe renderizar este componente con
// key={target.palabra}. Así, cuando cambia la ronda, React lo desmonta y
// vuelve a montar de cero (con el tablero ya mezclado desde el arranque) en
// vez de tener que "sincronizar" el cambio de prop con un efecto.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- "target" es parte del contrato (lo pide el diseño); el reset por ronda lo maneja el key en el padre
export default function SilabasGame({ target, correctas, locked, hint, resetSignal, onSubmit }: SilabasGameProps) {
  // Lazy init: se genera una sola vez, en el primer render de esta instancia
  // (que es "nueva" en cada ronda gracias al key en el padre).
  const [tiles, setTiles] = useState<TileState[]>(() => generarTiles(correctas));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resultPulse, setResultPulse] = useState<{ ok: boolean; key: number } | null>(null);

  const dragRef = useRef<{ id: string; pointerId: number; x: number; y: number; startX: number; startY: number } | null>(null);
  const cloneElRef = useRef<HTMLDivElement | null>(null);
  // Contenedor de las cajas destino: se buscan con querySelectorAll en el
  // momento de soltar (evento, no render), así no hace falta un ref por caja.
  const slotsContainerRef = useRef<HTMLDivElement | null>(null);
  // Evita disparar onSubmit más de una vez si algo re-renderiza de más.
  const submittedRef = useRef(false);
  const primerResetRef = useRef(true);

  const removerClon = () => {
    if (cloneElRef.current) {
      cloneElRef.current.remove();
      cloneElRef.current = null;
    }
  };

  // Reintento tras un error (misma palabra, resetSignal incrementado por
  // GameEngine): primero sacude las cajas y recién después reparte de nuevo.
  useEffect(() => {
    if (primerResetRef.current) {
      // El primer render también dispara este efecto: no es un error real.
      primerResetRef.current = false;
      return;
    }
    setResultPulse({ ok: false, key: Date.now() });
    const t = setTimeout(() => {
      submittedRef.current = false;
      setTiles(generarTiles(correctas));
      setResultPulse(null);
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  // Limpiar el clon si el componente se desmonta a mitad de un arrastre
  // (ej: se terminó la ronda mientras el dedo seguía en pantalla)
  useEffect(() => {
    return () => removerClon();
  }, []);

  const colocar = (id: string, idx: number) => {
    setTiles((prev) => prev.map((t) => (t.id === id ? { ...t, slotIdx: idx } : t)));
  };

  const sacarDeCaja = (id: string) => {
    setTiles((prev) => prev.map((t) => (t.id === id ? { ...t, slotIdx: null } : t)));
  };

  const colocarEnPrimeraVacia = (id: string) => {
    const ocupados = new Set(tiles.filter((t) => t.slotIdx !== null).map((t) => t.slotIdx));
    let idx = -1;
    for (let i = 0; i < correctas.length; i++) {
      if (!ocupados.has(i)) {
        idx = i;
        break;
      }
    }
    if (idx === -1) return; // no debería pasar: tray y cajas siempre calzan
    colocar(id, idx);
  };

  // Cuando se llenan todas las cajas, se arma el "orden" y se manda al padre.
  // SIN botón confirmar: colocar la última sílaba dispara la corrección.
  useEffect(() => {
    if (tiles.length === 0 || submittedRef.current) return;
    if (tiles.some((t) => t.slotIdx === null)) return;
    submittedRef.current = true;
    const orden = Array.from({ length: correctas.length }, (_, i) => tiles.find((t) => t.slotIdx === i)?.texto ?? "");
    onSubmit(orden);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles]);

  // F2: feedback visual de acierto en las cajas ("bg-brand-green + animate-pop",
  // igual que el botón correcto en wp/pw). Se deriva directo de "tiles" en vez
  // de guardarlo en un estado aparte seteado desde el efecto de arriba: así
  // aparece en el mismo render en que se completa el tablero (no hay que
  // esperar una vuelta de ida y vuelta con el padre) y se evita disparar un
  // setState síncrono dentro de un efecto (regla react-hooks/set-state-in-effect).
  const todasColocadas = tiles.length > 0 && tiles.every((t) => t.slotIdx !== null);
  const ordenCompleto = todasColocadas
    ? Array.from({ length: correctas.length }, (_, i) => tiles.find((t) => t.slotIdx === i)?.texto ?? "")
    : null;
  const esCorrecto =
    !!ordenCompleto &&
    ordenCompleto.length === correctas.length &&
    ordenCompleto.every((s, i) => s === correctas[i]);

  const crearClon = (rect: DOMRect, texto: string): HTMLDivElement => {
    const clone = document.createElement("div");
    clone.textContent = texto;
    clone.className =
      "fixed flex items-center justify-center rounded-[22px] bg-white shadow-[0_8px_0_rgba(0,0,0,0.2)] font-bold text-brand-dark text-[clamp(1.6rem,6vw,2rem)] pointer-events-none z-[9999]";
    clone.style.left = `${rect.left}px`;
    clone.style.top = `${rect.top}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.transform = "scale(1.08)";
    document.body.appendChild(clone);
    return clone;
  };

  const onTilePointerDown = (tile: TileState, e: React.PointerEvent<HTMLDivElement>) => {
    if (locked || dragRef.current) return; // ya bloqueado, o ya hay otro dedo arrastrando
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      id: tile.id,
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
    };
    cloneElRef.current = crearClon(rect, tile.texto);
    // No se dice la sílaba al agarrarla: el niño la lee. La voz aparece solo
    // al final, diciendo la palabra completa cuando la armó bien.
    setDraggingId(tile.id);
  };

  const onTilePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    d.x = e.clientX;
    d.y = e.clientY;
    // Mover el clon directo por transform (sin setState) para no re-renderizar a 60fps.
    if (cloneElRef.current) {
      const dx = d.x - d.startX;
      const dy = d.y - d.startY;
      cloneElRef.current.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.08)`;
    }
  };

  const finalizarDrag = () => {
    removerClon();
    dragRef.current = null;
    setDraggingId(null);
  };

  const onTilePointerUp = (tile: TileState, e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const distancia = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
    finalizarDrag();

    if (distancia < TAP_UMBRAL_PX) {
      // Tap: si la sílaba ya está en una caja, vuelve a la bandeja (así puede
      // corregirse antes de completar); si está en la bandeja, va a la primera
      // caja vacía (más fácil para nenes chiquitos que no logran arrastrar).
      if (tile.slotIdx !== null) sacarDeCaja(tile.id);
      else colocarEnPrimeraVacia(tile.id);
      return;
    }

    // Arrastre: comparar el punto de soltada contra cada caja, buscándolas en
    // el DOM recién ahora (evento, no render). Se prefiere esto a
    // elementFromPoint porque el clon fantasma tapa el DOM debajo del dedo.
    const punto = { x: e.clientX, y: e.clientY };
    let idxDestino = -1;
    let mejorDistancia = Infinity;
    const cajas = slotsContainerRef.current?.querySelectorAll<HTMLElement>("[data-slot-idx]");
    if (cajas) {
      for (const caja of Array.from(cajas)) {
        // Solo compiten las cajas VACÍAS (más la propia, si viene de una caja:
        // soltarla donde estaba tiene que dejarla ahí, no mandarla a la
        // bandeja). Si no, una caja llena pegada a una vacía podía "ganar" por
        // estar más cerca del centro y el drop se descartaba, aunque había una
        // caja válida al alcance del dedo.
        const idxCaja = Number(caja.dataset.slotIdx);
        const ocupadaPorOtro = tiles.some((t) => t.slotIdx === idxCaja && t.id !== tile.id);
        if (ocupadaPorOtro) continue;
        const r = caja.getBoundingClientRect();
        // F9: margen de tolerancia de ~14px en los 4 lados. Un niño con
        // motricidad imprecisa que suelta un poco afuera de la caja igual
        // acierta (el tile solo vuelve al tray si no acierta, no se pierde,
        // pero bajaba la tasa de éxito sin necesidad).
        const dentro =
          punto.x >= r.left - HIT_TOLERANCIA_PX &&
          punto.x <= r.right + HIT_TOLERANCIA_PX &&
          punto.y >= r.top - HIT_TOLERANCIA_PX &&
          punto.y <= r.bottom + HIT_TOLERANCIA_PX;
        if (!dentro) continue;
        // Si el margen ampliado hace que el punto caiga dentro de más de una
        // caja (se solapan), gana la de centro más cercano al punto soltado.
        const cx = (r.left + r.right) / 2;
        const cy = (r.top + r.bottom) / 2;
        const distancia = Math.hypot(punto.x - cx, punto.y - cy);
        if (distancia < mejorDistancia) {
          mejorDistancia = distancia;
          idxDestino = idxCaja;
        }
      }
    }

    if (idxDestino >= 0) {
      colocar(tile.id, idxDestino);
    } else if (tile.slotIdx !== null) {
      // Arrastró una sílaba ya colocada y la soltó fuera de las cajas:
      // se interpreta como "sacala", vuelve a la bandeja.
      sacarDeCaja(tile.id);
    }
    // Si venía de la bandeja y no acertó ninguna caja, queda donde estaba.
  };

  const onTilePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    finalizarDrag();
  };

  const trayTiles = tiles.filter((t) => t.slotIdx === null);

  // Pista tras 2 fallos: SOLO brilla la sílaba del tray que corresponde a la
  // próxima caja vacía en el orden correcto (no se revela la palabra entera).
  let proximaVaciaIdx = -1;
  for (let i = 0; i < correctas.length; i++) {
    if (!tiles.some((t) => t.slotIdx === i)) {
      proximaVaciaIdx = i;
      break;
    }
  }
  const idTileConPista =
    hint && proximaVaciaIdx !== -1
      ? trayTiles.find((t) => t.texto === correctas[proximaVaciaIdx])?.id ?? null
      : null;

  // Orden en pantalla: tarjeta (arriba, la pone el padre) → sílabas mezcladas
  // → cajas destino. Las sílabas van pegadas a la tarjeta para que el niño
  // las vea junto al modelo escrito y arrastre hacia abajo, no hacia arriba.
  const tray = (
    // min-h fijo: al ir sacando sílabas la bandeja no se encoge, así las cajas
    // de abajo no se mueven de lugar mientras el niño está arrastrando.
    <div className="flex flex-wrap justify-center content-center gap-6 sm:gap-8 w-full max-w-[560px] min-h-[96px] px-2 py-3 rounded-[26px] bg-white/60">
      {trayTiles.map((tile) => (
        <div
          key={tile.id}
          onPointerDown={(e) => onTilePointerDown(tile, e)}
          onPointerMove={onTilePointerMove}
          onPointerUp={(e) => onTilePointerUp(tile, e)}
          onPointerCancel={onTilePointerCancel}
          aria-label={tile.texto}
          className={`touch-none select-none min-w-[72px] min-h-[72px] rounded-[22px] bg-white shadow-[0_5px_0_rgba(0,0,0,0.14)] flex items-center justify-center px-3 text-[clamp(1.6rem,6vw,2rem)] font-bold text-brand-dark cursor-grab
            ${draggingId === tile.id ? "opacity-30" : ""}
            ${idTileConPista === tile.id ? "animate-glow" : ""}
          `}
        >
          {tile.texto}
        </div>
      ))}
    </div>
  );

  return (
    <>
      {tray}

      <div className="flex flex-col items-center w-full mt-6 sm:mt-10">
        <div
          ref={slotsContainerRef}
          className={`flex flex-wrap justify-center gap-6 sm:gap-8 w-full max-w-[560px] px-2 py-3 rounded-[26px] bg-white/25 ${
            resultPulse && !resultPulse.ok ? "animate-shake" : ""
          }`}
        >
          {Array.from({ length: correctas.length }, (_, i) => {
            const colocado = tiles.find((t) => t.slotIdx === i);
            return (
              // Una sílaba ya colocada se puede tocar (vuelve a la bandeja) o
              // arrastrar a otra caja: el niño tiene que poder corregirse antes
              // de completar, sin que el tablero se le trabe.
              <div
                key={i}
                data-slot-idx={i}
                aria-label={
                  colocado
                    ? `casilla ${i + 1}: ${colocado.texto} — tocá para sacarla`
                    : `casilla ${i + 1} vacía`
                }
                onPointerDown={colocado ? (e) => onTilePointerDown(colocado, e) : undefined}
                onPointerMove={colocado ? onTilePointerMove : undefined}
                onPointerUp={colocado ? (e) => onTilePointerUp(colocado, e) : undefined}
                onPointerCancel={colocado ? onTilePointerCancel : undefined}
                className={`min-w-[72px] min-h-[72px] rounded-[22px] flex items-center justify-center px-2 text-[clamp(1.6rem,6vw,2rem)] font-bold text-brand-dark
                  ${colocado ? "touch-none select-none cursor-grab" : ""}
                  ${draggingId && colocado?.id === draggingId ? "opacity-30" : ""}
                  ${
                    esCorrecto
                      ? "bg-brand-green text-white animate-pop"
                      : colocado
                      ? "bg-white shadow-[0_5px_0_rgba(0,0,0,0.14)]"
                      : "border-2 border-dashed border-brand-blue/60 bg-white/50"
                  }
                `}
              >
                {colocado?.texto ?? ""}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
