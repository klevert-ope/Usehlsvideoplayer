import { expect, test } from "@playwright/test";
import { appendFileSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { setTimeout as delay } from "node:timers/promises";

const minutes = Number(process.env.SOAK_MINUTES ?? 30);
if (![1, 30, 360, 1440].includes(minutes))
  throw new Error("SOAK_MINUTES must be 1, 30, 360, or 1440");

test("repeated live playback and teardown retain bounded resources", async ({
  browser,
  page,
}, info) => {
  test.setTimeout((minutes + 5) * 60_000);
  const out = info.outputPath("samples.ndjson");
  const save = (row) =>
    appendFileSync(
      out,
      JSON.stringify({ at: new Date().toISOString(), ...row }) + "\n",
    );
  save({
    kind: "environment",
    minutes,
    browser: browser.version(),
    node: process.version,
    platform: platform(),
    release: release(),
    arch: arch(),
    cpu: cpus()[0].model,
    ram: totalmem(),
    workload:
      "loopback CMAF LL-HLS, H.264 320x180 24 fps, 0.5s parts, 2s segments",
  });
  const pending = new Set();
  let failures = 0;
  page.on("request", (request) => pending.add(request));
  page.on("requestfinished", (request) => pending.delete(request));
  page.on("requestfailed", (request) => {
    pending.delete(request);
    failures++;
  });
  await page.addInitScript(() => {
    const media = new Set();
    const timers = new Set();
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    const timeout = window.setTimeout.bind(window);
    const interval = window.setInterval.bind(window);
    const clearTimeout = window.clearTimeout.bind(window);
    const clearInterval = window.clearInterval.bind(window);
    window.setTimeout = (callback, ms, ...args) => {
      if (typeof callback !== "function") return timeout(callback, ms, ...args);
      const id = timeout(
        (...params) => {
          timers.delete(id);
          callback(...params);
        },
        ms,
        ...args,
      );
      timers.add(id);
      return id;
    };
    window.setInterval = (...args) => {
      const id = interval(...args);
      timers.add(id);
      return id;
    };
    window.clearTimeout = (id) => {
      timers.delete(id);
      clearTimeout(id);
    };
    window.clearInterval = (id) => {
      timers.delete(id);
      clearInterval(id);
    };
    URL.createObjectURL = (obj) => {
      const url = create(obj);
      if (obj instanceof MediaSource) media.add(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      media.delete(url);
      revoke(url);
    };
    window.resources = () => ({ media: media.size, timers: timers.size });
  });
  await page.goto("/blank.html");
  const cdp = await page.context().newCDPSession(page);
  async function record(kind, cycle, media = {}) {
    await cdp.send("HeapProfiler.collectGarbage");
    const heap = await cdp.send("Runtime.getHeapUsage");
    const dom = await cdp.send("Memory.getDOMCounters");
    // Optional experimental CDP command, absent on some Chromium builds.
    const detached = await cdp
      .send("DOM.getDetachedDomNodes")
      .catch(() => null);
    const result = {
      kind,
      cycle,
      heap: heap.usedSize,
      ...dom,
      detachedRoots: detached?.detachedNodes?.length ?? null,
      ...(await page.evaluate(() => window.resources())),
      pending: pending.size,
      failures,
      playback: media,
    };
    save(result);
    return result;
  }
  const idle = await record("idle", 0);
  const teardowns = [];
  const activeSamples = [];
  const start = performance.now();
  const elapsed = () => performance.now() - start;
  const runMs = minutes * 60_000;
  for (let cycle = 0; elapsed() < runMs; cycle++) {
    await page.evaluate(async (cycle) => {
      const { createPlaybackController } = await import("/src/core.ts");
      const video = document.createElement("video");
      video.muted = true;
      document.body.append(video);
      const controller = createPlaybackController();
      const began = performance.now();
      const evidence = { firstFrameMs: null, recoveries: 0, terminal: null };
      video.requestVideoFrameCallback(() => {
        evidence.firstFrameMs = performance.now() - began;
      });
      controller.onEvent((event) => {
        if (event.type === "recovery" && event.recovery.phase === "scheduled")
          evidence.recoveries++;
        if (event.type === "transition" && event.to === "error")
          evidence.terminal = controller.getState().error?.code ?? "unknown";
      });
      window.session = { controller, video, evidence };
      controller.setSource(video, `/live/ll.m3u8?cycle=${cycle}`, {
        autoPlay: true,
        lowLatency: true,
        metrics: true,
        hlsConfig: {
          backBufferLength: 30,
          maxBufferLength: 15,
          maxMaxBufferLength: 30,
        },
      });
    }, cycle);
    try {
      await expect
        .poll(() => page.evaluate(() => window.session.evidence.firstFrameMs), {
          timeout: 20_000,
        })
        .not.toBeNull();
      const cycleMs =
        minutes === 1 ? 25_000 : minutes === 30 ? 4.5 * 60_000 : runMs;
      const until = Math.min(runMs, elapsed() + cycleMs);
      let lastFrames = 0;
      while (elapsed() < until) {
        await delay(
          Math.min(
            minutes === 1 ? 8000 : 60_000,
            Math.max(0, until - elapsed()),
          ),
        );
        const sample = await page.evaluate(() => {
          const { controller, video, evidence } = window.session;
          const state = controller.getState();
          return {
            ...evidence,
            ...controller.getMetrics(),
            currentTime: video.currentTime,
            status: state.status,
            bufferSeconds: state.buffered.reduce(
              (sum, range) => sum + range.end - range.start,
              0,
            ),
          };
        });
        const active = await record("active", cycle, sample);
        activeSamples.push(active);
        expect(sample.terminal).toBeNull();
        if (until - elapsed() > 2000 || lastFrames === 0)
          expect(sample.totalFrames).toBeGreaterThan(lastFrames);
        lastFrames = sample.totalFrames;
        expect(sample.bufferSeconds).toBeLessThan(70);
        expect(sample.rebufferRatio).toBeLessThan(0.1);
        expect(active.pending).toBeLessThan(20);
        expect(active.media).toBeLessThanOrEqual(1);
      }
    } finally {
      await page.evaluate(() => {
        const { controller, video } = window.session;
        controller.destroy();
        video.remove();
        delete window.session;
      });
      await expect.poll(() => pending.size, { timeout: 10_000 }).toBe(0);
      let sample;
      // Media teardown can release browser-owned DOM asynchronously. Keep
      // early probes, then require collection within a bounded settling time.
      await expect
        .poll(
          async () => {
            sample = await record("teardown-probe", cycle);
            return (
              sample.media === 0 &&
              sample.timers <= idle.timers + 2 &&
              sample.nodes <= idle.nodes + 16 &&
              sample.jsEventListeners <= idle.jsEventListeners + 4 &&
              (sample.detachedRoots === null ||
                sample.detachedRoots <= (idle.detachedRoots ?? 0) + 2)
            );
          },
          { timeout: 10_000 },
        )
        .toBe(true);
      save({ ...sample, kind: "teardown" });
      teardowns.push(sample);
    }
  }
  if (minutes > 30) {
    expect(teardowns).toHaveLength(1);
    expect(activeSamples.length).toBeGreaterThanOrEqual(
      Math.floor(minutes * 0.9),
    );
  } else expect(teardowns.length).toBeGreaterThan(1);
  const samples = minutes > 30 ? activeSamples : teardowns;
  if (samples.length >= 8 || minutes === 30) {
    expect(samples.length).toBeGreaterThanOrEqual(6);
    const median = (values) =>
      values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const delta = (field) =>
      median(samples.slice(-3).map((row) => row[field])) -
      median(samples.slice(1, 4).map((row) => row[field]));
    const growth = {
      heap: delta("heap"),
      nodes: delta("nodes"),
      listeners: delta("jsEventListeners"),
    };
    save({ kind: "trend", growth });
    expect(growth.heap).toBeLessThan(8 * 1024 * 1024);
    expect(growth.nodes).toBeLessThan(100);
    expect(growth.listeners).toBeLessThan(100);
  }
});
