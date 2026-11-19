import { NextResponse } from "next/server";
import { diasRestantes, sumarDias, sumarEstrellas, type Objetivo } from "@/lib/fichas";
import {
  COLS_OBJETIVO,
  T_OBJETIVOS,
  autenticarAdmin,
  conManejo,
  error,
  fichasEnRango,
  filtroChico,
  hoyAR,
  leerJson,
  nombreDelChico,
  objetivoActivo,
} from "@/lib/fichas-server";
import { sbGet } from "@/lib/supabase";

// Todo lo que muestra el tablero de una administradora y el modo chico.
// Sin objetivo activo, la lista muestra los últimos 30 días.

export async function POST(request: Request) {
  return conManejo(async () => {
    const body = await leerJson(request);
    if (!body) return error(400, "json-invalido");
    const admin = await autenticarAdmin(body);
    if (admin instanceof Response) return admin;
    const { accountId, username } = admin;

    const hoy = hoyAR();
    const [nombre, objetivo] = await Promise.all([
      nombreDelChico(accountId, username),
      objetivoActivo(accountId, username),
    ]);

    const inicio = objetivo ? objetivo.inicio : sumarDias(hoy, -29);
    const fin = objetivo ? objetivo.fin : hoy;
    const [fichas, historial] = await Promise.all([
      fichasEnRango(accountId, username, inicio, fin),
      sbGet<Objetivo[]>(
        `/rest/v1/${T_OBJETIVOS}?${filtroChico(accountId, username)}&cerrado_at=not.is.null` +
          `&select=${COLS_OBJETIVO}&order=fin.desc&limit=10`
      ),
    ]);

    return NextResponse.json({
      ok: true,
      rol: admin.rol,
      hoy,
      chico: { nombre },
      rango: { inicio, fin },
      objetivo: objetivo
        ? {
            ...objetivo,
            acumuladas: sumarEstrellas(fichas, objetivo),
            diasRestantes: diasRestantes(objetivo.fin, hoy),
          }
        : null,
      fichas,
      historial,
    });
  });
}
