// Tablele Fichas — piezas de servidor compartidas por /api/fichas/*.
// Sólo se importa desde route.ts (usa la service key a través de lib/supabase).

import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { ACCOUNT_ID_RE, EMAIL_RE, USERNAME_RE, normalizarEmail, type Rol } from "@/lib/claves";
import {
  BUCKET_FOTOS,
  SupabaseError,
  TABLA_DATOS,
  hayStorage,
  resolverRol,
  sbGet,
  sbHeaders,
  sbUrl,
} from "@/lib/supabase";
import {
  LLEVA_CONDUCTA,
  TOKEN_RE,
  UUID_RE,
  VALOR,
  calcularSaldo,
  esTipo,
  tipoDeConducta,
  limpiarTexto,
  validarFicha,
  fechaArgentina,
  rangoUTC,
  ultimoCero,
  type Conducta,
  type Ficha,
  type Movimiento,
} from "@/lib/fichas";

export const T_VINCULOS = "fichas_vinculos";
export const T_FICHAS = "fichas";
export const T_CONDUCTAS = "fichas_conductas";
export const T_PREMIOS = "fichas_premios";
export const T_MOVIMIENTOS = "fichas_movimientos";

export const COLS_FICHA =
  "id,tipo,valor,comentario,dada_por,dada_por_nombre,created_at,anulada_at,conducta_id,conducta_texto";
export const COLS_CONDUCTA = "id,texto,picto,foto,orden,activa,doble,catalogo";
export const COLS_PREMIO = "id,nombre,precio,picto,foto,orden,activo";
export const COLS_MOV =
  "id,tipo,premio_id,premio_nombre,costo,saldo_antes,hecho_por_nombre,created_at,anulado_at";

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

// --- Fotos propias ---------------------------------------------------------------

/** Carpeta pública donde van las fotos de conductas y premios de un chico. */
export function prefijoFotos(accountId: string, username: string): string {
  return `${accountId}/${username}/fichas/`;
}

/**
 * Una foto sólo se acepta si es una URL de NUESTRO bucket, en la carpeta de
 * ESE chico. Así nadie guarda un enlace a cualquier sitio.
 */
export function limpiarFoto(raw: unknown, accountId: string, username: string): string | null {
  if (typeof raw !== "string" || !raw) return null;
  const base = sbUrl(`/storage/v1/object/public/${BUCKET_FOTOS}/${prefijoFotos(accountId, username)}`);
  return raw.startsWith(base) && /^[A-Za-z0-9._-]+$/.test(raw.slice(base.length)) ? raw : null;
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

// --- Saldo -------------------------------------------------------------------

/** Todos los movimientos del chico (canjes y ceros). Son pocos: un puñado por semana. */
export async function movimientosDe(accountId: string, username: string): Promise<Movimiento[]> {
  return sbGet<Movimiento[]>(
    `/rest/v1/${T_MOVIMIENTOS}?${filtroChico(accountId, username)}&select=${COLS_MOV}&order=created_at.desc&limit=5000`
  );
}

/** Saldo actual, con las fichas desde el último cero vigente. */
export async function saldoActual(
  accountId: string,
  username: string,
  movs?: Movimiento[]
): Promise<{ saldo: number; movs: Movimiento[] }> {
  const m = movs ?? (await movimientosDe(accountId, username));
  const desde = ultimoCero(m);
  const filtroDesde = desde ? `&created_at=gt.${encodeURIComponent(desde)}` : "";
  const fichas = await sbGet<Pick<Ficha, "tipo" | "created_at" | "anulada_at">[]>(
    `/rest/v1/${T_FICHAS}?${filtroChico(accountId, username)}${filtroDesde}` +
      `&anulada_at=is.null&valor=gt.0&select=tipo,created_at,anulada_at&limit=20000`
  );
  return { saldo: calcularSaldo(fichas, m), movs: m };
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
  let tipo = p.body.tipo;
  const comentario = limpiarTexto(p.body.comentario);

  // Las fichas con conducta (estrella / Vale Doble, o "conducta" a secas)
  // llevan una conducta ACTIVA de ESE chico, y v3: el valor lo define la
  // conducta, no quien la da. Las caritas son libres. Texto y valor se congelan.
  let conducta: Conducta | null = null;
  if (tipo === "conducta" || (esTipo(tipo) && LLEVA_CONDUCTA[tipo])) {
    const conductaId = String(p.body.conductaId || "").trim().toLowerCase();
    if (!UUID_RE.test(conductaId)) {
      return error(400, "falta-conducta", "Elegí por qué se gana la estrella.");
    }
    const filas = await sbGet<Conducta[]>(
      `/rest/v1/${T_CONDUCTAS}?id=eq.${conductaId}&${filtroChico(p.accountId, p.username)}&select=${COLS_CONDUCTA}`
    );
    conducta = filas?.[0] ?? null;
    if (!conducta || !conducta.activa) {
      return error(400, "conducta-inactiva", "Esa conducta ya no está en la lista. Volvé a elegir.");
    }
    tipo = tipoDeConducta(conducta);
  }
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
        conducta_id: conducta?.id ?? null,
        conducta_texto: conducta?.texto ?? null,
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
