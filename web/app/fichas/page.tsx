"use client";

import { useEffect, useState } from "react";
import Admin from "@/components/fichas/Admin";
import Vinculado from "@/components/fichas/Vinculado";
import { getToken } from "@/lib/fichas-cliente";

// fichas.tablele.com.ar — un dispositivo vinculado por invitación ve sólo la
// pantalla de dar fichas; si no, es una administradora (titular o tutor).

export default function FichasPage() {
  const [token, setTokenState] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage sólo existe en el cliente
    setTokenState(getToken());
  }, []);

  if (token === undefined) return null;
  if (token) return <Vinculado token={token} onRevocado={() => setTokenState(null)} />;
  return <Admin />;
}
