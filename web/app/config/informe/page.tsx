"use client";

import { useState, useEffect } from "react";
import TopBar from "@/components/TopBar";
import {
  getEventos,
  getUso,
  clearMetricas,
  getSessionData,
  fechaLocal,
  Evento,
} from "@/lib/storage";
import { syncFromServer } from "@/lib/sync";

const JUEGOS: Record<string, string> = {
  wp: "📖 Leo y Busco",
  pw: "🔍 Miro y Busco",
  listen: "🦜 El Loro Dice",
  memo: "🃏 Memotest",
};

function fmtTiempo(seg: number): string {
  if (seg < 60) return `${seg} seg`;
  const min = Math.round(seg / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

function mediana(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function colorPct(p: number): string {
  return p >= 80 ? "#3dbf6e" : p >= 50 ? "#ff8a3d" : "#d63384";
}

export default function InformePage() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [uso, setUso] = useState<Record<string, number>>({});
  const [clearTimer, setClearTimer] = useState<NodeJS.Timeout | null>(null);
  const [fill, setFill] = useState(0);

  useEffect(() => {
    const s = getSessionData();
    (async () => {
      if (s) await syncFromServer(s.username);
      setEventos(getEventos());
      setUso(getUso());
    })();
  }, []);

  // --- Tiempo de uso ---
  const hoy = fechaLocal();
  const sumUso = (dias: number) => {
    let total = 0;
    for (let i = 0; i < dias; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      total += uso[fechaLocal(d)] || 0;
    }
    return total;
  };
  const usoHoy = uso[hoy] || 0;
  const usoSemana = sumUso(7);
  const usoMes = sumUso(30);

  // --- Por palabra (sin memotest: ahí el error puede ser de memoria, no de lectura) ---
  const lectura = eventos.filter((e) => e.juego !== "memo");
  const porPalabra = new Map<
    string,
    { rondas: number; primerOk: number; tiempos: number[]; ayudas: number }
  >();
  for (const e of lectura) {
    const p = porPalabra.get(e.palabra) || { rondas: 0, primerOk: 0, tiempos: [], ayudas: 0 };
    if (e.intento === 1) {
      p.rondas++;
      if (e.ok) p.primerOk++;
    }
    if (e.ok) p.tiempos.push(e.ms);
    if (e.ayuda && e.ok) p.ayudas++;
    porPalabra.set(e.palabra, p);
  }
  const filasPalabras = [...porPalabra.entries()]
    .filter(([, p]) => p.rondas > 0)
    .map(([palabra, p]) => ({
      palabra,
      pct: Math.round((p.primerOk / p.rondas) * 100),
      rondas: p.rondas,
      medianaSeg: mediana(p.tiempos) / 1000,
      ayudas: p.ayudas,
    }))
    .sort((a, b) => a.pct - b.pct);

  // --- Confusiones (eligió otra palabra) ---
  const confusiones = new Map<string, number>();
  for (const e of lectura) {
    if (!e.ok && e.elegida && e.elegida !== e.palabra) {
      const k = `${e.palabra}→${e.elegida}`;
      confusiones.set(k, (confusiones.get(k) || 0) + 1);
    }
  }
  const topConfusiones = [...confusiones.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  // --- Por juego (primer intento correcto) ---
  const porJuego = new Map<string, { rondas: number; ok: number }>();
  for (const e of eventos) {
    if (e.intento !== 1) continue;
    const j = porJuego.get(e.juego) || { rondas: 0, ok: 0 };
    j.rondas++;
    if (e.ok) j.ok++;
    porJuego.set(e.juego, j);
  }

  const startClear = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (clearTimer) return;
    setFill(100);
    const t = setTimeout(() => {
      clearMetricas();
      setEventos([]);
      setUso({});
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

  const card = "bg-white/80 rounded-[26px] p-5 shadow-[0_6px_0_rgba(0,0,0,0.12)] w-full";

  return (
    <>
      <TopBar backTo="/config" />
      <div className="flex-1 flex flex-col items-center w-full max-w-[520px] px-4 pt-[1vh] pb-8 gap-5">
        <h1 className="text-brand-dark text-[1.7rem] font-bold text-center">Informe</h1>

        {/* Tiempo de uso */}
        <div className={card}>
          <h2 className="text-brand-blue text-lg font-bold mb-3 text-center">⏱ Tiempo de uso</h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Hoy", usoHoy],
              ["7 días", usoSemana],
              ["30 días", usoMes],
            ].map(([label, seg]) => (
              <div key={label as string} className="bg-white rounded-xl p-3 shadow-sm">
                <div className="text-brand-dark font-bold text-[1.05rem]">
                  {fmtTiempo(seg as number)}
                </div>
                <div className="text-gray-500 text-xs font-bold uppercase tracking-wide mt-1">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Por palabra */}
        <div className={card}>
          <h2 className="text-brand-blue text-lg font-bold mb-1 text-center">📖 Por palabra</h2>
          <p className="text-gray-500 text-xs text-center mb-3">
            % correcto al primer intento · tiempo (mediana) hasta acertar · de peor a mejor
          </p>
          {filasPalabras.length === 0 ? (
            <div className="text-brand-blue text-center opacity-70 py-2">todavía no hay datos</div>
          ) : (
            <div className="flex flex-col gap-2">
              {filasPalabras.map((f) => (
                <div
                  key={f.palabra}
                  className="bg-white rounded-[14px] py-2 px-4 flex items-center justify-between shadow-sm"
                >
                  <b className="text-brand-dark text-[1.05rem]">{f.palabra}</b>
                  <div className="flex items-center gap-3 text-[0.95rem]">
                    <span className="font-bold" style={{ color: colorPct(f.pct) }}>
                      {f.pct}%
                    </span>
                    <span className="text-gray-500">{f.medianaSeg.toFixed(1)} s</span>
                    <span className="text-gray-400 text-xs">×{f.rondas}</span>
                    {f.ayudas > 0 && <span title="veces que necesitó ayuda">💡{f.ayudas}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Confusiones */}
        <div className={card}>
          <h2 className="text-brand-blue text-lg font-bold mb-1 text-center">🔀 Confusiones</h2>
          <p className="text-gray-500 text-xs text-center mb-3">
            qué eligió cuando se equivocó (las más repetidas)
          </p>
          {topConfusiones.length === 0 ? (
            <div className="text-brand-blue text-center opacity-70 py-2">sin confusiones registradas</div>
          ) : (
            <div className="flex flex-col gap-2">
              {topConfusiones.map(([par, n]) => {
                const [pal, eleg] = par.split("→");
                return (
                  <div
                    key={par}
                    className="bg-white rounded-[14px] py-2 px-4 flex items-center justify-between shadow-sm"
                  >
                    <span className="text-brand-dark">
                      <b>{pal}</b> → eligió <b className="text-brand-pink">{eleg}</b>
                    </span>
                    <span className="text-gray-500 font-bold">{n}×</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Por juego */}
        <div className={card}>
          <h2 className="text-brand-blue text-lg font-bold mb-3 text-center">🎮 Por juego</h2>
          {porJuego.size === 0 ? (
            <div className="text-brand-blue text-center opacity-70 py-2">todavía no hay datos</div>
          ) : (
            <div className="flex flex-col gap-2">
              {[...porJuego.entries()].map(([juego, j]) => {
                const pct = Math.round((j.ok / j.rondas) * 100);
                return (
                  <div
                    key={juego}
                    className="bg-white rounded-[14px] py-2 px-4 flex items-center justify-between shadow-sm"
                  >
                    <span className="text-brand-dark font-bold">{JUEGOS[juego] || juego}</span>
                    <span className="font-bold" style={{ color: colorPct(pct) }}>
                      {pct}% <span className="text-gray-400 font-normal text-xs">×{j.rondas}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

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
    </>
  );
}
