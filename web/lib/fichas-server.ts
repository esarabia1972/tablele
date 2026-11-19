// Tablele Fichas — piezas de servidor compartidas por /api/fichas/*.
// Sólo se importa desde route.ts (usa la service key a través de lib/supabase).

import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { ACCOUNT_ID_RE, EMAIL_RE, USERNAME_RE, normalizarEmail, type Rol } from "@/lib/claves";
import {
  SupabaseError,
  TABLA_DATOS,
  hayStorage,
  resolverRol,
  sbGet,
  sbHeaders,
  sbUrl,
} from "@/lib/supabase";
import {
  TOKEN_RE,
  UUID_RE,
  VALOR,
  esTipo,
  limpiarTexto,
  validarFicha,
  estaVencido,
  fechaArgentina,
  rangoUTC,
  sumarEstrellas,
  type Ficha,
  type Objetivo,
} from "@/lib/fichas";

export const T_VINCULOS = "fichas_vinculos";
export const T_FICHAS = "fichas";
export const T_OBJETIVOS = "fichas_objetivos";

export const COLS_FICHA =
  "id,tipo,valor,comentario,dada_por,dada_por_nombre,created_at,anulada_at";
export const COLS_OBJETIVO = "id,meta,premio,inicio,fin,cerrado_at,cumplido";

export function hoyAR(): string {
  return fechaArgentina(new Date());
}

// --- Respuestas -------------------------------------------------------------

export function error(status: number, motivo: string, message?: string) {
  return NextResponse.json({ ok: false, motivo, message }, { status });
}

/** Envuelve un handler: errores de Supabase → 502, el resto → 500. */
export async function conManejo(fn: () => Promise<Response>): Promise<Response> {
  if (!hayStorage()) return error(503, "storage-no-configurado");
  try {
    return await fn();
  } catch (err) {
    if (err instanceof SupabaseError) {
      return NextResponse.json(
        { ok: false, motivo: "storage", sbStatus: err.sbStatus, sbError: err.sbError },
        { status: 502 }
      );
    }
    console.error("fichas", err);
    return error(500, "interno");
  }
}

export async function leerJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await request.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// --- Escrituras PostgREST ---------------------------------------------------

/** Inserta filas. Con `ignorarDuplicados`, un id repetido no falla ni duplica. */
export async function sbInsert(tabla: string, filas: unknown[], ignorarDuplicados = false) {
  const prefer = ignorarDuplicados
    ? "resolution=ignore-duplicates,return=minimal"
    : "return=minimal";
  const res = await fetch(sbUrl(`/rest/v1/${tabla}`), {
    method: "POST",
    headers: sbHeaders({ Prefer: prefer }),
    body: JSON.stringify(filas),
  });
  if (!res.ok) throw new SupabaseError(res.status, (await res.text()).slice(0, 300));
}

/** PATCH con filtro PostgREST. Devuelve las filas tocadas. */
export async function sbPatch<T = unknown>(path: string, cambios: Record<string, unknown>): Promise<T[]> {
  const res = await fetch(sbUrl(path), {
    method: "PATCH",
    headers: sbHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify(cambios),
  });
  if (!res.ok) throw new SupabaseError(res.status, (await res.text()).slice(0, 300));
  return res.json() as Promise<T[]>;
}

export function filtroChico(accountId: string, username: string): string {
  return `account_id=eq.${accountId}&username=eq.${encodeURIComponent(username)}`;
}

// --- Autenticación ----------------------------------------------------------

export type Admin = { email: string; accountId: string; username: string; rol: Rol };

/**
 * Administradora = titular o tutor del chico en Tablele (SPEC-fichas.md §3).
 * Devuelve la administradora o la respuesta de error a devolver.
 */
export async function autenticarAdmin(body: Record<string, unknown>): Promise<Admin | Response> {
  const accountId = String(body.accountId || "").trim();
  const username = String(body.username || "").trim().toLowerCase();
  const email = normalizarEmail(String(body.email || ""));
  if (!ACCOUNT_ID_RE.test(accountId) || !USERNAME_RE.test(username)) return error(403, "sin-acceso");
  if (!EMAIL_RE.test(email)) return error(403, "email-invalido");
  const acceso = await resolverRol(email, accountId, username);
  if (!acceso) return error(403, "sin-acceso");
  return { email, accountId, username, rol: acceso.rol };
}

export type Vinculo = {
  id: string;
  account_id: string;
  username: string;
  nombre: string;
  activo: boolean;
};

