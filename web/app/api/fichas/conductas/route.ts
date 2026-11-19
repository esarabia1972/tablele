import { NextResponse } from "next/server";
import { itemCatalogo } from "@/lib/catalogo-conductas";
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
  limpiarFoto,
  sbInsert,
  sbPatch,
} from "@/lib/fichas-server";
import { sbGet } from "@/lib/supabase";

// Conductas del chico (SPEC-fichas-v3.md). Sólo administradoras.
// Nunca se borran: desactivar las devuelve a la biblioteca.
//   catalogo { clave, doble? }                → activa una del catálogo genérico (crea la copia o la reactiva)
//   crear    { texto, picto?, foto?, doble? } → propia; queda activa si hay lugar, si no en la biblioteca
//   editar   { conductaId, texto, picto?, foto? }
//   activar  { conductaId, doble? }  /  desactivar { conductaId }
//   doble    { conductaId, doble }   → marca o desmarca Vale Doble
//   ordenar  { ids: string[] }

export async function POST(request: Request) {
  return conManejo(async () => {
    const body = await leerJson(request);
    if (!body) return error(400, "json-invalido");
    const admin = await autenticarAdmin(body);
    if (admin instanceof Response) return admin;
    const { accountId, username } = admin;
    const chico = filtroChico(accountId, username);

    const activas = async () =>
      (await sbGet<{ id: string }[]>(`/rest/v1/${T_CONDUCTAS}?${chico}&activa=eq.true&select=id`)).length;
    const lleno = () =>
      error(409, "demasiadas", `Pueden estar activas hasta ${MAX_CONDUCTAS_ACTIVAS} conductas. Quitá alguna antes.`);
    const ok = () => NextResponse.json({ ok: true });

    const id = String(body.conductaId || "").trim().toLowerCase();
    const doble = body.doble === true;

    switch (body.accion) {
      case "catalogo": {
        const item = itemCatalogo(String(body.clave || ""));
        if (!item) return error(400, "clave-invalida");
        const n = await activas();
        if (n >= MAX_CONDUCTAS_ACTIVAS) return lleno();
        const existe = await sbGet<{ id: string }[]>(
          `/rest/v1/${T_CONDUCTAS}?${chico}&catalogo=eq.${encodeURIComponent(item.clave)}&select=id`
        );
        if (existe.length) {
          await sbPatch(`/rest/v1/${T_CONDUCTAS}?id=eq.${existe[0].id}&${chico}`, { activa: true, doble, orden: n });
        } else {
          await sbInsert(T_CONDUCTAS, [
            { account_id: accountId, username, texto: item.texto, picto: item.picto, catalogo: item.clave, activa: true, doble, orden: n },
          ]);
        }
        return ok();
      }
      case "crear": {
        const texto = limpiarTexto(body.texto);
        const err = validarConducta(texto);
        if (err) return error(400, "conducta-invalida", err);
        const n = await activas();
        await sbInsert(T_CONDUCTAS, [
          {
            account_id: accountId,
            username,
            texto,
            picto: limpiarPicto(body.picto),
            foto: limpiarFoto(body.foto, accountId, username),
            activa: n < MAX_CONDUCTAS_ACTIVAS,
            doble,
            orden: n,
          },
        ]);
        return NextResponse.json({ ok: true, activa: n < MAX_CONDUCTAS_ACTIVAS });
      }
      case "editar": {
        if (!UUID_RE.test(id)) return error(400, "id-invalido");
        const texto = limpiarTexto(body.texto);
        const err = validarConducta(texto);
        if (err) return error(400, "conducta-invalida", err);
        const r = await sbPatch(`/rest/v1/${T_CONDUCTAS}?id=eq.${id}&${chico}`, {
          texto,
          picto: limpiarPicto(body.picto),
          foto: limpiarFoto(body.foto, accountId, username),
        });
        return r.length ? ok() : error(404, "no-encontrada");
      }
      case "activar": {
        if (!UUID_RE.test(id)) return error(400, "id-invalido");
        const n = await activas();
        if (n >= MAX_CONDUCTAS_ACTIVAS) return lleno();
        const r = await sbPatch(`/rest/v1/${T_CONDUCTAS}?id=eq.${id}&${chico}`, { activa: true, doble, orden: n });
        return r.length ? ok() : error(404, "no-encontrada");
      }
      case "desactivar":
      case "archivar": {
        if (!UUID_RE.test(id)) return error(400, "id-invalido");
        const r = await sbPatch(`/rest/v1/${T_CONDUCTAS}?id=eq.${id}&${chico}`, { activa: false });
        return r.length ? ok() : error(404, "no-encontrada");
      }
      case "doble": {
        if (!UUID_RE.test(id)) return error(400, "id-invalido");
        const r = await sbPatch(`/rest/v1/${T_CONDUCTAS}?id=eq.${id}&${chico}`, { doble });
        return r.length ? ok() : error(404, "no-encontrada");
      }
      case "ordenar": {
        const ids = Array.isArray(body.ids) ? body.ids.map((x) => String(x).toLowerCase()) : [];
        if (!ids.every((x) => UUID_RE.test(x)) || ids.length > 50) return error(400, "ids-invalidos");
        await Promise.all(ids.map((cid, i) => sbPatch(`/rest/v1/${T_CONDUCTAS}?id=eq.${cid}&${chico}`, { orden: i })));
        return ok();
      }
      default:
        return error(400, "accion-invalida");
    }
  });
}
