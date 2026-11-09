import { execFileSync } from "node:child_process";
import { tsc } from "./compiler.mjs";
for (const args of [["--noEmit"], ["-p", "tsconfig.playground.json"]])
  execFileSync(process.execPath, [tsc, ...args], { stdio: "inherit" });
