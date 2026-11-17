import assert from "node:assert/strict";
import { arch, cpus, platform } from "node:os";
import { pathToFileURL } from "node:url";

const { createPlaybackController } = await import(
  process.env.CONTROLLER_BENCH_MODULE
    ? pathToFileURL(process.env.CONTROLLER_BENCH_MODULE).href
    : "usehlsvideoplayer/core"
);
const empty = { length: 0 };
class Video extends EventTarget {
  ownerDocument = { baseURI: "https://fixture.test" };
  seekable = empty;
  buffered = empty;
  duration = 60;
  currentTime = 0;
  volume = 1;
  muted = true;
  playbackRate = 1;
}

const iterations = 100_000;
function measure(withController, change) {
  const video = new Video();
  const controller =
    withController &&
    createPlaybackController(() => ({
      kind: "hls.js",
      features: () => ({}),
      attach() {},
      destroy() {},
    }));
  let notifications = 0;
  if (controller) {
    controller.setSource(video, "/vod");
    video.dispatchEvent(new Event("progress"));
    controller.subscribe(() => notifications++);
  }
  const event = new Event("progress");
  const began = performance.now();
  for (let i = 1; i <= iterations; i++) {
    if (change) video.currentTime = i / 100_000;
    video.dispatchEvent(event);
  }
  const elapsed = performance.now() - began;
  if (controller) {
    assert.equal(notifications, change ? iterations : 0);
    controller.destroy();
  }
  return (elapsed * 1e6) / iterations;
}
function repeat(controller, change) {
  measure(controller, change);
  return Array.from({ length: 5 }, () =>
    Math.round(measure(controller, change)),
  );
}
console.log(
  JSON.stringify(
    {
      node: process.version,
      host: `${platform()} ${arch()} ${cpus()[0].model}`,
      iterations,
      nanosecondsPerProgressEvent: {
        eventOnly: repeat(false, false),
        unchangedSnapshot: repeat(true, false),
        changingSnapshot: repeat(true, true),
      },
    },
    null,
    2,
  ),
);
