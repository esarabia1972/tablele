import { NextResponse } from "next/server";

// Acceso por nombre de usuario (sin email).
// Si el usuario no existe en Supabase, se crea y entra igual (modo demo).

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
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username || "").trim().toLowerCase();

    if (!USERNAME_RE.test(username)) {
      return NextResponse.json({
        ok: false,
        message: "El usuario debe tener de 3 a 20 letras, números o _ (sin espacios)",
      });
    }

    // Sin storage configurado: entra igual, en modo local
    if (!SB_URL || !SB_KEY) {
      return NextResponse.json({ ok: true, username });
    }

    // Upsert: si no existe lo crea, si existe no pisa nada
    const res = await fetch(`${SB_URL}/rest/v1/${TABLE}?on_conflict=username`, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify([{ username }]),
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return NextResponse.json({
        ok: false,
        message: "No se pudo verificar el usuario",
        sbStatus: res.status,
        sbError: detail,
      });
    }

    return NextResponse.json({ ok: true, username });
  } catch {
    return NextResponse.json(
      { ok: false, message: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
