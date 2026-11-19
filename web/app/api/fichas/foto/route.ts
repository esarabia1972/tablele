import { NextResponse } from "next/server";
import { BUCKET_FOTOS, sbHeaders, sbUrl } from "@/lib/supabase";
import { autenticarAdmin, conManejo, error, leerJson, prefijoFotos } from "@/lib/fichas-server";

// Foto propia para una conducta o un premio (ej.: la foto del juguete).
// A diferencia de /api/foto de Tablele, la puede subir cualquier
// administradora (titular o tutor): en Fichas las dos administran.
// La imagen llega ya reducida y en JPEG desde el navegador.

export async function POST(request: Request) {
  return conManejo(async () => {
    const body = await leerJson(request);
    if (!body) return error(400, "json-invalido");
    const admin = await autenticarAdmin(body);
    if (admin instanceof Response) return admin;

    const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(body.dataUrl || ""));
    if (!m) return error(400, "imagen-invalida", "La imagen no es válida.");
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 1_500_000) return error(413, "imagen-grande", "La imagen es demasiado grande.");

    const ext = m[1] === "jpeg" ? "jpg" : m[1];
    const nombre = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const path = `${prefijoFotos(admin.accountId, admin.username)}${nombre}`;
    const res = await fetch(sbUrl(`/storage/v1/object/${BUCKET_FOTOS}/${path}`), {
      method: "POST",
      headers: sbHeaders({ "Content-Type": `image/${m[1]}`, "x-upsert": "true" }),
      body: new Uint8Array(buf),
    });
    if (!res.ok) return error(502, "storage", (await res.text()).slice(0, 200));
    return NextResponse.json({ ok: true, url: sbUrl(`/storage/v1/object/public/${BUCKET_FOTOS}/${path}`) });
  });
}
