import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import fc from "fast-check";
import { createPlaybackController, selectEngine } from "usehlsvideoplayer/core";
import { classifyHlsError } from "../dist/esm/errors.js";

function timeRanges(pairs) {
  return {
    length: pairs.length,
    start: (i) => pairs[i][0],
    end: (i) => pairs[i][1],
  };
}

class Video extends EventTarget {
  ownerDocument = { baseURI: "https://stream.test/" };
  buffered = timeRanges([]);
  seekable = timeRanges([]);
  currentTime = 0;
  duration = NaN;
  readyState = 0;
  paused = true;
  ended = false;
  seeking = false;
  muted = false;
  volume = 1;
  playbackRate = 1;
  error = null;

  dispatch(name) {
    this.dispatchEvent(new Event(name));
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
  ready(duration = 10) {
    this.duration = duration;
    this.readyState = 4;
    this.seekable = timeRanges([[0, duration === Infinity ? 10 : duration]]);
    this.dispatch("canplay");
  }
}

function rig() {
  const sessions = [];
  const video = new Video();
  const controller = createPlaybackController((context) => {
    const record = { context, attached: 0, destroyed: 0, features: {} };
    sessions.push(record);
    return {
      kind: "hls.js",
      attach() {
        record.attached++;
      },
      destroy() {
        record.destroyed++;
      },
      features: () => record.features,
      selectQuality: (value) => {
        record.quality = value;
      },
      selectAudio: (value) => {
        record.audio = value;
      },
      selectSubtitle: (value) => {
        record.subtitle = value;
      },
      startLoading: () => {
        record.started = true;
      },
    };
  });
  return { controller, video, sessions };
}

const network = classifyHlsError({
  fatal: true,
  type: "networkError",
  details: "fragLoadError",
  response: { code: 503 },
});
const flush = () => Promise.resolve();

test("two controllers cannot own one element, and the claim transfers after teardown", () => {
  const first = rig();
  const second = rig();
  first.controller.setSource(first.video, "/first");
  second.controller.setSource(first.video, "/second");
  assert.equal(second.sessions.length, 0);
  assert.equal(second.controller.getState().status, "error");
  assert.equal(first.sessions[0].destroyed, 0);
  first.controller.destroy();
  second.controller.setSource(first.video, "/second");
  assert.equal(second.sessions[0].attached, 1);
  second.controller.destroy();
});

test("CommonJS and ESM controllers enforce the same media claim", () => {
  const { createPlaybackController: createCjs } = createRequire(
    import.meta.url,
  )("usehlsvideoplayer/core");
  const first = rig();
  let allocated = false;
  const second = createCjs(() => {
    allocated = true;
    return null;
  });
  first.controller.setSource(first.video, "/first");
  try {
    second.setSource(first.video, "/second");
    assert.equal(allocated, false);
    assert.equal(second.getState().status, "error");
  } finally {
    second.destroy();
    first.controller.destroy();
  }
});

test("a source chosen during teardown attaches after the old adapter returns", async () => {
  const video = new Video();
  let attached = null;
  const controller = createPlaybackController(({ url }) => ({
    kind: "hls.js",
    features: () => ({}),
    attach: () => {
      attached = url.pathname;
    },
    destroy: () => {
      if (url.pathname === "/first") controller.setSource(video, "/latest");
      attached = null;
    },
  }));
  controller.setSource(video, "/first");
  video.ready(90);
  controller.setSource(video, "/superseded");
  assert.equal(controller.getState().duration, null);
  assert.equal(controller.getState().status, "idle");
  await flush();
  assert.equal(attached, "/latest");
  assert.equal(controller.getState().status, "loading");
  controller.destroy();
});

test("engine sampling cannot publish old live data during reentrant replacement", async () => {
  const video = new Video();
  const edges = [];
  const controller = createPlaybackController(({ url }) => ({
    kind: "hls.js",
    attach() {},
    destroy() {},
    features() {
      if (url.pathname !== "/first") return {};
      controller.setSource(video, "/next");
      return { live: { isLive: true, edge: 900, syncPosition: 895 } };
    },
  }));
  controller.subscribe(() => edges.push(controller.getState().live.edge));
  controller.setSource(video, "/first");
  video.dispatch("progress");
  await flush();
  assert.ok(!edges.includes(900));
  assert.equal(controller.getState().status, "loading");
  controller.destroy();
});

test("capabilities and explicit preferences determine the engine", () => {
  assert.equal(selectEngine("auto", true, true), "hls.js");
  assert.equal(selectEngine("auto", false, true), "native");
  assert.equal(selectEngine("native", true, true), "native");
  assert.equal(selectEngine("auto", false, true, true), null);
  assert.equal(selectEngine("native", true, true, true), null);
  assert.equal(selectEngine("hls.js", false, true), null);
  assert.equal(selectEngine("auto", false, false), null);
});

test("loading, ready, play, buffering, seeking, pause, ended and teardown follow media events", async () => {
  const { controller, video, sessions } = rig();
  const transitions = [];
  const unsub = controller.onEvent((event) => {
    if (event.type === "transition") transitions.push(event.to);
  });
  controller.setSource(video, "/vod");
  assert.equal(controller.getState().status, "loading");
  video.ready();
  assert.equal(await controller.controls.play(), true);
  video.dispatch("waiting");
  video.seeking = true;
  video.dispatch("seeking");
  video.seeking = false;
  video.dispatch("seeked");
  assert.equal(controller.controls.pause(), true);
  video.ended = true;
  video.dispatch("ended");
  assert.equal(controller.controls.seek(15), true);
  assert.equal(video.currentTime, 10);
  assert.equal(controller.controls.seek(Infinity), false);
  assert.equal(controller.controls.setVolume(3), true);
  assert.equal(video.volume, 1);
  assert.equal(controller.controls.setVolume(NaN), false);
  assert.equal(controller.controls.setMuted(true), true);
  assert.equal(controller.controls.setPlaybackRate(2), true);
  assert.equal(controller.controls.setPlaybackRate(0), false);
  assert.equal(controller.controls.startLoading(), true);
  assert.equal(sessions[0].started, true);
  controller.destroy();
  unsub();
  controller.destroy();
  assert.deepEqual(transitions, [
    "initialising",
    "loading",
    "ready",
    "playing",
    "buffering",
    "seeking",
    "playing",
    "paused",
    "ended",
    "destroyed",
  ]);
  assert.equal(sessions[0].destroyed, 1);
  assert.equal(await controller.controls.play(), false);
  assert.equal(controller.controls.setMuted(false), false);
  controller.setSource(video, "/ignored");
  assert.equal(sessions.length, 1);
});

test("track selection validates IDs and live seeks stay inside the moving DVR window", () => {
  const { controller, video, sessions } = rig();
  controller.setSource(video, "/live");
  video.ready(Infinity);
  video.seekable = timeRanges([
    [12, 14],
    [17, 20],
  ]);
  video.currentTime = 13;
  const session = sessions[0];
  session.features = {
    live: { isLive: true, edge: 21, syncPosition: 18 },
    quality: {
      levels: [{ id: 0 }],
      mode: "auto",
      current: null,
      selected: null,
    },
    audio: { tracks: [{ id: 2 }], selected: null },
    subtitles: { tracks: [{ id: 1 }], selected: null },
  };
  session.context.changed();
  assert.equal(controller.getState().live.latency, 8);
  assert.equal(controller.controls.seek(16), true);
  assert.equal(video.currentTime, 17);
  assert.equal(controller.controls.seekToLive(), true);
  assert.equal(video.currentTime, 18);
  assert.equal(controller.getState().live.atEdge, true);
  assert.equal(controller.controls.setQuality(0), true);
  assert.equal(controller.controls.setQuality(9), false);
  assert.equal(controller.controls.setAudioTrack(2), true);
  assert.equal(controller.controls.setAudioTrack(1), false);
  assert.equal(controller.controls.setSubtitleTrack(1), true);
  assert.equal(controller.controls.setSubtitleTrack("off"), true);
  assert.deepEqual(
    [session.quality, session.audio, session.subtitle],
    [0, 2, "off"],
  );
  controller.destroy();
});

test("classifies failures without copying response or exception text", () => {
  const raw = {
    fatal: true,
    type: "networkError",
    url: "https://stream.test/v?secret",
    response: { code: 403, text: "token=secret" },
    error: new Error("secret"),
  };
  assert.deepEqual(classifyHlsError(raw), {
    code: "authentication",
    engine: "hls.js",
    fatal: true,
    retryable: false,
    httpStatus: 403,
    message: "The streaming server denied access.",
  });
  assert.equal(
    classifyHlsError({ fatal: true, details: "manifestParsingError" })
      .retryable,
    false,
  );
  assert.equal(
    classifyHlsError({ fatal: true, details: "manifestLoadTimeOut" }).code,
    "manifest",
  );
  assert.equal(network.code, "segment");
  assert.equal(network.retryable, true);
  assert.equal(
    classifyHlsError({
      fatal: true,
      type: "mediaError",
      details: "bufferAppendError",
    }).code,
    "decode",
  );
  const { controller, video, sessions } = rig();
  controller.setSource(video, "https://user:secret@stream.test/");
  assert.equal(controller.getState().error.code, "invalid-source");
  assert.equal(sessions.length, 0);
  controller.destroy();
});

test("only one recovery timer runs and retries exhaust the source budget", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { controller, video, sessions } = rig();
  const phases = [];
  controller.onEvent((event) => {
    if (event.type === "recovery") phases.push(event.recovery.phase);
  });
  controller.setSource(video, "/faulty", {
    recovery: { maxAttempts: 2, baseDelayMs: 0, attemptTimeoutMs: 10 },
  });
  sessions[0].context.failed(network);
  sessions[0].context.failed(network);
  await flush();
  assert.equal(controller.getState().status, "recovering");
  t.mock.timers.tick(0);
  assert.equal(sessions.length, 2);
  t.mock.timers.tick(10);
  t.mock.timers.tick(0);
  assert.equal(sessions.length, 3);
  sessions[2].context.failed(network);
  await flush();
  assert.equal(controller.getState().status, "error");
  assert.deepEqual(phases, [
    "scheduled",
    "running",
    "scheduled",
    "running",
    "exhausted",
  ]);
  t.mock.timers.tick(100);
  assert.equal(sessions.length, 3);
  assert.ok(sessions.every((session) => session.destroyed === 1));
  assert.equal(controller.controls.retry(), true);
  assert.equal(sessions.length, 4);
  controller.destroy();
});

