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
  const job = {
    name: "device-android",
    status: "completed",
    conclusion: "success",
  };
  verifyQualificationJobs([job]);
  for (const jobs of [
    [],
    [job, job],
    [{ ...job, name: "another-job" }],
    [{ ...job, status: "in_progress" }],
    [{ ...job, conclusion: "failure" }],
    [{ ...job, conclusion: "skipped" }],
  ])
    assert.throws(() => verifyQualificationJobs(jobs), /device-android/);
});
