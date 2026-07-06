"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSessionData, setSessionData } from "@/lib/storage";
import { syncFromServer } from "@/lib/sync";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const session = getSessionData();
    if (session) {
      router.replace("/jugar");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/acceso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (data.ok) {
        setSessionData({ email, nombre: data.nombre });
        // Baja el progreso guardado en el servidor (estrellas, config, informe)
        await syncFromServer(email);
        router.push("/jugar");
      } else {
        setError(data.message || "Error al verificar el acceso");
      }
    } catch (err) {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md">
      <h1 className="text-brand-dark text-[2.2rem] mb-2 drop-shadow-[2px_2px_0_#fff] font-bold text-center">
        ¡A leer! 🚀
      </h1>
      <p className="text-brand-blue text-[1.15rem] text-center mb-5">
        Ingresá con tu email para jugar
      </p>

      <form
        onSubmit={handleSubmit}
        className="bg-white/80 p-8 rounded-[26px] shadow-[0_6px_0_rgba(0,0,0,0.12)] w-full flex flex-col gap-4"
      >
        <div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
            className="w-full text-xl p-4 rounded-xl border-2 border-brand-blue/20 outline-none focus:border-brand-blue bg-white"
            required
            disabled={loading}
          />
        </div>
        
        {error && <div className="text-brand-pink font-bold text-center">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 bg-brand-green text-white border-none rounded-[22px] p-4 text-[1.35rem] font-bold cursor-pointer shadow-[0_5px_0_rgba(0,0,0,0.18)] flex items-center justify-center gap-3 transition-transform active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:active:translate-y-0 disabled:active:shadow-[0_5px_0_rgba(0,0,0,0.18)]"
        >
          {loading ? "Verificando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
