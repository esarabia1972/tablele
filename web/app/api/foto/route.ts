import { NextResponse } from "next/server";
import { ACCOUNT_ID_RE, EMAIL_RE, USERNAME_RE, normalizarEmail } from "@/lib/claves";
import {
  BUCKET_FOTOS,
  SupabaseError,
  hayStorage,
  resolverRol,
  sbHeaders,
  sbUrl,
} from "@/lib/supabase";

// Sube una foto (base64) a Supabase Storage y devuelve la URL pública.
// El path lleva la cuenta además del chico: si no, dos adultos con un chico
// que se llama igual se pisarían las fotos entre sí.

export async function POST(request: Request) {
  try {
    const { accountId, username, email: emailBruto, dataUrl } = await request.json();
    const cuenta = String(accountId || "").trim();
    const chico = String(username || "").trim().toLowerCase();
    const email = normalizarEmail(String(emailBruto || ""));

    if (!ACCOUNT_ID_RE.test(cuenta) || !USERNAME_RE.test(chico)) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ ok: false, motivo: "email-invalido" }, { status: 403 });
    }
    if (!hayStorage()) {
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

    // Las fotos viven dentro de `config`, así que subirlas es escribir config:
    // sólo el titular. Esto además verifica que el chico sea de esa cuenta, así
    // que nadie deja archivos colgando del espacio de otro adulto.
    const acceso = await resolverRol(email, cuenta, chico);
    if (!acceso) {
      return NextResponse.json({ ok: false, motivo: "sin-acceso" }, { status: 403 });
    }
    if (acceso.rol !== "titular") {
      return NextResponse.json(
        { ok: false, motivo: "solo-titular", message: "Sólo el titular puede cambiar las fotos." },
        { status: 403 }
      );
    }

    const path = `${cuenta}/${chico}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const res = await fetch(sbUrl(`/storage/v1/object/${BUCKET_FOTOS}/${path}`), {
      method: "POST",
      headers: sbHeaders({ "Content-Type": `image/${m[1]}`, "x-upsert": "true" }),
      body: new Uint8Array(buf),
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return NextResponse.json(
        { ok: false, sbStatus: res.status, sbError: detail },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      url: sbUrl(`/storage/v1/object/public/${BUCKET_FOTOS}/${path}`),
    });
  } catch (err) {
    if (err instanceof SupabaseError) {
      return NextResponse.json(
        { ok: false, sbStatus: err.sbStatus, sbError: err.sbError },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
