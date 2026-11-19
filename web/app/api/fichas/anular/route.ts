import { NextResponse } from "next/server";
import { UUID_RE } from "@/lib/fichas";
import { anularFicha, autenticarAdmin, conManejo, error, leerJson } from "@/lib/fichas-server";

// Una administradora anula cualquier ficha del chico, siempre. No se borra:
// queda tachada y deja de contar.

export async function POST(request: Request) {
  return conManejo(async () => {
    const body = await leerJson(request);
    if (!body) return error(400, "json-invalido");
    const admin = await autenticarAdmin(body);
    if (admin instanceof Response) return admin;

    const fichaId = String(body.fichaId || "").trim().toLowerCase();
    if (!UUID_RE.test(fichaId)) return error(400, "id-invalido");
    const ok = await anularFicha(admin.accountId, admin.username, fichaId, `admin:${admin.email}`);
    if (!ok) return error(404, "no-encontrada", "Esa ficha no existe o ya estaba anulada.");
    return NextResponse.json({ ok: true });
  });
}
