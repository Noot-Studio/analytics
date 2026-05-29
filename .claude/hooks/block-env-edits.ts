#!/usr/bin/env bun
// PreToolUse(Write|Edit) guard.
// CLAUDE.md: every app/.env.example is a symlink to the single root .env.example,
// validated by packages/env zod schemas. Editing a real .env (or clobbering the
// symlink target) breaks local setup + CI. Block it; allow .env.example only.
const input = (await Bun.stdin.json()) as {
  tool_input?: { file_path?: string };
};
const filePath = input?.tool_input?.file_path ?? "";
const base = filePath.split("/").pop() ?? "";

const isEnvFile = /^\.env(\..+)?$/.test(base);
if (isEnvFile && base !== ".env.example") {
  process.stderr.write(
    `Blocked: ${filePath} is managed via the root .env.example (single source, symlinked) ` +
      "and validated by packages/env. Edit .env.example and its zod schema instead.\n"
  );
  process.exit(2);
}
