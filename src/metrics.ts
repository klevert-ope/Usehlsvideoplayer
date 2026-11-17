import type { PlaybackMetrics, PlaybackStatus } from "./types.js";

export function createMetrics(video: HTMLVideoElement) {
  const started = performance.now();
  let last = started;
  let status: PlaybackStatus = "idle";
  let startupMs: number | null = null;
  let playingMs = 0;
  let rebufferMs = 0;
  let rebufferCount = 0;
  let previousFrames = video.getVideoPlaybackQuality?.();
  let droppedFrames = 0;
  let totalFrames = 0;
  let stopped: number | null = null;
  let recoveryMs = 0;
  let fatalFailures = 0;
  let recoveryAttempts = 0;
  let qualitySwitches = 0;
  let currentQuality: number | null = null;
  let bandwidthEstimate: number | null = null;
  let firstFrameMs: number | null = null;
  let frame: number | undefined;
  if (video.requestVideoFrameCallback) {
    frame = video.requestVideoFrameCallback(() => {
      if (stopped === null) firstFrameMs = performance.now() - started;
      frame = undefined;
    });
  }

  function update(next: PlaybackStatus) {
    if (stopped !== null) return;
    const now = performance.now();
    if (status === "playing") playingMs += now - last;
    if (status === "buffering" && startupMs !== null) rebufferMs += now - last;
    if (status === "recovering") recoveryMs += now - last;
    if (next === "playing" && startupMs === null) startupMs = now - started;
    if (next === "buffering" && status !== next && startupMs !== null)
      rebufferCount++;
    status = next;
    last = now;
    const frames = video.getVideoPlaybackQuality?.();
    if (frames && previousFrames) {
      const { droppedVideoFrames: dropped, totalVideoFrames: total } = frames;
      droppedFrames +=
        dropped < previousFrames.droppedVideoFrames
          ? dropped
          : dropped - previousFrames.droppedVideoFrames;
      totalFrames +=
        total < previousFrames.totalVideoFrames
          ? total
          : total - previousFrames.totalVideoFrames;
    }
    previousFrames = frames;
  }

  return {
    update,
    failure() {
      fatalFailures++;
    },
    recovery() {
      recoveryAttempts++;
    },
    quality(next: number | null) {
      if (next === null) return;
      if (currentQuality !== null && currentQuality !== next) qualitySwitches++;
      currentQuality = next;
    },
    bandwidth(value: number | null) {
      bandwidthEstimate =
        value !== null && Number.isFinite(value) && value >= 0 ? value : null;
    },
    stop() {
      update(status);
      stopped ??= performance.now();
      if (frame !== undefined) video.cancelVideoFrameCallback?.(frame);
      frame = undefined;
    },
    read(latency: number | null): PlaybackMetrics {
      update(status);
      const activeMs = playingMs + rebufferMs;
      return {
        startupMs,
        playingMs,
        rebufferMs,
        rebufferCount,
        rebufferRatio: activeMs === 0 ? 0 : rebufferMs / activeMs,
        droppedFrames: previousFrames ? droppedFrames : null,
        totalFrames: previousFrames ? totalFrames : null,
        liveLatency: latency,
        sessionMs: (stopped ?? performance.now()) - started,
        recoveryMs,
        fatalFailures,
        recoveryAttempts,
        qualitySwitches,
        bandwidthEstimate,
        firstFrameMs,
      };
    },
  };
}
