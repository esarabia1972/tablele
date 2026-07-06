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
    return null;
  };

  return (
    <>
      <div className="w-full max-w-[1000px] flex flex-col pt-4 pb-1 px-4 gap-1">
        {score !== undefined && (
          <div className="grid grid-cols-10 gap-x-[6px] gap-y-[4px] w-fit mx-auto">
            {Array.from({ length: 20 }).map((_, i) => (
              <span
                key={i}
                className={`text-[clamp(1.05rem,4.5vw,1.5rem)] leading-none transition-all duration-300 ${
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

        {(onBack || backTo) && (
          <div className="w-full flex items-center min-h-[40px]">{renderBack()}</div>
        )}
      </div>

      {configTo && (
        <Link
          href={configTo}
          aria-label="Configuración"
          className="fixed bottom-4 right-4 z-40 text-[1.7rem] opacity-50 hover:opacity-100 active:translate-y-1 transition-all p-2"
        >
          ⚙️
        </Link>
      )}
    </>
  );
}
