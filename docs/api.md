# Playback API reference

## React hooks

The package root exports the hooks and playback types. The React hooks expose an idle server snapshot and attach media after a client render.

| Hook                                           | Result                                                                                                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useHlsPlayer(options)`                        | Returns `videoRef`, `store`, `state`, `controls`, `quality`, `audio`, `subtitles`, `live`, `metrics`, and `error`. The component subscribes to state and metrics.                                                         |
| `useHlsController(options)`                    | Returns a stable callback `videoRef`, a stable `store`, and stable `controls`. The hook leaves playback and metrics subscriptions to the caller.                                                                          |
| `usePlaybackState(store, selector?, isEqual?)` | Returns the full snapshot or the result of a pure selector. Equality defaults to `Object.is`. A selector that returns a new object needs an equality function to suppress updates when the selected values are unchanged. |
| `useHlsMetrics(store)`                         | Subscribes to metrics separately from playback state. Returns `null` until the controller has a source with metrics enabled.                                                                                              |

## Options

Authentication renewal, recovery deadlines, `quality`, and the additional metrics below are [unreleased additions](../CHANGELOG.md#unreleased).

| Option       | Default and effect                                                                                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src`        | React only. Omitted, `null`, or an empty string leaves playback idle. The controller resolves relative HTTP or HTTPS URLs against the video's document base URL. A URL with a username or password is invalid. |
| `onEvent`    | React only. Receives transition, error, and recovery events. Changing the callback preserves the active session. The core controller provides an `onEvent(listener)` method.                                   |
| `autoPlay`   | `false`. When true, the controller requests playback on first readiness, subject to the browser's autoplay policy.                                                                                             |
| `lowLatency` | Defaults to the hls.js setting. An explicit value overrides `hlsConfig.lowLatencyMode`. The browser controls latency on the native path.                                                                       |
| `engine`     | `"auto"` prefers hls.js and falls back to native HLS when hls.js is unavailable. `"hls.js"` and `"native"` require the selected engine. The `request` option requires hls.js.                                  |
| `metrics`    | `false`. When true, the controller publishes a separate metrics snapshot on attachment and samples it every second.                                                                                            |
| `recovery`   | Two automatic attempts by default. `false` disables controller recovery. An object overrides the settings below.                                                                                               |
| `hlsConfig`  | Partial hls.js configuration from trusted application code. See the [security policy](../SECURITY.md) for overrides and limits.                                                                                |
| `request`    | Off by default. Enables the origin allowlist and optional request headers. `credentials` defaults to `"same-origin"` in this mode. See the [security policy](../SECURITY.md) for the request rules.            |
| `quality`    | Off by default. hls.js automatic quality preferences: `maxHeight`, `maxBitrate`, and `startBitrate`. Native HLS manages its own quality. See [automatic quality preferences](#automatic-quality-preferences).  |

### Recovery options

| Field              | Default  | Accepted range   |
| ------------------ | -------- | ---------------- |
| `maxAttempts`      | 2        | 0 to 5           |
| `baseDelayMs`      | 500      | 0 to 30,000      |
| `maxDelayMs`       | 5,000    | 0 to 60,000      |
| `attemptTimeoutMs` | 30,000   | 1 to 120,000     |
| `startupTimeoutMs` | Disabled | 1,000 to 120,000 |
| `stallTimeoutMs`   | Disabled | 1,000 to 120,000 |

The controller rounds finite numbers down and clamps them to the accepted range. Omitted and non-finite values use the defaults. The delay grows exponentially with jitter up to `maxDelayMs`. `attemptTimeoutMs` applies to each recovery attempt. The optional startup and stall deadlines also remain disabled for zero. See [optional reliability controls](#optional-reliability-controls) for their scope and suspension rules.

## Core controller

`usehlsvideoplayer/core` exports the controller, engine selection function, and playback and adapter types. The entry has no React runtime dependency.

| Method                                              | Contract                                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `createPlaybackController(factory?)`                | Creates an idle controller. An optional `EngineFactory` returns an unattached adapter or `null` when playback is unsupported.  |
| `selectEngine(mode, mse, native, requiresMse?)`     | Selects `"hls.js"`, `"native"`, or `null` from the supplied mode and capabilities. `requiresMse` defaults to `false`.          |
| `setSource(video, src, options?)`                   | Replaces the previous session, even for the same URL. `setSource(null)` clears the session and leaves the controller reusable. |
| `getState()`, `getMetrics()`                        | Return read-only snapshots. Repeated reads return the same snapshot until the store publishes an update.                       |
| `subscribe(listener)`, `subscribeMetrics(listener)` | Subscribe to changes in the respective store. The listener takes no arguments. Each method returns an unsubscribe function.    |
| `onEvent(listener)`                                 | Subscribes to `PlaybackEvent` values and returns an unsubscribe function.                                                      |
| `destroy()`                                         | Releases media resources, clears subscribers, and closes the controller permanently.                                           |

A controller owns its video element through automatic recovery. Terminal failure, source replacement, and teardown release ownership. A second controller in the same JavaScript realm receives a `setup` error while the element is owned. This applies across the package's ESM and CommonJS builds.

The controller owns adapter attachment and teardown. An adapter's `destroy()` method releases the media attachment synchronously and cancels any work the adapter started. If an adapter calls back into the controller on the same stack, replacement or destruction waits for the adapter call to return. The last source change wins unless the controller is destroyed.

## Controls

Commands return `true` for an accepted request and `false` for an unavailable, invalid, or rejected request. `play()` returns a promise for that result.

| Command                                                         | Result                                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `play()`, `pause()`                                             | Request playback or pause. A browser autoplay rejection from `play()` yields a non-fatal `playback-blocked` error.                          |
| `seek(seconds)`                                                 | Clamps finite seconds to the nearest seekable range. If no seekable range is available, the command uses the finite duration.               |
| `setMuted(muted)`, `setVolume(volume)`, `setPlaybackRate(rate)` | Set mute, volume, or playback rate. Volume is clamped to 0 through 1. Playback rate must be finite, positive, and supported by the browser. |
| `setQuality(level)`                                             | Selects a level ID from the snapshot or restores adaptive bitrate selection with `"auto"`. Available with hls.js when levels exist.         |
| `setAudioTrack(id)`                                             | Selects an audio track ID from the snapshot. Available with hls.js when tracks exist.                                                       |
| `setSubtitleTrack(id)`                                          | Selects a subtitle track ID from the snapshot or turns subtitles off with `"off"`.                                                          |
| `seekToLive()`                                                  | Seeks to the live sync position when a seekable range is available.                                                                         |
| `startLoading()`                                                | Starts hls.js loading, including when `hlsConfig.autoStartLoad` is false.                                                                   |
| `retry()`                                                       | Starts a new session with the retained source and a fresh recovery budget. Requires a retained source and `state.status === "error"`.       |

Track and level IDs refer to the choices in the current snapshot. A successful selection accepts the request. Media from the selected rendition may appear after one or more segments.

## State and events

`PlaybackState` contains `status`, the active or last `engine`, playback time, duration, buffered and seekable ranges, volume, mute, and playback rate. Time and range values are in seconds. Unknown or infinite duration appears as `null`.

- `quality` reports the available `levels`, selection `mode`, requested `selected` level, and `current` level.
- `audio` and `subtitles` each report `tracks` and the selected track ID or `null`.
- `live` reports `isLive`, `edge`, `syncPosition`, and `latency`, each nullable. `canSeekToLive` requires a sync position and a seekable range. `atEdge` is true when playback reaches two seconds before the sync position or later.
- `error` contains a `PlaybackError` or `null`. A playback error includes a code, fixed message, fatal and retryable flags, the engine or `null`, and an HTTP status when available.
- `recovery` contains the attempt number, limit, phase, delay, and optional action, or `null`.

A typical session moves through `idle`, `initialising`, `loading`, `ready`, and `playing`. Media events can skip `ready`. After playback starts, the browser can report `paused`, `buffering`, `seeking`, or `ended`. Source replacement returns to `idle`. Destruction leaves the controller in `destroyed`.

The controller delivers `PlaybackEvent` values synchronously as it publishes changes or reports failures.

| `type`         | Fields                                                                             |
| -------------- | ---------------------------------------------------------------------------------- |
| `"transition"` | `from` and `to` contain the previous and next status.                              |
| `"error"`      | `error` contains the structured failure, including non-fatal hls.js diagnostics.   |
| `"recovery"`   | `recovery` contains the current attempt, limit, delay, phase, and optional action. |

Non-fatal hls.js errors appear as events while hls.js retries or switches renditions. A fatal, retryable error can move the controller to `recovering`. The controller requests an applicable loading restart or decoder recovery from the adapter; it reconstructs the engine if unavailable. A timed-out operation forces reconstruction on the next attempt. Every action, including authentication renewal, consumes the source-wide budget. Requested playback must make progress before recovery succeeds; deliberately paused playback needs readiness. Reconstruction restores the last known position when possible: live-edge viewers resume near the new sync position, while DVR viewers retain their position inside the seekable window. Track choices may revert to stream defaults after reconstruction. Permanent errors and exhausted budgets end in `error`.

## Metrics

| Field                          | Measurement                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `startupMs`                    | Milliseconds from attachment to first playback, including time spent waiting for viewer input. `null` before first playback.            |
| `playingMs`                    | Milliseconds in `playing`.                                                                                                              |
| `rebufferMs`, `rebufferCount`  | Time in `buffering` and entries into `buffering` after first playback. Startup waits, seeks, and explicit recovery are separate states. |
| `rebufferRatio`                | `rebufferMs / (playingMs + rebufferMs)`, or zero before any measured playback or rebuffering.                                           |
| `droppedFrames`, `totalFrames` | Counts from `getVideoPlaybackQuality()` when available, otherwise `null`.                                                               |
| `liveLatency`                  | Estimated seconds between the playback position and the live edge visible to the player, or `null`.                                     |

State samples from `timeupdate` publish at most four times per second. Media events and commands can publish state changes immediately.

## Optional reliability controls

`recovery.startupTimeoutMs` and `recovery.stallTimeoutMs` are disabled when omitted, zero or non-finite. Other finite values clamp to 1,000–120,000 ms. Startup covers attachment to readiness, starting after `startLoading()` when hls.js loading was deferred. Stall detection watches media-time progress and suspends while paused, seeking, ended or hidden. Both use the existing recovery budget. `recovery: false` disables controller recovery and watchdogs.

`RecoveryState.action` optionally identifies `restart-loading`, `recover-media`, `recreate` or `refresh-authentication`. Event discriminants are unchanged. Optional custom-adapter `recover(action)` accepts the first two operations and returns whether it accepted the operation; absence, rejection or an exception falls back to reconstruction. Acceptance alone does not establish successful recovery.

## Authentication callbacks

`request.headers(url, { signal })` may return headers or `undefined`, synchronously or asynchronously. Existing synchronous one-argument callbacks remain valid. The URL may contain secrets: it is an application callback input, not a diagnostic. Origins are validated before invocation; request/session teardown aborts pending providers. Providers should honour the signal; late results are ignored regardless.

`request.refreshAuthentication({ signal, httpStatus, attempt })` is opt-in. Update application-owned credentials read by the header provider, optionally return `{ src: string }` for a renewed signed URL, or return `null` to decline. Returning `undefined` retries the existing source with updated credentials. Synchronous and asynchronous callbacks work. A replacement URL must remain within the original allowlist; changing policy requires explicit source replacement.

`refreshStatusCodes` defaults to `[401]`. Include `403` only when your origin uses it for expiry. `refreshTimeoutMs` defaults to 10,000 ms and clamps finite values to 1,000–60,000 ms. One refresh runs per source at a time; each consumes a recovery attempt. Rejected, declined and timed-out refreshes terminate with an authentication error; forbidden replacement URLs report `request-policy`. `recovery: false` disables renewal. Cancellation cannot undo application/server work already performed.

Reactive renewal is not a token scheduler. For regular expiry during long sessions, renew proactively in the application credential provider. Applications own coordination across players. Native HLS cannot use these restricted-request callbacks.

## Automatic quality preferences

`quality: { maxHeight?, maxBitrate?, startBitrate? }` applies only to hls.js. Heights are pixels; bitrates are advertised bits per second. Non-positive and non-finite preferences are ignored. Caps select a conservative prefix of the upstream ladder, because bitrate and resolution ordering can differ. When no rendition fits, playback falls back to the lowest rendition. These are preferences, not hard transfer limits.

`startBitrate` selects the highest advertised bitrate within the startup preference and automatic cap, falling back to the lowest rendition. It overrides `hlsConfig.startLevel` when specified. Valid quality preferences reset `minAutoBitrate` to zero so an upstream floor cannot raise the chosen startup level. Explicit caps also clamp a conflicting startup level and disable `capLevelToPlayerSize` and `capLevelOnFPSDrop` so those mechanisms cannot overwrite the preference. Other ABR behaviour stays upstream-owned. Manual selection can exceed the preference; selecting `auto` reapplies it. Native HLS manages its own quality.

## Additional opt-in measurements

These optional fields are emitted with metrics enabled. Optional declarations retain compatibility with structural stores and test doubles.

| Field               | Meaning                                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sessionMs`         | Elapsed source-session time including pauses; frozen on terminal failure.                                                                                       |
| `recoveryMs`        | Time in recovery, separate from the existing rebuffer ratio.                                                                                                    |
| `fatalFailures`     | Fatal failures handled by the controller, including attempt timeouts.                                                                                           |
| `recoveryAttempts`  | Scheduled controller attempts, including renewal.                                                                                                               |
| `qualitySwitches`   | Observed rendition changes after the first known rendition.                                                                                                     |
| `bandwidthEstimate` | Estimated hls.js bits per second, or `null`; not connection capacity.                                                                                           |
| `firstFrameMs`      | Attachment to first presented frame, or `null` when no frame has been presented or the browser lacks the callback. A paused preview frame can precede playback. |

Disabled metrics create no sampler or frame observer. Observers are cancelled on clear, destruction and terminal failure. The SDK sends no metrics anywhere automatically.
