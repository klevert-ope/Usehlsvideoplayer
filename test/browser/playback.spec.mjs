import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";

const fixture = "/fixtures/master.m3u8";
const noRetry = {
  maxTimeToFirstByteMs: 1000,
  maxLoadTimeMs: 2000,
  timeoutRetry: null,
  errorRetry: null,
};

async function begin(page, path = "/") {
  await page.goto(path);
  await expect(page.getByTestId("status")).toHaveText("ready");
  await page.getByRole("button", { name: "Play stream" }).click();
  await expect(page.getByTestId("status")).toHaveText("playing");
}

test("VOD decodes through hls.js, changes rendition and selects alternate audio and captions", async ({
  page,
}) => {
  await begin(page);
  await expect(page.getByTestId("engine")).toHaveText("hls.js");
  const video = page.locator("video");
  await expect
    .poll(() => video.evaluate((element) => element.currentTime))
    .toBeGreaterThan(0.25);
  await page.getByLabel("Quality").selectOption({ label: "180p" });
  await expect(page.getByTestId("current-quality")).toHaveText("0");
  await expect
    .poll(() => video.evaluate((element) => element.videoHeight))
    .toBe(180);
  await page.getByLabel("Quality").selectOption({ label: "360p" });
  await expect(page.getByTestId("current-quality")).toHaveText("1");
  await expect
    .poll(() => video.evaluate((element) => element.videoHeight))
    .toBe(360);
  await page.getByLabel("Quality").selectOption("auto");
  const audio = page.waitForRequest(/audio\/index\.m3u8/);
  await page.getByLabel("Audio").selectOption({ label: "Alternate" });
  await audio;
  const captions = page.waitForResponse(/english\.vtt/);
  await page.getByLabel("Subtitles").selectOption({ label: "English" });
  expect((await captions).ok()).toBe(true);
  await expect
    .poll(() =>
      video.evaluate((element) =>
        Array.from(element.textTracks).some(
          (track) =>
            track.mode === "showing" &&
            Array.from(track.cues ?? []).some(
              (cue) => cue.text === "Fixture caption.",
            ),
        ),
      ),
    )
    .toBe(true);
  await page.getByLabel("Subtitles").selectOption("off");
  await expect
    .poll(() =>
      video.evaluate((element) =>
        Array.from(element.textTracks).some(
          (track) => track.mode === "showing",
        ),
      ),
    )
    .toBe(false);
});

test("rolling live playlist exposes an advancing seekable window and seek-to-live", async ({
  page,
}) => {
  await begin(page, "/?live");
  const button = page.getByRole("button", { name: "Seek to live" });
  await expect(button).toBeEnabled();
  const video = page.locator("video");
  const edge = await video.evaluate((element) =>
    element.seekable.end(element.seekable.length - 1),
  );
  await expect
    .poll(() =>
      video.evaluate((element) =>
        element.seekable.end(element.seekable.length - 1),
      ),
    )
    .toBeGreaterThan(edge);
  await video.evaluate((element) => {
    element.currentTime = element.seekable.start(0);
  });
  const behind = await video.evaluate((element) => element.currentTime);
  await button.click();
  await expect
    .poll(() => video.evaluate((element) => element.currentTime))
    .toBeGreaterThan(behind + 1);
  expect(
    Number(await page.getByTestId("live-latency").textContent()),
  ).toBeGreaterThanOrEqual(0);
});

test("recovers from an actual failed segment request and reaches a terminal error on malformed manifests", async ({
  page,
}) => {
  let interrupted = 0;
  await page.route(/\/seg\d+\.ts$/, async (route) => {
    if (interrupted++ === 0)
      await route.fulfill({ status: 503, body: "temporary failure" });
    else await route.continue();
  });
  await page.goto("/?fastRecovery&singleVariant");
  await expect(page.getByTestId("recovery")).toHaveText("recovered");
  await page.getByRole("button", { name: "Play stream" }).click();
  await expect(page.getByTestId("status")).toHaveText("playing");
  await expect
    .poll(() => page.locator("video").evaluate((video) => video.currentTime))
    .toBeGreaterThan(0.2);
  await page.route("**/corrupt.m3u8", (route) =>
    route.fulfill({ body: "not an HLS playlist" }),
  );
  await page.getByLabel("Manifest URL").fill("/corrupt.m3u8");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByTestId("status")).toHaveText("error");
  await expect(page.getByTestId("error-code")).toHaveText("manifest");
  await expect(page.getByTestId("recovery")).toHaveText("—");
});

