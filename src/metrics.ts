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

  function update(next: PlaybackStatus) {
    const now = performance.now();
    if (status === "playing") playingMs += now - last;
    if (status === "buffering" && startupMs !== null) rebufferMs += now - last;
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
      };
    },
  };
}
