// Reglas de Tablele Fichas (lib/fichas.ts). Misma convención que los otros
// runners: sin framework, se corre desde web/
//
//   node --experimental-strip-types lib/fichas.run-tests.ts

import { CATALOGO } from "./catalogo-conductas.ts";
import {
  LLEVA_CONDUCTA,
  MAX_CONDUCTAS_ACTIVAS,
  tipoDeConducta,
  calcularSaldo,
  informePorConducta,
  lunesDe,
  ultimoCero,
  validarPremio,
  type Movimiento,
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
check("v2: doble sin comentario es válida (la conducta dice el por qué)", validarFicha("doble", null) === null);
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
  "v2: frase con conducta",
  fraseParaChico(f({ tipo: "doble", dada_por_nombre: "Seño Ana", conducta_texto: "terminar la tarea" })) ===
    "Seño Ana: ¡Gracias por terminar la tarea! Te dio un Vale Doble."
);
check(
  "frase de estrella",
  fraseParaChico(f({ tipo: "doble", dada_por_nombre: "Seño Ana", comentario: "ayudó" })) === "Seño Ana te dio un Vale Doble: ayudó"
);
check("frase de carita triste", fraseParaChico(f({ tipo: "triste", comentario: "gritó" })).startsWith("Mamá anotó una carita triste"));

// --- v2: conductas y saldo
check("estrellas llevan conducta, caritas no", LLEVA_CONDUCTA.estrella && LLEVA_CONDUCTA.doble && !LLEVA_CONDUCTA.feliz && !LLEVA_CONDUCTA.triste);
check("premio válido", validarPremio("cine", 40) === null);
check("premio sin precio falla", validarPremio("cine", 0) !== null);
check("premio sin nombre falla", validarPremio(null, 5) !== null);

const m = (p: Partial<Movimiento>): Movimiento => ({
  id: "m", tipo: "canje", premio_id: null, premio_nombre: null, costo: 0, saldo_antes: 0,
  hecho_por_nombre: "Mamá", created_at: "2026-11-20T18:00:00Z", anulado_at: null, ...p,
});
const fs = [
  f({ tipo: "estrella", created_at: "2026-11-20T10:00:00Z" }),
  f({ tipo: "doble", created_at: "2026-11-20T11:00:00Z" }),
  f({ tipo: "triste", created_at: "2026-11-20T12:00:00Z" }),
  f({ tipo: "doble", created_at: "2026-11-20T20:00:00Z" }),
  f({ tipo: "doble", created_at: "2026-11-20T21:00:00Z", anulada_at: "x" }),
];
check("saldo sin movimientos: 1+2+2", calcularSaldo(fs, []) === 5, String(calcularSaldo(fs, [])));
check("saldo con canje de 2", calcularSaldo(fs, [m({ costo: 2 })]) === 3);
check("canje anulado no descuenta", calcularSaldo(fs, [m({ costo: 2, anulado_at: "x" })]) === 5);
const cero = m({ tipo: "cero", created_at: "2026-11-20T19:00:00Z" });
check("después del cero sólo cuenta lo nuevo", calcularSaldo(fs, [cero]) === 2, String(calcularSaldo(fs, [cero])));
check("canje anterior al cero no descuenta", calcularSaldo(fs, [cero, m({ costo: 3 })]) === 2);
check("cero anulado vuelve todo", calcularSaldo(fs, [{ ...cero, anulado_at: "x" }]) === 5);
check("último cero ignora los anulados", ultimoCero([cero, m({ tipo: "cero", created_at: "2026-11-21T00:00:00Z", anulado_at: "x" })]) === cero.created_at);
check("saldo puede quedar negativo", calcularSaldo([], [m({ costo: 4 })]) === -4);

check("lunes de un jueves", lunesDe("2026-11-19T15:00:00Z") === "2026-11-16");
check("lunes de un domingo a la noche AR", lunesDe("2026-11-23T02:00:00Z") === "2026-11-16"); // dom 22 23:00 AR
check("lunes de un lunes", lunesDe("2026-11-16T12:00:00Z") === "2026-11-16");
const inf = informePorConducta(
  [
    f({ tipo: "estrella", conducta_id: "c1", conducta_texto: "la tarea", created_at: "2026-11-17T15:00:00Z" }),
    f({ tipo: "doble", conducta_id: "c1", conducta_texto: "la tarea", created_at: "2026-11-19T15:00:00Z" }),
    f({ tipo: "estrella", conducta_id: "c2", conducta_texto: "ordenar", created_at: "2026-11-10T15:00:00Z" }),
    f({ tipo: "estrella", created_at: "2026-11-18T15:00:00Z" }),
    f({ tipo: "feliz", created_at: "2026-11-18T15:00:00Z" }),
    f({ tipo: "estrella", conducta_id: "c2", conducta_texto: "ordenar", created_at: "2026-01-01T15:00:00Z" }),
  ],
  "2026-11-20"
);
check("informe: 8 semanas terminando en la actual", inf.semanas.length === 8 && inf.semanas[7] === "2026-11-16");
const c1 = inf.filas.find((x) => x.clave === "c1");
check("informe: la tarea suma 3 esta semana", c1?.porSemana["2026-11-16"] === 3 && c1?.total === 3);
check("informe: ordenar 1 (la de enero queda afuera)", inf.filas.find((x) => x.clave === "c2")?.total === 1);
check("informe: fila sin conducta", inf.filas.find((x) => x.clave === "sin")?.texto === "sin conducta");
check("informe: caritas no aparecen", inf.filas.reduce((a, x) => a + x.total, 0) === 5);

// --- v3: biblioteca y Vale Doble por conducta
check("conducta simple da estrella", tipoDeConducta({ doble: false }) === "estrella");
check("conducta Vale Doble da doble", tipoDeConducta({ doble: true }) === "doble");
check("máximo 6 activas", MAX_CONDUCTAS_ACTIVAS === 6);
check("catálogo: claves únicas", new Set(CATALOGO.map((c) => c.clave)).size === CATALOGO.length);
check("catálogo: textos válidos para '¡Gracias por …!'", CATALOGO.every((c) => c.texto.length <= 60 && c.texto === c.texto.toLowerCase().replace(/^./, (x) => x)));
check("catálogo: todos con pictograma", CATALOGO.every((c) => Number.isInteger(c.picto) && c.picto > 0));

// --- token
check("token corto (16 bytes) válido", TOKEN_RE.test("jm3cwyzQ-6dDYNr4IloDzr"));
check("token largo viejo (32 bytes) válido", TOKEN_RE.test("jm3cwyzQ-6dDYNr4IloDzre1dmP8SgNike5mTPrJFas"));
check("token de otro largo falla", !TOKEN_RE.test("abc"));
check("token con caracteres raros falla", !TOKEN_RE.test("jm3cwyzQ-6dDYNr4IloDz,"));

console.log(`${corridos - fallas}/${corridos} ok`);
if (fallas) process.exit(1);
