"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getSessionData,
  setSessionData,
  migrarLegacy,
  recordarUsuario,
  listarUsuariosLocales,
} from "@/lib/storage";
import { normalizarUsername } from "@/lib/claves";
import { syncFromServer } from "@/lib/sync";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  // Cuando el usuario no existe, en vez de crearlo en silencio se pregunta.
  const [confirmarAlta, setConfirmarAlta] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [conocidos, setConocidos] = useState<string[]>([]);
  const router = useRouter();

  useEffect(() => {
    const session = getSessionData();
    if (session) {
      router.replace("/jugar");
      return;
    }
    (async () => {
      setConocidos(listarUsuariosLocales());
    })();
  }, [router]);

  const entrar = async (nombre: string, crear: boolean) => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/acceso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: nombre, crear }),
      });
      const data = await res.json();

      if (data.ok) {
        setSessionData({ username: data.username });
        // Adopta las claves de la versión de un solo chico, si las hubiera.
        migrarLegacy(data.username);
        recordarUsuario(data.username);
        // Baja el progreso guardado en el servidor (estrellas, config, informe)
        await syncFromServer(data.username);
        router.push("/jugar");
        return;
      }

      if (data.motivo === "no-existe") {
        setConfirmarAlta(data.username);
        return;
      }
      setError(data.message || "Error al verificar el acceso");
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const limpio = normalizarUsername(username);
    if (limpio.length < 3) {
      setError("El usuario necesita al menos 3 letras o números (sin espacios ni tildes)");
      return;
    }
    setUsername(limpio);
    setConfirmarAlta(null);
    void entrar(limpio, false);
  };

  const inputClass =
    "w-full text-xl p-4 rounded-xl border-2 border-brand-blue/20 outline-none focus:border-brand-blue bg-white lowercase";

  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md">
      <h1 className="text-brand-dark text-[2.2rem] mb-2 drop-shadow-[2px_2px_0_#fff] font-bold text-center">
        ¡A leer! 🚀
      </h1>
      <p className="text-brand-blue text-[1.15rem] text-center mb-5">
        Escribí tu usuario para jugar
      </p>

      <form
        onSubmit={handleSubmit}
        className="bg-white/80 p-8 rounded-[26px] shadow-[0_6px_0_rgba(0,0,0,0.12)] w-full flex flex-col gap-4"
      >
        <div>
          <input
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(normalizarUsername(e.target.value));
              setConfirmarAlta(null);
              setError("");
            }}
            placeholder="tu usuario"
            className={inputClass}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            minLength={3}
            maxLength={20}
            required
            disabled={loading}
          />

          {conocidos.length > 0 && !confirmarAlta && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wide mb-1.5">
                En esta tablet
              </p>
              <div className="flex flex-wrap gap-2">
                {conocidos.map((u) => (
                  <button
                    key={u}
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setUsername(u);
                      void entrar(u, false);
                    }}
                    className="bg-brand-blue/10 text-brand-blue font-bold rounded-full py-1.5 px-4 text-[0.95rem] active:translate-y-0.5 transition-transform disabled:opacity-50"
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && <div className="text-brand-pink font-bold text-center">{error}</div>}

        {confirmarAlta ? (
          <div className="bg-brand-blue/10 rounded-[18px] p-4 flex flex-col gap-3">
            <p className="text-brand-dark text-center">
              No existe el usuario <b>{confirmarAlta}</b>.
              <br />
              <span className="text-sm text-gray-600">
                Revisá que esté bien escrito: un usuario nuevo arranca sin informe y con
                las palabras por defecto.
              </span>
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmarAlta(null)}
                disabled={loading}
                className="flex-1 bg-gray-200 text-gray-600 rounded-[18px] p-3 font-bold active:translate-y-1 disabled:opacity-50"
              >
                Corregir
              </button>
              <button
                type="button"
                onClick={() => void entrar(confirmarAlta, true)}
                disabled={loading}
                className="flex-1 bg-brand-green text-white rounded-[18px] p-3 font-bold shadow-[0_4px_0_rgba(0,0,0,0.18)] active:translate-y-1 active:shadow-none disabled:opacity-50"
              >
                Crear usuario
              </button>
            </div>
          </div>
        ) : (
          <button
            type="submit"
            disabled={loading}
            className="mt-2 bg-brand-green text-white border-none rounded-[22px] p-4 text-[1.35rem] font-bold cursor-pointer shadow-[0_5px_0_rgba(0,0,0,0.18)] flex items-center justify-center gap-3 transition-transform active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:active:translate-y-0 disabled:active:shadow-[0_5px_0_rgba(0,0,0,0.18)]"
          >
            {loading ? "Verificando..." : "Entrar"}
          </button>
        )}
      </form>
    </div>
  );
}
