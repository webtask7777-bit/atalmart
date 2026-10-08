import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const EXTS = [".ts", ".tsx", ".mts", ".js", ".mjs"];

function withExtension(base) {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTS) if (existsSync(base + ext)) return base + ext;
  for (const ext of EXTS) {
    const idx = join(base, "index" + ext);
    if (existsSync(idx)) return idx;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const target = withExtension(join(SRC, specifier.slice(2)));
    if (!target) throw new Error(`[tests/alias-loader] cannot resolve ${specifier}`);
    return { url: pathToFileURL(target).href, shortCircuit: true };
  }
  // Relative imports inside src/ are extension-less too.
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    const target = withExtension(base);
    if (target && target !== base) return { url: pathToFileURL(target).href, shortCircuit: true };
  }
  return next(specifier, context);
}
