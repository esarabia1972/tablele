"use client";

import { useEffect, useState } from "react";
import Admin from "@/components/fichas/Admin";
import Vinculado from "@/components/fichas/Vinculado";
import { getModo, getToken, setModo, type Modo } from "@/lib/fichas-cliente";

// fichas.tablele.com.ar — un dispositivo vinculado por invitación ve la
// pantalla de dar fichas; si no, es una administradora (titular o tutor).
//
// Un mismo navegador puede tener las dos cosas (la mamá abrió el enlace que
// generó). Por eso hay un modo guardado y un botón para pasar de una a otra:
// sin eso, la invitación tapaba para siempre la vista de administradora.

export default function FichasPage() {
  const [listo, setListo] = useState(false);
  const [token, setTokenState] = useState<string | null>(null);
  const [modo, setModoState] = useState<Modo>("admin");

  useEffect(() => {
    const t = getToken();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage sólo existe en el cliente
    setTokenState(t);
    setModoState(t ? getModo() ?? "vinculo" : "admin");
    setListo(true);
  }, []);

  const cambiar = (m: Modo) => {
    setModo(m);
    setModoState(m);
  };

  if (!listo) return null;
  if (token && modo === "vinculo") {
    return (
      <Vinculado
        token={token}
        onRevocado={() => {
          setTokenState(null);
          cambiar("admin");
        }}
        onSoyAdmin={() => cambiar("admin")}
      />
    );
  }
  return <Admin onIrAVinculo={token ? () => cambiar("vinculo") : undefined} />;
}
