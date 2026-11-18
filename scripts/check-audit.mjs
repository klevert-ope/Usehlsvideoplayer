import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const picomatchAdvisory = "https://github.com/advisories/GHSA-fc5q-39xc-vjpf";
const severities = ["info", "low", "moderate", "high", "critical"];

export function evaluateAudit(report, lockfile) {
  const { vulnerabilities } = report;
  assert.ok(
    report.auditReportVersion === 2 &&
      !report.error &&
      vulnerabilities &&
      typeof vulnerabilities === "object" &&
      !Array.isArray(vulnerabilities),
    "Expected a complete npm audit report",
  );

  function isExcepted(name, ancestors = []) {
    if (ancestors.includes(name) || !Object.hasOwn(vulnerabilities, name)) {
      return false;
    }
    const { via, nodes } = vulnerabilities[name];
    return (
      Array.isArray(via) &&
      via.length > 0 &&
      via.every((cause) => {
        if (typeof cause === "string") {
          return isExcepted(cause, [...ancestors, name]);
        }
        return (
          name === "picomatch" &&
          cause?.url === picomatchAdvisory &&
          cause.severity === "high" &&
          Array.isArray(nodes) &&
          nodes.length > 0 &&
          nodes.every((path) => {
            const installed = lockfile.packages?.[path];
            return installed?.dev === true && installed.version === "4.0.7";
          })
        );
      })
    );
  }

  const blocking = [];
  const excepted = [];
  for (const [name, { severity }] of Object.entries(vulnerabilities)) {
    const level = severities.indexOf(severity);
    assert.notEqual(level, -1, `Unknown npm audit severity for ${name}`);
    if (level < severities.indexOf("moderate")) continue;
    (isExcepted(name) ? excepted : blocking).push(name);
  }
  return { blocking, excepted };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const npm = process.env.npm_execpath;
  assert.ok(npm, "Run npm run audit:ci");
  const audit = spawnSync(
    process.execPath,
    [npm, "audit", "--json", "--audit-level=moderate"],
    { encoding: "utf8" },
  );
  if (audit.error) throw audit.error;
  const result = evaluateAudit(
    JSON.parse(audit.stdout),
    JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url))),
  );
  assert.equal(
    audit.status,
    result.blocking.length + result.excepted.length > 0 ? 1 : 0,
    "npm audit exit status does not match its report",
  );
  if (result.excepted.length) {
    console.warn(
      `Development dependency exception for picomatch@4.0.7. ${picomatchAdvisory}`,
    );
  }
  if (result.blocking.length) {
    console.error(audit.stdout);
    process.exitCode = 1;
  }
}
