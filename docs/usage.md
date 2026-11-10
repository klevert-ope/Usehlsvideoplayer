# Use the player

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

For LL-HLS, serve an LL-HLS playlist with partial segments and blocking reloads. The origin and CDN need to support those requests. To offer rewind on a live stream, keep enough segments in the live playlist and available on the server.

## Add quality, audio, and subtitle choices

Build the menus from the current snapshot. Rebuild them as the available choices change.

- Offer **Auto** with `controls.setQuality("auto")`. For manual choices, pass an ID from `quality.levels`. Hide the selector when `quality.mode` is `"unavailable"`.
- Pass an ID from `audio.tracks` to `controls.setAudioTrack(id)`. Hide the selector when there are no audio choices.
- Pass an ID from `subtitles.tracks` to `controls.setSubtitleTrack(id)`. Add an **Off** choice that passes `"off"`.

Use `quality.current` to display the level in use. The requested level can take one or more segments to become current.

## Recover from a playback failure

- If the browser blocks autoplay, call `controls.play()` from a click or let the viewer use the video controls.
- While `state.status` is `"recovering"`, show progress and let the controller finish its automatic attempts.
- If `state.status` is `"error"` and the URL and configuration still apply, offer `controls.retry()`. A return value of `true` means the controller started a fresh attempt.
- If the URL expired, get a fresh URL and replace `src`. If credentials expired, refresh them through your application before starting another attempt.

To collect diagnostics, use `onEvent` for transitions, errors, and recovery. For playback measurements, set `metrics: true`.

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
