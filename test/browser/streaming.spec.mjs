import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";

async function start(page, source, options = {}) {
  await page.goto("/blank.html");
  await page.evaluate(
    async ({ source, options }) => {
      const { createPlaybackController } = await import("/src/core.ts");
      const began = performance.now();
      const controller = createPlaybackController();
      const constructionMs = performance.now() - began;
      const video = document.createElement("video");
      video.muted = true;
      document.body.append(video);
      const sample = {
        frames: 0,
        constructionMs,
        attachmentMs: null,
        firstFrameMs: null,
      };
      const attachment = performance.now();
      video.requestVideoFrameCallback(function frame() {
        sample.frames++;
        sample.firstFrameMs ??= performance.now() - attachment;
        video.requestVideoFrameCallback(frame);
      });
      window.fixture = { controller, video, sample };
      controller.setSource(video, source, { autoPlay: true, ...options });
      sample.attachmentMs = performance.now() - attachment;
    },
    { source, options },
  );
}

test("decodes fragmented MP4 after requesting an init and a media segment", async ({
  page,
}) => {
  const requests = [];
  page.on("response", (response) => {
    if (response.ok()) requests.push(new URL(response.url()).pathname);
  });
  await start(page, "/fixtures/cmaf/index.m3u8");
  await expect
    .poll(() => page.evaluate(() => window.fixture.sample.frames))
    .toBeGreaterThan(10);
  expect(requests).toContain("/fixtures/cmaf/init.mp4");
  expect(requests).toContain("/fixtures/cmaf/segment0.m4s");
});

test("decodes past an explicit CMAF timestamp discontinuity", async ({
  page,
}) => {
  await page.route("**/discontinuous.m3u8", (route) =>
    route.fulfill({
      contentType: "application/vnd.apple.mpegurl",
      body: '#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:2\n#EXT-X-MAP:URI="/fixtures/cmaf/init.mp4"\n#EXTINF:2,\n/fixtures/cmaf/segment0.m4s\n#EXT-X-DISCONTINUITY\n#EXTINF:2,\n/fixtures/cmaf/segment0.m4s?repeat\n#EXT-X-ENDLIST\n',
    }),
  );
  await start(page, "/discontinuous.m3u8");
  await expect
    .poll(() => page.evaluate(() => window.fixture.video.currentTime))
    .toBeGreaterThan(2.75);
  await expect
    .poll(() => page.evaluate(() => window.fixture.sample.frames))
    .toBeGreaterThan(60);
});

test("source replacement aborts a held manifest without poisoning the new engine", async ({
  page,
}) => {
  let release;
  const hold = new Promise((resolve) => {
    release = resolve;
  });
  let finish;
  const completed = new Promise((resolve) => {
    finish = resolve;
  });
  const match = (request) => new URL(request.url()).pathname === "/held.m3u8";
  await page.route("**/held.m3u8", async (route) => {
    await hold;
    try {
      await route.fulfill({ status: 503, body: "late network failure" });
    } catch {
      /* The superseded browser request was already aborted. */
    } finally {
      finish();
    }
  });
  try {
    const started = page.waitForRequest(match);
    await start(page, "/held.m3u8");
    await started;
    const aborted = page.waitForEvent("requestfailed", {
      predicate: match,
      timeout: 5000,
    });
    await page.evaluate(() => {
      const { controller, video } = window.fixture;
      controller.setSource(video, "/fixtures/cmaf/index.m3u8", {
        autoPlay: true,
      });
    });
    await aborted;
    release();
    await completed;
    await expect
      .poll(() => page.evaluate(() => window.fixture.sample.frames))
      .toBeGreaterThan(10);
    const state = await page.evaluate(() =>
      window.fixture.controller.getState(),
    );
    expect(state).toMatchObject({
      status: "playing",
      error: null,
      recovery: null,
    });
  } finally {
    release();
  }
});

