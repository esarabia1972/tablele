import { NextResponse } from "next/server";
import { EMAIL_RE, normalizarEmail } from "@/lib/claves";
import {
  SupabaseError,
  TABLA_CUENTAS,
  TABLA_DATOS,
  hayStorage,
  sbGet,
} from "@/lib/supabase";

// Valida el correo del adulto contra la lista de cuentas habilitadas y
// devuelve los chicos de esa cuenta.
//
// IMPORTANTE: "no existe" e "inactiva" devuelven EXACTAMENTE el mismo mensaje.
// Distinguirlos le confirmaría a un desconocido qué correos están dados de alta.

type FilaCuenta = { id: string; nombre: string | null; activo: boolean };

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, motivo: "json-invalido" }, { status: 400 });
  }

  const email = normalizarEmail(String(body.email || ""));

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({
      ok: false,
      motivo: "email-invalido",
      message: "Escribí un correo válido.",
    });
  }

  if (!hayStorage()) {
    return NextResponse.json({ ok: false, motivo: "storage-no-configurado" });
  }

  const noHabilitada = NextResponse.json({
    ok: false,
    motivo: "no-autorizada",
    message: "Ese correo no está habilitado todavía.",
  });

  try {
    const filas = await sbGet<FilaCuenta[]>(
      `/rest/v1/${TABLA_CUENTAS}?email=eq.${encodeURIComponent(email)}&select=id,nombre,activo`
    );
    const cuenta = Array.isArray(filas) ? filas[0] : undefined;
    if (!cuenta || cuenta.activo === false) return noHabilitada;

    const chicos = await sbGet<{ username: string }[]>(
      `/rest/v1/${TABLA_DATOS}?account_id=eq.${cuenta.id}&select=username&order=username.asc`
    );

    return NextResponse.json({
      ok: true,
      account: { id: cuenta.id, nombre: cuenta.nombre ?? undefined, email },
      chicos: (chicos ?? []).map((c) => c.username),
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
