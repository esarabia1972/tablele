import { NextResponse } from "next/server";
import { limpiarTexto, validarObjetivo } from "@/lib/fichas";
import {
  T_OBJETIVOS,
  autenticarAdmin,
  cerrarObjetivo,
  conManejo,
  error,
  hoyAR,
  leerJson,
  objetivoActivo,
  sbInsert,
} from "@/lib/fichas-server";
import { SupabaseError } from "@/lib/supabase";

// Objetivo del chico. Uno activo a la vez.
//   crear  → { meta, premio, inicio, fin }
//   cerrar → cierra el activo antes de tiempo (cumplido o no según la suma)

export async function POST(request: Request) {
  return conManejo(async () => {
    const body = await leerJson(request);
    if (!body) return error(400, "json-invalido");
    const admin = await autenticarAdmin(body);
    if (admin instanceof Response) return admin;
    const { accountId, username } = admin;

    if (body.accion === "crear") {
      const premio = limpiarTexto(body.premio);
      const err = validarObjetivo(body.meta, premio, body.inicio, body.fin, hoyAR());
      if (err) return error(400, "objetivo-invalido", err);
      // objetivoActivo() cierra el vencido, si lo hay, antes de chequear.
      if (await objetivoActivo(accountId, username)) {
        return error(409, "ya-hay-objetivo", "Ya hay un objetivo en curso. Cerralo antes de crear otro.");
      }
      try {
        await sbInsert(T_OBJETIVOS, [
          {
            account_id: accountId,
            username,
            meta: Number(body.meta),
            premio,
            inicio: body.inicio,
            fin: body.fin,
            creado_por: admin.email,
          },
        ]);
      } catch (e) {
        // El índice único parcial frena dos objetivos activos creados a la vez.
        if (e instanceof SupabaseError && e.sbStatus === 409) {
          return error(409, "ya-hay-objetivo", "Ya hay un objetivo en curso.");
        }
        throw e;
      }
      return NextResponse.json({ ok: true });
    }

    if (body.accion === "cerrar") {
      const obj = await objetivoActivo(accountId, username);
      if (!obj) return error(404, "sin-objetivo");
      await cerrarObjetivo(accountId, username, obj);
      return NextResponse.json({ ok: true });
    }

    return error(400, "accion-invalida");
  });
}
