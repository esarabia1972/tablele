import { NextResponse } from "next/server";
import { USERNAME_RE } from "@/lib/claves";

// Acceso por nombre de usuario (sin email).
// Dos pasos deliberados:
//   POST { username }              -> si no existe, responde existe:false y NO lo crea
//   POST { username, crear: true } -> lo crea y entra
// Antes cualquier typo creaba un chico nuevo en silencio, con su informe vacío
// y las palabras por defecto, y nadie se enteraba de que había perdido el suyo.

const SB_URL = (() => {
  const raw = process.env.SUPABASE_URL?.trim();
  if (!raw) return undefined;
  try {
    return new URL(raw).origin;
  } catch {
    return undefined;
  }
})();
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const TABLE = "tablele_datos";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username || "").trim().toLowerCase();
    const crear = body.crear === true;

    if (!USERNAME_RE.test(username)) {
      return NextResponse.json({
        ok: false,
        motivo: "username-invalido",
        message: "El usuario debe tener de 3 a 20 letras, números o _ (sin espacios ni tildes)",
      });
    }

    // Sin storage configurado: entra igual, en modo local
    if (!SB_URL || !SB_KEY) {
      return NextResponse.json({ ok: true, username, local: true });
    }

    const headers = {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
    };

    const consulta = await fetch(
      `${SB_URL}/rest/v1/${TABLE}?username=eq.${encodeURIComponent(username)}&select=username`,
      { headers, cache: "no-store" }
    );
    if (!consulta.ok) {
      const detail = (await consulta.text()).slice(0, 300);
      return NextResponse.json(
        {
          ok: false,
          motivo: "storage",
          message: "No se pudo verificar el usuario",
          sbStatus: consulta.status,
          sbError: detail,
        },
        { status: 502 }
      );
    }
    const filas = await consulta.json();
    const existe = Array.isArray(filas) && filas.length > 0;

    if (existe) {
      return NextResponse.json({ ok: true, username, existe: true });
    }
    if (!crear) {
      return NextResponse.json({
        ok: false,
        motivo: "no-existe",
        existe: false,
        username,
        message: `No existe el usuario «${username}».`,
      });
    }

    // Alta: upsert. Si existe no pisa nada (carrera con otra pestaña).
    const res = await fetch(`${SB_URL}/rest/v1/${TABLE}?on_conflict=username`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ username }]),
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return NextResponse.json(
        {
          ok: false,
          motivo: "storage",
          message: "No se pudo crear el usuario",
          sbStatus: res.status,
          sbError: detail,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, username, existe: false, creado: true });
  } catch {
    return NextResponse.json(
      { ok: false, motivo: "interno", message: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
