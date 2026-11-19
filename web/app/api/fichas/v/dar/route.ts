import { autenticarVinculo, conManejo, darFicha, error, leerJson } from "@/lib/fichas-server";

export async function POST(request: Request) {
  return conManejo(async () => {
    const v = await autenticarVinculo(request);
    if (v instanceof Response) return v;
    const body = await leerJson(request);
    if (!body) return error(400, "json-invalido");
    return darFicha({
      accountId: v.account_id,
      username: v.username,
      body,
      dadaPor: `vinculo:${v.id}`,
      dadaPorNombre: v.nombre,
    });
  });
}
