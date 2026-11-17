import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlaybackController } from "usehlsvideoplayer/core";
import { qualitySelection } from "../dist/esm/quality.js";
import { createMetrics } from "../dist/esm/metrics.js";

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const range = { length: 1, start: () => 0, end: () => 100 };
class Video extends EventTarget {
  ownerDocument = new EventTarget();
  buffered = range;
  seekable = range;
  currentTime = 0;
  duration = 100;
  readyState = 0;
  paused = true;
  ended = false;
  seeking = false;
  muted = false;
  volume = 1;
  playbackRate = 1;
  error = null;
  constructor() {
    super();
    this.ownerDocument.baseURI = "https://stream.test/";
    this.ownerDocument.hidden = false;
  }
  dispatch(name) {
    this.dispatchEvent(new Event(name));
  }
  ready() {
    this.readyState = 4;
    this.dispatch("canplay");
  }
  play() {
    this.paused = false;
    this.dispatch("playing");
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.dispatch("pause");
  }
}
function rig(canRecover = false) {
  const video = new Video();
  const sessions = [];
  const controller = createPlaybackController((context) => {
    const record = { context, destroyed: 0, actions: [], features: {} };
    sessions.push(record);
    return {
      kind: "hls.js",
      attach() {},
      destroy() {
        record.destroyed++;
      },
      features: () => record.features,
      recover(action) {
        record.actions.push(action);
        return canRecover;
      },
      startLoading() {},
    };
  });
  return { video, controller, sessions };
}
const network = {
  code: "network",
  message: "A streaming request failed.",
  engine: "hls.js",
  fatal: true,
  retryable: true,
};
const denied = {
  ...network,
  code: "authentication",
  httpStatus: 401,
  retryable: false,
};

test("in-place recovery requires progress and consumes the same finite budget", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { controller, video, sessions } = rig(true);
  t.after(() => controller.destroy());
  controller.setSource(video, "/vod", {
    recovery: { baseDelayMs: 0, attemptTimeoutMs: 10 },
  });
  video.ready();
  await controller.controls.play();
  sessions[0].context.failed(network);
  await flush();
  t.mock.timers.tick(0);
  assert.deepEqual(sessions[0].actions, ["restart-loading"]);
  assert.equal(sessions.length, 1);
  video.ready();
  assert.equal(controller.getState().recovery.phase, "running");
  video.currentTime = 1;
  video.dispatch("timeupdate");
  assert.equal(controller.getState().recovery.phase, "recovered");
  sessions[0].context.failed(network);
  await flush();
  t.mock.timers.tick(0);
  t.mock.timers.tick(10);
  await flush();
  assert.equal(controller.getState().status, "error");
  assert.equal(controller.getState().recovery.attempt, 2);
  assert.equal(sessions[0].destroyed, 1);
});

test("a loading restart that makes no progress falls back to reconstruction within the same budget", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { controller, video, sessions } = rig(true);
  t.after(() => controller.destroy());
  controller.setSource(video, "/vod", {
    recovery: { maxAttempts: 3, baseDelayMs: 0, attemptTimeoutMs: 10 },
  });
  video.ready();
  await controller.controls.play();
  sessions[0].context.failed(network);
  await flush();
  t.mock.timers.tick(0);
  assert.equal(controller.getState().recovery.attempt, 1);
  assert.equal(sessions.length, 1);
  t.mock.timers.tick(10);
  await flush();
  t.mock.timers.tick(0);
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].destroyed, 1);
  assert.equal(controller.getState().recovery.attempt, 2);
  assert.equal(controller.getState().recovery.action, "recreate");
  video.ready();
  assert.equal(controller.getState().status, "recovering");
  video.currentTime = 1;
  video.dispatch("progress");
  assert.equal(controller.getState().recovery.phase, "recovered");
  sessions[0].context.failed(network);
  await flush();
  t.mock.timers.tick(100);
  assert.equal(controller.getState().status, "playing");
  assert.equal(sessions.length, 2);
});

