// Tests de integración del manejo de usuarios: aislamiento por usuario,
// atribución de los pushes y merge al bajar del servidor.
//
//   node --experimental-strip-types --import ./lib/test/registrar.mjs lib/sync.run-tests.ts
//
// Cada bloque reproduce un bug REAL que se arregló. Si alguno vuelve a fallar,
// volvió el bug — están numerados igual que en FIX-manejo-usuarios.md.
//
// No usa vitest/jest (ver AGENTS.md: dependencias mínimas): stubea localStorage,
// fetch y los listeners del navegador, y después importa los módulos de verdad.

// El warn de dev de lib/sync.ts ensucia la salida en el caso que falla a
// propósito; acá sólo interesan los asserts.
process.env.NODE_ENV = "production";

// --- stubs de navegador (ANTES de importar los módulos) ----------------------

type Registro = { url: string; body: Record<string, unknown>; keepalive: boolean };

const almacen = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => (almacen.has(k) ? almacen.get(k)! : null),
  setItem: (k: string, v: string) => void almacen.set(k, String(v)),
  removeItem: (k: string) => void almacen.delete(k),
  clear: () => almacen.clear(),
  key: (i: number) => [...almacen.keys()][i] ?? null,
  get length() {
    return almacen.size;
  },
};

let posts: Registro[] = [];
let respuestaGet: unknown = { ok: true, data: null };
let fallarPost = false;

const g = globalThis as Record<string, unknown>;
g.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
};
g.document = {
  addEventListener: () => {},
  removeEventListener: () => {},
  visibilityState: "visible",
};
// navigator existe en Node 22 y es de sólo lectura: hay que redefinirlo.
Object.defineProperty(globalThis, "navigator", {
  value: { sendBeacon: () => true },
  configurable: true,
  writable: true,
});
g.localStorage = localStorageStub;
g.fetch = async (url: string, init?: RequestInit) => {
  if (init?.method === "POST") {
    posts.push({
      url,
      body: JSON.parse(String(init.body)),
      keepalive: !!init.keepalive,
    });
    if (fallarPost) {
      return { ok: false, status: 502, json: async () => ({ ok: false }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, updated_at: new Date().toISOString() }),
    };
  }
  return { ok: true, status: 200, json: async () => respuestaGet };
};

const { BASES, claveDe, K_SESSION } = await import("@/lib/claves");
const sync = await import("@/lib/sync");
const storage = await import("@/lib/storage");

// --- utilidades --------------------------------------------------------------

let fallas = 0;
let corridos = 0;

function check(nombre: string, cond: boolean, detalle = "") {
  corridos++;
  if (!cond) {
    console.error(`FALLA  ${nombre}${detalle ? `  →  ${detalle}` : ""}`);
    fallas++;
  }
}

async function reset() {
  await sync.cerrarSesionSync();
  almacen.clear();
  posts = [];
  fallarPost = false;
  respuestaGet = { ok: true, data: null };
}

function entrarComo(username: string) {
  localStorageStub.setItem(K_SESSION, JSON.stringify({ username }));
}

/** Simula que este navegador ya bajó la fila del usuario. */
function hidratar(username: string) {
  localStorageStub.setItem(claveDe(BASES.syncAt, username), new Date(0).toISOString());
}

const configDe = (u: string) =>
  JSON.parse(localStorageStub.getItem(claveDe(BASES.config, u)) || "null");
const eventosDe = (u: string) =>
  JSON.parse(localStorageStub.getItem(claveDe(BASES.eventos, u)) || "[]");

// =============================================================================
// BUG-04 — aislamiento por usuario
// =============================================================================

await reset();
entrarComo("ana");
storage.saveConfig({ metodo: "SELEC", nivel: "Global", palabras: [], nombre: "Ana" });
entrarComo("beto");

check(
  "la config de un usuario no se le aparece a otro",
  storage.getConfig().nombre !== "Ana"
);
check(
  "un usuario nuevo arranca con el set de palabras por defecto",
  storage.getConfig().palabras.length === 27
);
check(
  "el default es una copia, no la instancia compartida",
  storage.getConfig().palabras !== storage.getConfig().palabras
);

await reset();
localStorageStub.removeItem(K_SESSION);
storage.saveConfig({ metodo: "SELEC", nivel: "Global", palabras: [] });
check(
  "sin sesión NO se escribe nada (antes iba a un bucket compartido)",
  [...almacen.keys()].filter((k) => k.startsWith("tablele.config")).length === 0
);

// =============================================================================
// BUG-05 — la migración legacy ya no está atada al usuario "manu"
// =============================================================================

await reset();
localStorageStub.setItem("tablele.config", JSON.stringify({ nombre: "viejo" }));
entrarComo("beto");
storage.migrarLegacy("beto");
check(
  "lo legacy se adopta para el usuario que entra, no para 'manu'",
  configDe("beto")?.nombre === "viejo" && configDe("manu") === null
);
check(
  "lo legacy queda respaldado, no se pierde",
  JSON.parse(localStorageStub.getItem("tablele.legacy.config") || "null")?.nombre === "viejo"
);
storage.migrarLegacy("beto");
check("la migración corre una sola vez", localStorageStub.getItem("tablele.config") === null);

