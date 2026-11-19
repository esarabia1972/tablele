import { NextResponse } from "next/server";
import { UUID_RE, puedeAnularVinculado, type Ficha } from "@/lib/fichas";
import {
  COLS_FICHA,
  T_FICHAS,
  anularFicha,
  autenticarVinculo,
  conManejo,
  error,
  leerJson,
} from "@/lib/fichas-server";
import { sbGet } from "@/lib/supabase";

// Un vinculado anula sólo lo suyo y sólo dentro de los 15 minutos.

export async function POST(request: Request) {
  return conManejo(async () => {
    const v = await autenticarVinculo(request);
    if (v instanceof Response) return v;
    const body = await leerJson(request);
    if (!body) return error(400, "json-invalido");
    const fichaId = String(body.fichaId || "").trim().toLowerCase();
    if (!UUID_RE.test(fichaId)) return error(400, "id-invalido");

    const filas = await sbGet<Ficha[]>(`/rest/v1/${T_FICHAS}?id=eq.${fichaId}&select=${COLS_FICHA}`);
    const f = filas?.[0];
    if (!f || !puedeAnularVinculado(f, v.id, Date.now())) {
      return error(403, "no-se-puede", "Sólo podés anular lo que diste vos en los últimos 15 minutos.");
    }
    await anularFicha(v.account_id, v.username, fichaId, `vinculo:${v.id}`);
    return NextResponse.json({ ok: true });
  });
}
