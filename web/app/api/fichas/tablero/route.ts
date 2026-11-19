import { NextResponse } from "next/server";
import { sumarDias, type Conducta, type Premio } from "@/lib/fichas";
import {
  COLS_CONDUCTA,
  COLS_PREMIO,
  T_CONDUCTAS,
  T_PREMIOS,
  autenticarAdmin,
  conManejo,
  error,
  fichasEnRango,
  filtroChico,
  hoyAR,
  leerJson,
  nombreDelChico,
  saldoActual,
} from "@/lib/fichas-server";
import { sbGet } from "@/lib/supabase";

// Todo lo que muestran el tablero, el informe y el modo chico: conductas,
// premios, saldo, fichas y movimientos de las últimas 8 semanas.

const SEMANAS_TABLERO = 8;

export async function POST(request: Request) {
  return conManejo(async () => {
    const body = await leerJson(request);
    if (!body) return error(400, "json-invalido");
    const admin = await autenticarAdmin(body);
    if (admin instanceof Response) return admin;
    const { accountId, username } = admin;
    const chico = filtroChico(accountId, username);

    const hoy = hoyAR();
    const inicio = sumarDias(hoy, -(SEMANAS_TABLERO * 7 + 6));
    const [nombre, conductas, premios, fichas, saldo] = await Promise.all([
      nombreDelChico(accountId, username),
      sbGet<Conducta[]>(`/rest/v1/${T_CONDUCTAS}?${chico}&select=${COLS_CONDUCTA}&order=orden.asc,created_at.asc`),
      sbGet<Premio[]>(`/rest/v1/${T_PREMIOS}?${chico}&select=${COLS_PREMIO}&order=precio.asc,created_at.asc`),
      fichasEnRango(accountId, username, inicio, hoy),
      saldoActual(accountId, username),
    ]);

    const desde = Date.now() - (SEMANAS_TABLERO * 7 + 6) * 86_400_000;
    return NextResponse.json({
      ok: true,
      rol: admin.rol,
      hoy,
      chico: { nombre },
      conductas,
      premios,
      saldo: saldo.saldo,
      fichas,
      movimientos: saldo.movs.filter((m) => Date.parse(m.created_at) >= desde),
    });
  });
}