// =============================================================================
// BUG-02 — un push pendiente pertenece al usuario que lo generó
// =============================================================================

await reset();
entrarComo("ana");
hidratar("ana");
storage.recordEvento({
  t: Date.now(), juego: "wp", palabra: "casa", elegida: "casa",
  ok: true, intento: 1, ms: 1200, ayuda: false,
});
// el adulto cambia de chico ANTES de que dispare el debounce
entrarComo("beto");
storage.setStars(1);
await new Promise((r) => setTimeout(r, 50));

check(
  "el push pendiente se sube con el username del chico que SALE",
  posts.some((p) => p.body.username === "ana"),
  `usernames vistos: ${posts.map((p) => p.body.username).join(", ") || "ninguno"}`
);
check(
  "y NUNCA con el username del chico que entra",
  !posts.some((p) => p.body.username === "beto" && Array.isArray((p.body.stats as {eventos?: unknown[]})?.eventos)),
  "beto no puede subir el informe de ana"
);

await reset();
entrarComo("ana");
hidratar("ana");
storage.setStars(3);
await sync.cerrarSesionSync();
check(
  "cerrar sesión sube lo pendiente en vez de descartarlo",
  posts.some((p) => p.body.username === "ana" && p.body.stars === 3)
);

// =============================================================================
// BUG-03 — nunca subir el informe de un usuario no hidratado
// =============================================================================

await reset();
entrarComo("beto"); // sin hidratar: este navegador nunca bajó su fila
storage.recordEvento({
  t: Date.now(), juego: "wp", palabra: "sol", elegida: "sol",
  ok: true, intento: 1, ms: 900, ayuda: false,
});
await sync.flushPush().catch(() => {});
check(
  "un usuario sin hidratar no sube stats (borraba su historial en el server)",
  !posts.some((p) => p.body.stats !== undefined),
  JSON.stringify(posts.map((p) => Object.keys(p.body)))
);

await reset();
entrarComo("beto");
storage.saveConfig({ metodo: "SELEC", nivel: "Global", nombre: "recien", palabras: [] });
let avisoDeSinSincronizar = false;
await sync.flushPush().catch(() => { avisoDeSinSincronizar = true; });
check(
  "sin hidratar tampoco sube la config (pisaría las palabras buenas del server)",
  !posts.some((p) => p.body.config !== undefined)
);
check("y el guardado local se conserva igual", configDe("beto")?.nombre === "recien");
check("pero avisa que no se sincronizó (no miente al adulto)", avisoDeSinSincronizar);

await reset();
entrarComo("beto");
hidratar("beto");
storage.recordEvento({
  t: Date.now(), juego: "wp", palabra: "sol", elegida: "sol",
  ok: true, intento: 1, ms: 900, ayuda: false,
});
await sync.flushPush();
check("ya hidratado, sí sube stats", posts.some((p) => p.body.stats !== undefined));
check(
  "cada evento sale con id (para que el merge sea exacto)",
  eventosDe("beto").every((e: { id?: string }) => typeof e.id === "string" && e.id.length > 0)
);

// =============================================================================
// BUG-01 — keepalive nunca con un payload que supere la cuota de 64 KiB
// =============================================================================

await reset();
entrarComo("ana");
hidratar("ana");
const muchos = Array.from({ length: 1500 }, (_, i) => ({
  id: `e${i}`, t: 1700000000000 + i, juego: "wp", palabra: "elefante",
  elegida: "elefante", ok: true, intento: 1, ms: 3210, ayuda: false,
}));
localStorageStub.setItem(claveDe(BASES.eventos, "ana"), JSON.stringify(muchos));
storage.setStars(2);
storage.recordEvento({
  t: Date.now(), juego: "wp", palabra: "casa", elegida: "casa",
  ok: true, intento: 1, ms: 800, ayuda: false,
});
await sync.flushPush();
const grande = posts.find((p) => JSON.stringify(p.body).length > 64 * 1024);
check("el payload de prueba efectivamente supera los 64 KiB", !!grande,
  `tamaño: ${Math.max(...posts.map((p) => JSON.stringify(p.body).length))} bytes`);
check(
  "un payload grande NO viaja con keepalive (el navegador lo rechazaba en silencio)",
  !!grande && grande.keepalive === false
);
check("y llega igual al servidor", !!grande && grande.body.username === "ana");

// =============================================================================
// BUG-01/06 — el pull no puede pisar cambios locales sin confirmar
// =============================================================================

