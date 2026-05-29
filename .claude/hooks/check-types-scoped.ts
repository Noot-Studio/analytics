#!/usr/bin/env bun
// PostToolUse(Write|Edit) type-check, scoped to the edited file's workspace package.
// Avoids repo-wide `turbo check-types` (slow + fails on unrelated packages).
// Resolves the nearest package.json up from the edited file, then runs
// `turbo -F <pkg> check-types` (turbo-cached, near-instant when unchanged).
import { dirname, join } from "node:path";

const input = (await Bun.stdin.json()) as {
  tool_input?: { file_path?: string };
};
const filePath = input?.tool_input?.file_path ?? "";

// Only type-check TS/TSX edits.
if (!/\.(ts|tsx|mts|cts)$/.test(filePath)) {
  process.exit(0);
}

const repoRoot = process.cwd();
let dir = dirname(filePath);
let pkgName = "";
while (dir.startsWith(repoRoot) && dir !== repoRoot) {
  const pkgPath = join(dir, "package.json");
  if (await Bun.file(pkgPath).exists()) {
    try {
      const pkg = (await Bun.file(pkgPath).json()) as { name?: string };
      pkgName = pkg.name ?? "";
    } catch {
      pkgName = "";
    }
    break;
  }
  dir = dirname(dir);
}

// No owning package (e.g. edits under .claude/) → nothing to check.
if (!pkgName) {
  process.exit(0);
}

const proc = Bun.spawnSync(["bun", "turbo", "-F", pkgName, "check-types"], {
  cwd: repoRoot,
  stderr: "pipe",
  stdout: "pipe",
});

if (proc.exitCode !== 0) {
  process.stderr.write(proc.stdout.toString() + proc.stderr.toString());
  process.exit(2);
}
