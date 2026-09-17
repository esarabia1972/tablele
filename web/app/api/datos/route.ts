import { NextResponse } from "next/server";
import {
  ACCOUNT_ID_RE,
  EMAIL_RE,
  GOAL,
  MAX_TUTORES,
  USERNAME_RE,
  normalizarEmail,
} from "@/lib/claves";
import { MAX_EVENTOS, mergeEventos, mergeUso, type Stats } from "@/lib/eventos";
import {
  SupabaseError,
  TABLA_DATOS,
  hayStorage,
  resolverRol,
  sbGet,
  sbUpsert,
} from "@/lib/supabase";

// Persistencia server-side en Supabase.
// Una fila por chico, direccionada por (account_id, username).

const API_VERSION = 7; // para verificar qué versión está deployada

type Fila = {
  config?: unknown;
  stars?: number | null;
  stats?: Partial<Stats> | null;
  updated_at?: string | null;
};

function filtro(accountId: string, username: string): string {
  return `account_id=eq.${accountId}&username=eq.${encodeURIComponent(username)}`;
}

async function leerFila(accountId: string, username: string): Promise<Fila | null> {
  const rows = await sbGet<Fila[]>(
    `/rest/v1/${TABLA_DATOS}?${filtro(accountId, username)}&select=config,stars,stats,updated_at`
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

function errorDeSupabase(err: unknown) {
  if (err instanceof SupabaseError) {
    return NextResponse.json(
      { ok: false, v: API_VERSION, sbStatus: err.sbStatus, sbError: err.sbError },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: false, v: API_VERSION }, { status: 500 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountId = (searchParams.get("accountId") || "").trim();
  const username = (searchParams.get("username") || "").trim().toLowerCase();
  const email = normalizarEmail(searchParams.get("email") || "");

  if (!ACCOUNT_ID_RE.test(accountId) || !USERNAME_RE.test(username)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, motivo: "email-invalido" }, { status: 403 });
  }
  if (!hayStorage()) {
    return NextResponse.json({ ok: false, reason: "storage-no-configurado" });
  }

  try {
    // Sin esto, conocer un accountId y adivinar un nombre alcanzaría para leer
    // el informe de cualquier chico de esa cuenta.
    const acceso = await resolverRol(email, accountId, username);
    if (!acceso) {
      return NextResponse.json({ ok: false, motivo: "sin-acceso" }, { status: 403 });
    }
    return NextResponse.json({
      ok: true,
      v: API_VERSION,
      rol: acceso.rol,
      data: await leerFila(accountId, username),
    });
  } catch (err) {
    return errorDeSupabase(err);
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "json-invalido" }, { status: 400 });
  }

  const accountId = String(body.accountId || "").trim();
  const username = String(body.username || "").trim().toLowerCase();
  const email = normalizarEmail(String(body.email || ""));

  if (!ACCOUNT_ID_RE.test(accountId) || !USERNAME_RE.test(username)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, motivo: "email-invalido" }, { status: 403 });
  }
  if (!hayStorage()) {
    return NextResponse.json({ ok: false, reason: "storage-no-configurado" });
  }

  // Borrado explícito del historial (candado adulto en el informe).
  const forzarBorrado = body.forzarBorrado === true;

  const updatedAt = new Date().toISOString();
  const row: Record<string, unknown> = {
    account_id: accountId,
    username,
    updated_at: updatedAt,
  };

  try {
    const acceso = await resolverRol(email, accountId, username);
    if (!acceso) {
      return NextResponse.json({ ok: false, motivo: "sin-acceso" }, { status: 403 });
    }
    const esTutor = acceso.rol === "tutor";

    // LA REGLA: un tutor nunca escribe config. Juega y mira.
    // Se ignora en silencio en vez de rechazar el request: si llega config de
    // un tutor es un bug del cliente o una manipulación, y en ninguno de los
    // dos casos conviene romperle el guardado de las estrellas al chico.
    if (!esTutor && body.config !== undefined && body.config !== null) {
      row.config = body.config;
    }
    if (typeof body.stars === "number" && Number.isFinite(body.stars)) {
      row.stars = Math.max(0, Math.min(Math.round(body.stars), GOAL));
    }

    // Borrar el informe sí es un error explícito: el tutor lo pidió a propósito.
    if (forzarBorrado && esTutor) {
      return NextResponse.json(
        { ok: false, motivo: "solo-titular", message: "Sólo el titular puede borrar el informe." },
        { status: 403 }
      );
    }

    // Los adultos a cargo los define únicamente el titular.
    if (body.tutores !== undefined) {
      if (esTutor) {
        return NextResponse.json(
          { ok: false, motivo: "solo-titular", message: "Sólo el titular puede cambiar los adultos a cargo." },
          { status: 403 }
        );
      }
      const lista = Array.isArray(body.tutores) ? body.tutores : [];
      const limpios: (string | null)[] = [];
      for (const bruto of lista.slice(0, MAX_TUTORES)) {
        const t = normalizarEmail(String(bruto ?? ""));
        if (!t) {
          limpios.push(null);
          continue;
        }
        if (!EMAIL_RE.test(t)) {
          return NextResponse.json(
            { ok: false, motivo: "email-invalido", message: `"${bruto}" no es un correo válido.` },
            { status: 400 }
          );
        }
        // Sin repetir: el mismo adulto no ocupa las dos posiciones.
        limpios.push(limpios.includes(t) ? null : t);
      }
      while (limpios.length < MAX_TUTORES) limpios.push(null);
      row.tutor1 = limpios[0];
      row.tutor2 = limpios[1];
    }

    if (body.stats !== undefined && body.stats !== null) {
      if (forzarBorrado) {
        row.stats = { eventos: [], uso: {} };
      } else {
        // El informe NUNCA se sobrescribe: se fusiona con lo que ya hay.
        // Así dos dispositivos —o un push viejo que llega tarde— no pueden
        // borrar historial.
        const actual = await leerFila(accountId, username);
        const entrante = body.stats as Partial<Stats>;
        row.stats = {
          eventos: mergeEventos(entrante.eventos, actual?.stats?.eventos).slice(-MAX_EVENTOS),
          uso: mergeUso(entrante.uso, actual?.stats?.uso),
        };
      }
    }

    await sbUpsert(`/rest/v1/${TABLA_DATOS}?on_conflict=account_id,username`, [row]);
    return NextResponse.json({ ok: true, v: API_VERSION, updated_at: updatedAt });
  } catch (err) {
    return errorDeSupabase(err);
  }
}