await reset();
entrarComo("ana");
hidratar("ana");
fallarPost = true; // el guardado al servidor falla (offline / error)
storage.saveConfig({ metodo: "SELEC", nivel: "Global", nombre: "nueva", palabras: [] });
await sync.flushPush().catch(() => {});
fallarPost = false;
respuestaGet = {
  ok: true,
  data: {
    config: { metodo: "SELEC", nivel: "Global", nombre: "vieja", palabras: [] },
    stars: 0,
    stats: { eventos: [], uso: {} },
    updated_at: new Date(Date.now() - 60_000).toISOString(),
  },
};
await sync.syncFromServer("ana");
check(
  "si el guardado no llegó, el pull NO revierte a las palabras viejas",
  configDe("ana")?.nombre === "nueva",
  `quedó: ${configDe("ana")?.nombre}`
);

await reset();
entrarComo("ana");
hidratar("ana");
respuestaGet = {
  ok: true,
  data: {
    config: { metodo: "SELEC", nivel: "Global", nombre: "del server", palabras: [] },
    stars: 2,
    stats: { eventos: [], uso: {} },
    updated_at: new Date().toISOString(),
  },
};
await sync.syncFromServer("ana");
check(
  "sin cambios locales pendientes, sí baja lo del server",
  configDe("ana")?.nombre === "del server"
);

// =============================================================================
// BUG-06 — el informe se fusiona, nunca se sobrescribe
// =============================================================================

await reset();
entrarComo("ana");
hidratar("ana");
localStorageStub.setItem(
  claveDe(BASES.eventos, "ana"),
  JSON.stringify([{ id: "local1", t: 2000, juego: "wp", palabra: "casa", elegida: "casa", ok: true, intento: 1, ms: 900, ayuda: false }])
);
respuestaGet = {
  ok: true,
  data: {
    stats: {
      eventos: [{ id: "remoto1", t: 1000, juego: "pw", palabra: "sol", elegida: "sol", ok: true, intento: 1, ms: 700, ayuda: false }],
      uso: { "2026-01-01": 300 },
    },
    updated_at: new Date().toISOString(),
  },
};
await sync.syncFromServer("ana");
const ids = eventosDe("ana").map((e: { id: string }) => e.id);
check(
  "el pull fusiona el informe local con el del servidor",
  ids.includes("local1") && ids.includes("remoto1"),
  ids.join(",")
);

// un GET vacío no puede borrar lo local
await reset();
entrarComo("ana");
hidratar("ana");
localStorageStub.setItem(
  claveDe(BASES.eventos, "ana"),
  JSON.stringify([{ id: "l1", t: 1, juego: "wp", palabra: "casa", elegida: "casa", ok: true, intento: 1, ms: 1, ayuda: false }])
);
respuestaGet = { ok: true, data: { stats: null, updated_at: new Date().toISOString() } };
await sync.syncFromServer("ana");
check("una fila vacía en el server no borra el informe local", eventosDe("ana").length === 1);

// =============================================================================
// Borrado explícito (candado adulto)
// =============================================================================

await reset();
entrarComo("ana");
hidratar("ana");
localStorageStub.setItem(
  claveDe(BASES.eventos, "ana"),
  JSON.stringify([{ id: "viejo", t: Date.now() - 5000, juego: "wp", palabra: "casa", elegida: "casa", ok: true, intento: 1, ms: 1, ayuda: false }])
);
storage.clearMetricas();
await new Promise((r) => setTimeout(r, 10));
check("borrar historial vacía lo local", eventosDe("ana").length === 0);
check(
  "y avisa al servidor con forzarBorrado",
  posts.some((p) => p.body.forzarBorrado === true && p.body.username === "ana")
);
respuestaGet = {
  ok: true,
  data: {
    stats: { eventos: [{ id: "viejo", t: Date.now() - 5000, juego: "wp", palabra: "casa", elegida: "casa", ok: true, intento: 1, ms: 1, ayuda: false }], uso: {} },
    updated_at: new Date().toISOString(),
  },
};
await sync.syncFromServer("ana");
check(
  "el merge no resucita lo que el adulto borró",
  eventosDe("ana").length === 0,
  JSON.stringify(eventosDe("ana"))
);

// =============================================================================
// Higiene de dispositivo
// =============================================================================

await reset();
entrarComo("ana");
hidratar("ana");
storage.saveConfig({ metodo: "SELEC", nivel: "Global", nombre: "Ana", palabras: [] });
storage.recordarUsuario("ana");
storage.limpiarDatosLocales("ana");
check(
  "borrar los datos de la tablet no deja rastro de ese usuario",
  [...almacen.keys()].filter((k) => k.endsWith("_ana")).length === 0
);
check("y lo saca de la lista de usuarios conocidos", !storage.listarUsuariosLocales().includes("ana"));

// -----------------------------------------------------------------------------

await sync.cerrarSesionSync();
if (fallas === 0) {
  console.log(`OK — ${corridos}/${corridos} casos de manejo de usuarios`);
} else {
  console.error(`\n${fallas} de ${corridos} casos fallaron`);
  process.exit(1);
}