test("startup and stall watchdogs respect deferred loading, hidden pages and pause", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { controller, video } = rig();
  t.after(() => controller.destroy());
  const recovery = {
    maxAttempts: 0,
    startupTimeoutMs: 1000,
    stallTimeoutMs: 1000,
  };
  controller.setSource(video, "/vod", {
    recovery,
    hlsConfig: { autoStartLoad: false },
  });
  t.mock.timers.tick(5000);
  assert.equal(controller.getState().status, "loading");
  controller.controls.startLoading();
  t.mock.timers.tick(1000);
  await flush();
  assert.equal(controller.getState().status, "error");
  controller.setSource(video, "/vod", { recovery });
  video.ready();
  await controller.controls.play();
  video.ownerDocument.hidden = true;
  video.ownerDocument.dispatchEvent(new Event("visibilitychange"));
  t.mock.timers.tick(5000);
  assert.equal(controller.getState().status, "playing");
  video.ownerDocument.hidden = false;
  video.ownerDocument.dispatchEvent(new Event("visibilitychange"));
  controller.controls.pause();
  t.mock.timers.tick(5000);
  assert.equal(controller.getState().status, "paused");
  await controller.controls.play();
  video.readyState = 2;
  video.dispatch("waiting");
  t.mock.timers.tick(1000);
  await flush();
  assert.equal(controller.getState().status, "error");
});

test("authentication denial coalesces refresh and cancels a late signed URL", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { controller, video, sessions } = rig();
  t.after(() => controller.destroy());
  let finish;
  let signal;
  let calls = 0;
  controller.setSource(video, "/old", {
    recovery: { baseDelayMs: 0 },
    request: {
      allowedOrigins: ["https://stream.test"],
      refreshAuthentication(context) {
        calls++;
        signal = context.signal;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    },
  });
  sessions[0].context.failed(denied);
  sessions[0].context.failed(denied);
  await flush();
  t.mock.timers.tick(0);
  await flush();
  assert.equal(calls, 1);
  assert.equal(sessions[0].destroyed, 1);
  controller.setSource(video, "/new");
  assert.equal(signal.aborted, true);
  finish({ src: "https://stream.test/expired?secret" });
  await flush();
  assert.equal(sessions.length, 2);
  assert.equal(sessions[1].context.url.pathname, "/new");
  assert.doesNotMatch(JSON.stringify(controller.getState()), /secret/);
});

test("renewal revalidates origins, times out, and never retries a declined renewal", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const outcome of ["foreign", "timeout", "decline", "reject"]) {
    const { controller, video, sessions } = rig();
    let signal;
    controller.setSource(video, "/old", {
      recovery: { baseDelayMs: 0 },
      request: {
        allowedOrigins: ["https://stream.test"],
        refreshTimeoutMs: 1000,
        refreshAuthentication(context) {
          signal = context.signal;
          if (outcome === "foreign")
            return { src: "https://foreign.test/?secret" };
          if (outcome === "decline") return null;
          if (outcome === "reject") throw new Error("secret");
          return new Promise(() => {});
        },
      },
    });
    sessions[0].context.failed(denied);
    await flush();
    t.mock.timers.tick(0);
    await flush();
    if (outcome === "timeout") {
      t.mock.timers.tick(1000);
      await flush();
      assert.equal(signal.aborted, true);
    }
    assert.equal(controller.getState().status, "error", outcome);
    assert.equal(sessions.length, 1);
    assert.doesNotMatch(JSON.stringify(controller.getState()), /secret/);
    controller.destroy();
  }
});

test("quality preferences use a conservative ladder prefix with lowest fallback", () => {
  const levels = [
    { height: 180, bitrate: 300 },
    { height: 360, bitrate: 900 },
    { height: 720, bitrate: 600 },
  ];
  assert.deepEqual(
    qualitySelection(levels, { maxBitrate: 700, startBitrate: 650 }),
    { cap: 0, start: 0 },
  );
  assert.deepEqual(qualitySelection(levels, { maxHeight: 10 }), {
    cap: 0,
    start: undefined,
  });
  assert.deepEqual(qualitySelection(levels, {}), { cap: -1, start: undefined });
  assert.deepEqual(qualitySelection(levels, { startBitrate: 650 }), {
    cap: -1,
    start: 2,
  });
  assert.deepEqual(qualitySelection(levels, { maxBitrate: NaN }), {
    cap: -1,
    start: undefined,
  });
});

test("renewal succeeds with a signed source but never replenishes the source budget", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { controller, video, sessions } = rig();
  t.after(() => controller.destroy());
  let calls = 0;
  controller.setSource(video, "/old", {
    recovery: { baseDelayMs: 0 },
    request: {
      allowedOrigins: ["https://stream.test"],
      refreshAuthentication: () => {
        calls++;
        return { src: `/signed?private=${calls}` };
      },
    },
  });
  for (let i = 0; i < 3; i++) {
    sessions.at(-1).context.failed(denied);
    await flush();
    t.mock.timers.tick(0);
    await flush();
    if (i < 2) {
      video.ready();
      assert.equal(controller.getState().recovery.phase, "recovered");
    }
  }
  assert.equal(calls, 2);
  assert.equal(sessions.length, 3);
  assert.equal(controller.getState().status, "error");
  assert.doesNotMatch(JSON.stringify(controller.getState()), /private=/);
});

