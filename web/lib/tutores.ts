"use client";

// Los adultos a cargo NO viven dentro de `config`: son columnas propias.
//
// Si vivieran en el blob de config, el propio tutor podría borrarse el acceso
// —o dárselo a cualquiera— con sólo guardar una copia vieja, porque el cliente
// sobrescribe ese objeto entero. Como columnas, la API simplemente no acepta
// que un tutor las toque.

import { MAX_TUTORES } from "@/lib/claves";

export async function leerTutores(
  accountId: string,
  username: string,
  email: string
): Promise<string[]> {
  const vacio = Array(MAX_TUTORES).fill("");
  try {
    const res = await fetch(
      `/api/tutores?accountId=${encodeURIComponent(accountId)}` +
        `&username=${encodeURIComponent(username)}&email=${encodeURIComponent(email)}`,
      { cache: "no-store" }
    );
    const json = await res.json();
    if (!json?.ok) return vacio;
    const lista: string[] = json.tutores ?? [];
    return vacio.map((_, i) => lista[i] ?? "");
  } catch {
    return vacio;
  }
}

/** Lanza si el servidor no confirmó, igual que el resto de los guardados. */
export async function guardarTutores(
  accountId: string,
  username: string,
  email: string,
  tutores: string[]
): Promise<void> {
  const res = await fetch("/api/datos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, username, email, tutores }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || "No se pudieron guardar los adultos a cargo");
  }
}
