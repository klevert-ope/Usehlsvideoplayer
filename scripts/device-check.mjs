import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const {
  DEVICE_DRIVER,
  DEVICE_CAPABILITIES,
  DEVICE_FIXTURE_ORIGIN,
  DEVICE_PLATFORM,
  GITHUB_SHA,
} = process.env;
assert.ok(
  DEVICE_DRIVER && DEVICE_CAPABILITIES && DEVICE_FIXTURE_ORIGIN && GITHUB_SHA,
  "Configure the physical device runner and fixture origin",
);
assert.ok(["macos", "ios", "android"].includes(DEVICE_PLATFORM));
const capabilities = JSON.parse(DEVICE_CAPABILITIES);
const isAndroid = DEVICE_PLATFORM === "android";
assert.match(capabilities.browserName, isAndroid ? /^chrome$/i : /^safari$/i);
if (DEVICE_PLATFORM !== "macos")
  assert.ok(
    capabilities["appium:udid"],
    "Pin the physical device UDID on the runner",
  );
const engine = isAndroid ? "hls.js" : "native";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "0.0.0.0",
    "--port",
    "4175",
    "--strictPort",
  ],
  { stdio: "inherit" },
);
let session;
async function driver(path, method, body) {
  const response = await fetch(`${DEVICE_DRIVER.replace(/\/$/, "")}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60_000),
  });
  const { value } = await response.json();
  if (!response.ok || value?.error)
    throw new Error(
      `WebDriver ${method} ${path.split("/").at(-1)} failed (${response.status}: ${value?.error ?? "unknown"})`,
    );
  return value;
}
async function poll(fn, timeout = 20_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await delay(300);
  }
  throw new Error(
    "Physical device did not reach the expected state before the deadline",
  );
}
try {
  await poll(() =>
    fetch("http://127.0.0.1:4175/fixture-revision")
      .then((r) => r.text())
      .then((sha) => sha === GITHUB_SHA)
      .catch(() => false),
  );
  ({ sessionId: session } = await driver("/session", "POST", {
    capabilities: { alwaysMatch: capabilities },
  }));
  const call = (path, method, body) =>
    driver(`/session/${session}${path}`, method, body);
  const execute = (script) =>
    call("/execute/sync", "POST", { script, args: [] });
  await call("/url", "POST", {
    url: `${DEVICE_FIXTURE_ORIGIN}/device.html?engine=${engine}`,
  });
  await poll(() =>
    execute(
      'return window.deviceSample && !document.querySelector("#play").disabled',
    ),
  );
  const element = await call("/element", "POST", {
    using: "css selector",
    value: "#play",
  });
  await call(
    `/element/${element["element-6066-11e4-a52e-4f735466cecf"]}/click`,
    "POST",
    {},
  );
  const result = await poll(async () => {
    const state = await execute("return window.deviceSample()");
    assert.equal(state.revision, GITHUB_SHA);
    assert.notEqual(state.status, "error", state.error?.message);
    return state.status === "playing" &&
      state.currentTime > 1 &&
      state.decoded > 10
      ? state
      : null;
  });
  assert.equal(result.engine, engine);
  assert.match(
    result.agent,
    { android: /Android/, ios: /iPhone|iPad|Mobile/, macos: /Macintosh/ }[
      DEVICE_PLATFORM
    ],
  );
  await execute("window.deviceDestroy()");
  await poll(async () => {
    const state = await execute("return window.deviceSample()");
    return state.status === "destroyed" && !state.hasSource;
  });
  mkdirSync("test-results/device", { recursive: true });
  writeFileSync(
    `test-results/device/${DEVICE_PLATFORM}.json`,
    JSON.stringify(
      {
        platform: DEVICE_PLATFORM,
        revision: GITHUB_SHA,
        agent: result.agent,
        decoded: result.decoded,
        engine,
        teardown: "passed",
      },
      null,
      2,
    ),
  );
} finally {
  try {
    if (session) await driver(`/session/${session}`, "DELETE");
  } finally {
    server.kill();
  }
}
