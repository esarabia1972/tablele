import { NextResponse } from "next/server";
import { ACCOUNT_ID_RE, EMAIL_RE, USERNAME_RE, normalizarEmail } from "@/lib/claves";
import { SupabaseError, hayStorage, resolverRol } from "@/lib/supabase";

// Lee los adultos a cargo de un chico. Sólo el titular: para un tutor, saber
// quién más tiene acceso al chico no le aporta nada y es dato de terceros.
//
// La escritura va por POST /api/datos con el campo `tutores`, para que quede en
// el mismo upsert que el resto de la fila.

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountId = (searchParams.get("accountId") || "").trim();
  const username = (searchParams.get("username") || "").trim().toLowerCase();
  const email = normalizarEmail(searchParams.get("email") || "");

  if (!ACCOUNT_ID_RE.test(accountId) || !USERNAME_RE.test(username)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, motivo: "email-invalido" }, { status: 403 });
  }
  if (!hayStorage()) {
    return NextResponse.json({ ok: false, reason: "storage-no-configurado" });
  }

  try {
    const acceso = await resolverRol(email, accountId, username);
    if (!acceso) {
      return NextResponse.json({ ok: false, motivo: "sin-acceso" }, { status: 403 });
    }
    if (acceso.rol !== "titular") {
      return NextResponse.json({ ok: false, motivo: "solo-titular" }, { status: 403 });
    }
    return NextResponse.json({
      ok: true,
      tutores: [acceso.fila.tutor1 ?? "", acceso.fila.tutor2 ?? ""],
    });
  } catch (err) {
    if (err instanceof SupabaseError) {
      return NextResponse.json(
        { ok: false, motivo: "storage", sbStatus: err.sbStatus, sbError: err.sbError },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: false, motivo: "interno" }, { status: 500 });
  }
}
