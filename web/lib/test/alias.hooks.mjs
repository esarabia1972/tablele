// Hook de resolución para correr los tests con Node: traduce el alias "@/..."
// de tsconfig.json a una ruta real con extensión .ts, que es lo que exige
// --experimental-strip-types. Sólo se usa en los runners de test.
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = path.join(RAIZ, specifier.slice(2));
    for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
      if (existsSync(cand)) return next(pathToFileURL(cand).href, context);
    }
  }
  return next(specifier, context);
}
