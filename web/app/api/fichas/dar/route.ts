import { MAX_NOMBRE_VINCULO, limpiarTexto } from "@/lib/fichas";
import { autenticarAdmin, conManejo, darFicha, error, leerJson } from "@/lib/fichas-server";

// Una administradora da una ficha o una carita. `nombre` es cómo la ve el
// chico ("Mamá", "Seño Leti"); si no lo manda, se usa la parte local del correo.

export async function POST(request: Request) {
  return conManejo(async () => {
    const body = await leerJson(request);
    if (!body) return error(400, "json-invalido");
    const admin = await autenticarAdmin(body);
    if (admin instanceof Response) return admin;

    const nombre =
      limpiarTexto(body.nombre)?.slice(0, MAX_NOMBRE_VINCULO) ?? admin.email.split("@")[0];
    return darFicha({
      accountId: admin.accountId,
      username: admin.username,
      body,
      dadaPor: `admin:${admin.email}`,
      dadaPorNombre: nombre,
    });
  });
}
