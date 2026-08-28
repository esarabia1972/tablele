// Registra el hook de alias. Uso:
//   node --experimental-strip-types --import ./lib/test/registrar.mjs lib/<runner>.ts
import { register } from "node:module";
register("./alias.hooks.mjs", import.meta.url);
