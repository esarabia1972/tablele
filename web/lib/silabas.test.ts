// Casos de prueba para lib/silabas.ts.
// El repo no usa vitest/jest (ver AGENTS.md/CLAUDE.md: mantener dependencias mínimas),
// así que este archivo solo EXPORTA los casos. Se corren manualmente con:
//   node --experimental-strip-types lib/silabas.run-tests.ts
// (script temporal, no forma parte del build ni de una suite automática).

export const CASOS: [string, string][] = [
  // Los 27 casos default del plan del arquitecto
  ["auto", "au-to"],
  ["bebé", "be-bé"],
  ["casa", "ca-sa"],
  ["dedo", "de-do"],
  ["elefante", "e-le-fan-te"],
  ["fideos", "fi-de-os"],
  ["gato", "ga-to"],
  ["helado", "he-la-do"],
  ["india", "in-dia"],
  ["jugo", "ju-go"],
  ["kiosco", "kios-co"],
  ["luna", "lu-na"],
  ["manuel", "ma-nuel"],
  ["nene", "ne-ne"],
  ["ñoqui", "ño-qui"],
  ["oso", "o-so"],
  ["papá", "pa-pá"],
  ["queso", "que-so"],
  ["ratón", "ra-tón"],
  ["sol", "sol"],
  ["tractor", "trac-tor"],
  ["uva", "u-va"],
  ["vaca", "va-ca"],
  ["wifi", "wi-fi"],
  ["xilofón", "xi-lo-fón"],
  ["yogur", "yo-gur"],
  ["zapato", "za-pa-to"],
  // Suplementarios
  ["coche", "co-che"],
  ["pollo", "po-llo"],
  ["guitarra", "gui-ta-rra"],
  ["agua", "a-gua"],
  ["perro", "pe-rro"],
  ["plato", "pla-to"],
  ["día", "dí-a"],
  // F5: blend "tl" (convención americana, es la que corresponde en rioplatense)
  ["atlas", "a-tlas"],
  ["atleta", "a-tle-ta"],
  // F8: trim() defensivo ante espacios accidentales al configurar la palabra
  [" luna ", "lu-na"],
];
