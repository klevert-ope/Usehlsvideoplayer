import { expect, test } from "@playwright/test";

async function initialise(page) {
  await page.goto("/blank.html");
  await page.evaluate(async () => {
    const { createPlaybackController } = await import("/src/core.ts");
    const video = document.createElement("video");
    video.muted = true;
    document.body.append(video);
    const controller = createPlaybackController();
    window.upgrade = { video, controller, frames: 0, events: [] };
    video.requestVideoFrameCallback(function frame() {
      window.upgrade.frames++;
      video.requestVideoFrameCallback(frame);
    });
    controller.onEvent((event) => window.upgrade.events.push(event));
  });
}

test("playground demonstrates renewal and keeps the quality controls distinct", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Source / }).click();
  await page.getByRole("button", { name: "Test credential renewal" }).click();
  await expect(page.getByTestId("status")).toHaveText("ready");
  await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await expect(page.getByTestId("recovery")).toHaveText("recovered");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "play", exact: true }).press("Space");
  await expect(page.getByTestId("status")).toHaveText("playing");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByText("Quality options").click();
  await expect(page.getByLabel("Auto resolution limit")).toBeVisible();
  await expect(page.getByLabel("Quality")).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath("playground.png"),
    fullPage: true,
  });
});

test("startup bitrate preference takes precedence over an upstream bitrate floor", async ({
  page,
}) => {
  let firstSegment;
  page.on("request", (request) => {
    if (/\/fixtures\/(low|high)\/seg/.test(request.url()))
      firstSegment ??= new URL(request.url()).pathname;
  });
  await initialise(page);
  await page.evaluate(() => {
    const { controller, video } = window.upgrade;
    controller.setSource(video, "/fixtures/master.m3u8", {
      autoPlay: true,
      quality: { startBitrate: 700000 },
      hlsConfig: { minAutoBitrate: 1000000 },
    });
  });
  await expect
    .poll(() => page.evaluate(() => window.upgrade.frames))
    .toBeGreaterThan(10);
  expect(firstSegment).toMatch(/\/low\//);
});

test("quality preferences cap automatic playback, allow manual override and retain fallback", async ({
  page,
}) => {
  await initialise(page);
  await page.evaluate(() => {
    const { controller, video } = window.upgrade;
    controller.setSource(video, "/fixtures/master.m3u8", {
      autoPlay: true,
      metrics: true,
      quality: { maxHeight: 180, startBitrate: 10000000 },
      hlsConfig: {
        startLevel: 1,
        minAutoBitrate: 10000000,
        capLevelToPlayerSize: true,
      },
    });
  });
  await expect
    .poll(() => page.evaluate(() => window.upgrade.frames))
    .toBeGreaterThan(10);
  expect(await page.evaluate(() => window.upgrade.video.videoHeight)).toBe(180);
  await page.evaluate(() => window.upgrade.controller.controls.setQuality(1));
  await expect
    .poll(() => page.evaluate(() => window.upgrade.video.videoHeight))
    .toBe(360);
  await page.evaluate(() =>
    window.upgrade.controller.controls.setQuality("auto"),
  );
  await expect
    .poll(() => page.evaluate(() => window.upgrade.video.videoHeight))
    .toBe(180);
  await expect
    .poll(() =>
      page.evaluate(
        () => window.upgrade.controller.getMetrics().qualitySwitches,
      ),
    )
    .toBeGreaterThanOrEqual(2);
  await page.evaluate(() => {
    const { controller, video } = window.upgrade;
    controller.setSource(video, "/fixtures/master.m3u8", {
      autoPlay: true,
      quality: { maxBitrate: 1 },
    });
    window.upgrade.frames = 0;
  });
  await expect
    .poll(() => page.evaluate(() => window.upgrade.frames))
    .toBeGreaterThan(10);
  expect(await page.evaluate(() => window.upgrade.video.videoHeight)).toBe(180);
});

test("concurrent expired segment credentials renew once and decode with async headers", async ({
  page,
}) => {
  const attempts = [];
  await page.route(/\/fixtures\/low\/seg\d+\.ts/, async (route) => {
    const value = route.request().headers()["x-test-token"];
    attempts.push(value);
    if (value === "expired-test-secret")
      await route.fulfill({ status: 401, body: value });
    else await route.continue();
  });
  await initialise(page);
  await page.evaluate(() => {
    const { controller, video } = window.upgrade;
    let token = "expired-test-secret";
    window.upgrade.renewals = 0;
    controller.setSource(
      video,
      "/fixtures/low/index.m3u8?signature=private-test-secret",
      {
        autoPlay: true,
        metrics: true,
        recovery: { baseDelayMs: 0 },
        request: {
          allowedOrigins: [location.origin],
          headers: async (_url, { signal }) => {
            signal.throwIfAborted();
            return { "X-Test-Token": token };
          },
          refreshAuthentication: async ({ signal }) => {
            window.upgrade.renewals++;
            await new Promise((resolve) => setTimeout(resolve, 30));
            signal.throwIfAborted();
            token = "renewed-test-secret";
          },
        },
      },
    );
  });
  await expect
    .poll(() => page.evaluate(() => window.upgrade.frames))
    .toBeGreaterThan(10);
  expect(await page.evaluate(() => window.upgrade.renewals)).toBe(1);
  expect(attempts).toContain("expired-test-secret");
  expect(attempts).toContain("renewed-test-secret");
  const diagnostics = await page.evaluate(() =>
    JSON.stringify({
      state: window.upgrade.controller.getState(),
      metrics: window.upgrade.controller.getMetrics(),
      events: window.upgrade.events,
    }),
  );
  expect(diagnostics).not.toContain("test-secret");
  expect(JSON.parse(diagnostics).state.recovery).toMatchObject({
    phase: "recovered",
    action: "refresh-authentication",
  });
});

test("source replacement aborts an unresolved header provider before any network dispatch", async ({
  page,
}) => {
  const seen = [];
  page.on("request", (request) => {
    if (request.url().includes("pending-credential")) seen.push(request.url());
  });
  await initialise(page);
  await page.evaluate(() => {
    const { controller, video } = window.upgrade;
    controller.setSource(video, "/pending-credential.m3u8", {
      request: {
        allowedOrigins: [location.origin],
        headers: (_url, { signal }) => {
          window.upgrade.signal = signal;
          return new Promise((resolve) => {
            window.upgrade.resolve = resolve;
          });
        },
      },
    });
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(window.upgrade.resolve)))
    .toBe(true);
  await page.evaluate(() => {
    const { controller, video } = window.upgrade;
    controller.setSource(video, "/fixtures/low/index.m3u8", { autoPlay: true });
    window.upgrade.resolve({ Authorization: "late-test-secret" });
  });
  expect(await page.evaluate(() => window.upgrade.signal.aborted)).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.upgrade.frames))
    .toBeGreaterThan(10);
  expect(seen).toEqual([]);
  expect(
    await page.evaluate(() => window.upgrade.controller.getState().error),
  ).toBeNull();
});