test("authenticated requests send headers to trusted origins and reject expiry, redirects and untrusted children", async ({
  page,
}) => {
  await page.goto("/");
  const token = "private-fixture-credential";
  const leaked = [];
  const credentialled = [];
  await page.route("**/signed/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (pathname === "/signed/target.m3u8") leaked.push(request.url());
    credentialled.push({
      pathname,
      header: request.headers()["x-fixture-token"],
    });
    if (pathname === "/signed/expired.m3u8")
      await route.fulfill({ status: 403, body: token });
    else if (pathname === "/signed/redirect.m3u8")
      await route.fulfill({
        status: 302,
        headers: { location: "/signed/target.m3u8" },
      });
    else
      await route.fulfill({
        body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=700000,CODECS="avc1.42c00c,mp4a.40.2"\nhttp://localhost:4173/untrusted.m3u8\n',
      });
  });
  await page.route("**/untrusted.m3u8", async (route) => {
    leaked.push(route.request().url());
    await route.abort();
  });
  async function run(path) {
    return page.evaluate(
      async ({ path, token, noRetry }) => {
        const { createPlaybackController } = await import("/src/core.ts");
        const controller = createPlaybackController();
        const video = document.createElement("video");
        const terminal = new Promise((resolve) =>
          controller.subscribe(() => {
            if (controller.getState().status === "error")
              resolve(controller.getState().error);
          }),
        );
        controller.setSource(video, path + "?signature=" + token, {
          request: {
            allowedOrigins: [location.origin],
            headers: () => ({ "X-Fixture-Token": token }),
          },
          recovery: false,
          hlsConfig: {
            manifestLoadPolicy: { default: noRetry },
            levelLoadPolicy: { default: noRetry },
          },
        });
        try {
          return await terminal;
        } finally {
          controller.destroy();
        }
      },
      { path, token, noRetry },
    );
  }
  expect(await run("/signed/expired.m3u8")).toMatchObject({
    code: "authentication",
    httpStatus: 403,
    retryable: false,
  });
  const redirect = await run("/signed/redirect.m3u8");
  expect(redirect.fatal).toBe(true);
  const untrusted = await run("/signed/child.m3u8");
  expect(untrusted).toMatchObject({ code: "request-policy", retryable: false });
  expect(JSON.stringify([redirect, untrusted])).not.toContain(token);
  expect(leaked).toEqual([]);
  expect(credentialled).toEqual([
    { pathname: "/signed/expired.m3u8", header: token },
    { pathname: "/signed/redirect.m3u8", header: token },
    { pathname: "/signed/child.m3u8", header: token },
  ]);
});

test("authenticated playback applies headers to both the manifest and media segments", async ({
  page,
}) => {
  await page.goto("/");
  const credential = "local-test-token";
  const seen = [];
  await page.route("**/fixtures/**", async (route) => {
    if (route.request().headers()["x-fixture-token"] === credential)
      seen.push(new URL(route.request().url()).pathname);
    await route.continue();
  });
  const result = await page.evaluate(async (credential) => {
    const { createPlaybackController } = await import("/src/core.ts");
    const controller = createPlaybackController();
    const video = document.createElement("video");
    video.muted = true;
    document.body.append(video);
    const terminal = new Promise((resolve) =>
      controller.subscribe(() => {
        const { status, error, currentTime } = controller.getState();
        if (status === "error") resolve(error?.code);
        if (status === "playing" && currentTime > 0.2) resolve("playing");
      }),
    );
    controller.setSource(video, "/fixtures/low/index.m3u8", {
      autoPlay: true,
      request: {
        allowedOrigins: [location.origin],
        headers: () => ({ "X-Fixture-Token": credential }),
      },
    });
    try {
      return await terminal;
    } finally {
      controller.destroy();
      video.remove();
    }
  }, credential);
  expect(result).toBe("playing");
  expect(seen).toContain("/fixtures/low/index.m3u8");
  expect(seen).toContain("/fixtures/low/seg000.ts");
});

test("repeatable local playback and source-switch benchmark", async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const revoke = URL.revokeObjectURL.bind(URL);
    window.revokedFixtureUrls = new Set();
    URL.revokeObjectURL = (url) => {
      window.revokedFixtureUrls.add(url);
      revoke(url);
    };
  });
  await begin(page);
  const metrics = page.getByTestId("metrics");
  const video = page.locator("video");
  await expect
    .poll(async () => JSON.parse(await metrics.textContent()).totalFrames)
    .toBeGreaterThan(10);
  const vod = JSON.parse(await metrics.textContent());
  const cdp = await page.context().newCDPSession(page);
  const heap = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
    return (await cdp.send("Runtime.getHeapUsage")).usedSize;
  };
  const baselineHeap = await heap();
  const switches = [];
  async function clear() {
    const src = await video.evaluate((element) => element.currentSrc);
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByTestId("status")).toHaveText("idle");
    await expect
      .poll(() =>
        video.evaluate(
          (element, src) => ({
            hasSource:
              element.hasAttribute("src") ||
              Boolean(element.querySelector("source[src]")),
            readyState: element.readyState,
            revoked: window.revokedFixtureUrls.has(src),
          }),
          src,
        ),
      )
      .toEqual({ hasSource: false, readyState: 0, revoked: true });
  }
  for (let i = 0; i < 5; i++) {
    await clear();
    const start = performance.now();
    await page.getByLabel("Manifest URL").fill(`${fixture}?run=${i}`);
    await page.getByRole("button", { name: "Load", exact: true }).click();
    await expect(page.getByTestId("status")).toHaveText("ready");
    switches.push(Math.round(performance.now() - start));
  }
  await page.getByRole("button", { name: "Live fixture" }).click();
  await expect(
    page.getByRole("button", { name: "Seek to live" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Play stream" }).click();
  await expect
    .poll(async () => JSON.parse(await metrics.textContent()).liveLatency)
    .toBeGreaterThanOrEqual(0);
  const live = JSON.parse(await metrics.textContent());
  await clear();
  const finalHeap = await heap();
  const results = {
    vod,
    live,
    sourceSwitchMs: switches,
    baselineHeap,
    finalHeap,
    heapDeltaBytes: finalHeap - baselineHeap,
  };
  expect(vod.startupMs).toBeGreaterThan(0);
  expect(vod.rebufferRatio).toBeGreaterThanOrEqual(0);
  expect(vod.rebufferRatio).toBeLessThanOrEqual(1);
  const evidence = info.outputPath("benchmark.json");
  writeFileSync(evidence, JSON.stringify(results, null, 2));
  await info.attach("local-playback-benchmark", {
    path: evidence,
    contentType: "application/json",
  });
  console.log(JSON.stringify(results));
});
