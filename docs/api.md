# Playback API

## React hooks

| Hook                                           | Contract                                                                                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useHlsPlayer(options)`                        | Owns one video and subscribes to playback and optional metrics. Returns `videoRef`, `store`, `state`, `controls`, `quality`, `audio`, `subtitles`, `live`, `metrics`, and `error`. |
| `useHlsController(options)`                    | Returns a stable callback ref, the store, and stable controls. Its component does not subscribe to playback updates.                                                               |
| `usePlaybackState(store, selector?, isEqual?)` | Reads the current snapshot or a selected value. Equality defaults to `Object.is`. Use a pure selector and provide equality when it returns a newly allocated object.               |
| `useHlsMetrics(store)`                         | Subscribes to the separate metrics store. Returns `null` until collection is enabled and a source is attached.                                                                     |

```tsx
import {
  useHlsController,
  usePlaybackState,
  type PlaybackStore,
} from "usehlsvideoplayer";

function Status({ store }: { store: PlaybackStore }) {
  const status = usePlaybackState(store, (state) => state.status);
  return <p role="status">{status}</p>;
}

export function Player({ src }: { src: string }) {
  const { videoRef, store } = useHlsController({ src });
  return (
    <>
      <video ref={videoRef} controls playsInline />
      <Status store={store} />
    </>
  );
}
```

### Options

| Option       | Default and effect                                                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src`        | No source. Accepts relative or absolute HTTP(S) URLs, resolved against the video's document. Empty or null clears playback.                                                                        |
| `autoPlay`   | `false`. Requests playback at first readiness. Browser autoplay policy still applies.                                                                                                              |
| `lowLatency` | Uses the hls.js default when omitted. Setting it overrides `hlsConfig.lowLatencyMode`. Native playback uses browser policy.                                                                        |
| `engine`     | `"auto"` prefers hls.js, then native. `"hls.js"` and `"native"` require the chosen capability. `request` requires hls.js.                                                                          |
| `metrics`    | `false`. Enables a separate one-second metrics sample.                                                                                                                                             |
| `recovery`   | Two automatic attempts after terminal upstream transient errors. Set `false` to disable, or configure attempts (0–5), base delay (default 500 ms), max delay (5 s) and per-attempt timeout (30 s). |
| `hlsConfig`  | Trusted partial hls.js configuration. Keep nested objects and callbacks stable between renders.                                                                                                    |
| `request`    | Opt-in credential and origin policy. See [Security](../SECURITY.md).                                                                                                                               |
| `onEvent`    | Receives synchronous, URL-free transition, error and recovery events. Changing the callback keeps the session.                                                                                     |

## Controller and commands

The root React entry and `usehlsvideoplayer/core` expose types. The core entry exports `createPlaybackController(factory?)` and `selectEngine`. An optional engine factory implements `EngineFactory`, creates an unattached adapter, and gives the controller sole ownership of attaching and destroying it. Use only one controller per media element.

`setSource(video, src, options)` always replaces the previous session. `setSource(null)` clears it. `destroy()` clears subscribers, releases resources and permanently closes the controller. `subscribe`, `subscribeMetrics` and `onEvent` each return an unsubscribe function. Snapshot reads retain identity until a value changes. Treat snapshots as read-only.

Controls return `true` when accepted and `false` when unavailable, invalid or rejected. `play()` resolves to a boolean and reports a browser autoplay rejection as a non-fatal `playback-blocked` error. Track selection confirms an accepted request. The selected rendition may take one or more segments to become current.

| Commands                                                        | Semantics                                                                                                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `play()`, `pause()`                                             | Request playback or pause. Use a user gesture when autoplay is blocked.                                                                 |
| `seek(seconds)`                                                 | Clamps finite seconds to the nearest seekable range, or finite media duration when ranges are unavailable.                              |
| `setMuted(value)`, `setVolume(value)`, `setPlaybackRate(value)` | Applies a boolean, a volume clamped to 0–1, or a finite positive speed accepted by the browser.                                         |
| `setQuality(id \| "auto")`                                      | Selects a listed level or restores ABR. Native selection is unavailable.                                                                |
| `setAudioTrack(id)`, `setSubtitleTrack(id \| "off")`            | Selects IDs from the current snapshot. IDs are scoped to the active track group.                                                        |
| `seekToLive()`                                                  | Seeks to the advertised sync position, or slightly inside the last native seekable range.                                               |
| `startLoading()`                                                | Starts hls.js loading, including streams configured with `autoStartLoad: false`.                                                        |
| `retry()`                                                       | Starts a fresh attempt with a new budget after a terminal error on a retained source. Use a new URL when the old signature has expired. |

### State and events

The snapshot contains a lifecycle `status`, active or last `engine`, current time, finite duration or `null`, buffered and seekable ranges, volume, mute and rate. `quality` separates requested selection from current level. `audio` and `subtitles` describe available tracks and selected IDs. `live` provides nullable detection, edge, sync position and latency estimate in seconds, plus a seek availability flag and a two-second tolerance around the sync target. `error` is a structured failure. `recovery` includes the current attempt, limit, phase and delay.

The normal path is `idle → initialising → loading → ready → playing`. Browser events may skip ready when playback starts immediately. After readiness, actual playback may enter `paused`, `buffering`, `seeking` or `ended` and resume as media events permit. A fatal retryable failure can move the session to `recovering`, with success returning it to readiness. Non-retryable failure or exhaustion ends in `error`. Replacement goes through `idle`. `destroyed` is absorbing.

Non-fatal hls.js errors emit diagnostics while its own retry and failover logic runs. Fatal transient failure destroys the old engine before scheduling a new one. The source-wide attempt budget persists across successful recoveries. Recovery attempts time out if playback never reaches readiness. Automatic reload restores the last known position when possible and preserves playback intent. Track choices can revert to stream defaults after reattachment.

### Live, quality and recovery

```tsx
const { controls, state, live, quality } = useHlsPlayer({
  src: liveManifest,
  lowLatency: true,
  recovery: { maxAttempts: 2, baseDelayMs: 500 },
  onEvent(event) {
    if (event.type === "recovery") recordRecovery(event.recovery);
  },
});

// Wire these commands to UI actions.
const goLive = () => live.canSeekToLive && controls.seekToLive();
const selectQuality = (id: number | "auto") => controls.setQuality(id);
const retry = () => state.status === "error" && controls.retry();
```

Map `quality.levels` to your selector and include an Auto option. hls.js and the browser handle decoding, playlist parsing, ABR, LL-HLS protocol, buffer management and discontinuities. Server playlist design controls DVR availability. Live latency is the distance from the player-visible media edge, which can differ from glass-to-glass latency.

### Metrics

`startupMs` measures from attachment to first playing, including any time waiting for the user. `playingMs`, `rebufferMs` and `rebufferCount` accumulate media-state intervals, excluding startup waits, seeks and explicit recovery. `rebufferRatio` is rebuffer time divided by playing plus rebuffer time. Frame counters depend on `getVideoPlaybackQuality()`. `liveLatency` is an estimate in seconds. Playback time samples from `timeupdate` are capped at four per second. Status and command changes can publish immediately.
