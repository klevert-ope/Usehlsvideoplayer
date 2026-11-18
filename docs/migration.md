# Migrate from 1.x

`Usehlsplayer(url, options)` and `useHlsVideoPlayer(url, options)` remain available as deprecated adapters. They return the original `{ videoRef }` object ref and pass flat hls.js options to the engine.

## Switch to `useHlsPlayer`

1. Replace the legacy import with `useHlsPlayer` from the package root.
2. Pass the URL as `src` and move hls.js options under `hlsConfig`. The old call `Usehlsplayer(url, { startLevel: -1 })` becomes `useHlsPlayer({ src: url, hlsConfig: { startLevel: -1 } })`.
3. Attach `videoRef` directly to the video element. Remove any `src` attribute or `<source>` children. The new ref is a callback. For imperative playback, use `controls`.
4. Replace the legacy `onError` callback with `onEvent` if you need diagnostics. Use `state.status === "error"` and `error` to show a terminal failure in the UI.

```tsx
"use client";

import { useHlsPlayer } from "usehlsvideoplayer";

export function Player({ url }: { url: string }) {
  const { videoRef, state, error } = useHlsPlayer({
    src: url,
    hlsConfig: { startLevel: -1 },
  });

  return (
    <>
      <video ref={videoRef} controls playsInline />
      {state.status === "error" && error && <p role="alert">{error.message}</p>}
    </>
  );
}
```

If you keep a legacy adapter, update any code that reads raw hls.js response data or browser exceptions. The `kind` discriminator stays the same, and the `error` or `cause` field now contains a structured `PlaybackError` when present. The library disables hls.js debugging and exposes structured events for diagnostics.

The new hook makes up to two automatic recovery attempts by default. To keep the legacy recovery behaviour, set `recovery: false` and leave retries to the engine.

Replace deep imports of generated 1.x files with the package root for React or `usehlsvideoplayer/core` for the controller. Both entries support ESM and CommonJS. See the [API reference](api.md) for options and commands.

## Adopt the 2.1.0 additions

Existing synchronous header callbacks remain valid, including callbacks that accept only the URL. Asynchronous providers can accept a second `{ signal }` argument and return a promise. Authentication renewal is opt-in, consumes the existing recovery budget, and cannot widen `allowedOrigins`.

Startup and stall deadlines are disabled unless configured. Automatic quality preferences and additional metrics are optional. Existing event `type` values are unchanged, and new diagnostic fields are optional in public types. Custom adapters can omit `recover(action)`; the controller reconstructs them when recovery is needed.

See the [2.1.0 changelog](../CHANGELOG.md#210) and [usage guide](usage.md) for examples and version requirements.
