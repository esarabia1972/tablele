"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSessionData, getStars, setStars, getConfig, addUso, expirarEstrellas, esNivelSilabica, migrarLegacy, migrarACuentas, GOAL } from "@/lib/storage";
import { syncFromServer } from "@/lib/sync";
import { esElegibleSilabas } from "@/lib/silabas";
import TopBar from "@/components/TopBar";
import GameEngine from "@/components/GameEngine";

// Botones del menú: alto y tipografía atados a la altura de pantalla para que
// las 4 filas entren sin scroll incluso en un celular chico.
const BTN =
  "text-white border-none rounded-[32px] p-[clamp(10px,2vh,28px)_0] cursor-pointer shadow-[0_5px_0_rgba(0,0,0,0.18)] transition-transform active:translate-y-1 active:shadow-none flex flex-col items-center justify-center leading-none";
const EMOJI = "text-[clamp(2.2rem,7vh,4rem)] leading-none";
const LABEL = "text-[clamp(1rem,2.2vh,1.5rem)] mt-[clamp(4px,0.8vh,10px)] font-bold";

// Etapa Silábica activa Y con al menos 2 palabras de más de una sílaba habilitadas.
// F6: esElegibleSilabas() es la misma función que usan GameEngine y app/config,
// así el override manual de p.silabas se respeta igual en los tres lugares.
function calcularMostrarSilabas(): boolean {
  const config = getConfig();
  if (!esNivelSilabica(config.nivel)) return false;
  const elegibles = config.palabras.filter((p) => p.usar && esElegibleSilabas(p));
  return elegibles.length >= 2;
}

export default function JugarPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ username: string; nombre: string } | null>(null);
  const [score, setScore] = useState(0);
  const [view, setView] = useState<"menu" | "game">("menu");
  const [gameMode, setGameMode] = useState<"show" | "wp" | "pw" | "memo" | "listen" | "silabas">("show");
  // No es state: getConfig() es una lectura síncrona de localStorage (barata),
  // así que se recalcula en cada render en vez de duplicarla en un useState+effect
  // (evita también el warning de "setState síncrono dentro de un efecto").
  // Esto ya cubre "al volver al menú" y "cambiar de pestaña": cualquier
  // re-render del componente (session, score, view) vuelve a leerla.
  const mostrarSilabas = session ? calcularMostrarSilabas() : false;

  useEffect(() => {
    const s = getSessionData();
    if (!s) {
      router.replace("/");
      return;
    }
    (async () => {
      // Al actualizar desde la versión sin usuarios queda una sesión ya abierta:
      // las claves compartidas se adoptan para ESE chico, que es de quien son,
      // y no para el que entre después. Corre una sola vez por dispositivo.
      migrarLegacy(s.username);
      // Y de ahí al esquema por cuenta. El par ya está verificado contra el
      // servidor (venimos de un acceso exitoso), así que no puede asignarle
      // los datos de un chico a la cuenta equivocada.
      migrarACuentas(s.accountId, s.username);
      await syncFromServer(s.accountId, s.username);
      // Partida a medias con más de 1 h sin jugar: arranca de cero
      expirarEstrellas();
      // El nombre del niño/a se define en Configuración (puede estar vacío)
      const nombre = getConfig().nombre?.trim() || "";
      setSession({ username: s.username, nombre });
      setScore(getStars());
    })();
  }, [router]);

  // Si la app quedó abierta y vuelven después de 1 h, resetear la partida
  // (solo en el menú, para no cortar un juego en curso)
  useEffect(() => {
    if (view !== "menu") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        expirarEstrellas();
        setScore(getStars());
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [view]);

  // Tiempo de uso: suma 15 s por tick mientras la app está visible
  useEffect(() => {
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") addUso(15);
    }, 15000);
    return () => clearInterval(iv);
  }, []);

  const addStars = (n: number) => {
    const newScore = Math.max(0, Math.min(score + n, GOAL));
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
        <div className="flex-1 flex flex-col items-center w-full max-w-[600px] mt-[2vh]">
          {/* Todo el menú tiene que entrar SIN scroll, también en un teléfono
              con el juego de sílabas activo (6 botones = 4 filas). Por eso los
              tamaños son relativos a la altura de pantalla (vh) con clamp:
              en una tablet se ven grandes y en un celular se comprimen solos. */}
          <div className="grid grid-cols-2 gap-[clamp(10px,1.6vh,22px)] w-full px-4">
            <button
              className={`col-span-2 bg-[#4d9de0] ${BTN}`}
              onClick={() => { setGameMode("show"); setView("game"); }}
            >
              <span className={EMOJI}>👀</span>
              <span className={LABEL}>Conocer</span>
            </button>
            <button
              className={`bg-brand-orange ${BTN}`}
              onClick={() => { setGameMode("wp"); setView("game"); }}
            >
              <span className={EMOJI}>📖</span>
              <span className={LABEL}>Leo y Busco</span>
            </button>
            <button
              className={`bg-brand-green ${BTN}`}
              onClick={() => { setGameMode("pw"); setView("game"); }}
            >
              <span className={EMOJI}>🔍</span>
              <span className={LABEL}>Miro y Busco</span>
            </button>
            <button
              className={`bg-brand-purple ${BTN}`}
              onClick={() => { setGameMode("memo"); setView("game"); }}
            >
              <span className={EMOJI}>🃏</span>
              <span className={LABEL}>Memotest</span>
            </button>
            <button
              className={`bg-[#e0508e] ${BTN}`}
              onClick={() => { setGameMode("listen"); setView("game"); }}
            >
              <span className={EMOJI}>🦜</span>
              <span className={LABEL}>El Loro Dice</span>
            </button>
            {mostrarSilabas && (
              // F3: col-span-2 (igual que "Conocer"). Con 5 botones (impar) uno
              // quedaba solo y angosto, dejando un hueco vacío al lado.
              <button
                className={`col-span-2 bg-[#2bb3a3] ${BTN}`}
                onClick={() => { setGameMode("silabas"); setView("game"); }}
              >
                <span className={EMOJI}>🧩</span>
                <span className={LABEL}>Armo la Palabra</span>
              </button>
            )}
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
