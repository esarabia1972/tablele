"use client";

import Link from "next/link";

interface TopBarProps {
  score?: number;
  onBack?: () => void;
  backTo?: string;
  configTo?: string;
}

const SIDE = "w-[88px] shrink-0";

export default function TopBar({ score, onBack, backTo, configTo }: TopBarProps) {
  const btnClass =
    "text-brand-blue font-bold py-2 px-2 flex items-center gap-1 hover:opacity-80 active:translate-y-1 transition-all text-lg shrink-0 w-[88px]";

  const renderBack = () => {
    if (onBack) {
      return <button onClick={onBack} className={btnClass}>⬅ Volver</button>;
    }
    if (backTo) {
      return <Link href={backTo} className={btnClass}>⬅ Volver</Link>;
    }
    return <div className={SIDE}></div>;
  };

  const renderConfig = () => {
    if (configTo) {
      return (
        <Link
          href={configTo}
          aria-label="Configuración"
          className={`${SIDE} flex items-center justify-end text-[1.5rem] opacity-60 hover:opacity-100 active:translate-y-1 transition-all py-2 px-2`}
        >
          ⚙️
        </Link>
      );
    }
    return <div className={SIDE}></div>;
  };

  return (
    <div className="w-full max-w-[1000px] flex items-center justify-between py-3 px-4 gap-2">
      {renderBack()}

      {score !== undefined ? (
        <div className="flex-1 min-w-0 flex items-center justify-center gap-[2px]">
          {Array.from({ length: 20 }).map((_, i) => (
            <span
              key={i}
              className={`text-[clamp(0.8rem,2.3vw,1.3rem)] leading-none transition-all duration-300 ${
                i < score
                  ? "opacity-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)] scale-110"
                  : "opacity-25 grayscale scale-90"
              }`}
            >
              ⭐
            </span>
          ))}
        </div>
      ) : (
        <div className="flex-1"></div>
      )}

      {renderConfig()}
    </div>
  );
}
