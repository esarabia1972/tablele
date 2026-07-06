"use client";

import { useState, useEffect } from "react";
import TopBar from "@/components/TopBar";
import { getStats, clearStats, PalabraStat } from "@/lib/storage";

export default function InformePage() {
  const [stats, setStats] = useState<Record<string, PalabraStat>>({});
  const [clearTimer, setClearTimer] = useState<NodeJS.Timeout | null>(null);
  const [fill, setFill] = useState(0);

  useEffect(() => {
    setStats(getStats());
  }, []);

  const rows = Object.entries(stats).sort(
    (a, b) => a[1].ok / a[1].tot - b[1].ok / b[1].tot
  );

  const startClear = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (clearTimer) return;
    setFill(100);
    const t = setTimeout(() => {
      clearStats();
      setStats({});
      setFill(0);
      setClearTimer(null);
    }, 2000);
    setClearTimer(t);
  };

  const cancelClear = () => {
    if (clearTimer) {
      clearTimeout(clearTimer);
      setClearTimer(null);
    }
    setFill(0);
  };

  return (
    <>
      <TopBar backTo="/config" />
      <div className="flex-1 flex flex-col items-center w-full max-w-[440px] pt-[2vh]">
        <h1 className="text-brand-dark text-[1.7rem] mb-2 font-bold text-center">
          Informe
        </h1>
        <div className="text-brand-blue text-[1.15rem] text-center mb-5">
          aciertos por palabra (de peor a mejor)
        </div>

        <div className="w-full flex flex-col gap-2">
          {rows.length === 0 ? (
            <div className="text-brand-blue text-[1.15rem] text-center opacity-70">
              todavía no hay datos
            </div>
          ) : (
            rows.map(([w, s]) => {
              const p = Math.round((s.ok / s.tot) * 100);
              const col = p >= 80 ? "#3dbf6e" : p >= 50 ? "#ff8a3d" : "#d63384";
              return (
                <div
                  key={w}
                  className="bg-white rounded-[14px] p-[10px_16px] flex justify-between items-center shadow-[0_3px_0_rgba(0,0,0,0.1)]"
                >
                  <b className="text-brand-dark text-[1.15rem]">{w}</b>
                  <span className="font-bold" style={{ color: col }}>
                    {s.ok} / {s.tot} &nbsp;({p}%)
                  </span>
                </div>
              );
            })
          )}
        </div>

        {rows.length > 0 && (
          <div className="mt-[24px] w-full pb-8">
            <button
              onPointerDown={startClear}
              onPointerUp={cancelClear}
              onPointerLeave={cancelClear}
              onPointerCancel={cancelClear}
              onContextMenu={(e) => e.preventDefault()}
              className="relative overflow-hidden bg-brand-pink text-white border-none rounded-[22px] p-4 text-[1.05rem] font-bold cursor-pointer shadow-[0_5px_0_rgba(0,0,0,0.18)] active:translate-y-1 active:shadow-none w-full"
            >
              <div
                className="absolute top-0 left-0 bottom-0 bg-white/45"
                style={{ width: `${fill}%`, transition: fill > 0 ? "width 2s linear" : "none" }}
              ></div>
              <span className="relative z-10">Borrar historial (mantener apretado)</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}
