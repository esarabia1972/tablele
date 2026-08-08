"use client";

import { useState, useEffect, useRef } from "react";
import { getConfig, recordEvento, GOAL } from "@/lib/storage";
import { elegirPalabras } from "@/lib/seleccion";
import { PalabraDefault } from "@/data/palabras-default";
import { speak, sndGood, sndBad, sndWin } from "@/lib/audio";
import { silabasDe, esElegibleSilabas } from "@/lib/silabas";
import Visual from "@/components/Visual";
import SilabasGame from "@/components/SilabasGame";

const ROUNDS = 6;
const PRAISE = ['¡muy bien, manu!', '¡genial!', '¡excelente!', '¡sos un campeón!', '¡bravo!', '¡súper!'];

// Si no hay nombre configurado, los mensajes salen sin él
const withName = (msg: string, nombre: string) =>
  nombre ? msg.replace('manu', nombre.toLowerCase()) : msg.replace(', manu', '');

const RETRY = ['¡casi! probá otra vez', 'mmm... ¡intentá de nuevo!', '¡vos podés! otra vez'];

const shuffle = <T,>(a: T[]): T[] => {
  return a.map(x => [Math.random(), x] as const).sort((p, q) => p[0] - q[0]).map(p => p[1]);
};
const rand = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

interface GameEngineProps {
  mode: "show" | "wp" | "pw" | "memo" | "listen" | "silabas";
  nombre: string;
  score: number;
  onAddStars: (n: number) => void;
  onBackToMenu: () => void;
  onPlayAgain: () => void;
}

