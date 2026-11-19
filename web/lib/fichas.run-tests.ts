// Reglas de Tablele Fichas (lib/fichas.ts). Misma convención que los otros
// runners: sin framework, se corre desde web/
//
//   node --experimental-strip-types lib/fichas.run-tests.ts

import {
  TOKEN_RE,
  VALOR,
  diasRestantes,
  estaVencido,
  fechaArgentina,
  fraseParaChico,
  limpiarTexto,
  puedeAnularVinculado,
  rangoUTC,
  sumarEstrellas,
  validarFicha,
  validarObjetivo,
  type Ficha,
} from "./fichas.ts";

let fallas = 0;
let corridos = 0;
function check(nombre: string, cond: boolean, detalle = "") {
  corridos++;
  if (!cond) {
    fallas++;
    console.error(`✗ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}

const f = (p: Partial<Ficha>): Ficha => ({
  id: "x",
  tipo: "estrella",
  valor: 1,
  comentario: null,
  dada_por: "admin:a@b.com",
  dada_por_nombre: "Mamá",
  created_at: "2026-11-20T15:00:00Z",
  anulada_at: null,
  ...p,
});

// --- valores
check("estrella vale 1, doble 2", VALOR.estrella === 1 && VALOR.doble === 2);
check("las caritas no valen", VALOR.feliz === 0 && VALOR.triste === 0);

// --- validación
check("estrella sin comentario es válida", validarFicha("estrella", null) === null);
check("feliz sin comentario es válida", validarFicha("feliz", null) === null);
check("doble sin comentario falla", validarFicha("doble", null) !== null);
check("triste sin comentario falla", validarFicha("triste", null) !== null);
check("triste con comentario es válida", validarFicha("triste", "le pegó al hermano") === null);
check("tipo inventado falla", validarFicha("diez", "x") !== null);
check("comentario larguísimo falla", validarFicha("estrella", "a".repeat(201)) !== null);
check("limpiarTexto colapsa vacío a null", limpiarTexto("   ") === null);
check("limpiarTexto colapsa espacios", limpiarTexto("  hola   che ") === "hola che");

// --- fechas en Argentina
check("00:30 UTC es el día anterior en AR", fechaArgentina("2026-11-21T00:30:00Z") === "2026-11-20");
check("03:00 UTC ya es el día en AR", fechaArgentina("2026-11-21T03:00:00Z") === "2026-11-21");
const r = rangoUTC("2026-11-20", "2026-11-26");
check("rango arranca a las 03:00 UTC", r.desde === "2026-11-20T03:00:00.000Z", r.desde);
check("rango termina el día siguiente al fin", r.hasta === "2026-11-27T03:00:00.000Z", r.hasta);
check("días restantes cuenta hoy", diasRestantes("2026-11-26", "2026-11-20") === 7);
check("último día = 1", diasRestantes("2026-11-20", "2026-11-20") === 1);
check("vencido = 0", diasRestantes("2026-11-19", "2026-11-20") === 0);

// --- suma
const obj = { inicio: "2026-11-20", fin: "2026-11-26" };
const lista = [
  f({ tipo: "estrella" }),
  f({ tipo: "doble" }),
  f({ tipo: "feliz" }),
  f({ tipo: "triste" }),
  f({ tipo: "doble", anulada_at: "2026-11-20T16:00:00Z" }),
  f({ tipo: "estrella", created_at: "2026-11-20T02:00:00Z" }), // 19/11 en AR: afuera
  f({ tipo: "estrella", created_at: "2026-11-27T02:59:00Z" }), // 26/11 23:59 en AR: adentro
  f({ tipo: "triste", valor: 5 }), // valor raro en la fila: no suma igual
];
check("suma: 1 + 2 + 1, sin caritas ni anuladas ni fuera de rango", sumarEstrellas(lista, obj) === 4, String(sumarEstrellas(lista, obj)));
check("las caritas solas no suman", sumarEstrellas([f({ tipo: "feliz" }), f({ tipo: "triste" })], obj) === 0);

// --- objetivo
const hoy = "2026-11-20";
check("objetivo válido", validarObjetivo(20, "cine", "2026-11-20", "2026-11-26", hoy) === null);
check("meta 0 falla", validarObjetivo(0, "cine", "2026-11-20", "2026-11-26", hoy) !== null);
check("meta decimal falla", validarObjetivo(2.5, "cine", "2026-11-20", "2026-11-26", hoy) !== null);
check("sin premio falla", validarObjetivo(20, null, "2026-11-20", "2026-11-26", hoy) !== null);
check("fin antes de inicio falla", validarObjetivo(20, "cine", "2026-11-26", "2026-11-20", hoy) !== null);
check("fin en el pasado falla", validarObjetivo(20, "cine", "2026-11-10", "2026-11-19", hoy) !== null);
check("vencido si el fin pasó", estaVencido({ fin: "2026-11-19", cerrado_at: null }, hoy));
check("no vencido el último día", !estaVencido({ fin: "2026-11-20", cerrado_at: null }, hoy));
check("cerrado no se re-cierra", !estaVencido({ fin: "2026-11-01", cerrado_at: "x" }, hoy));

// --- anulación del vinculado
const ahora = Date.parse("2026-11-20T15:10:00Z");
const mia = f({ dada_por: "vinculo:v1", created_at: "2026-11-20T15:00:00Z" });
check("anula lo suyo dentro de 15 min", puedeAnularVinculado(mia, "v1", ahora));
check("no anula lo de otro", !puedeAnularVinculado(mia, "v2", ahora));
check("no anula pasados 15 min", !puedeAnularVinculado(mia, "v1", ahora + 6 * 60 * 1000));
check("no anula de una administradora", !puedeAnularVinculado(f({}), "v1", ahora));
check("no re-anula", !puedeAnularVinculado({ ...mia, anulada_at: "x" }, "v1", ahora));

// --- voz
check(
  "frase de estrella",
  fraseParaChico(f({ tipo: "doble", dada_por_nombre: "Seño Ana", comentario: "ayudó" })) === "Seño Ana te dio un Vale Doble: ayudó"
);
check("frase de carita triste", fraseParaChico(f({ tipo: "triste", comentario: "gritó" })).startsWith("Mamá anotó una carita triste"));

// --- token
check("token corto (16 bytes) válido", TOKEN_RE.test("jm3cwyzQ-6dDYNr4IloDzr"));
check("token largo viejo (32 bytes) válido", TOKEN_RE.test("jm3cwyzQ-6dDYNr4IloDzre1dmP8SgNike5mTPrJFas"));
check("token de otro largo falla", !TOKEN_RE.test("abc"));
check("token con caracteres raros falla", !TOKEN_RE.test("jm3cwyzQ-6dDYNr4IloDz,"));

console.log(`${corridos - fallas}/${corridos} ok`);
if (fallas) process.exit(1);