export function nuevoToken(): string {
  return randomBytes(16).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** El vinculado se identifica con el token del enlace, en el header X-Fichas-Token. */
export async function autenticarVinculo(request: Request): Promise<Vinculo | Response> {
  const token = (request.headers.get("x-fichas-token") || "").trim();
  if (!TOKEN_RE.test(token)) return error(401, "token-invalido");
  const filas = await sbGet<Vinculo[]>(
    `/rest/v1/${T_VINCULOS}?token_hash=eq.${hashToken(token)}&select=id,account_id,username,nombre,activo`
  );
  const v = filas?.[0];
  if (!v || !v.activo) {
    return error(401, "token-revocado", "Este enlace ya no está activo. Pedile uno nuevo a la familia.");
  }
  return v;
}

// --- Chico y objetivo -------------------------------------------------------

/** Nombre para mostrar del chico: el `nombre` de su config o, si no hay, el username. */
export async function nombreDelChico(accountId: string, username: string): Promise<string> {
  const filas = await sbGet<{ nombre: string | null }[]>(
    `/rest/v1/${TABLA_DATOS}?${filtroChico(accountId, username)}&select=nombre:config->>nombre`
  );
  const n = filas?.[0]?.nombre?.trim();
  return n || username;
}

export async function fichasEnRango(
  accountId: string,
  username: string,
  inicio: string,
  fin: string
): Promise<Ficha[]> {
  const { desde, hasta } = rangoUTC(inicio, fin);
  return sbGet<Ficha[]>(
    `/rest/v1/${T_FICHAS}?${filtroChico(accountId, username)}` +
      `&created_at=gte.${encodeURIComponent(desde)}&created_at=lt.${encodeURIComponent(hasta)}` +
      `&select=${COLS_FICHA}&order=created_at.desc&limit=2000`
  );
}

/**
 * Objetivo activo del chico. Si el período ya terminó, lo cierra (cumplido o
 * no según la suma) y devuelve null: no hay cron, se cierra al mirarlo.
 */
export async function objetivoActivo(accountId: string, username: string): Promise<Objetivo | null> {
  const filas = await sbGet<Objetivo[]>(
    `/rest/v1/${T_OBJETIVOS}?${filtroChico(accountId, username)}&cerrado_at=is.null&select=${COLS_OBJETIVO}`
  );
  const obj = filas?.[0];
  if (!obj) return null;
  if (!estaVencido(obj, hoyAR())) return obj;
  await cerrarObjetivo(accountId, username, obj);
  return null;
}

export async function cerrarObjetivo(accountId: string, username: string, obj: Objetivo) {
  const fichas = await fichasEnRango(accountId, username, obj.inicio, obj.fin);
  const cumplido = sumarEstrellas(fichas, obj) >= obj.meta;
  await sbPatch(
    `/rest/v1/${T_OBJETIVOS}?id=eq.${obj.id}&cerrado_at=is.null`,
    { cerrado_at: new Date().toISOString(), cumplido }
  );
}

// --- Dar y anular -----------------------------------------------------------

/**
 * Registra una ficha. El valor lo fija el servidor según el tipo, y el id lo
 * genera el cliente: un reintento con el mismo id no duplica.
 */
export async function darFicha(p: {
  accountId: string;
  username: string;
  body: Record<string, unknown>;
  dadaPor: string;
  dadaPorNombre: string;
}): Promise<Response> {
  const id = String(p.body.id || "").trim().toLowerCase();
  if (!UUID_RE.test(id)) return error(400, "id-invalido");
  const tipo = p.body.tipo;
  const comentario = limpiarTexto(p.body.comentario);
  const err = validarFicha(tipo, comentario);
  if (err || !esTipo(tipo)) return error(400, "ficha-invalida", err ?? undefined);

  await sbInsert(
    T_FICHAS,
    [
      {
        id,
        account_id: p.accountId,
        username: p.username,
        tipo,
        valor: VALOR[tipo],
        comentario,
        dada_por: p.dadaPor,
        dada_por_nombre: p.dadaPorNombre,
      },
    ],
    true
  );
  return NextResponse.json({ ok: true, id });
}

/** Marca una ficha como anulada. Sólo si es de ese chico y no estaba anulada. */
export async function anularFicha(
  accountId: string,
  username: string,
  fichaId: string,
  anuladaPor: string
): Promise<boolean> {
  const filas = await sbPatch(
    `/rest/v1/${T_FICHAS}?id=eq.${fichaId}&${filtroChico(accountId, username)}&anulada_at=is.null`,
    { anulada_at: new Date().toISOString(), anulada_por: anuladaPor }
  );
  return filas.length > 0;
}
