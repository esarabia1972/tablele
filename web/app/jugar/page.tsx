"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSessionData, getStars, setStars, getConfig, addUso } from "@/lib/storage";
import { syncFromServer } from "@/lib/sync";
import TopBar from "@/components/TopBar";
import GameEngine from "@/components/GameEngine";

export default function JugarPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ username: string; nombre: string } | null>(null);
  const [score, setScore] = useState(0);
  const [view, setView] = useState<"menu" | "game">("menu");
  const [gameMode, setGameMode] = useState<"show" | "wp" | "pw" | "memo" | "listen">("show");

  useEffect(() => {
    const s = getSessionData();
    if (!s) {
      router.replace("/");
      return;
    }
    (async () => {
      await syncFromServer(s.username);
      // El nombre del niño/a se define en Configuración (puede estar vacío)
      const nombre = getConfig().nombre?.trim() || "";
      setSession({ username: s.username, nombre });
      setScore(getStars());
    })();
  }, [router]);

  // Tiempo de uso: suma 15 s por tick mientras la app está visible
  useEffect(() => {
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") addUso(15);
    }, 15000);
    return () => clearInterval(iv);
  }, []);

  const addStars = (n: number) => {
    const newScore = Math.min(score + n, 20);
    setScore(newScore);
    setStars(newScore);
  };

  if (!session) return null;

  return (
    <>
      <TopBar
        score={score}
        configTo={view === "menu" ? "/config" : undefined}
      />
      
      {view === "menu" && (
        <div className="flex-1 flex flex-col items-center w-full max-w-[600px] mt-[4vh]">
          <div className="grid grid-cols-2 gap-[22px] w-full px-4">
            <button 
              className="col-span-2 bg-[#4d9de0] text-white border-none rounded-[32px] text-[5rem] p-[30px_0] cursor-pointer shadow-[0_5px_0_rgba(0,0,0,0.18)] transition-transform active:translate-y-1 active:shadow-none flex flex-col items-center justify-center leading-none"
              onClick={() => { setGameMode("show"); setView("game"); }}
            >
              👀
              <span className="text-2xl mt-2 font-bold">Conocer</span>
            </button>
            <button 
              className="bg-brand-orange text-white border-none rounded-[32px] text-[4rem] p-[30px_0] cursor-pointer shadow-[0_5px_0_rgba(0,0,0,0.18)] transition-transform active:translate-y-1 active:shadow-none flex flex-col items-center justify-center leading-none"
              onClick={() => { setGameMode("wp"); setView("game"); }}
            >
              📖
              <span className="text-xl mt-2 font-bold">Leo y Busco</span>
            </button>
            <button 
              className="bg-brand-green text-white border-none rounded-[32px] text-[4rem] p-[30px_0] cursor-pointer shadow-[0_5px_0_rgba(0,0,0,0.18)] transition-transform active:translate-y-1 active:shadow-none flex flex-col items-center justify-center leading-none"
              onClick={() => { setGameMode("pw"); setView("game"); }}
            >
              🔍
              <span className="text-xl mt-2 font-bold">Miro y Busco</span>
            </button>
            <button 
              className="bg-brand-purple text-white border-none rounded-[32px] text-[4rem] p-[30px_0] cursor-pointer shadow-[0_5px_0_rgba(0,0,0,0.18)] transition-transform active:translate-y-1 active:shadow-none flex flex-col items-center justify-center leading-none"
              onClick={() => { setGameMode("memo"); setView("game"); }}
            >
              🃏
              <span className="text-xl mt-2 font-bold">Memotest</span>
            </button>
            <button 
              className="bg-[#e0508e] text-white border-none rounded-[32px] text-[4rem] p-[30px_0] cursor-pointer shadow-[0_5px_0_rgba(0,0,0,0.18)] transition-transform active:translate-y-1 active:shadow-none flex flex-col items-center justify-center leading-none"
              onClick={() => { setGameMode("listen"); setView("game"); }}
            >
              🦜
              <span className="text-xl mt-2 font-bold">El Loro Dice</span>
            </button>
          </div>
        </div>
      )}

      {view === "game" && (
        <>
          <GameEngine
            mode={gameMode}
            nombre={session.nombre}
            score={score}
            onAddStars={addStars}
            onBackToMenu={() => setView("menu")}
            onPlayAgain={() => {}}
          />
          <div className="h-20 shrink-0 w-full" aria-hidden></div>
          <button
            onClick={() => setView("menu")}
            className="fixed left-1/2 -translate-x-1/2 z-40 bg-white/90 text-brand-blue font-bold py-2 px-8 rounded-full shadow-[0_3px_0_rgba(0,0,0,0.15)] active:translate-y-1 transition-all text-lg"
            style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            ⬅ Volver
          </button>
        </>
      )}
    </>
  );
}
