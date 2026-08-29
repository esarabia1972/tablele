import { NextResponse } from "next/server";
import { ACCOUNT_ID_RE, USERNAME_RE } from "@/lib/claves";
import {
  SupabaseError,
  TABLA_CUENTAS,
  TABLA_DATOS,
  hayStorage,
  sbGet,
  sbUpsert,
} from "@/lib/supabase";

// Acceso de un chico DENTRO de una cuenta ya validada por /api/cuenta.
//
// Alta en dos pasos, igual que antes: sin `crear`, un nombre que no existe se
// informa en vez de darse de alta en silencio. Lo que cambia es que el nombre
// ya no es global: sólo tiene que ser único dentro de la cuenta.

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, motivo: "json-invalido" }, { status: 400 });
  }

  const accountId = String(body.accountId || "").trim();
  const username = String(body.username || "").trim().toLowerCase();
  const crear = body.crear === true;

  if (!ACCOUNT_ID_RE.test(accountId)) {
    return NextResponse.json({ ok: false, motivo: "cuenta-invalida" }, { status: 403 });
  }
  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({
      ok: false,
      motivo: "username-invalido",
      message: "El nombre necesita de 3 a 20 letras o números, sin espacios ni tildes.",
    });
  }

  // Sin storage configurado: entra igual, en modo local
  if (!hayStorage()) {
    return NextResponse.json({ ok: true, accountId, username, local: true });
  }

  try {
    // La cuenta tiene que existir y estar activa. Se revalida en cada acceso:
    // el accountId viene del cliente y una cuenta puede haberse dado de baja.
    const cuentas = await sbGet<{ id: string; activo: boolean }[]>(
      `/rest/v1/${TABLA_CUENTAS}?id=eq.${accountId}&select=id,activo`
    );
    if (!cuentas?.[0] || cuentas[0].activo === false) {
      return NextResponse.json({ ok: false, motivo: "cuenta-invalida" }, { status: 403 });
    }

    const filas = await sbGet<{ username: string }[]>(
      `/rest/v1/${TABLA_DATOS}?account_id=eq.${accountId}&username=eq.${encodeURIComponent(
        username
      )}&select=username`
    );
    const existe = Array.isArray(filas) && filas.length > 0;

    if (existe) {
      if (crear) {
        // Alta de un nombre que ya está en esta cuenta: no se pisa nunca.
        return NextResponse.json({
          ok: false,
          motivo: "ya-existe",
          username,
          message: `Ya tenés un ${username}. Agregale algo para distinguirlos.`,
        });
      }
      return NextResponse.json({ ok: true, accountId, username, existe: true });
    }

    if (!crear) {
      return NextResponse.json({
        ok: false,
        motivo: "no-existe",
        existe: false,
        username,
        message: `No existe ${username} en esta cuenta.`,
      });
    }

    await sbUpsert(`/rest/v1/${TABLA_DATOS}?on_conflict=account_id,username`, [
      { account_id: accountId, username },
    ]);

    return NextResponse.json({ ok: true, accountId, username, existe: false, creado: true });
  } catch (err) {
    if (err instanceof SupabaseError) {
      return NextResponse.json(
        {
          ok: false,
          motivo: "storage",
          message: "No se pudo verificar el usuario",
          sbStatus: err.sbStatus,
          sbError: err.sbError,
        },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { ok: false, motivo: "interno", message: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