test("403 renewal is explicit and recovery false disables it", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const [statuses, recovery, expected] of [
    [undefined, {}, 0],
    [[403], {}, 1],
    [[403], false, 0],
  ]) {
    const { controller, video, sessions } = rig();
    let calls = 0;
    controller.setSource(video, "/vod", {
      recovery: recovery === false ? false : { baseDelayMs: 0 },
      request: {
        allowedOrigins: ["https://stream.test"],
        refreshStatusCodes: statuses,
        refreshAuthentication: () => {
          calls++;
          return null;
        },
      },
    });
    sessions[0].context.failed({ ...denied, httpStatus: 403 });
    await flush();
    t.mock.timers.tick(0);
    await flush();
    assert.equal(calls, expected);
    controller.destroy();
  }
});

test("reconstruction distinguishes live-edge, DVR and expired DVR positions", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const [position, windowStart, expected] of [
    [98, 150, 198],
    [20, 0, 20],
    [20, 150, 150],
  ]) {
    const { controller, video, sessions } = rig();
    controller.setSource(video, "/live", { recovery: { baseDelayMs: 0 } });
    sessions[0].features.live = { isLive: true, edge: 100, syncPosition: 98 };
    video.ready();
    await controller.controls.play();
    video.currentTime = position;
    video.dispatch("progress");
    sessions[0].context.failed(network);
    await flush();
    t.mock.timers.tick(0);
    sessions[1].features.live = { isLive: true, edge: 200, syncPosition: 198 };
    video.seekable = { length: 1, start: () => windowStart, end: () => 200 };
    video.currentTime = 0;
    video.paused = true;
    video.ready();
    assert.equal(video.currentTime, expected);
    controller.destroy();
  }
});

test("metrics use an independent clock, keep recovery separate, and stop frame observation", (t) => {
  let now = 100;
  t.mock.method(performance, "now", () => now);
  let callback;
  const cancelled = [];
  const video = {
    requestVideoFrameCallback(fn) {
      callback = fn;
      return 7;
    },
    cancelVideoFrameCallback(id) {
      cancelled.push(id);
    },
  };
  const metrics = createMetrics(video);
  now = 200;
  metrics.update("playing");
  callback();
  now = 400;
  metrics.update("buffering");
  now = 500;
  metrics.update("recovering");
  metrics.failure();
  metrics.recovery();
  metrics.quality(0);
  metrics.quality(0);
  metrics.quality(1);
  metrics.bandwidth(800000);
  now = 800;
  metrics.update("playing");
  now = 1000;
  const result = metrics.read(null);
  assert.equal(result.startupMs, 100);
  assert.equal(result.firstFrameMs, 100);
  assert.equal(result.playingMs, 400);
  assert.equal(result.rebufferMs, 100);
  assert.equal(result.rebufferRatio, 0.2);
  assert.equal(result.recoveryMs, 300);
  assert.equal(result.sessionMs, 900);
  assert.equal(result.qualitySwitches, 1);
  assert.equal(result.fatalFailures, 1);
  assert.equal(result.recoveryAttempts, 1);
  assert.equal(result.bandwidthEstimate, 800000);
  metrics.stop();
  now = 2000;
  assert.equal(metrics.read(null).sessionMs, 900);
  const pending = createMetrics(video);
  pending.stop();
  assert.deepEqual(cancelled, [7]);
});

test("disabled metrics never schedule frame observation and destruction cancels enabled collection", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const { controller, video } = rig();
  let frames = 0;
  let cancelled = 0;
  video.requestVideoFrameCallback = () => {
    frames++;
    return 1;
  };
  video.cancelVideoFrameCallback = () => cancelled++;
  controller.setSource(video, "/vod");
  assert.equal(frames, 0);
  assert.equal(controller.getMetrics(), null);
  controller.setSource(video, "/vod", { metrics: true });
  assert.equal(frames, 1);
  controller.destroy();
  assert.equal(cancelled, 1);
  t.mock.timers.tick(5000);
  assert.equal(controller.getMetrics(), null);
});
