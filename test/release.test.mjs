import assert from "node:assert/strict";
import { test } from "node:test";
import {
  verifyQualificationJobs,
  verifyQualificationRun,
} from "../scripts/check-qualification.mjs";

test("release qualification rejects stale, forked, skipped and spoofed evidence", () => {
  const sha = "a".repeat(40);
  const repo = "example/player";
  const run = {
    head_sha: sha,
    head_branch: "master",
    head_repository: { full_name: repo },
    path: ".github/workflows/qualification.yml",
    event: "workflow_dispatch",
    status: "completed",
    conclusion: "success",
    run_attempt: 2,
  };
  assert.equal(verifyQualificationRun(run, sha, repo), 2);
  for (const change of [
    { head_sha: "b".repeat(40) },
    { head_repository: { full_name: "fork/player" } },
    { path: ".github/workflows/other.yml" },
    { event: "pull_request" },
    { conclusion: "cancelled" },
    { head_branch: "fork" },
  ])
    assert.throws(
      () => verifyQualificationRun({ ...run, ...change }, sha, repo),
      /exact release SHA/,
    );
  const jobs = [
    "soak-30",
    "soak-360",
    "soak-1440",
    "device-macos",
    "device-ios",
    "device-android",
  ].map((name) => ({ name, status: "completed", conclusion: "success" }));
  verifyQualificationJobs(jobs);
  assert.throws(
    () => verifyQualificationJobs(jobs.slice(0, 5)),
    /device-android/,
  );
  assert.throws(
    () =>
      verifyQualificationJobs(
        jobs.map((job) =>
          job.name === "soak-1440" ? { ...job, conclusion: "skipped" } : job,
        ),
      ),
    /soak-1440/,
  );
  assert.throws(() => verifyQualificationJobs([...jobs, jobs[0]]), /soak-30/);
});
