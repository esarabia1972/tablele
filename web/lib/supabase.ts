// Cliente REST mínimo de Supabase para las rutas de API.
// El repo no usa @supabase/supabase-js a propósito (dependencias mínimas):
// esto centraliza la URL, las cabeceras y el manejo de errores, que antes
// estaban copiados en cada route.ts.

import type { Rol } from "@/lib/claves";

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

// --- Rol del adulto frente a un chico ---------------------------------------

/**
 * Quién es el adulto que hace el pedido.
 *
 * El titular y el tutor mandan EXACTAMENTE el mismo par (accountId, username)
 * —el chico es el mismo— así que el rol no se puede deducir del par: se deriva
 * del correo, contra la fila del chico. Es tan fuerte como el resto del modelo
 * de acceso de la app (conocer el correo es ser esa persona) y, además, cierra
 * un agujero anterior: sin esto, conocer un accountId y adivinar un nombre
 * alcanzaba para leer o escribir el informe de cualquier chico de esa cuenta.
 *
 * Devuelve null si el correo no tiene nada que ver con ese chico: el que llama
 * responde 403.
 */
export async function resolverRol(
  email: string,
  accountId: string,
  username: string
): Promise<{ rol: Rol; fila: FilaChico } | null> {
  const filas = await sbGet<FilaChico[]>(
    `/rest/v1/${TABLA_DATOS}?account_id=eq.${accountId}&username=eq.${encodeURIComponent(
      username
    )}&select=account_id,username,tutor1,tutor2`
  );
  const fila = filas?.[0];
  if (!fila) return null;

  const cuentas = await sbGet<{ email: string; activo: boolean }[]>(
    `/rest/v1/${TABLA_CUENTAS}?id=eq.${accountId}&select=email,activo`
  );
  const cuenta = cuentas?.[0];
  if (!cuenta || cuenta.activo === false) return null;

  // El titular se evalúa primero: si además se puso a sí mismo como tutor de su
  // propio chico, sigue siendo titular.
  if (cuenta.email.toLowerCase() === email) return { rol: "titular", fila };

  const tutores = [fila.tutor1, fila.tutor2]
    .filter((t): t is string => typeof t === "string" && t.length > 0)
    .map((t) => t.toLowerCase());
  if (tutores.includes(email)) return { rol: "tutor", fila };

  return null;
}

export type FilaChico = {
  account_id: string;
  username: string;
  tutor1?: string | null;
  tutor2?: string | null;
};
