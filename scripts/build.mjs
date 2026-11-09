import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const tsc = require.resolve("typescript/bin/tsc");
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
    "node10",
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
