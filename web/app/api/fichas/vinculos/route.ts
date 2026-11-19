import { NextResponse } from "next/server";
import { UUID_RE, limpiarTexto, validarNombreVinculo } from "@/lib/fichas";
import {
  T_FICHAS,
  T_VINCULOS,
  autenticarAdmin,
  conManejo,
  error,
  filtroChico,
  hashToken,
  leerJson,
  nuevoToken,
  sbInsert,
  sbPatch,
} from "@/lib/fichas-server";
import { sbGet } from "@/lib/supabase";

// Personas invitadas a dar fichas. Un solo endpoint con `accion`:
//   listar  → vínculos del chico con cuántas fichas dio cada uno
//   crear   → { nombre } → devuelve el token UNA sola vez
//   revocar → { vinculoId }

type FilaVinculo = { id: string; nombre: string; activo: boolean; created_at: string; revocado_at: string | null };

export async function POST(request: Request) {
  return conManejo(async () => {
    const body = await leerJson(request);
    if (!body) return error(400, "json-invalido");
    const admin = await autenticarAdmin(body);
    if (admin instanceof Response) return admin;
    const chico = filtroChico(admin.accountId, admin.username);

    switch (body.accion) {
      case "listar": {
        const [vinculos, dadas] = await Promise.all([
          sbGet<FilaVinculo[]>(
            `/rest/v1/${T_VINCULOS}?${chico}&select=id,nombre,activo,created_at,revocado_at&order=created_at.desc`
          ),
          sbGet<{ dada_por: string }[]>(
            `/rest/v1/${T_FICHAS}?${chico}&dada_por=like.vinculo:*&anulada_at=is.null&select=dada_por&limit=5000`
          ),
        ]);
        const cuenta = new Map<string, number>();
        for (const f of dadas) cuenta.set(f.dada_por, (cuenta.get(f.dada_por) ?? 0) + 1);
        return NextResponse.json({
          ok: true,
          vinculos: vinculos.map((v) => ({ ...v, fichas: cuenta.get(`vinculo:${v.id}`) ?? 0 })),
        });
      }

      case "crear": {
        const nombre = limpiarTexto(body.nombre);
        const err = validarNombreVinculo(nombre);
        if (err) return error(400, "nombre-invalido", err);
        const token = nuevoToken();
        await sbInsert(T_VINCULOS, [
          {
            account_id: admin.accountId,
            username: admin.username,
            nombre,
            token_hash: hashToken(token),
            creado_por: admin.email,
          },
        ]);
        return NextResponse.json({ ok: true, token });
      }

      case "revocar": {
        const vinculoId = String(body.vinculoId || "").trim().toLowerCase();
        if (!UUID_RE.test(vinculoId)) return error(400, "id-invalido");
        const filas = await sbPatch(
          `/rest/v1/${T_VINCULOS}?id=eq.${vinculoId}&${chico}&activo=eq.true`,
          { activo: false, revocado_at: new Date().toISOString() }
        );
        if (!filas.length) return error(404, "no-encontrado");
        return NextResponse.json({ ok: true });
      }

      default:
        return error(400, "accion-invalida");
    }
  });
}
