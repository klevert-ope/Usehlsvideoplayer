import { pathToFileURL } from "node:url";

const required = [
  "soak-30",
  "soak-360",
  "soak-1440",
  "device-macos",
  "device-ios",
  "device-android",
];

export function verifyQualificationRun(run, sha, repo) {
  if (
    run.head_sha !== sha ||
    run.head_branch !== "master" ||
    run.head_repository?.full_name !== repo ||
    run.path !== ".github/workflows/qualification.yml" ||
    !["workflow_dispatch", "schedule"].includes(run.event) ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    !Number.isSafeInteger(run.run_attempt) ||
    run.run_attempt < 1
  )
    throw new Error(
      "Qualification must be a successful trusted run for the exact release SHA",
    );
  return run.run_attempt;
}

export function verifyQualificationJobs(jobs) {
  for (const name of required) {
    const matches = jobs.filter((job) => job.name === name);
    if (
      matches.length !== 1 ||
      matches[0].status !== "completed" ||
      matches[0].conclusion !== "success"
    )
      throw new Error(`Missing successful qualification job: ${name}`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const {
    GITHUB_API_URL,
    GITHUB_REPOSITORY,
    GITHUB_SHA,
    GH_TOKEN,
    QUALIFICATION_RUN,
  } = process.env;
  if (
    !/^\d+$/.test(QUALIFICATION_RUN ?? "") ||
    !GITHUB_API_URL ||
    !GITHUB_REPOSITORY ||
    !GITHUB_SHA ||
    !GH_TOKEN
  )
    throw new Error(
      "Qualification requires a numeric run ID and the GitHub release context",
    );
  async function read(path) {
    const response = await fetch(
      `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/actions/runs/${QUALIFICATION_RUN}${path}`,
      {
        headers: {
          Authorization: `Bearer ${GH_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok)
      throw new Error(`Qualification lookup failed (${response.status})`);
    return response.json();
  }
  const attempt = verifyQualificationRun(
    await read(""),
    GITHUB_SHA,
    GITHUB_REPOSITORY,
  );
  verifyQualificationJobs(
    (await read(`/attempts/${attempt}/jobs?per_page=100`)).jobs,
  );
  console.log(
    `Qualification run ${QUALIFICATION_RUN}, attempt ${attempt}, matches ${GITHUB_SHA}`,
  );
}
