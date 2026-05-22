import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { access, constants } from "node:fs/promises";

const execFile = promisify(execFileCb);

const ENV_PATH = process.env.CWEBP_PATH;
const CANDIDATES = [
  "/opt/homebrew/bin/cwebp", // macOS Apple Silicon
  "/usr/local/bin/cwebp", // macOS Intel
  "/usr/bin/cwebp", // Linux (Debian/Ubuntu/Alpine package webp)
];

let resolvedPath: string | null = null;

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the cwebp binary path at runtime. Caches result after first call.
 *
 * Search order:
 *   1. CWEBP_PATH env var
 *   2. Common system paths (mac brew, mac local, linux)
 *   3. `which cwebp` via shell
 *
 * Throws a descriptive error if not found, so misconfigured prod boxes fail
 * loudly with install instructions instead of silently 500-ing.
 */
export async function resolveCwebp(): Promise<string> {
  if (resolvedPath) return resolvedPath;

  if (ENV_PATH && (await isExecutable(ENV_PATH))) {
    resolvedPath = ENV_PATH;
    return resolvedPath;
  }

  for (const candidate of CANDIDATES) {
    if (await isExecutable(candidate)) {
      resolvedPath = candidate;
      return resolvedPath;
    }
  }

  // Last resort: shell which
  try {
    const { stdout } = await execFile("which", ["cwebp"]);
    const path = stdout.trim();
    if (path && (await isExecutable(path))) {
      resolvedPath = path;
      return resolvedPath;
    }
  } catch {
    // ignore
  }

  throw new Error(
    "cwebp binary not found. Install: macOS `brew install webp`, " +
      "Ubuntu/Debian `apt install webp`, Alpine `apk add libwebp-tools`. " +
      "Or set CWEBP_PATH env var to the binary location.",
  );
}
