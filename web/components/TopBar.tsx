"use client";

import Link from "next/link";

interface TopBarProps {
  score?: number;
  onBack?: () => void;
  backTo?: string;
  configTo?: string;
}

export default function TopBar({ score, onBack, backTo, configTo }: TopBarProps) {
  const btnClass =
    "text-brand-blue font-bold py-1 px-2 flex items-center gap-1 hover:opacity-80 active:translate-y-1 transition-all text-lg";

  const renderBack = () => {
    if (onBack) {
      return <button onClick={onBack} className={btnClass}>⬅ Volver</button>;
    }
    if (backTo) {
      return <Link href={backTo} className={btnClass}>⬅ Volver</Link>;
    }
    return <div></div>;
  };

  const hasButtons = onBack || backTo || configTo;

  return (
    <div className="w-full max-w-[1000px] flex flex-col pt-3 pb-1 px-4 gap-1">
      {score !== undefined && (
        <div className="w-full flex items-center justify-center gap-[2px]">
          {Array.from({ length: 20 }).map((_, i) => (
            <span
              key={i}
              className={`text-[clamp(0.85rem,3.5vw,1.3rem)] leading-none transition-all duration-300 ${
                i < score
                  ? "opacity-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)] scale-110"
                  : "opacity-25 grayscale scale-90"
              }`}
            >
              ⭐
            </span>
          ))}
        </div>
      )}

      {hasButtons && (
        <div className="w-full flex items-center justify-between min-h-[40px]">
          {renderBack()}
          {configTo ? (
            <Link
              href={configTo}
              aria-label="Configuración"
              className="flex items-center text-[1.5rem] opacity-60 hover:opacity-100 active:translate-y-1 transition-all py-1 px-2"
            >
              ⚙️
            </Link>
          ) : (
            <div></div>
          )}
        </div>
      )}
    </div>
  );
}