test("recovery can resume playback and a later scheduled recovery is cancelled by replacement", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { controller, video, sessions } = rig();
  controller.setSource(video, "/live", { recovery: { baseDelayMs: 0 } });
  video.ready();
  await controller.controls.play();
  video.currentTime = 4;
  sessions[0].context.failed(network);
  await flush();
  t.mock.timers.tick(0);
  video.currentTime = 0;
  video.paused = true;
  video.ready();
  assert.equal(video.currentTime, 4);
  assert.equal(controller.getState().recovery.phase, "recovered");
  assert.equal(controller.getState().status, "playing");
  sessions[1].context.failed(network);
  await flush();
  controller.setSource(video, "/new");
  t.mock.timers.tick(20);
  assert.equal(sessions.length, 3);
  assert.equal(controller.getState().recovery, null);
  controller.destroy();
});

test("a stale play rejection cannot set an error on the next source", async () => {
  const { controller, video, sessions } = rig();
  let reject;
  video.play = () =>
    new Promise((_resolve, fail) => {
      reject = fail;
    });
  controller.setSource(video, "/old");
  const pending = controller.controls.play();
  controller.setSource(video, "/next");
  reject(new DOMException("signed secret", "NotAllowedError"));
  assert.equal(await pending, false);
  assert.equal(controller.getState().error, null);
  assert.equal(sessions[0].destroyed, 1);
  controller.destroy();
});

