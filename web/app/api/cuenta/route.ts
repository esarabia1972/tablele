import { NextResponse } from "next/server";
import { EMAIL_RE, normalizarEmail, type Rol } from "@/lib/claves";
import {
  SupabaseError,
  TABLA_CUENTAS,
  TABLA_DATOS,
  hayStorage,
  sbGet,
} from "@/lib/supabase";

// Valida el correo del adulto y devuelve los chicos a los que llega.
//
// Un correo puede tener acceso por DOS vías, y hay que mirar las dos:
//   - como titular, a los chicos de su propia cuenta;
//   - como tutor, a los chicos donde figura en tutor1 o tutor2, de cualquier
//     cuenta.
// Y puede ser las dos cosas a la vez: alguien con cuenta propia puede además
// ser el adulto a cargo de un paciente de otra profesional. Por eso se buscan
// siempre los dos lados y se unen, en vez de un if/else.
//
// IMPORTANTE: "no existe" e "inactiva" devuelven EXACTAMENTE el mismo mensaje.
// Distinguirlos le confirmaría a un desconocido qué correos están dados de alta.

type FilaCuenta = { id: string; nombre: string | null; activo: boolean };
type ChicoDeCuenta = { accountId: string; username: string; rol: Rol };

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

  try {
    // --- vía 1: cuenta propia
    const cuentas = await sbGet<FilaCuenta[]>(
      `/rest/v1/${TABLA_CUENTAS}?email=eq.${encodeURIComponent(email)}&select=id,nombre,activo`
    );
    const cuenta = cuentas?.[0]?.activo === false ? undefined : cuentas?.[0];

    const chicos: ChicoDeCuenta[] = [];

    if (cuenta) {
      const propios = await sbGet<{ username: string }[]>(
        `/rest/v1/${TABLA_DATOS}?account_id=eq.${cuenta.id}&select=username&order=username.asc`
      );
      for (const c of propios ?? []) {
        chicos.push({ accountId: cuenta.id, username: c.username, rol: "titular" });
      }
    }

    // --- vía 2: chicos a cargo, de cualquier cuenta
    // El correo va entre comillas y encodeado: EMAIL_RE ya descarta los
    // metacaracteres de or=(), y encodeURIComponent evita que un '+' legítimo
    // (yesi+tablele@gmail.com) se lea como espacio.
    const e = encodeURIComponent(`"${email}"`);
    const aCargo = await sbGet<{ account_id: string; username: string }[]>(
      `/rest/v1/${TABLA_DATOS}?or=(tutor1.eq.${e},tutor2.eq.${e})` +
        `&select=account_id,username&order=username.asc`
    );
    for (const c of aCargo ?? []) {
      // Si además es el titular de ese chico, ya está en la lista como titular.
      const yaEsta = chicos.some(
        (x) => x.accountId === c.account_id && x.username === c.username
      );
      if (!yaEsta) {
        chicos.push({ accountId: c.account_id, username: c.username, rol: "tutor" });
      }
    }

    if (!cuenta && chicos.length === 0) {
      return NextResponse.json({
        ok: false,
        motivo: "no-autorizada",
        message: "Ese correo no está habilitado todavía.",
      });
    }

    return NextResponse.json({
      ok: true,
      email,
      // null cuando entra sólo como tutor: un tutor NO necesita cuenta propia.
      titular: cuenta ? { id: cuenta.id, nombre: cuenta.nombre ?? undefined } : null,
      chicos,
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
