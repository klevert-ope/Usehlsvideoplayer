# Use the player

Credential renewal, recovery deadlines, quality preferences, and extended metrics require [2.1.0 or later](../CHANGELOG.md#210).

## Play a stream without React

Import from `usehlsvideoplayer/core`. Pass a video element with no `src` or `<source>` children, and an element for the status. Call the returned cleanup function before removing the player.

```ts
import { createPlaybackController } from "usehlsvideoplayer/core";

export function mountPlayer(
  video: HTMLVideoElement,
  status: HTMLElement,
  src: string,
) {
  const player = createPlaybackController();
  const render = () => {
    const state = player.getState();
    status.textContent =
      state.status === "error"
        ? (state.error?.message ?? "Playback failed.")
        : state.status;
  };

  const unsubscribe = player.subscribe(render);
  video.controls = true;
  video.playsInline = true;
  render();
  player.setSource(video, src);

  return () => {
    unsubscribe();
    player.destroy();
  };
}
```

## Replace or clear a stream

Give each player its own video element. In React, change `src` to replace the playlist or pass `src: null` to clear it. The hook clears the source on unmount. With the core controller, call `setSource(video, nextUrl, options)` to replace the playlist or `setSource(null)` to clear it.

Keep nested `hlsConfig` values and `request.headers` stable across React renders. For example, put static configuration at module scope. Use `useCallback` for a header provider that depends on props. A changed option can replace the playback session.

## Add live controls

Keep the browser's video controls for play, pause, volume, and seeking. Enable **Go live** when `live.canSeekToLive` is true. A live playlist needs a seekable range before the command becomes available.

```tsx
"use client";

import { useHlsPlayer } from "usehlsvideoplayer";

export function LivePlayer({ src }: { src: string }) {
  const { videoRef, controls, live } = useHlsPlayer({ src, lowLatency: true });

  return (
    <>
      <video ref={videoRef} controls playsInline />
      <button
        type="button"
        disabled={!live.canSeekToLive}
        onClick={controls.seekToLive}
      >
        Go live
      </button>
    </>
  );
}
```

`lowLatency: true` enables low-latency mode on the hls.js path. For Low-Latency HLS (LL-HLS), serve partial segments and configure the origin and CDN to handle blocking playlist reloads. Test with the encoder and CDN your viewers use. For live rewind, keep enough segments in the live playlist and available on the server. [API options](api.md#options) · [Playback qualification](qualification.md#low-latency-hls)

## Add quality, audio, and subtitle choices

Build the menus from the current snapshot. Rebuild them as the available choices change.

- Offer **Auto** with `controls.setQuality("auto")`. For manual choices, pass an ID from `quality.levels`. Hide the selector when `quality.mode` is `"unavailable"`.
- Pass an ID from `audio.tracks` to `controls.setAudioTrack(id)`. Hide the selector when there are no audio choices.
- Pass an ID from `subtitles.tracks` to `controls.setSubtitleTrack(id)`. Add an **Off** choice that passes `"off"`.

Use `quality.current` to display the level in use. The requested level can take one or more segments to become current.

## Build a VOD playlist with resume

Open **VOD playlist** in the local playground. Play a clip, then open the playlist using the clip name on the player and choose **Save position**. Switch clips from the playlist or with **Next clip** and **Previous clip** in the playbar. The example restores the saved position when you return to a clip and the time is still seekable. Choose **Start over** in the playlist or finish playback to clear that clip's saved position. [Run the playground](../README.md#development)

Use the player’s **Settings** to adjust audio, captions, speed and volume. **Quality options** contains manual rendition selection and the separate resolution limit for automatic mode. **Inspector** shows playback diagnostics and stays open beside the video on wide screens. Use the source selector in **Playground** to switch fixtures, test credential renewal, load a custom manifest or clear the current stream.

Keep the playlist in application state and pass the selected video's URL as `src`. Key saved positions by stable content ID. Use `controls.seek()` once the video has a seekable range and the saved time is within it. The example uses per-tab `sessionStorage` and writes a position only when the viewer chooses **Save position**. Playback can continue when storage is unavailable. If your app stores positions across sessions, define who can access them and how long to keep them. Keep stream URLs and credentials out of storage.

Use `<video controls>` and label the playlist and caption selectors. Keep keyboard focus on the playlist selector as the video changes. Use the tracks exposed by the player and offer an **Off** option. Announce save, restore and recovery feedback in a status region. [W3C media player guidance](https://www.w3.org/WAI/media/av/player/)

## Use AirPlay from Safari

Use a public HTTPS HLS stream approved for receiver playback. The receiver needs access to the playlists and media without the sender's cookies or credentials. Set `engine: "native"` to give Safari the stream URL directly. With `auto`, the controller can choose hls.js and use a media source local to the browser. [WebKit AirPlay guidance](https://webkit.org/blog/15036/how-to-use-media-source-extensions-with-airplay/)

```ts
import { createPlaybackController } from "usehlsvideoplayer/core";

export function mountAirPlayPlayer(
  video: HTMLVideoElement,
  publicHlsUrl: string,
) {
  const player = createPlaybackController();
  video.controls = true;
  video.playsInline = true;
  player.setSource(video, publicHlsUrl, { engine: "native" });
  return () => player.destroy();
}
```

Start local playback in Safari and select the receiver from the AirPlay control when it appears. Call the returned cleanup function when removing the player. Streams that require injected headers or per-request origin rules need restricted request mode. Use the standard playback example on other browsers. [Playback example](#play-a-stream-without-react) · [Request policy](../SECURITY.md) · [AirPlay device check](qualification.md#airplay-device-check)

## Recover from a playback failure

- If the browser blocks autoplay, call `controls.play()` from a click or let the viewer use the video controls.
- While `state.status` is `"recovering"`, show progress and let the controller finish its automatic attempts.
- If `state.status` is `"error"` and the URL and configuration still apply, offer `controls.retry()`. A return value of `true` means the controller started a fresh attempt.
- If credentials expire, configure [credential renewal](#renew-application-owned-credentials), or refresh them through your application and replace `src` when needed.

To collect diagnostics, use `onEvent` for transitions, errors, and recovery. For playback measurements, set `metrics: true`.

### Bound initial loading and playback stalls

Enable controller deadlines when a stream must stop waiting after a bounded interval.

```tsx
const player = useHlsPlayer({
  src,
  recovery: {
    maxAttempts: 2,
    startupTimeoutMs: 20_000,
    stallTimeoutMs: 15_000,
  },
});
```

The startup deadline runs until readiness. With `hlsConfig.autoStartLoad: false`, it waits for `controls.startLoading()`. The stall deadline watches media-time progress after readiness and suspends while paused, seeking, ended, or hidden. Both share the source's recovery budget. They are disabled by default; `recovery: false` disables them and automatic credential renewal.

Use `state.recovery?.action` to distinguish a loading restart, decoder recovery, reconstruction, or authentication renewal. Recovery finishes when requested playback advances or deliberately paused playback is ready. From [2.1.1](../CHANGELOG.md#211), a deferred stream can also recover its manifest and return to `loading`. Call `controls.startLoading()` when you want it to request media. See the [recovery reference](api.md#optional-reliability-controls).

## Subscribe to part of the playback state

If only one part of a React player needs playback updates, use `useHlsController` in the parent. Select the field you need in the child. In this example, the store updates `PlaybackStatus` only when `state.status` changes.

```tsx
"use client";

import {
  type PlaybackStore,
  useHlsController,
  usePlaybackState,
} from "usehlsvideoplayer";

function PlaybackStatus({ store }: { store: PlaybackStore }) {
  const status = usePlaybackState(store, (state) => state.status);
  return <p role="status">{status}</p>;
}

export function Player({ src }: { src: string }) {
  const { videoRef, store } = useHlsController({ src });
  return (
    <>
      <video ref={videoRef} controls playsInline />
      <PlaybackStatus store={store} />
    </>
  );
}
```

## Send credentials with HLS requests

If the stream requires an authorization header, pass `request`. This mode requires hls.js. Include the exact origins of the master playlist, child playlists, segments, subtitles, and keys in `allowedOrigins`. Use final URLs because this mode rejects redirects.

```tsx
"use client";

import { useCallback } from "react";
import { useHlsPlayer } from "usehlsvideoplayer";

export function ProtectedPlayer({
  src,
  getAccessToken,
}: {
  src: string;
  getAccessToken: () => string;
}) {
  const headers = useCallback(
    () => ({ Authorization: `Bearer ${getAccessToken()}` }),
    [getAccessToken],
  );
  const { videoRef, state, error } = useHlsPlayer({
    src,
    request: {
      allowedOrigins: ["https://media.example.com"],
      credentials: "omit",
      headers,
    },
  });

  return (
    <>
      <video ref={videoRef} controls playsInline />
      {state.status === "error" && error && <p role="alert">{error.message}</p>}
    </>
  );
}
```

Replace the example origin with the media origin and pass a stable `getAccessToken` function that reads the current token. The header callback in this example sends the token to every allowed origin. If different origins need different credentials, use the callback's URL argument to decide which headers to return.

For cross-origin requests, allow your app's origin and the `Authorization` header in the server's CORS response. For cookie authentication across origins, use `credentials: "include"` and configure the server to allow credentials for the exact app origin. For native playback, use a signed URL or browser-managed cookies. See the [security policy](../SECURITY.md) for request and credential limits.

## Renew application-owned credentials

Supply stable callbacks from your authentication module. `getAccessToken` should proactively renew an expiring token and honour cancellation; `refreshAccessToken` handles unexpected denial. The application owns coordination across players.

```ts
import {
  createPlaybackController,
  type RequestOptions,
} from "usehlsvideoplayer/core";

export function attachProtectedStream(
  video: HTMLVideoElement,
  src: string,
  getAccessToken: (signal: AbortSignal) => Promise<string>,
  refreshAccessToken: (signal: AbortSignal) => Promise<void>,
) {
  const request: RequestOptions = {
    allowedOrigins: ["https://media.example.com"],
    credentials: "omit",
    headers: async (_url, { signal }) => ({
      Authorization: `Bearer ${await getAccessToken(signal)}`,
    }),
    refreshAuthentication: async ({ signal }) => {
      await refreshAccessToken(signal);
    },
  };
  const player = createPlaybackController();
  player.setSource(video, src, { request, recovery: { maxAttempts: 2 } });
  return () => player.destroy();
}
```

For a renewed signed manifest, return `{ src: renewedUrl }`; its origin must remain allowed. Return `null` for permanent denial. Include `403` in `refreshStatusCodes` only if your server uses it for expiry. Never call `retry()` automatically on every error event: that resets the budget and can create an application-level loop.

React and Next.js client components can pass the same request object to `useHlsPlayer`. Keep callback identities stable. Obtain credentials from an authenticated application endpoint; never embed signing keys in browser code. Native HLS still requires application-driven signed-source replacement.

## Prefer lower data use

```tsx
const player = useHlsPlayer({
  src,
  quality: { maxHeight: 720, maxBitrate: 2_000_000, startBitrate: 500_000 },
});
```

hls.js ABR remains enabled. Bitrates are advertised bits per second. Preferences have a lowest-rendition fallback; manual selection can override them. Call `controls.setQuality("auto")` to reapply the cap. These preferences do not impose a hard data-transfer limit, and native HLS ignores them. See [quality preference precedence](api.md#automatic-quality-preferences) when combining them with `hlsConfig`.

For live tuning, use `lowLatency` and upstream latency configuration, then measure the actual encoder and CDN. Avoid aggressive catch-up for viewers intentionally watching DVR content.

## Bridge application telemetry

Pass a `Meter` from your application's OpenTelemetry provider. Subscribe before calling `setSource()` so the bridge can count error events and started recovery attempts. Set `metrics: true` when attaching a source to record its startup and first-frame times in milliseconds. Configure the provider and exporter in your application. [OpenTelemetry metrics](https://opentelemetry.io/docs/languages/js/instrumentation/#metrics)

```ts
import type { Meter } from "@opentelemetry/api";
import type { PlaybackController } from "usehlsvideoplayer/core";

export function subscribeToPlaybackMetrics(
  player: PlaybackController,
  meter: Meter,
) {
  const errors = meter.createCounter("hls.playback.errors");
  const recoveries = meter.createCounter("hls.playback.recovery.attempts");
  const startup = meter.createHistogram("hls.playback.startup.duration", {
    unit: "ms",
  });
  const firstFrame = meter.createHistogram(
    "hls.playback.first_frame.duration",
    {
      unit: "ms",
    },
  );
  let recordedStartup = false;
  let recordedFirstFrame = false;

  const stopEvents = player.onEvent((event) => {
    if (event.type === "error") errors.add(1, { code: event.error.code });
    if (event.type === "recovery" && event.recovery.phase === "running") {
      recoveries.add(1, { action: event.recovery.action ?? "unknown" });
    }
  });
  const stopMetrics = player.subscribeMetrics(() => {
    const metrics = player.getMetrics();
    if (metrics === null) {
      recordedStartup = false;
      recordedFirstFrame = false;
      return;
    }
    if (!recordedStartup && metrics.startupMs !== null) {
      recordedStartup = true;
      startup.record(metrics.startupMs);
    }
    if (!recordedFirstFrame && typeof metrics.firstFrameMs === "number") {
      recordedFirstFrame = true;
      firstFrame.record(metrics.firstFrameMs);
    }
  });

  return () => {
    stopEvents();
    stopMetrics();
  };
}
```

Call the returned function when disabling telemetry or before destroying the player. The bridge counts each emitted error event, including non-fatal errors. It records each timing once per source and records first-frame timing only when the browser supplies it. Use the fixed error and recovery labels shown here. Keep URLs, headers, raw errors, manifest labels and persistent identifiers out of the telemetry payload.