test("pause invalidates the old play request without discarding a subsequent seek and play", async () => {
  const { controller, video } = rig();
  const requests = [];
  video.play = () =>
    new Promise((resolve, reject) => requests.push({ resolve, reject }));
  controller.setSource(video, "/vod");
  video.ready();
  const old = controller.controls.play();
  assert.equal(controller.controls.pause(), true);
  assert.equal(controller.controls.seek(5), true);
  const next = controller.controls.play();
  requests[0].reject(new DOMException("signed secret", "NotAllowedError"));
  assert.equal(await old, false);
  video.paused = false;
  video.dispatch("playing");
  requests[1].resolve();
  assert.equal(await next, true);
  assert.equal(controller.getState().status, "playing");
  assert.equal(controller.getState().currentTime, 5);
  assert.equal(controller.getState().error, null);
  controller.destroy();
});

test("a synchronous subscriber can replace a source without attaching the superseded engine", () => {
  const { controller, video, sessions } = rig();
  const unsubscribe = controller.onEvent((event) => {
    if (event.type === "transition" && event.to === "loading") {
      unsubscribe();
      controller.setSource(video, "/new");
    }
  });
  controller.setSource(video, "/old");
  assert.deepEqual(
    sessions.map((s) => [s.attached, s.destroyed]),
    [
      [0, 1],
      [1, 0],
    ],
  );
  controller.destroy();
});

test("generated replacement and teardown traces never retain more than one engine", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(
        fc.constantFrom("replace", "clear", "late", "ready", "destroy"),
        { maxLength: 70 },
      ),
      async (ops) => {
        const { controller, video, sessions } = rig();
        let destroyed = false;
        let live = false;
        for (const [index, op] of ops.entries()) {
          if (op === "replace") {
            controller.setSource(video, `/${index}`, { recovery: false });
            live = !destroyed;
          } else if (op === "clear") {
            controller.setSource(null);
            live = false;
          } else if (op === "late") {
            for (const entry of sessions.filter((s) => s.destroyed)) {
              entry.context.failed(network);
              entry.context.changed();
            }
            await flush();
          } else if (op === "ready") {
            video.ready();
          } else {
            controller.destroy();
            destroyed = true;
            live = false;
          }
          const active = sessions.filter((s) => s.destroyed === 0);
          assert.equal(active.length, live ? 1 : 0);
          assert.ok(
            sessions.every((s) => s.attached === 1 && s.destroyed <= 1),
          );
          assert.ok(
            (destroyed
              ? ["destroyed"]
              : live
                ? ["loading", "ready"]
                : ["idle"]
            ).includes(controller.getState().status),
          );
        }
        controller.destroy();
      },
    ),
    { seed: 19027, numRuns: 250 },
  );
});
