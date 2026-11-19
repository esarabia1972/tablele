"use client";

import { useCallback, useEffect, useState } from "react";
import { puedeAnularVinculado, type Conducta, type Ficha, type TipoFicha } from "@/lib/fichas";
import { api, borrarToken } from "@/lib/fichas-cliente";
import DarFicha from "./DarFicha";
import ListaFichas from "./ListaFichas";
import { card, errorTxt, titulo } from "./ui";

type Yo = { vinculo: { id: string; nombre: string }; chico: { nombre: string }; conductas: Conducta[]; mias: Ficha[] };

/** La única pantalla de una persona invitada: dar fichas y ver lo que dio. */
export default function Vinculado({
  token,
  onRevocado,
  onSoyAdmin,
}: {
  token: string;
  onRevocado: () => void;
  onSoyAdmin: () => void;
}) {
  const [yo, setYo] = useState<Yo | null>(null);
  const [error, setError] = useState("");
  const [revocado, setRevocado] = useState("");

  const cargar = useCallback(async () => {
    const r = await api.yo(token);
    if (r.ok) {
      setYo(r);
      setError("");
    } else if (r.motivo === "token-revocado" || r.motivo === "token-invalido") {
      borrarToken();
      setRevocado(r.message || "Este enlace ya no está activo. Pedile uno nuevo a la familia.");
    } else {
      setError(r.message || "No se pudo cargar.");
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga desde la API
    void cargar();
  }, [cargar]);

  if (revocado) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center max-w-md gap-4">
        <div className={card}>
          <p className="text-brand-dark text-lg text-center">{revocado}</p>
          <button type="button" className="underline text-brand-blue" onClick={onRevocado}>
            Volver
          </button>
        </div>
      </div>
    );
  }
  if (!yo) return <p className="opacity-60 pt-10">{error || "Cargando…"}</p>;

  const dar = async (tipo: TipoFicha, comentario: string, conductaId: string | null) => {
    const r = await api.vDar(token, tipo, comentario, conductaId);
    if (!r.ok) {
      if (r.motivo === "conducta-inactiva") void cargar();
      return r.message || "No se pudo guardar.";
    }
    void cargar();
    return null;
  };

  const anular = async (f: Ficha) => {
    const r = await api.vAnular(token, f.id);
    if (!r.ok) setError(r.message || "No se pudo anular.");
    void cargar();
  };

  return (
    <div className="w-full max-w-xl flex flex-col gap-4 pt-4">
      <h1 className="text-brand-dark text-[2rem] font-bold drop-shadow-[2px_2px_0_#fff]">
        Fichas para {yo.chico.nombre} 🏅
      </h1>
      <p className="text-brand-blue -mt-2">Hola, {yo.vinculo.nombre}.</p>
      <DarFicha
        nombreChico={yo.chico.nombre}
        conductas={yo.conductas}
        sinConductas="Todavía no hay conductas activas. Avisale a la familia."
        onDar={dar}
      />
      <div className={card}>
        <div className={titulo}>Lo que diste</div>
        {error && <div className={errorTxt}>{error}</div>}
        <ListaFichas
          fichas={yo.mias}
          vacio="Todavía no diste ninguna ficha."
          puedeAnular={(f) => puedeAnularVinculado(f, yo.vinculo.id, Date.now())}
          onAnular={(f) => void anular(f)}
        />
        <p className="text-sm opacity-60">Podés anular lo que diste en los últimos 15 minutos.</p>
      </div>
      <button type="button" onClick={onSoyAdmin} className="text-sm text-brand-dark/60 underline self-center pb-4">
        ¿Sos de la familia o la profesional? Entrá con tu correo
      </button>
    </div>
  );
}
