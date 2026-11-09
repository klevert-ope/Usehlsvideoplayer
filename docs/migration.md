# Migrate from 1.x

`Usehlsplayer(url, options)` and `useHlsVideoPlayer(url, options)` remain available as deprecated adapters. Both return the legacy `{ videoRef }` object ref. Existing flat hls.js options, including legacy timeout names supported by hls.js, continue to reach the engine. The default capability order stays hls.js first.

```tsx
// 1.x compatibility
const { videoRef } = Usehlsplayer(url, { startLevel: -1 });

// 2.x
const { videoRef, state, controls } = useHlsPlayer({
  src: url,
  hlsConfig: { startLevel: -1 },
});
```

- Remove the `<source>` child and any video `src` binding. The controller owns the active source.
- The primary hook returns a callback ref. Attach it directly. For imperative playback, use `controls`.
- The deprecated hooks keep the old error discriminator. The `error` or `cause` payload now contains a structured, sanitized `PlaybackError`. Code that consumed hls.js response data or a browser exception should switch to the public error codes.
- hls.js debugging is disabled to keep signed URLs out of library diagnostics. Application diagnostics should use structured events.
- Use the package root in ESM and CommonJS. Deep imports of generated 1.x files are superseded by the explicit root and `/core` entries.
- The new hook uses a bounded recovery budget. The legacy adapters leave upstream retries in charge, preserving their original recovery behaviour.

These contract changes are tracked as a 2.0.0 candidate.
