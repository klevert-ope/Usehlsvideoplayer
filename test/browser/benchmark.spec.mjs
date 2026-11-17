import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";

const fixture = "/fixtures/master.m3u8";

async function begin(page, path = "/") {
  await page.goto(path);
  await expect(page.getByTestId("status")).toHaveText("ready");
  await page.getByRole("button", { name: "Play stream" }).click();
  await expect(page.getByTestId("status")).toHaveText("playing");
}

test("automatic bitrate drops when actual Chromium transfer throughput is reduced", async ({
  page,
}, info) => {
  test.setTimeout(45_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  const throttle = (downloadThroughput) =>
    cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 30,
      downloadThroughput,
      uploadThroughput: 1_000_000,
    });
  await throttle(1_500_000);
  await page.goto("/blank.html");
  await page.evaluate(async () => {
    const { createPlaybackController } = await import("/src/core.ts");
    const controller = createPlaybackController();
    const video = document.createElement("video");
    video.muted = true;
    document.body.append(video);
    window.abr = { controller, video };
    controller.setSource(video, "/fixtures/master.m3u8", {
      autoPlay: true,
      hlsConfig: {
        startLevel: 1,
        testBandwidth: false,
        abrEwmaDefaultEstimate: 3_000_000,
        maxBufferLength: 3,
        maxMaxBufferLength: 4,
      },
    });
  });
  const sample = () =>
    page.evaluate(() => ({
      height: window.abr.video.videoHeight,
      quality: window.abr.controller.getState().quality,
    }));
  await expect.poll(async () => (await sample()).height).toBe(360);
  const initial = await sample();
  expect(initial.quality.mode).toBe("auto");
  const start = performance.now();
  await throttle(65_000);
  await expect
    .poll(async () => (await sample()).height, { timeout: 24_000 })
    .toBe(180);
  expect((await sample()).quality.mode).toBe("auto");
  const artifact = info.outputPath("abr-throttle.json");
  writeFileSync(
    artifact,
    JSON.stringify({
      downshiftMs: performance.now() - start,
      beforeBytesPerSecond: 1500000,
      afterBytesPerSecond: 65000,
    }),
  );
  await info.attach("abr-throttle", {
    path: artifact,
    contentType: "application/json",
  });
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
  await page.addInitScript(() => {
    const began = performance.now();
    document.addEventListener(
      "loadeddata",
      (event) => {
        if (!(event.target instanceof HTMLVideoElement)) return;
        event.target.requestVideoFrameCallback(() => {
          window.firstFixtureFrameMs ??= performance.now() - began;
        });
      },
      true,
    );
  });
  await begin(page);
  const metrics = page.getByTestId("metrics");
  const video = page.locator("video");
  await expect
    .poll(async () => JSON.parse(await metrics.textContent()).totalFrames)
    .toBeGreaterThan(10);
  const vod = JSON.parse(await metrics.textContent());
  const firstPresentedFrameFromNavigationMs = await page.evaluate(
    () => window.firstFixtureFrameMs,
  );
  expect(firstPresentedFrameFromNavigationMs).toBeGreaterThan(0);
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
    .poll(async () => JSON.parse(await metrics.textContent()).totalFrames)
    .toBeGreaterThan(10);
  const live = JSON.parse(await metrics.textContent());
  await clear();
  const finalHeap = await heap();
  const results = {
    vod,
    firstPresentedFrameFromNavigationMs,
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
