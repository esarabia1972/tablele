// Cliente REST mínimo de Supabase para las rutas de API.
// El repo no usa @supabase/supabase-js a propósito (dependencias mínimas):
// esto centraliza la URL, las cabeceras y el manejo de errores, que antes
// estaban copiados en cada route.ts.

const SB_URL = (() => {
  // Tolera que hayan pegado el endpoint REST completo, con path o barra final.
  const raw = process.env.SUPABASE_URL?.trim();
  if (!raw) return undefined;
  try {
    return new URL(raw).origin;
  } catch {
    return undefined;
  }
})();

const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

export const TABLA_DATOS = "tablele_datos";
export const TABLA_CUENTAS = "accounts";
export const BUCKET_FOTOS = "fotos";

export function hayStorage(): boolean {
  return !!SB_URL && !!SB_KEY;
}

export function sbUrl(path: string): string {
  return `${SB_URL}${path}`;
}

export function sbHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: SB_KEY!,
    Authorization: `Bearer ${SB_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export class SupabaseError extends Error {
  constructor(readonly sbStatus: number, readonly sbError: string) {
    super(`supabase ${sbStatus}: ${sbError}`);
  }
}

/** GET a PostgREST. Lanza SupabaseError si el servidor no responde 2xx. */
export async function sbGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(sbUrl(path), { headers: sbHeaders(), cache: "no-store" });
  if (!res.ok) throw new SupabaseError(res.status, (await res.text()).slice(0, 300));
  return res.json() as Promise<T>;
}

/** Upsert a PostgREST (merge-duplicates). Lanza SupabaseError si falla. */
export async function sbUpsert(path: string, filas: unknown[]): Promise<void> {
  const res = await fetch(sbUrl(path), {
    method: "POST",
    headers: sbHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(filas),
  });
  if (!res.ok) throw new SupabaseError(res.status, (await res.text()).slice(0, 300));
}