export default function GameEngine({ mode, nombre, score, onAddStars, onBackToMenu, onPlayAgain }: GameEngineProps) {
  const [words, setWords] = useState<PalabraDefault[]>([]);
  const [nivelPalabra, setNivelPalabra] = useState<"inicial" | "intermedio">("intermedio");
  // En nivel Inicial se muestra solo la primera letra (el audio sigue diciendo la palabra)
  const mostrar = (palabra: string) =>
    nivelPalabra === "inicial" ? palabra.charAt(0) : palabra;
  const [seq, setSeq] = useState<PalabraDefault[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Game state
  const [errs, setErrs] = useState(0);
  const [options, setOptions] = useState<PalabraDefault[]>([]);
  const [memoCards, setMemoCards] = useState<any[]>([]);
  const [memoOpen, setMemoOpen] = useState<number[]>([]);
  const [memoMatched, setMemoMatched] = useState(0);
  const [locked, setLocked] = useState(false);
  // Se incrementa cada vez que hay que rearmar el tablero de "Armo la palabra"
  // tras un error (misma ronda, sílabas mezcladas de nuevo).
  const [resetSignal, setResetSignal] = useState(0);

  // Visual state
  const [feedback, setFeedback] = useState("");
  const [buttonStates, setButtonStates] = useState<Record<string, "correct" | "wrong" | "dim" | "hint" | "">>(Object.create(null));
  const [confetti, setConfetti] = useState<{ id: string, emoji: string, left: string, dur: string, delay: string }[]>([]);
  const [finished, setFinished] = useState(false);
  const [prizeWon, setPrizeWon] = useState(false);

  // Momento en que apareció la ronda actual (para medir latencia de respuesta)
  const roundStartRef = useRef<number>(Date.now());
  // Opciones falsas ya elegidas por error en esta ronda (para no repetirlas)
  const wrongChoicesRef = useRef<string[]>([]);

  // Timers centralizados: se cancelan al salir del juego para que no
  // quede una palabra "hablando" después de volver al menú.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  };
  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  useEffect(() => {
    return () => {
      clearTimers();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        speechSynthesis.cancel();
      }
    };
  }, []);

  const initGame = () => {
    clearTimers();
    const config = getConfig();
    let activeWords = config.palabras.filter(w => w.usar);
    // "Armo la palabra" necesita palabras de más de una sílaba: con una sola
    // sílaba no hay nada para ordenar (ver override p.silabas o silabear()).
    // esElegibleSilabas() es la MISMA función que usan app/jugar y app/config
    // para decidir si mostrar el botón/advertencia (F6: antes cada lugar tenía
    // su propia versión del filtro y podían desincronizarse).
    if (mode === "silabas") {
      activeWords = activeWords.filter(esElegibleSilabas);
    }
    setWords(activeWords);
    setNivelPalabra(config.nivelPalabra === "inicial" ? "inicial" : "intermedio");

    if (activeWords.length === 0) return;

    if (mode === "memo") {
      const pick = elegirPalabras(activeWords, 6);
      const cards = shuffle(pick.flatMap(o => [
        { id: o.palabra, kind: 'emoji', show: o.emoji, foto: o.foto },
        { id: o.palabra, kind: 'word', show: o.palabra },
      ]));
      setMemoCards(cards);
      setMemoMatched(0);
      setMemoOpen([]);
    } else {
      // "Conocer" recorre TODAS las palabras activas (es presentación, no
      // ejercicio: no tiene sentido dejar palabras sin mostrar). El resto de
      // los juegos hace ROUNDS rondas con selección ponderada.
      const cuantas = mode === "show" ? activeWords.length : ROUNDS;
      const selectedSeq = elegirPalabras(activeWords, cuantas);
      setSeq(selectedSeq);
      setCurrentIndex(0);
      setupRound(0, selectedSeq, activeWords);
    }

    setFinished(false);
    setPrizeWon(false);
    setConfetti([]);
  };

  useEffect(() => {
    initGame();
  }, [mode]);

  const setupRound = (idx: number, sequence: PalabraDefault[], allWords: PalabraDefault[]) => {
    // En "Conocer" el largo es la cantidad de palabras activas, no ROUNDS
    const total = mode === "show" ? sequence.length : Math.min(sequence.length, ROUNDS);
    if (idx >= total) {
      handleCelebrate();
      return;
    }
    const target = sequence[idx];
    // "Armo la palabra" no usa opciones múltiples: se arma con arrastre en SilabasGame
    if (mode !== "silabas") {
      const others = shuffle(allWords.filter(x => x.palabra !== target.palabra)).slice(0, 2);
      setOptions(shuffle([target, ...others]));
    } else {
      setOptions([]);
    }
    setErrs(0);
    setButtonStates({});
    setFeedback("");
    setLocked(false);
    roundStartRef.current = Date.now();
    wrongChoicesRef.current = [];

    if (mode === "show" || mode === "listen" || mode === "silabas") {
      later(() => speak(target.palabra), 400);
    }
  };

  // Al terminar un juego completo se gana UNA estrella
  // ("Conocer" no da estrella: es solo para mirar las palabras).
  // Si con esa estrella llega a la meta, va directo a la pantalla de premio.
  const handleCelebrate = () => {
    setFinished(true);
    if (mode === "show") {
      sndWin();
      spawnConfetti(40);
      speak(`¡Felicitaciones${nombre ? `, ${nombre}` : ""}! ¡Terminaste!`);
      return;
    }
    onAddStars(1);
    sndWin();
    spawnConfetti(40);
    if (score + 1 >= GOAL) {
      setPrizeWon(true);
      later(() => spawnConfetti(40), 800);
      later(() => spawnConfetti(40), 1600);
      speak(`¡Cinco estrellas! ¡Te ganaste un premio${nombre ? `, ${nombre}` : ""}!`);
    } else {
      speak(`¡Felicitaciones${nombre ? `, ${nombre}` : ""}! ¡Ganaste una estrella!`);
    }
  };

  const spawnConfetti = (count: number) => {
    const em = ['🎉', '⭐', '🎊', '✨', '🌟'];
    const newConfetti = Array.from({ length: count }).map((_, i) => ({
      id: Math.random().toString(36).substr(2, 9) + i,
      emoji: rand(em),
      left: Math.random() * 100 + 'vw',
      dur: (2 + Math.random() * 2) + 's',
      delay: (Math.random() * 0.8) + 's'
    }));
    setConfetti(prev => [...prev, ...newConfetti]);
    later(() => setConfetti([]), 5000);
  };

  const handleAnswer = (chosenOption: PalabraDefault) => {
    if (locked) return;
    const target = seq[currentIndex];
    const ok = chosenOption.palabra === target.palabra;

    recordEvento({
      t: Date.now(),
      juego: mode,
      palabra: target.palabra,
      elegida: chosenOption.palabra,
      ok,
      intento: errs + 1,
      ms: Date.now() - roundStartRef.current,
      ayuda: errs >= 2,
    });

    if (ok) {
      setLocked(true);
      setButtonStates(prev => ({ ...prev, [chosenOption.palabra]: "correct" }));
      sndGood();

      const praiseMsg = withName(rand(PRAISE), nombre);
      setFeedback(`✅ ${praiseMsg}`);
      speak(praiseMsg);

      later(() => {
        setCurrentIndex(c => c + 1);
        setupRound(currentIndex + 1, seq, words);
      }, 1400);
    } else {
      // Bloquear los clicks hasta que termine el feedback (evita que pruebe apurado)
      setLocked(true);
      setButtonStates(prev => ({ ...prev, [chosenOption.palabra]: "wrong" }));
      sndBad();
      const retryMsg = rand(RETRY);
      setFeedback(`💪 ${retryMsg}`);
      later(() => speak(retryMsg), 350);

      wrongChoicesRef.current.push(chosenOption.palabra);
      const newErrs = errs + 1;
      setErrs(newErrs);

      // Mantener la correcta pero renovar las opciones falsas y mezclar el orden,
      // así no puede resolver por descarte probando una por una.
      later(() => {
        const evitar = new Set([target.palabra, ...wrongChoicesRef.current]);
        let pool = words.filter(x => !evitar.has(x.palabra));
        if (pool.length < 2) pool = words.filter(x => x.palabra !== target.palabra);
        const others = shuffle(pool).slice(0, 2);
        setOptions(shuffle([target, ...others]));
        setButtonStates(newErrs >= 2 ? { [target.palabra]: "hint" } : {});
        setFeedback("");
        setLocked(false);
        // En El Loro Dice, repetir la palabra para retomar la consigna
        if (mode === "listen") {
          later(() => speak(target.palabra), 300);
        }
      }, 1800);
    }
  };

  // Análoga a handleAnswer, pero para el arrastre de sílabas: SilabasGame ya
  // entrega el orden armado (sin botón confirmar), acá solo se valida y se
  // registra el evento igual que en los demás juegos de lectura.
  const handleSilabasSubmit = (orden: string[]) => {
    if (locked) return;
    const target = seq[currentIndex];
    // Si cargaron un override manual de sílabas (>=2), se usa ese; si no, silabear().
    const correctas = silabasDe(target);
    const ok = orden.length === correctas.length && orden.every((s, i) => s === correctas[i]);

    recordEvento({
      t: Date.now(),
      juego: "silabas",
      palabra: target.palabra,
      elegida: orden.join("-"),
      ok,
      intento: errs + 1,
      ms: Date.now() - roundStartRef.current,
      ayuda: errs >= 2,
    });

    setLocked(true);

    if (ok) {
      sndGood();
      const praiseMsg = withName(rand(PRAISE), nombre);
      setFeedback(`✅ ${praiseMsg}`);
      speak(praiseMsg);

      later(() => {
        setCurrentIndex(c => c + 1);
        setupRound(currentIndex + 1, seq, words);
      }, 1400);
    } else {
      sndBad();
      const retryMsg = rand(RETRY);
      setFeedback(`💪 ${retryMsg}`);
      later(() => speak(retryMsg), 350);

      const newErrs = errs + 1;
      setErrs(newErrs);

      // Tras el feedback, se rearma el tablero (SilabasGame mezcla de nuevo al
      // detectar el cambio en resetSignal) y se desbloquea la interacción.
      later(() => {
        setResetSignal(n => n + 1);
        setFeedback("");
        setLocked(false);
      }, 1800);
    }
  };

  const handleMemoClick = (idx: number) => {
    if (locked || memoCards[idx].flipped || memoOpen.includes(idx)) return;

    // No decir la palabra al dar vuelta cartas: el niño tiene que leerla
    const newOpen = [...memoOpen, idx];
    setMemoOpen(newOpen);

    if (newOpen.length === 2) {
      setLocked(true);
      const [idxA, idxB] = newOpen;
      const a = memoCards[idxA];
      const b = memoCards[idxB];

      recordEvento({
        t: Date.now(),
        juego: "memo",
        palabra: a.id,
        elegida: b.id,
        ok: a.id === b.id && a.kind !== b.kind,
        intento: 1,
        ms: 0,
        ayuda: false,
      });

      if (a.id === b.id && a.kind !== b.kind) {
        setMemoCards(prev => {
          const newCards = [...prev];
          newCards[idxA] = { ...newCards[idxA], matched: true };
          newCards[idxB] = { ...newCards[idxB], matched: true };
          return newCards;
        });
        sndGood();
        const praiseMsg = withName(rand(PRAISE), nombre);
        setFeedback(`✅ ${praiseMsg}`);
        speak(praiseMsg);

        later(() => {
          setMemoMatched(m => {
            const newM = m + 1;
            if (newM === 6) later(handleCelebrate, 900);
            return newM;
          });
          setMemoOpen([]);
          setLocked(false);
        }, 1400);
      } else {
        sndBad();
        const retryMsg = rand(RETRY);
        setFeedback(`💪 ${retryMsg}`);
        later(() => speak(retryMsg), 350);
        later(() => {
          setMemoOpen([]);
          setLocked(false);
        }, 1100);
      }
    }
  };

  if (mode === "silabas" && words.length < 2) {
    return (
      <div className="p-8 text-center text-xl text-brand-dark font-bold">
        No hay suficientes palabras de más de una sílaba activadas.
      </div>
    );
  }
  if (words.length === 0) return <div className="p-8 text-center text-xl text-brand-dark font-bold">No hay palabras activas en la configuración.</div>;

  if (prizeWon) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-[520px] text-center mt-8">
        <div className="text-[5rem] animate-bounce-short">🎁</div>
        <h1 className="text-brand-dark text-[2.2rem] mb-2 drop-shadow-[2px_2px_0_#fff] font-bold">¡{GOAL} estrellas!</h1>
        <div className="text-[3rem] my-3">{"⭐".repeat(GOAL)}</div>
        <div className="text-brand-blue text-[1.5rem] mb-5">
          <b>¡te ganaste un premio{nombre ? `, ${nombre.toLowerCase()}` : ""}!</b><br/>andá a buscarlo 😄
        </div>
        <button className="bg-brand-green text-white border-none rounded-[22px] p-5 text-[1.35rem] font-bold cursor-pointer shadow-[0_5px_0_rgba(0,0,0,0.18)] active:translate-y-1 active:shadow-none w-full max-w-[300px]" onClick={() => { onAddStars(-GOAL); onBackToMenu(); }}>
          🔁 empezar otra vez
        </button>
        {confetti.map(c => (
          <div key={c.id} className="fixed -top-5 text-[1.6rem] z-50 pointer-events-none animate-fall" style={{ left: c.left, animationDuration: c.dur, animationDelay: c.delay }}>{c.emoji}</div>
        ))}
      </div>
    );
  }

  if (finished) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-[520px] text-center mt-8">
        <div className="text-[5rem] animate-bounce-short">🏆</div>
        <h1 className="text-brand-dark text-[2.2rem] mb-2 drop-shadow-[2px_2px_0_#fff] font-bold">¡lo lograste{nombre ? `, ${nombre.toLowerCase()}` : ""}!</h1>
        {mode !== "show" ? (
          <>
            <div className="text-brand-blue text-[1.4rem] mt-2 mb-1 font-bold">¡ganaste una estrella!</div>
            <div className="text-[2.4rem] my-3 tracking-[6px]">
              {Array.from({ length: GOAL }).map((_, i) => (
                <span key={i} className={i < score ? "" : "opacity-25 grayscale"}>⭐</span>
              ))}
            </div>
            <div className="text-brand-blue text-[1.15rem] mb-5">
              {GOAL - score > 0
                ? <>te falta{GOAL - score > 1 ? "n" : ""} <b>{GOAL - score}</b> para el premio</>
                : null}
            </div>
          </>
        ) : (
          <div className="text-[3rem] my-3">🎉</div>
        )}
        <div className="flex flex-col gap-4 w-full max-w-[300px]">
          <button className="bg-brand-green text-white border-none rounded-[22px] p-5 text-[1.35rem] font-bold cursor-pointer shadow-[0_5px_0_rgba(0,0,0,0.18)] active:translate-y-1 active:shadow-none w-full" onClick={initGame}>
            🔁 jugar otra vez
          </button>
          <button className="bg-brand-purple text-white border-none rounded-[22px] p-5 text-[1.35rem] font-bold cursor-pointer shadow-[0_5px_0_rgba(0,0,0,0.18)] active:translate-y-1 active:shadow-none w-full" onClick={onBackToMenu}>
            🏠 elegir otro juego
          </button>
        </div>
        {confetti.map(c => (
          <div key={c.id} className="fixed -top-5 text-[1.6rem] z-50 pointer-events-none animate-fall" style={{ left: c.left, animationDuration: c.dur, animationDelay: c.delay }}>{c.emoji}</div>
        ))}
      </div>
    );
  }

  const titleMap = {
    show: "👀 conocer las palabras",
    wp: "📖 leo y busco el dibujo",
    pw: "🔍 miro y busco la palabra",
    memo: "🃏 buscá la palabra y su dibujo",
    listen: "🦜 el loro dice...",
    silabas: "🧩 armo la palabra"
  };

  const target = seq[currentIndex];

  // "Conocer" recorre todas las palabras activas; el resto hace ROUNDS rondas
  const totalRondas = mode === "show" ? seq.length : ROUNDS;

  const header = (
    <div className="w-full flex flex-col items-center mb-[14px]">
      <div className="text-brand-blue text-[clamp(0.95rem,3.6vw,1.15rem)] text-center mb-1 whitespace-nowrap">
        {titleMap[mode]} {mode !== "memo" && `— ${currentIndex + 1} de ${totalRondas}`}
      </div>
      {mode !== "memo" && (
        <div className="w-full max-w-[520px] h-[22px] bg-white/60 rounded-full overflow-hidden mt-1.5">
          <div className="h-full rounded-full bg-gradient-to-r from-[#ffd23f] to-[#ff8a3d] transition-all duration-400" style={{ width: `${totalRondas ? (currentIndex / totalRondas) * 100 : 0}%` }}></div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col items-center w-full mt-2">
      {header}

      {/* Show Mode (Conocer) */}
      {mode === "show" && target && (
        <>
          {/* Conocer: SOLO la palabra escrita, sin imagen. La idea es que asocie
              la forma escrita con el sonido (lectura global), sin que el dibujo
              le resuelva la palabra antes de mirarla. */}
          <div className="bg-white rounded-[26px] p-[40px_30px] text-center shadow-[0_6px_0_rgba(0,0,0,0.12)] mb-[22px] min-w-[min(90%,420px)] cursor-pointer" onClick={() => speak(target.palabra)}>
            <div className="text-[clamp(3rem,11vw,5rem)] font-bold text-brand-pink tracking-[2px]">{mostrar(target.palabra)}</div>
            <div className="text-[1rem] text-[#888] mt-3">🔊 tocá la tarjeta para escucharla otra vez</div>
          </div>
          <button className="bg-brand-green text-white border-none rounded-[22px] p-[16px] text-[1.5rem] font-bold cursor-pointer shadow-[0_5px_0_rgba(0,0,0,0.18)] active:translate-y-1 active:shadow-none w-full max-w-[260px]" onClick={() => {
            setCurrentIndex(c => c + 1);
            setupRound(currentIndex + 1, seq, words);
          }}>
            Próximo
          </button>
        </>
      )}

      {/* Mode WP: Word -> Picture */}
      {mode === "wp" && target && (
        <>
          <div className="bg-white rounded-[26px] p-[22px_30px] text-center shadow-[0_6px_0_rgba(0,0,0,0.12)] mb-[22px] min-w-[min(90%,420px)] cursor-pointer pointer-events-none">
            {/* SPEC rule 7.2: NO audio on tap for word in wp */}
            <div className="text-[clamp(2.6rem,9vw,4rem)] font-bold text-brand-pink tracking-[2px]">{mostrar(target.palabra)}</div>
            {/* REMOVED hint text "tocá la palabra para escucharla" */}
          </div>
          <div className="grid grid-cols-3 gap-[22px] w-full max-w-[600px] px-2">
            {options.map(o => (
              <button
                key={o.palabra}
                onClick={() => handleAnswer(o)}
                className={`bg-white border-none rounded-[22px] p-[10px_8px] cursor-pointer shadow-[0_5px_0_rgba(0,0,0,0.14)] font-inherit transition-transform active:translate-y-1 active:shadow-none
                  ${buttonStates[o.palabra] === 'correct' ? 'bg-brand-green text-white animate-pop' : ''}
                  ${buttonStates[o.palabra] === 'wrong' ? 'bg-[#ffe0e0] animate-shake' : ''}
                  ${buttonStates[o.palabra] === 'dim' ? 'opacity-35 pointer-events-none' : ''}
                  ${buttonStates[o.palabra] === 'hint' ? 'animate-glow' : ''}
                `}
              >
                <Visual p={o} size="opcion" />
              </button>
            ))}
          </div>
          <div className="min-h-[2.2rem] text-[1.4rem] font-bold text-brand-dark mt-[16px] text-center">{feedback}</div>
        </>
      )}

      {/* Mode PW: Picture -> Word */}
      {mode === "pw" && target && (
        <>
          <div className="bg-white rounded-[26px] p-[22px_30px] text-center shadow-[0_6px_0_rgba(0,0,0,0.12)] mb-[22px] min-w-[min(90%,420px)] cursor-pointer pointer-events-none">
             {/* SPEC rule 7.2: NO audio on tap for picture in pw */}
            <div className="leading-[1.1]"><Visual p={target} size="grande" /></div>
          </div>
          <div className="grid grid-cols-1 gap-[24px] w-full max-w-[420px]">
            {options.map(o => (
              <button
                key={o.palabra}
                onClick={() => handleAnswer(o)}
                className={`bg-white border-none rounded-[22px] p-[18px] text-[clamp(1.7rem,6vw,2.3rem)] font-bold text-brand-dark tracking-[2px] cursor-pointer shadow-[0_5px_0_rgba(0,0,0,0.14)] font-inherit transition-transform active:translate-y-1 active:shadow-none
                  ${buttonStates[o.palabra] === 'correct' ? 'bg-brand-green text-white animate-pop' : ''}
                  ${buttonStates[o.palabra] === 'wrong' ? 'bg-[#ffe0e0] animate-shake' : ''}
                  ${buttonStates[o.palabra] === 'dim' ? 'opacity-35 pointer-events-none' : ''}
                  ${buttonStates[o.palabra] === 'hint' ? 'animate-glow' : ''}
                `}
              >
                {mostrar(o.palabra)}
              </button>
            ))}
          </div>
          <div className="min-h-[2.2rem] text-[1.4rem] font-bold text-brand-dark mt-[16px] text-center">{feedback}</div>
        </>
      )}

      {/* Mode Listen: Loro dice */}
      {mode === "listen" && target && (
        <>
          <div className="bg-white rounded-[26px] p-[22px_30px] text-center shadow-[0_6px_0_rgba(0,0,0,0.12)] mb-[22px] min-w-[min(90%,420px)] cursor-pointer" onClick={() => speak(target.palabra)}>
            <div className="text-[clamp(4rem,16vw,6.5rem)] leading-[1.1]">🦜</div>
            <div className="text-[1rem] text-[#888] mt-1.5">🔊 tocá al loro para escuchar la palabra otra vez</div>
          </div>
          <div className="grid grid-cols-1 gap-[24px] w-full max-w-[420px]">
            {options.map(o => (
              <button
                key={o.palabra}
                onClick={() => handleAnswer(o)}
                className={`bg-white border-none rounded-[22px] p-[18px] text-[clamp(1.7rem,6vw,2.3rem)] font-bold text-brand-dark tracking-[2px] cursor-pointer shadow-[0_5px_0_rgba(0,0,0,0.14)] font-inherit transition-transform active:translate-y-1 active:shadow-none
                  ${buttonStates[o.palabra] === 'correct' ? 'bg-brand-green text-white animate-pop' : ''}
                  ${buttonStates[o.palabra] === 'wrong' ? 'bg-[#ffe0e0] animate-shake' : ''}
                  ${buttonStates[o.palabra] === 'dim' ? 'opacity-35 pointer-events-none' : ''}
                  ${buttonStates[o.palabra] === 'hint' ? 'animate-glow' : ''}
                `}
              >
                {mostrar(o.palabra)}
              </button>
            ))}
          </div>
          <div className="min-h-[2.2rem] text-[1.4rem] font-bold text-brand-dark mt-[16px] text-center">{feedback}</div>
        </>
      )}

      {/* Mode Silabas: Armo la Palabra */}
      {mode === "silabas" && target && (
        <>
          {/* Tarjeta más compacta que en los otros juegos: acá abajo van dos
              bandejas de sílabas, y con el padding normal había que scrollear
              en pantallas chicas para llegar a tocarlas. */}
          <div className="bg-white rounded-[26px] p-[14px_24px] text-center shadow-[0_6px_0_rgba(0,0,0,0.12)] mb-[14px] min-w-[min(90%,420px)] cursor-pointer" onClick={() => speak(target.palabra)}>
            <div className="leading-[1.1] [&>span]:text-[clamp(3rem,11vw,4.5rem)] [&>img]:h-[clamp(5rem,20vw,8rem)]"><Visual p={target} size="grande" /></div>
            {/* F1: acá SIEMPRE se muestra la palabra completa (NO se usa mostrar(),
                que en nivel "inicial" recorta a la primera letra). El niño necesita
                el modelo completo por escrito para poder copiarlo ordenando las
                sílabas: sin eso el juego deja de ser lectoescritura y pasa a ser
                memoria auditiva pura, mucho más difícil para el público objetivo. */}
            <div className="text-[clamp(2.2rem,8vw,3.2rem)] font-bold text-brand-pink tracking-[2px]">{target.palabra}</div>
            <div className="text-[0.85rem] text-[#888] mt-1">🔊 tocá la tarjeta para escucharla otra vez</div>
          </div>
          <SilabasGame
            key={target.palabra}
            target={target}
            correctas={silabasDe(target)}
            locked={locked}
            hint={errs >= 2}
            resetSignal={resetSignal}
            onSubmit={handleSilabasSubmit}
          />
          <div className="min-h-[2.2rem] text-[1.4rem] font-bold text-brand-dark mt-[16px] text-center">{feedback}</div>
        </>
      )}

      {/* Mode Memo: Memotest */}
      {mode === "memo" && (
        <>
          <div className="grid grid-cols-4 gap-[12px] w-full max-w-[500px] px-1">
            {memoCards.map((c, idx) => {
              const isOpen = memoOpen.includes(idx);
              const isMatched = memoMatched > 0 && !memoOpen.includes(idx) && false; // We track match via class? Wait, we can track matched indices!
              // For simplicity, once matched they stay flipped and get a styling change.
              // Let's compute if it's matched:
              // Actually we need to track matched pairs or indices.
              // Let's add matched property to the card object itself in memoCards array!
              return (
                <div key={idx} className={`aspect-[3/3.8] [perspective:600px] cursor-pointer ${isOpen || c.matched ? '[&>div]:[transform:rotateY(180deg)]' : ''}`} onClick={() => handleMemoClick(idx)}>
                  <div className="w-full h-full relative [transform-style:preserve-3d] transition-transform duration-400">
                    <div className="absolute inset-0 [backface-visibility:hidden] rounded-[16px] flex items-center justify-center text-center shadow-[0_4px_0_rgba(0,0,0,0.14)] p-1 bg-gradient-to-br from-[#4d9de0] to-[#7ec8ff] text-[2rem]">
                      ❓
                    </div>
                    <div className={`absolute inset-0 [backface-visibility:hidden] rounded-[16px] flex items-center justify-center text-center shadow-[0_4px_0_rgba(0,0,0,0.14)] p-1 [transform:rotateY(180deg)] ${c.matched ? 'bg-[#d2f5df] outline outline-3 outline-[#3dbf6e]' : 'bg-white'}`}>
                      {c.kind === 'emoji' ? (
                        c.foto ? (
                          <img src={c.foto} alt="" draggable={false} className="absolute inset-0 w-full h-full rounded-[16px] object-cover" />
                        ) : (
                          <span className="text-[clamp(1.8rem,7vw,2.4rem)]">{c.show}</span>
                        )
                      ) : (
                        <span className={`font-bold text-brand-pink tracking-[1px] break-all ${nivelPalabra === "inicial" ? "text-[clamp(1.6rem,6vw,2.2rem)]" : "text-[clamp(0.8rem,3vw,1.15rem)]"}`}>{mostrar(c.show)}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="min-h-[2.2rem] text-[1.4rem] font-bold text-brand-dark mt-[16px] text-center">{feedback}</div>
        </>
      )}

      {/* Ensure confetti renders correctly for modes */}
      {confetti.map(c => (
        <div key={c.id} className="fixed -top-5 text-[1.6rem] z-50 pointer-events-none animate-fall" style={{ left: c.left, animationDuration: c.dur, animationDelay: c.delay }}>{c.emoji}</div>
      ))}
    </div>
  );
}
