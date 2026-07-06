import { NextResponse } from "next/server";
import allowlist from "@/data/allowlist.json";

// Persistencia server-side en Supabase (tabla: tablele_datos)
// Env vars requeridas (en Vercel): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE = "tablele_datos";

function allowed(email: string): boolean {
  return allowlist.some(
    (entry: { email: string }) => entry.email.toLowerCase() === email
  );
}

function sbHeaders(): Record<string, string> {
  return {
    apikey: SB_KEY!,
    Authorization: `Bearer ${SB_KEY}`,
    "Content-Type": "application/json",
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = (searchParams.get("email") || "").trim().toLowerCase();

  if (!email || !allowed(email)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  if (!SB_URL || !SB_KEY) {
    return NextResponse.json({ ok: false, reason: "storage-no-configurado" });
  }

  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/${TABLE}?email=eq.${encodeURIComponent(email)}&select=config,stars,stats`,
      { headers: sbHeaders(), cache: "no-store" }
    );
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return NextResponse.json(
        { ok: false, sbStatus: res.status, sbError: detail },
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
    const email = (body.email || "").trim().toLowerCase();

    if (!email || !allowed(email)) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
    if (!SB_URL || !SB_KEY) {
      return NextResponse.json({ ok: false, reason: "storage-no-configurado" });
    }

    const row: Record<string, unknown> = {
      email,
      updated_at: new Date().toISOString(),
    };
    if (body.config !== undefined && body.config !== null) row.config = body.config;
    if (typeof body.stars === "number") {
      row.stars = Math.max(0, Math.min(Math.round(body.stars), 20));
    }
    if (body.stats !== undefined && body.stats !== null) row.stats = body.stats;

    const res = await fetch(`${SB_URL}/rest/v1/${TABLE}?on_conflict=email`, {
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
