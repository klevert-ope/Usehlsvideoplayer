import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tsc } from "./compiler.mjs";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(workspace, "dist");

rmSync(dist, { recursive: true, force: true });
execFileSync(process.execPath, [tsc], { cwd: workspace, stdio: "inherit" });
execFileSync(
  process.execPath,
  [
    tsc,
    "--module",
    "commonjs",
    "--moduleResolution",
    "bundler",
    "--esModuleInterop",
    "--verbatimModuleSyntax",
    "false",
    "--outDir",
    "dist/cjs",
  ],
  { cwd: workspace, stdio: "inherit" },
);

mkdirSync(join(dist, "cjs"), { recursive: true });
writeFileSync(join(dist, "cjs", "package.json"), '{"type":"commonjs"}\n');
