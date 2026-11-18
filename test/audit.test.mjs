import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateAudit } from "../scripts/check-audit.mjs";

const path = "node_modules/picomatch";
const advisory = {
  url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
  severity: "high",
};
const picomatch = { severity: "high", via: [advisory], nodes: [path] };
const vite = { severity: "high", via: ["picomatch"] };
const lockfile = { packages: { [path]: { version: "4.0.7", dev: true } } };
const report = (vulnerabilities) => ({
  auditReportVersion: 2,
  vulnerabilities,
});

test("excepts only the known development advisory and its inherited findings", () => {
  assert.deepEqual(evaluateAudit(report({ picomatch, vite }), lockfile), {
    blocking: [],
    excepted: ["picomatch", "vite"],
  });
  const runtimeLock = { packages: { [path]: { version: "4.0.7" } } };
  assert.deepEqual(evaluateAudit(report({ picomatch, vite }), runtimeLock), {
    blocking: ["picomatch", "vite"],
    excepted: [],
  });
});

test("blocks new advisories, unknown dependency paths and incomplete reports", () => {
  const unrelated = { url: "https://example.com/another-advisory" };
  assert.deepEqual(
    evaluateAudit(
      report({
        picomatch: { ...picomatch, via: [advisory, unrelated] },
        vite,
        unknown: { severity: "moderate", via: ["missing"] },
        low: { severity: "low", via: [unrelated] },
      }),
      lockfile,
    ),
    { blocking: ["picomatch", "vite", "unknown"], excepted: [] },
  );
  assert.throws(
    () => evaluateAudit({ error: {} }, lockfile),
    /complete npm audit/,
  );
});
