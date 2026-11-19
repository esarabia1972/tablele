import { NextResponse } from "next/server";
import { MAX_NOMBRE_VINCULO, UUID_RE, limpiarTexto, type Premio } from "@/lib/fichas";
import {
  COLS_PREMIO,
  T_MOVIMIENTOS,
  T_PREMIOS,
  autenticarAdmin,
  conManejo,
  error,
  filtroChico,
  leerJson,
  saldoActual,
  sbInsert,
  sbPatch,
} from "@/lib/fichas-server";
import { sbGet } from "@/lib/supabase";

// Lo que mueve el saldo sin tocar las fichas. Sólo administradoras.
//   canjear { id, premioId }  → descuenta el precio si alcanza
//   cero    { id }            → deja el saldo en 0
//   anular  { movimientoId }  → deshace un canje o un cero
// `id` lo genera el cliente: un reintento no canjea dos veces.

export async function POST(request: Request) {
  return conManejo(async () => {
    const body = await leerJson(request);
    if (!body) return error(400, "json-invalido");
    const admin = await autenticarAdmin(body);
    if (admin instanceof Response) return admin;
    const { accountId, username, email } = admin;
    const chico = filtroChico(accountId, username);
    const nombre = limpiarTexto(body.nombre)?.slice(0, MAX_NOMBRE_VINCULO) ?? email.split("@")[0];
    const comun = { account_id: accountId, username, hecho_por: `admin:${email}`, hecho_por_nombre: nombre };

    if (body.accion === "anular") {
      const mid = String(body.movimientoId || "").trim().toLowerCase();
      if (!UUID_RE.test(mid)) return error(400, "id-invalido");
      const r = await sbPatch(`/rest/v1/${T_MOVIMIENTOS}?id=eq.${mid}&${chico}&anulado_at=is.null`, {
        anulado_at: new Date().toISOString(),
        anulado_por: `admin:${email}`,
      });
      return r.length ? NextResponse.json({ ok: true }) : error(404, "no-encontrado");
    }

    const id = String(body.id || "").trim().toLowerCase();
    if (!UUID_RE.test(id)) return error(400, "id-invalido");
    const { saldo } = await saldoActual(accountId, username);

    if (body.accion === "canjear") {
      const pid = String(body.premioId || "").trim().toLowerCase();
      if (!UUID_RE.test(pid)) return error(400, "id-invalido");
      const premios = await sbGet<Premio[]>(`/rest/v1/${T_PREMIOS}?id=eq.${pid}&${chico}&select=${COLS_PREMIO}`);
      const premio = premios?.[0];
      if (!premio || !premio.activo) return error(404, "premio-inexistente", "Ese premio ya no está en la tienda.");
      if (saldo < premio.precio) {
        return error(409, "saldo-insuficiente", `Le faltan ${premio.precio - Math.max(0, saldo)} estrellas.`);
      }
      await sbInsert(
        T_MOVIMIENTOS,
        [{ id, ...comun, tipo: "canje", premio_id: premio.id, premio_nombre: premio.nombre, costo: premio.precio, saldo_antes: saldo }],
        true
      );
      return NextResponse.json({ ok: true, saldo: saldo - premio.precio });
    }

    if (body.accion === "cero") {
      await sbInsert(T_MOVIMIENTOS, [{ id, ...comun, tipo: "cero", costo: 0, saldo_antes: saldo }], true);
      return NextResponse.json({ ok: true, saldo: 0 });
    }

    return error(400, "accion-invalida");
  });
}
