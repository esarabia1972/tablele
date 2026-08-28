import { NextResponse } from "next/server";
import { GOAL, USERNAME_RE } from "@/lib/claves";
import { MAX_EVENTOS, mergeEventos, mergeUso, type Stats } from "@/lib/eventos";

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
const API_VERSION = 5; // para verificar qué versión está deployada

function sbHeaders(): Record<string, string> {
  return {
    apikey: SB_KEY!,
    Authorization: `Bearer ${SB_KEY}`,
    "Content-Type": "application/json",
  };
}

type Fila = {
  config?: unknown;
  stars?: number | null;
  stats?: Partial<Stats> | null;
  updated_at?: string | null;
};

async function leerFila(username: string): Promise<Fila | null> {
  const res = await fetch(
    `${SB_URL}/rest/v1/${TABLE}?username=eq.${encodeURIComponent(
      username
    )}&select=config,stars,stats,updated_at`,
    { headers: sbHeaders(), cache: "no-store" }
  );
  if (!res.ok) {
    throw Object.assign(new Error("supabase-get"), {
      sbStatus: res.status,
      sbError: (await res.text()).slice(0, 300),
    });
  }
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? (rows[0] as Fila) : null;
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
    const fila = await leerFila(username);
    return NextResponse.json({ ok: true, v: API_VERSION, data: fila });
  } catch (err) {
    const e = err as { sbStatus?: number; sbError?: string };
    return NextResponse.json(
      { ok: false, v: API_VERSION, sbStatus: e.sbStatus, sbError: e.sbError },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "json-invalido" }, { status: 400 });
  }

  const username = String(body.username || "").trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  if (!SB_URL || !SB_KEY) {
    return NextResponse.json({ ok: false, reason: "storage-no-configurado" });
  }

  // Borrado explícito del historial (candado adulto en el informe).
  const forzarBorrado = body.forzarBorrado === true;

  const updatedAt = new Date().toISOString();
  const row: Record<string, unknown> = { username, updated_at: updatedAt };

  // Actualización PARCIAL: sólo se escriben las columnas que vienen en el body.
  // Lo que el cliente no manda, no se toca.
  if (body.config !== undefined && body.config !== null) row.config = body.config;
  if (typeof body.stars === "number" && Number.isFinite(body.stars)) {
    row.stars = Math.max(0, Math.min(Math.round(body.stars), GOAL));
  }

  try {
    if (body.stats !== undefined && body.stats !== null) {
      if (forzarBorrado) {
        row.stats = { eventos: [], uso: {} };
      } else {
        // El informe NUNCA se sobrescribe: se fusiona con lo que ya hay.
        // Así dos dispositivos (o un push viejo que llega tarde) no pueden
        // borrar historial, que es exactamente lo que pasaba antes.
        const actual = await leerFila(username);
        const entrante = body.stats as Partial<Stats>;
        row.stats = {
          eventos: mergeEventos(entrante.eventos, actual?.stats?.eventos).slice(-MAX_EVENTOS),
          uso: mergeUso(entrante.uso, actual?.stats?.uso),
        };
      }
    }

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
      // Status HTTP real: antes esto viajaba como 200 con ok:false y el
      // cliente lo daba por guardado.
      return NextResponse.json(
        { ok: false, v: API_VERSION, sbStatus: res.status, sbError: detail },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, v: API_VERSION, updated_at: updatedAt });
  } catch (err) {
    const e = err as { sbStatus?: number; sbError?: string };
    return NextResponse.json(
      { ok: false, v: API_VERSION, sbStatus: e.sbStatus, sbError: e.sbError },
      { status: 502 }
    );
  }
}
