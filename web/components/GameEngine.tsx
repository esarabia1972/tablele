"use client";

import { useState, useEffect, useRef } from "react";
import { getConfig, recordEvento } from "@/lib/storage";
import { PalabraDefault } from "@/data/palabras-default";
import { speak, sndGood, sndBad, sndWin } from "@/lib/audio";

const ROUNDS = 12;
const GOAL = 20;
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
  mode: "show" | "wp" | "pw" | "memo" | "listen";
  nombre: string;
  score: number;
  onAddStars: (n: number) => void;
  onBackToMenu: () => void;
  onPlayAgain: () => void;
}

export default function GameEngine({ mode, nombre, score, onAddStars, onBackToMenu, onPlayAgain }: GameEngineProps) {
  const [words, setWords] = useState<PalabraDefault[]>([]);
  const [seq, setSeq] = useState<PalabraDefault[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Game state
  const [errs, setErrs] = useState(0);
  const [options, setOptions] = useState<PalabraDefault[]>([]);
  const [memoCards, setMemoCards] = useState<any[]>([]);
  const [memoOpen, setMemoOpen] = useState<number[]>([]);
  const [memoMatched, setMemoMatched] = useState(0);
  const [locked, setLocked] = useState(false);
  
  // Visual state
  const [feedback, setFeedback] = useState("");
  const [buttonStates, setButtonStates] = useState<Record<string, "correct" | "wrong" | "dim" | "hint" | "">>(Object.create(null));
  const [confetti, setConfetti] = useState<{ id: string, emoji: string, left: string, dur: string, delay: string }[]>([]);
  const [finished, setFinished] = useState(false);
  const [prizeWon, setPrizeWon] = useState(false);

  // Momento en que apareció la ronda actual (para medir latencia de respuesta)
  const roundStartRef = useRef<number>(Date.now());

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
    const activeWords = config.palabras.filter(w => w.usar);
    setWords(activeWords);
    
    if (activeWords.length === 0) return;

    if (mode === "memo") {
      const pick = shuffle([...activeWords]).slice(0, 6);
      const cards = shuffle(pick.flatMap(o => [
        { id: o.palabra, kind: 'emoji', show: o.emoji },
        { id: o.palabra, kind: 'word', show: o.palabra },
      ]));
      setMemoCards(cards);
      setMemoMatched(0);
      setMemoOpen([]);
    } else {
      const selectedSeq = shuffle([...activeWords]).slice(0, ROUNDS);
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
    if (idx >= sequence.length || idx >= ROUNDS) {
      handleCelebrate();
      return;
    }
    const target = sequence[idx];
    const others = shuffle(allWords.filter(x => x.palabra !== target.palabra)).slice(0, 2);
    setOptions(shuffle([target, ...others]));
    setErrs(0);
    setButtonStates({});
    setFeedback("");
    setLocked(false);
    roundStartRef.current = Date.now();

    if (mode === "show" || mode === "listen") {
      later(() => speak(target.palabra), 400);
    }
  };

  const handleCelebrate = () => {
    setFinished(true);
    sndWin();
    spawnConfetti(40);
    speak(`¡Felicitaciones${nombre ? `, ${nombre}` : ""}! ¡Terminaste el juego!`);
  };

  const triggerPrize = () => {
    setFinished(true);
    setPrizeWon(true);
    sndWin();
    spawnConfetti(40);
    later(() => spawnConfetti(40), 800);
    later(() => spawnConfetti(40), 1600);
    speak(`¡Veinte estrellas! ¡Te ganaste un premio${nombre ? `, ${nombre}` : ""}!`);
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
      setFeedback(`⭐ ${praiseMsg}`);
      speak(praiseMsg);

      onAddStars(1);
      if (score + 1 >= GOAL) {
        later(triggerPrize, 1300);
      } else {
        if ((score + 1) % 10 === 0) spawnConfetti(20);
        later(() => {
          setCurrentIndex(c => c + 1);
          setupRound(currentIndex + 1, seq, words);
        }, 1400);
      }
    } else {
      setButtonStates(prev => ({ ...prev, [chosenOption.palabra]: "wrong" }));
      sndBad();
      const retryMsg = rand(RETRY);
      setFeedback(`💪 ${retryMsg}`);
      later(() => speak(retryMsg), 350);

      later(() => {
        setButtonStates(prev => ({ ...prev, [chosenOption.palabra]: "dim" }));
      }, 500);

      setErrs(e => {
        const newErrs = e + 1;
        if (newErrs >= 2) {
          setButtonStates(prev => ({ ...prev, [target.palabra]: "hint" }));
        }
        return newErrs;
      });
    }
  };

  const handleMemoClick = (idx: number) => {
    if (locked || memoCards[idx].flipped || memoOpen.includes(idx)) return;
    
    const card = memoCards[idx];
    if (card.kind === 'word') {
      speak(card.id);
    }
    
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
        onAddStars(1);
        const praiseMsg = withName(rand(PRAISE), nombre);
        setFeedback(`⭐ ${praiseMsg}`);
        speak(praiseMsg);
        
        later(() => {
          setMemoMatched(m => {
            const newM = m + 1;
            if (newM === 6) {
              if (score + 1 >= GOAL) later(triggerPrize, 800);
              else later(handleCelebrate, 900);
            }
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

  if (words.length === 0) return <div className="p-8 text-center text-xl text-brand-dark font-bold">No hay palabras activas en la configuración.</div>;

  if (prizeWon) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-[520px] text-center mt-8">
        <div className="text-[5rem] animate-bounce-short">🎁</div>
        <h1 className="text-brand-dark text-[2.2rem] mb-2 drop-shadow-[2px_2px_0_#fff] font-bold">¡20 estrellas!</h1>
        <div className="text-[3rem] my-3">⭐⭐⭐⭐⭐</div>
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
        <div className="text-[3rem] my-3">⭐⭐⭐</div>
        <div className="text-brand-blue text-[1.15rem] mb-5">estrellas: <b>{score} / {GOAL}</b></div>
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
    listen: "🦜 el loro dice..."
  };

  const target = seq[currentIndex];

  const header = (
    <div className="w-full flex flex-col items-center mb-[14px]">
      <div className="text-brand-blue text-[clamp(0.95rem,3.6vw,1.15rem)] text-center mb-1 whitespace-nowrap">
        {titleMap[mode]} {mode !== "memo" && `— ${currentIndex + 1} de ${ROUNDS}`}
      </div>
      {mode !== "memo" && (
        <div className="w-full max-w-[520px] h-[22px] bg-white/60 rounded-full overflow-hidden mt-1.5">
          <div className="h-full rounded-full bg-gradient-to-r from-[#ffd23f] to-[#ff8a3d] transition-all duration-400" style={{ width: `${(currentIndex / ROUNDS) * 100}%` }}></div>
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
          <div className="bg-white rounded-[26px] p-[22px_30px] text-center shadow-[0_6px_0_rgba(0,0,0,0.12)] mb-[22px] min-w-[min(90%,420px)] cursor-pointer" onClick={() => speak(target.palabra)}>
            <div className="text-[clamp(4rem,16vw,6.5rem)] leading-[1.1]">{target.emoji}</div>
            <div className="text-[clamp(2.6rem,9vw,4rem)] font-bold text-brand-pink tracking-[2px]">{target.palabra}</div>
            <div className="text-[1rem] text-[#888] mt-1.5">🔊 tocá la tarjeta para escucharla otra vez</div>
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
            <div className="text-[clamp(2.6rem,9vw,4rem)] font-bold text-brand-pink tracking-[2px]">{target.palabra}</div>
            {/* REMOVED hint text "tocá la palabra para escucharla" */}
          </div>
          <div className="grid grid-cols-3 gap-[14px] w-full max-w-[560px]">
            {options.map(o => (
              <button 
                key={o.palabra} 
                onClick={() => handleAnswer(o)}
                className={`bg-white border-none rounded-[22px] p-[16px_8px] text-[3.4rem] cursor-pointer shadow-[0_5px_0_rgba(0,0,0,0.14)] font-inherit transition-transform active:translate-y-1 active:shadow-none
                  ${buttonStates[o.palabra] === 'correct' ? 'bg-brand-green text-white animate-pop' : ''}
                  ${buttonStates[o.palabra] === 'wrong' ? 'bg-[#ffe0e0] animate-shake' : ''}
                  ${buttonStates[o.palabra] === 'dim' ? 'opacity-35 pointer-events-none' : ''}
                  ${buttonStates[o.palabra] === 'hint' ? 'animate-glow' : ''}
                `}
              >
                {o.emoji}
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
            <div className="text-[clamp(4rem,16vw,6.5rem)] leading-[1.1]">{target.emoji}</div>
          </div>
          <div className="grid grid-cols-1 gap-[14px] w-full max-w-[420px]">
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
                {o.palabra}
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
          <div className="grid grid-cols-1 gap-[14px] w-full max-w-[420px]">
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
                {o.palabra}
              </button>
            ))}
          </div>
          <div className="min-h-[2.2rem] text-[1.4rem] font-bold text-brand-dark mt-[16px] text-center">{feedback}</div>
        </>
      )}

      {/* Mode Memo: Memotest */}
      {mode === "memo" && (
        <>
          <div className="grid grid-cols-4 gap-[8px] w-full max-w-[480px]">
            {memoCards.map((c, idx) => {
              const isOpen = memoOpen.includes(idx);
              const isMatched = memoMatched > 0 && !memoOpen.includes(idx) && false; // We track match via class? Wait, we can track matched indices!
              // For simplicity, once matched they stay flipped and get a styling change.
              // Let's compute if it's matched:
              // Actually we need to track matched pairs or indices.
              // Let's add matched property to the card object itself in memoCards array!
              return (
                <div key={idx} className={`aspect-[3/3.2] [perspective:600px] cursor-pointer ${isOpen || c.matched ? '[&>div]:[transform:rotateY(180deg)]' : ''}`} onClick={() => handleMemoClick(idx)}>
                  <div className="w-full h-full relative [transform-style:preserve-3d] transition-transform duration-400">
                    <div className="absolute inset-0 [backface-visibility:hidden] rounded-[16px] flex items-center justify-center text-center shadow-[0_4px_0_rgba(0,0,0,0.14)] p-1 bg-gradient-to-br from-[#4d9de0] to-[#7ec8ff] text-[2rem]">
                      ❓
                    </div>
                    <div className={`absolute inset-0 [backface-visibility:hidden] rounded-[16px] flex items-center justify-center text-center shadow-[0_4px_0_rgba(0,0,0,0.14)] p-1 [transform:rotateY(180deg)] ${c.matched ? 'bg-[#d2f5df] outline outline-3 outline-[#3dbf6e]' : 'bg-white'}`}>
                      {c.kind === 'emoji' ? (
                        <span className="text-[clamp(1.8rem,7vw,2.4rem)]">{c.show}</span>
                      ) : (
                        <span className="text-[clamp(0.8rem,3vw,1.15rem)] font-bold text-brand-pink tracking-[1px] break-all">{c.show}</span>
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