test("LL-HLS decodes partial media across delayed requests and uses blocking playlist reloads", async ({
  page,
  browserName,
}, info) => {
  test.setTimeout(45_000);
  const evidence = { parts: 0, blocked: [], delays: [], throughput: [] };
  const cdp =
    browserName === "chromium"
      ? await page.context().newCDPSession(page)
      : null;
  const throttle = async (downloadThroughput) => {
    if (!cdp) return;
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 30,
      downloadThroughput,
      uploadThroughput: 1_000_000,
    });
    evidence.throughput.push(downloadThroughput);
  };
  await throttle(1_500_000);
  const tasks = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (response.ok() && /\/part\d+\.m4s$/.test(url.pathname)) evidence.parts++;
    if (response.ok() && url.searchParams.has("_HLS_msn")) {
      tasks.push(
        response.headerValue("x-fixture-blocked-ms").then((ms) => {
          evidence.blocked.push({
            msn: url.searchParams.get("_HLS_msn"),
            part: url.searchParams.get("_HLS_part"),
            ms: Number(ms),
          });
        }),
      );
    }
  });
  await page.route(/\/part\d+\.m4s$/, async (route) => {
    const ms = [0, 150, 600, 40][evidence.delays.length % 4];
    evidence.delays.push(ms);
    await delay(ms);
    await route.continue();
  });
  await start(page, "/live/ll.m3u8", { lowLatency: true });
  await expect
    .poll(() => page.evaluate(() => window.fixture.sample.frames), {
      timeout: 20_000,
    })
    .toBeGreaterThan(45);
  if (cdp) {
    const frames = await page.evaluate(() => window.fixture.sample.frames);
    await throttle(80_000);
    await delay(2200);
    await throttle(1_500_000);
    await expect
      .poll(() => page.evaluate(() => window.fixture.sample.frames))
      .toBeGreaterThan(frames + 30);
  }
  await expect.poll(() => evidence.parts).toBeGreaterThan(1);
  await expect
    .poll(() =>
      evidence.blocked.some(({ ms, part }) => part !== null && ms >= 250),
    )
    .toBe(true);
  const live = await page.evaluate(
    () => window.fixture.controller.getState().live,
  );
  expect(live.isLive).toBe(true);
  expect(live.latency).toBeLessThan(6);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { video } = window.fixture;
        return video.seekable.length
          ? video.seekable.end(video.seekable.length - 1) -
              video.seekable.start(0)
          : 0;
      }),
    )
    .toBeGreaterThan(8);
  const seek = await page.evaluate(() => {
    const { controller, video, sample } = window.fixture;
    controller.controls.pause();
    const edge = controller.getState().live.edge;
    const movedBack = controller.controls.seek(video.seekable.start(0));
    const behind = edge - video.currentTime;
    const movedLive = controller.controls.seekToLive();
    const after = edge - video.currentTime;
    void controller.controls.play();
    return { movedBack, movedLive, behind, after, frames: sample.frames };
  });
  expect(seek.movedBack && seek.movedLive).toBe(true);
  expect(seek.behind).toBeGreaterThan(6);
  expect(seek.after).toBeLessThan(6);
  await expect
    .poll(() => page.evaluate(() => window.fixture.sample.frames))
    .toBeGreaterThan(seek.frames + 10);
  await expect
    .poll(() =>
      page.evaluate(() => window.fixture.controller.getState().live.latency),
    )
    .toBeLessThan(6);
  await Promise.all(tasks);
  const path = info.outputPath("ll-hls.json");
  const startup = await page.evaluate(() => window.fixture.sample);
  writeFileSync(
    path,
    JSON.stringify({ ...evidence, live, seek, startup }, null, 2),
  );
  await info.attach("ll-hls", {
    path,
    contentType: "application/json",
  });
});

async function origin(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  return `http://127.0.0.1:${server.address().port}`;
}

test("protected redirects, cross-origin segments and keys never reach the destination server", async ({
  page,
}) => {
  const servers = [];
  const cleanup = { after: (close) => servers.push(close) };
  const rejected = [];
  const approved = [];
  const hostile = await origin(cleanup, (req, res) => {
    rejected.push(req.method);
    res.writeHead(204).end();
  });
  const trusted = await origin(cleanup, (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "null");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "X-Test-Token");
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    approved.push([
      req.headers["x-test-token"],
      req.headers.cookie,
      req.headers.referer ?? null,
    ]);
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: hostile + "/redirected" }).end();
      return;
    }
    if (req.url === "/expired") {
      res.writeHead(403, "HLS_REQUEST_POLICY").end();
      return;
    }
    const key =
      req.url === "/key"
        ? `#EXT-X-KEY:METHOD=AES-128,URI="${hostile}/secret.key"\n`
        : "";
    res.end(
      `#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:1\n${key}#EXTINF:2,\n${req.url === "/key" ? "/media.ts" : hostile + "/media.ts"}\n#EXT-X-ENDLIST\n`,
    );
  });
  try {
    await page
      .context()
      .addCookies([
        { name: "hls_session", value: "synthetic-cookie", url: trusted },
      ]);
    await page.goto("/blank.html");
    const results = await page.evaluate(async (trusted) => {
      const { createPlaybackController } = await import("/src/core.ts");
      const results = [];
      const loadPolicy = {
        default: {
          maxTimeToFirstByteMs: 2000,
          maxLoadTimeMs: 3000,
          timeoutRetry: null,
          errorRetry: null,
        },
      };
      for (const path of ["/redirect", "/segment", "/key", "/expired"]) {
        const controller = createPlaybackController();
        try {
          const terminal = new Promise((resolve) =>
            controller.subscribe(() => {
              if (controller.getState().status === "error")
                resolve(controller.getState().error);
            }),
          );
          controller.setSource(
            document.createElement("video"),
            trusted + path,
            {
              request: {
                allowedOrigins: [trusted],
                credentials: "include",
                headers: () => ({ "X-Test-Token": "synthetic-token" }),
              },
              recovery: false,
              hlsConfig: {
                manifestLoadPolicy: loadPolicy,
                fragLoadPolicy: loadPolicy,
                keyLoadPolicy: loadPolicy,
              },
            },
          );
          results.push(await terminal);
        } finally {
          controller.destroy();
        }
      }
      return results;
    }, trusted);
    expect(results.map(({ code }) => code)).toEqual([
      "manifest",
      "request-policy",
      "request-policy",
      "authentication",
    ]);
    expect(results.at(-1).httpStatus).toBe(403);
    expect(JSON.stringify(results)).not.toContain("synthetic-token");
    expect(approved).toEqual(
      Array(4).fill(["synthetic-token", "hls_session=synthetic-cookie", null]),
    );
    expect(rejected).toEqual([]);
  } finally {
    await Promise.all(servers.map((close) => close()));
  }
});

if (process.env.PUBLIC_HLS === "1") {
  test("decodes the public Mux HLS VOD sample", async ({ page }) => {
    await start(page, "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8");
    await expect
      .poll(() => page.evaluate(() => window.fixture.sample.frames), {
        timeout: 20_000,
      })
      .toBeGreaterThan(10);
  });
}
