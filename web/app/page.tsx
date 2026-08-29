"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getCuenta,
  setCuenta,
  setChicosDeCuenta,
  getSessionData,
  setSessionData,
  type Cuenta,
} from "@/lib/storage";
import { normalizarEmail, normalizarUsername } from "@/lib/claves";
import { syncFromServer } from "@/lib/sync";

// El login tiene dos pasos, y el segundo es el que ve el chico todos los días:
//   1. El adulto valida su correo. UNA vez por dispositivo.
//   2. Aparecen los nombres de los chicos de esa cuenta y el chico toca el suyo.
// El correo no se vuelve a pedir: si hubiera que escribirlo cada vez, el chico
// no podría entrar solo, que es algo que hoy funciona y no queremos perder.

type Paso = "correo" | "chicos" | "nuevo";

export default function LoginPage() {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>("correo");
  const [cuenta, setCuentaState] = useState<Cuenta | null>(null);
  const [email, setEmail] = useState("");
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refrescarChicos = async (c: Cuenta) => {
    try {
      const res = await fetch("/api/cuenta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: c.email }),
      });
      const data = await res.json();
      if (data.ok) {
        setChicosDeCuenta(data.chicos);
        setCuentaState({ ...c, chicos: data.chicos });
      }
    } catch {
      // Sin conexión: se sigue con los chicos cacheados.
    }
  };

  useEffect(() => {
    if (getSessionData()) {
      router.replace("/jugar");
      return;
    }
    (async () => {
      const c = getCuenta();
      if (!c) return;
      // Arranca con los chicos cacheados para que la pantalla abra sin esperar,
      // y los refresca contra el servidor, que es la fuente de verdad.
      setCuentaState(c);
      setPaso("chicos");
      void refrescarChicos(c);
    })();
  }, [router]);


  const validarCorreo = async (e: React.FormEvent) => {
    e.preventDefault();
    const limpio = normalizarEmail(email);
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/cuenta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: limpio }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.message || "No se pudo validar el correo");
        return;
      }
      const c: Cuenta = {
        accountId: data.account.id,
        email: data.account.email,
        nombre: data.account.nombre,
        chicos: data.chicos,
      };
      setCuenta(c);
      setCuentaState(c);
      setPaso(data.chicos.length === 0 ? "nuevo" : "chicos");
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const entrar = async (username: string, crear: boolean) => {
    if (!cuenta) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/acceso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: cuenta.accountId, username, crear }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.message || "No se pudo entrar");
        return;
      }
      setSessionData({ accountId: cuenta.accountId, username: data.username });
      await syncFromServer(cuenta.accountId, data.username);
      router.push("/jugar");
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const crearChico = (e: React.FormEvent) => {
    e.preventDefault();
    const username = normalizarUsername(nombreNuevo);
    if (username.length < 3) {
      setError("Poné al menos 3 letras.");
      return;
    }
    void entrar(username, true);
  };

  const inputClass =
    "w-full text-xl p-4 rounded-xl border-2 border-brand-blue/20 outline-none focus:border-brand-blue bg-white";
  const cardClass =
    "bg-white/80 p-8 rounded-[26px] shadow-[0_6px_0_rgba(0,0,0,0.12)] w-full flex flex-col gap-4";
  const btnClass =
    "bg-brand-green text-white border-none rounded-[22px] p-4 text-[1.35rem] font-bold cursor-pointer shadow-[0_5px_0_rgba(0,0,0,0.18)] flex items-center justify-center transition-transform active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:active:translate-y-0 disabled:active:shadow-[0_5px_0_rgba(0,0,0,0.18)]";

  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md">
      <h1 className="text-brand-dark text-[2.2rem] mb-2 drop-shadow-[2px_2px_0_#fff] font-bold text-center">
        ¡A leer! 🚀
      </h1>

      {paso === "correo" && (
        <>
          <p className="text-brand-blue text-[1.15rem] text-center mb-5">
            Escribí tu correo para empezar
          </p>
          <form onSubmit={validarCorreo} className={cardClass}>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              placeholder="tu correo"
              className={`${inputClass} lowercase`}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              disabled={loading}
            />
            {error && <div className="text-brand-pink font-bold text-center">{error}</div>}
            <button type="submit" disabled={loading} className={`mt-2 ${btnClass}`}>
              {loading ? "Validando..." : "Validar"}
            </button>
          </form>
        </>
      )}

      {paso === "chicos" && cuenta && (
        <>
          <p className="text-brand-blue text-[1.15rem] text-center mb-5">¿Quién va a jugar?</p>
          <div className={cardClass}>
            <div className="flex flex-wrap gap-3 justify-center">
              {(cuenta.chicos ?? []).map((u) => (
                <button
                  key={u}
                  type="button"
                  disabled={loading}
                  onClick={() => void entrar(u, false)}
                  className="bg-brand-blue text-white font-bold rounded-full py-3 px-7 text-[1.2rem] shadow-[0_4px_0_rgba(0,0,0,0.18)] active:translate-y-1 active:shadow-none transition-transform disabled:opacity-50"
                >
                  {u}
                </button>
              ))}
              <button
                type="button"
                disabled={loading}
                aria-label="Agregar un chico"
                onClick={() => {
                  setNombreNuevo("");
                  setError("");
                  setPaso("nuevo");
                }}
                className="bg-white border-2 border-brand-blue/30 text-brand-blue font-bold rounded-full w-[52px] h-[52px] text-[1.6rem] leading-none active:translate-y-1 transition-transform disabled:opacity-50"
              >
                +
              </button>
            </div>
            {error && <div className="text-brand-pink font-bold text-center">{error}</div>}
          </div>
        </>
      )}

      {paso === "nuevo" && cuenta && (
        <>
          <p className="text-brand-blue text-[1.15rem] text-center mb-5">
            {(cuenta.chicos ?? []).length === 0
              ? "Todavía no hay nadie. Creá el primero."
              : "¿Cómo se llama?"}
          </p>
          <form onSubmit={crearChico} className={cardClass}>
            <input
              type="text"
              value={nombreNuevo}
              onChange={(e) => {
                setNombreNuevo(e.target.value);
                setError("");
              }}
              placeholder="su nombre"
              className={inputClass}
              autoCorrect="off"
              spellCheck={false}
              maxLength={20}
              required
              autoFocus
              disabled={loading}
            />
            {error && <div className="text-brand-pink font-bold text-center">{error}</div>}
            <button type="submit" disabled={loading} className={`mt-2 ${btnClass}`}>
              {loading ? "Creando..." : "Empezar"}
            </button>
            {(cuenta.chicos ?? []).length > 0 && (
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setError("");
                  setPaso("chicos");
                }}
                className="bg-gray-200 text-gray-600 rounded-[18px] p-3 font-bold active:translate-y-1 disabled:opacity-50"
              >
                Volver
              </button>
            )}
          </form>
        </>
      )}
    </div>
  );
}
