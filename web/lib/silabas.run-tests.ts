// Runner de los casos de lib/silabas.test.ts.
// El repo no usa vitest/jest a propósito (mantener dependencias mínimas), así
// que esto se corre a mano desde web/:
//
//   node --experimental-strip-types lib/silabas.run-tests.ts
//
// No forma parte del build ni del deploy. Sale con código 1 si algo falla,
// así también sirve para un hook de pre-commit o un paso de CI.
//
// Está excluido de tsconfig.json: los imports llevan extensión .ts porque
// Node la exige, y eso a tsc no le gusta (TS5097).

import { CASOS } from "./silabas.test.ts";
import { silabear } from "./silabas.ts";

let fallas = 0;

for (const [palabra, esperado] of CASOS) {
  const obtenido = silabear(palabra).join("-");
  if (obtenido !== esperado) {
    console.error(`FALLA  "${palabra}"  →  ${obtenido}   (esperado: ${esperado})`);
    fallas++;
  }
}

if (fallas === 0) {
  console.log(`OK — ${CASOS.length}/${CASOS.length} casos de silabeo`);
} else {
  console.error(`\n${fallas} de ${CASOS.length} casos fallaron`);
  process.exit(1);
}