test("a deferred stream recovers its manifest and waits for explicit media loading", async ({
  page,
}) => {
  let manifests = 0;
  let mediaSegments = 0;
  await page.route("**/fixtures/master.m3u8", (route) => {
    if (++manifests === 1)
      return route.fulfill({ status: 503, body: "Temporary failure" });
    return route.continue();
  });
  page.on("request", (request) => {
    if (
      /\/fixtures\/(low|high)\/seg\d+\.ts$/.test(
        new URL(request.url()).pathname,
      )
    )
      mediaSegments++;
  });

  await initialise(page);
  const attemptTimeoutMs = 2000;
  await page.evaluate((attemptTimeoutMs) => {
    const { controller, video } = window.upgrade;
    controller.setSource(video, "/fixtures/master.m3u8", {
      hlsConfig: {
        autoStartLoad: false,
        manifestLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 1000,
            maxLoadTimeMs: 1500,
            timeoutRetry: null,
            errorRetry: null,
          },
        },
      },
      recovery: { maxAttempts: 1, baseDelayMs: 0, attemptTimeoutMs },
    });
  }, attemptTimeoutMs);
  const readState = () =>
    page.evaluate(() => {
      const { status, recovery, quality } =
        window.upgrade.controller.getState();
      return { status, phase: recovery?.phase, levels: quality.levels.length };
    });
  await expect.poll(readState).toEqual({
    status: "loading",
    phase: "recovered",
    levels: 2,
  });
  await page.evaluate(
    (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
    attemptTimeoutMs + 100,
  );
  expect(await readState()).toMatchObject({
    status: "loading",
    phase: "recovered",
  });
  expect(manifests).toBe(2);
  expect(mediaSegments).toBe(0);

  expect(
    await page.evaluate(() =>
      window.upgrade.controller.controls.startLoading(),
    ),
  ).toBe(true);
  await expect.poll(async () => (await readState()).status).toBe("ready");
  expect(
    await page.evaluate(() => window.upgrade.controller.controls.play()),
  ).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.upgrade.frames))
    .toBeGreaterThan(2);
  expect(mediaSegments).toBeGreaterThan(0);
  await page.evaluate(() => window.upgrade.controller.destroy());
});

test("buffer starvation reaches the opt-in deadline without an initialization loop", async ({
  page,
}) => {
  let release;
  const hold = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(/\/fixtures\/low\/seg\d+\.ts/, async (route) => {
    const index = Number(/seg(\d+)/.exec(route.request().url())[1]);
    if (index >= 2) await hold;
    try {
      await route.continue();
    } catch {
      /* Destruction cancels the held request. */
    }
  });
  try {
    await initialise(page);
    await page.evaluate(() => {
      const { controller, video } = window.upgrade;
      controller.setSource(video, "/fixtures/low/index.m3u8", {
        autoPlay: true,
        recovery: { maxAttempts: 0, stallTimeoutMs: 1000 },
      });
    });
    await expect
      .poll(() => page.evaluate(() => window.upgrade.frames))
      .toBeGreaterThan(10);
    await expect
      .poll(() =>
        page.evaluate(() => window.upgrade.controller.getState().status),
      )
      .toBe("error");
    expect(
      await page.evaluate(
        () =>
          window.upgrade.events.filter(
            (e) => e.type === "transition" && e.to === "loading",
          ).length,
      ),
    ).toBe(1);
  } finally {
    release();
  }
});
