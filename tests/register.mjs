// Registers the "@/..." → "src/..." alias for `node --test`. Node runs .ts
// files with type stripping natively (Node ≥ 22.18 / 24), so the regression
// suite needs no transpiler or test framework — just this resolver.
import { register } from "node:module";
register("./alias-loader.mjs", import.meta.url);
