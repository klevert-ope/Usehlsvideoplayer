import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";

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
