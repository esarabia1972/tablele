import { NextResponse } from "next/server";

// Persistencia server-side en Supabase (tabla: tablele_datos, clave: username)
// Env vars requeridas (en Vercel): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

// Acepta la URL con o sin path/barra final (ej: si pegaron el RESTful endpoint)
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
const API_VERSION = 4; // para verificar qué versión está deployada

function sbHeaders(): Record<string, string> {
  return {
    apikey: SB_KEY!,
    Authorization: `Bearer ${SB_KEY}`,
    "Content-Type": "application/json",
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = (searchParams.get("username") || "").trim().toLowerCase();

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  if (!SB_URL || !SB_KEY) {
    return NextResponse.json({ ok: false, reason: "storage-no-configurado" });
  }

  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/${TABLE}?username=eq.${encodeURIComponent(username)}&select=config,stars,stats`,
      { headers: sbHeaders(), cache: "no-store" }
    );
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return NextResponse.json(
        { ok: false, v: API_VERSION, sbStatus: res.status, sbError: detail },
        { status: 500 }
      );
    }
    const rows = await res.json();
    return NextResponse.json({
      ok: true,
      data: Array.isArray(rows) && rows[0] ? rows[0] : null,
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username || "").trim().toLowerCase();

    if (!USERNAME_RE.test(username)) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
    if (!SB_URL || !SB_KEY) {
      return NextResponse.json({ ok: false, reason: "storage-no-configurado" });
    }

    const row: Record<string, unknown> = {
      username,
      updated_at: new Date().toISOString(),
    };
    if (body.config !== undefined && body.config !== null) row.config = body.config;
    if (typeof body.stars === "number") {
      row.stars = Math.max(0, Math.min(Math.round(body.stars), 20));
    }
    if (body.stats !== undefined && body.stats !== null) row.stats = body.stats;

    const res = await fetch(`${SB_URL}/rest/v1/${TABLE}?on_conflict=username`, {
      method: "POST",
      headers: {
        ...sbHeaders(),
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify([row]),
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return NextResponse.json({ ok: false, sbStatus: res.status, sbError: detail });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
