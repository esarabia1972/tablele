import { NextResponse } from "next/server";
import {
  COLS_FICHA,
  T_FICHAS,
  autenticarVinculo,
  conManejo,
  nombreDelChico,
} from "@/lib/fichas-server";
import { sbGet } from "@/lib/supabase";
import type { Ficha } from "@/lib/fichas";

// Lo que ve un vinculado: su nombre, el del chico y SÓLO las fichas que dio él
// en los últimos 30 días. Nada del objetivo ni de lo que dieron otros.

export async function GET(request: Request) {
  return conManejo(async () => {
    const v = await autenticarVinculo(request);
    if (v instanceof Response) return v;
    const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [chico, mias] = await Promise.all([
      nombreDelChico(v.account_id, v.username),
      sbGet<Ficha[]>(
        `/rest/v1/${T_FICHAS}?dada_por=eq.${encodeURIComponent(`vinculo:${v.id}`)}` +
          `&created_at=gte.${encodeURIComponent(desde)}&select=${COLS_FICHA}&order=created_at.desc&limit=200`
      ),
    ]);
    return NextResponse.json({ ok: true, vinculo: { id: v.id, nombre: v.nombre }, chico: { nombre: chico }, mias });
  });
}
