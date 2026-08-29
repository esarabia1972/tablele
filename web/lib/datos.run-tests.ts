// Casos de prueba del merge de métricas (lib/eventos.ts) y de la normalización
// de usernames (lib/claves.ts). Misma convención que lib/silabas.run-tests.ts:
// sin vitest/jest, se corre a mano desde web/
//
//   node --experimental-strip-types lib/datos.run-tests.ts
//
// Cada caso corresponde a un bug real del manejo de usuarios; si alguno vuelve
// a fallar, volvió el bug. Excluido de tsconfig.json (imports con extensión .ts).

import {
  MAX_EVENTOS,
  mergeEventos,
  mergeUso,
  idEvento,
  type EventoCrudo,
} from "./eventos.ts";
import {
  normalizarUsername,
  normalizarEmail,
  claveDe,
  USERNAME_RE,
  EMAIL_RE,
  ACCOUNT_ID_RE,
} from "./claves.ts";

let fallas = 0;
let corridos = 0;

function check(nombre: string, cond: boolean, detalle = "") {
  corridos++;
  if (!cond) {
    console.error(`FALLA  ${nombre}${detalle ? `  →  ${detalle}` : ""}`);
    fallas++;
  }
}

function ev(t: number, extra: Partial<EventoCrudo> = {}): EventoCrudo {
  return {
    t,
    juego: "wp",
    palabra: "casa",
    elegida: "casa",
    ok: true,
    intento: 1,
    ms: 1000,
    ayuda: false,
    ...extra,
  };
}

// --- mergeEventos ------------------------------------------------------------

check(
  "une lo local y lo remoto sin perder nada",
  mergeEventos([ev(2)], [ev(1)]).length === 2
);

check(
  "no duplica el mismo evento con id",
  mergeEventos([ev(1, { id: "a" })], [ev(1, { id: "a" })]).length === 1
);

check(
  "no duplica eventos viejos sin id (identidad por contenido)",
  mergeEventos([ev(1)], [ev(1)]).length === 1
);

check(
  "queda ordenado cronológicamente",
  mergeEventos([ev(3), ev(1)], [ev(2)])
    .map((e) => e.t)
    .join(",") === "1,2,3"
);

check(
  "ante colisión gana el local (es el más reciente)",
  mergeEventos([ev(1, { id: "x", ok: false })], [ev(1, { id: "x", ok: true })])[0].ok === false
);

// BUG: un push viejo o un segundo dispositivo NO puede vaciar el historial.
check(
  "un lado vacío no borra el historial del otro",
  mergeEventos([], [ev(1), ev(2)]).length === 2 && mergeEventos([ev(1)], []).length === 1
);

check(
  "descarta eventos anteriores a un borrado explícito",
  mergeEventos([ev(500)], [ev(100), ev(200)], 300).map((e) => e.t).join(",") === "500"
);

check(
  "respeta el tope de eventos",
  mergeEventos(
    Array.from({ length: MAX_EVENTOS + 50 }, (_, i) => ev(i + 1)),
    []
  ).length === MAX_EVENTOS
);

check(
  "conserva los MÁS NUEVOS al recortar",
  mergeEventos(
    Array.from({ length: MAX_EVENTOS + 5 }, (_, i) => ev(i + 1)),
    []
  ).at(-1)!.t === MAX_EVENTOS + 5
);

check("ignora basura en la lista", mergeEventos([null, 3, ev(1)], undefined).length === 1);

check(
  "idEvento usa el id cuando está",
  idEvento(ev(1, { id: "abc" })) === "abc" && idEvento(ev(7)).startsWith("7|")
);

// --- mergeUso ----------------------------------------------------------------

check(
  "el uso toma el máximo por día, nunca la suma",
  mergeUso({ "2026-01-01": 100 }, { "2026-01-01": 60 })["2026-01-01"] === 100
);

check(
  "sincronizar dos veces no infla el uso",
  (() => {
    const a = mergeUso({ "2026-01-01": 100 }, {});
    const b = mergeUso(a, a);
    return b["2026-01-01"] === 100;
  })()
);

check(
  "une días distintos",
  Object.keys(mergeUso({ "2026-01-01": 10 }, { "2026-01-02": 20 })).length === 2
);

check(
  "descarta días anteriores al borrado",
  Object.keys(mergeUso({ "2026-03-05": 10 }, { "2026-01-02": 20 }, "2026-02-01")).join() ===
    "2026-03-05"
);

check("ignora valores no numéricos o negativos", (() => {
  const r = mergeUso({ "2026-01-01": -5, "2026-01-02": "x" }, {});
  return Object.keys(r).length === 0;
})());

// --- usernames ---------------------------------------------------------------

check("normaliza tildes y espacios", normalizarUsername("Ana Peña") === "anapena");
check("saca símbolos", normalizarUsername("juan.perez!") === "juanperez");
check("respeta guion bajo y dígitos", normalizarUsername("Mati_2019") === "mati_2019");
check("corta a 20", normalizarUsername("a".repeat(40)).length === 20);
check(
  "lo normalizado pasa la validación del server",
  USERNAME_RE.test(normalizarUsername("Ana Peña"))
);
check("rechaza demasiado corto", !USERNAME_RE.test("ab"));

// BUG: las claves DEBEN llevar cuenta y chico; sin eso se comparte el bucket.
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
check(
  "la clave lleva la cuenta y el chico",
  claveDe("tablele.config", A, "ana") === `tablele.config_${A}_ana`
);
check(
  "dos chicos de la misma cuenta nunca comparten clave",
  claveDe("tablele.config", A, "ana") !== claveDe("tablele.config", A, "beto")
);
check(
  "el mismo nombre en dos cuentas tampoco",
  claveDe("tablele.config", A, "manu") !== claveDe("tablele.config", B, "manu")
);

// --- correos y cuentas -------------------------------------------------------

check("el correo se normaliza", normalizarEmail("  Leti@Hotmail.COM ") === "leti@hotmail.com");
check("acepta un correo normal", EMAIL_RE.test("letialberti@hotmail.com"));
check("rechaza uno sin arroba", !EMAIL_RE.test("letialberti.hotmail.com"));
check("rechaza uno sin dominio", !EMAIL_RE.test("leti@hotmail"));
check("rechaza espacios", !EMAIL_RE.test("le ti@hotmail.com"));
check("lo normalizado pasa la validación", EMAIL_RE.test(normalizarEmail(" Leti@Hotmail.com ")));

check("acepta un uuid de cuenta", ACCOUNT_ID_RE.test(A));
check("rechaza cualquier otra cosa como cuenta", !ACCOUNT_ID_RE.test("ana"));
check(
  "rechaza un intento de inyección en el filtro de PostgREST",
  !ACCOUNT_ID_RE.test("11111111-1111-4111-8111-111111111111&username=eq.otro")
);

// -----------------------------------------------------------------------------

if (fallas === 0) {
  console.log(`OK — ${corridos}/${corridos} casos de datos/usuarios`);
} else {
  console.error(`\n${fallas} de ${corridos} casos fallaron`);
  process.exit(1);
}
