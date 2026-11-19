import { NextResponse } from "next/server";
import {
  MAX_CONDUCTAS_ACTIVAS,
  UUID_RE,
  limpiarPicto,
  limpiarTexto,
  validarConducta,
} from "@/lib/fichas";
import {
  T_CONDUCTAS,
  autenticarAdmin,
  conManejo,
  error,
  filtroChico,
  leerJson,
  sbInsert,
  sbPatch,
} from "@/lib/fichas-server";
import { sbGet } from "@/lib/supabase";

// Conductas del chico. Sólo administradoras. Se archivan, no se borran: las
// fichas viejas guardan su texto, pero el informe agrupa por id.
//   crear    { texto, picto? }
//   editar   { conductaId, texto, picto? }
//   archivar { conductaId }   /  activar { conductaId }
//   ordenar  { ids: string[] }

export async function POST(request: Request) {
  return conManejo(async () => {
    const body = await leerJson(request);
    if (!body) return error(400, "json-invalido");
    const admin = await autenticarAdmin(body);
    if (admin instanceof Response) return admin;
    const chico = filtroChico(admin.accountId, admin.username);

    const activas = async () =>
      (await sbGet<{ id: string }[]>(`/rest/v1/${T_CONDUCTAS}?${chico}&activa=eq.true&select=id`)).length;
    const lleno = () =>
      error(409, "demasiadas", `Pueden estar activas hasta ${MAX_CONDUCTAS_ACTIVAS} conductas. Archivá alguna antes.`);

    const id = String(body.conductaId || "").trim().toLowerCase();

    switch (body.accion) {
      case "crear": {
        const texto = limpiarTexto(body.texto);
        const err = validarConducta(texto);
        if (err) return error(400, "conducta-invalida", err);
        const n = await activas();
        if (n >= MAX_CONDUCTAS_ACTIVAS) return lleno();
        await sbInsert(T_CONDUCTAS, [
          { account_id: admin.accountId, username: admin.username, texto, picto: limpiarPicto(body.picto), orden: n },
        ]);
        return NextResponse.json({ ok: true });
      }
      case "editar": {
        if (!UUID_RE.test(id)) return error(400, "id-invalido");
        const texto = limpiarTexto(body.texto);
        const err = validarConducta(texto);
        if (err) return error(400, "conducta-invalida", err);
        const r = await sbPatch(`/rest/v1/${T_CONDUCTAS}?id=eq.${id}&${chico}`, { texto, picto: limpiarPicto(body.picto) });
        return r.length ? NextResponse.json({ ok: true }) : error(404, "no-encontrada");
      }
      case "archivar":
      case "activar": {
        if (!UUID_RE.test(id)) return error(400, "id-invalido");
        if (body.accion === "activar" && (await activas()) >= MAX_CONDUCTAS_ACTIVAS) return lleno();
        const r = await sbPatch(`/rest/v1/${T_CONDUCTAS}?id=eq.${id}&${chico}`, { activa: body.accion === "activar" });
        return r.length ? NextResponse.json({ ok: true }) : error(404, "no-encontrada");
      }
      case "ordenar": {
        const ids = Array.isArray(body.ids) ? body.ids.map((x) => String(x).toLowerCase()) : [];
        if (!ids.every((x) => UUID_RE.test(x)) || ids.length > 50) return error(400, "ids-invalidos");
        await Promise.all(ids.map((cid, i) => sbPatch(`/rest/v1/${T_CONDUCTAS}?id=eq.${cid}&${chico}`, { orden: i })));
        return NextResponse.json({ ok: true });
      }
      default:
        return error(400, "accion-invalida");
    }
  });
}
