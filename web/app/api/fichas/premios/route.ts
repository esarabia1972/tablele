import { NextResponse } from "next/server";
import { UUID_RE, limpiarPicto, limpiarTexto, validarPremio } from "@/lib/fichas";
import {
  T_PREMIOS,
  autenticarAdmin,
  conManejo,
  error,
  filtroChico,
  leerJson,
  limpiarFoto,
  sbInsert,
  sbPatch,
} from "@/lib/fichas-server";

// Tienda de premios del chico. Sólo administradoras. Se archivan, no se
// borran: los canjes viejos guardan el nombre.
//   crear    { nombre, precio, picto?, foto? }
//   editar   { premioId, nombre, precio, picto?, foto? }
//   archivar { premioId }  /  activar { premioId }

export async function POST(request: Request) {
  return conManejo(async () => {
    const body = await leerJson(request);
    if (!body) return error(400, "json-invalido");
    const admin = await autenticarAdmin(body);
    if (admin instanceof Response) return admin;
    const chico = filtroChico(admin.accountId, admin.username);
    const id = String(body.premioId || "").trim().toLowerCase();

    switch (body.accion) {
      case "crear":
      case "editar": {
        const nombre = limpiarTexto(body.nombre);
        const err = validarPremio(nombre, body.precio);
        if (err) return error(400, "premio-invalido", err);
        const datos = {
          nombre,
          precio: Number(body.precio),
          picto: limpiarPicto(body.picto),
          foto: limpiarFoto(body.foto, admin.accountId, admin.username),
        };
        if (body.accion === "crear") {
          await sbInsert(T_PREMIOS, [{ account_id: admin.accountId, username: admin.username, ...datos }]);
          return NextResponse.json({ ok: true });
        }
        if (!UUID_RE.test(id)) return error(400, "id-invalido");
        const r = await sbPatch(`/rest/v1/${T_PREMIOS}?id=eq.${id}&${chico}`, datos);
        return r.length ? NextResponse.json({ ok: true }) : error(404, "no-encontrado");
      }
      case "archivar":
      case "activar": {
        if (!UUID_RE.test(id)) return error(400, "id-invalido");
        const r = await sbPatch(`/rest/v1/${T_PREMIOS}?id=eq.${id}&${chico}`, { activo: body.accion === "activar" });
        return r.length ? NextResponse.json({ ok: true }) : error(404, "no-encontrado");
      }
      default:
        return error(400, "accion-invalida");
    }
  });
}
