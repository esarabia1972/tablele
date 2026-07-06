import { NextResponse } from "next/server";

// Sube una foto (base64) a Supabase Storage (bucket público "fotos")
// y devuelve la URL pública.

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
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const BUCKET = "fotos";

export async function POST(request: Request) {
  try {
    const { username, dataUrl } = await request.json();
    const user = String(username || "").trim().toLowerCase();

    if (!USERNAME_RE.test(user)) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
    if (!SB_URL || !SB_KEY) {
      return NextResponse.json({ ok: false, reason: "storage-no-configurado" });
    }

    const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl || "");
    if (!m) {
      return NextResponse.json({ ok: false, message: "Imagen inválida" }, { status: 400 });
    }
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 2_500_000) {
      return NextResponse.json({ ok: false, message: "Imagen demasiado grande" }, { status: 413 });
    }

    const path = `${user}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const res = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": `image/${m[1]}`,
        "x-upsert": "true",
      },
      body: new Uint8Array(buf),
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return NextResponse.json({ ok: false, sbStatus: res.status, sbError: detail });
    }

    return NextResponse.json({
      ok: true,
      url: `${SB_URL}/storage/v1/object/public/${BUCKET}/${path}`,
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
