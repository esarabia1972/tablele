"use client";

import { useEffect, useState } from "react";
import { TOKEN_RE } from "@/lib/fichas";
import { base, setModo, setToken } from "@/lib/fichas-cliente";

// Guarda el token en el dispositivo y lo saca de la URL (replace, no push)
// para que no quede en el historial ni en una captura.

export default function Entrar({ token }: { token: string }) {
  const [invalido, setInvalido] = useState(false);

  useEffect(() => {
    if (!TOKEN_RE.test(token)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- validación del parámetro al montar
      setInvalido(true);
      return;
    }
    setToken(token);
    setModo("vinculo");
    window.location.replace(`${base()}/`);
  }, [token]);

  return (
    <p className="pt-16 text-brand-dark text-lg text-center">
      {invalido ? "Este enlace no es válido. Pedile uno nuevo a la familia." : "Entrando…"}
    </p>
  );
}
