import { NextResponse } from "next/server";
import { ACCOUNT_ID_RE, EMAIL_RE, USERNAME_RE, normalizarEmail } from "@/lib/claves";
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
  const email = normalizarEmail(String(body.email || ""));
  const crear = body.crear === true;

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, motivo: "email-invalido" }, { status: 403 });
  }
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
    return NextResponse.json({ ok: true, accountId, username, rol: "titular", local: true });
  }

  try {
    // La cuenta tiene que existir y estar activa. Se revalida en cada acceso:
    // el accountId viene del cliente y una cuenta puede haberse dado de baja.
    const cuentas = await sbGet<{ id: string; email: string; activo: boolean }[]>(
      `/rest/v1/${TABLA_CUENTAS}?id=eq.${accountId}&select=id,email,activo`
    );
    const cuenta = cuentas?.[0];
    if (!cuenta || cuenta.activo === false) {
      return NextResponse.json({ ok: false, motivo: "cuenta-invalida" }, { status: 403 });
    }
    const esTitular = cuenta.email.toLowerCase() === email;

    const filas = await sbGet<{ username: string; tutor1: string | null; tutor2: string | null }[]>(
      `/rest/v1/${TABLA_DATOS}?account_id=eq.${accountId}&username=eq.${encodeURIComponent(
        username
      )}&select=username,tutor1,tutor2`
    );
    const existe = Array.isArray(filas) && filas.length > 0;

    // Dar de alta un chico es potestad exclusiva del titular. Esconder el botón
    // en la UI no alcanza: la API es la que manda.
    if (crear && !esTitular) {
      return NextResponse.json(
        { ok: false, motivo: "solo-titular", message: "Sólo el titular puede crear chicos." },
        { status: 403 }
      );
    }

    if (existe) {
      const fila = filas[0];
      const esTutor = [fila.tutor1, fila.tutor2]
        .filter((t): t is string => !!t)
        .some((t) => t.toLowerCase() === email);
      if (!esTitular && !esTutor) {
        return NextResponse.json({ ok: false, motivo: "sin-acceso" }, { status: 403 });
      }
      if (crear) {
        // Alta de un nombre que ya está en esta cuenta: no se pisa nunca.
        return NextResponse.json({
          ok: false,
          motivo: "ya-existe",
          username,
          message: `Ya tenés un ${username}. Agregale algo para distinguirlos.`,
        });
      }
      return NextResponse.json({
        ok: true,
        accountId,
        username,
        existe: true,
        rol: esTitular ? "titular" : "tutor",
      });
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

    return NextResponse.json({
      ok: true,
      accountId,
      username,
      existe: false,
      creado: true,
      rol: "titular",
    });
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
