# usehlsvideoplayer

Headless HLS playback for an HTML video element. Use the React hooks or the framework-independent TypeScript controller. The library selects hls.js where MSE or Managed Media Source is supported and falls back to browser-native HLS.

The examples below target version 2.0.0.

## Quick start

```sh
npm install usehlsvideoplayer
```

The React entry supports React 18.2 and 19. The `/core` entry can be installed without React.

```tsx
"use client";

import { useHlsPlayer } from "usehlsvideoplayer";

export function StreamPlayer({ src }: { src: string }) {
  const {
    videoRef,
    state,
    controls,
    quality,
    audio,
    subtitles,
    live,
    metrics,
    error,
  } = useHlsPlayer({ src, autoPlay: false, lowLatency: true });

  return (
    <>
      <video ref={videoRef} controls playsInline />
      <button onClick={() => void controls.play()}>Play</button>
      <button disabled={!live.canSeekToLive} onClick={controls.seekToLive}>
        Seek to live
      </button>
      <p role="status">{state.status}</p>
      {error?.fatal && state.status === "error" && (
        <p role="alert">{error.message}</p>
      )}
    </>
  );
}
```

Give the hook one video element and leave its `src` and `<source>` children unset. Pass a new `src` to replace the stream, or `null` to clear it. For Next.js App Router, put the player in a Client Component as shown above and pass a serializable URL from the Server Component. Server rendering yields an idle snapshot and starts no media requests.

## Framework-independent usage

```ts
import { createPlaybackController } from "usehlsvideoplayer/core";

const player = createPlaybackController();
const unsubscribe = player.subscribe(() => render(player.getState()));
player.setSource(videoElement, "/streams/master.m3u8");

// On teardown
unsubscribe();
player.destroy();
```

## Documentation

- [API, state transitions and streaming examples](docs/api.md)
- [Browser compatibility and troubleshooting](docs/compatibility.md)
- [Migrating from `Usehlsplayer`](docs/migration.md)
- [Security and authenticated requests](SECURITY.md)
- [Repository audit and engineering evidence](docs/modernization.md)

## Development

Use Node 24 and FFmpeg with libx264.

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm run lint
npm run fixtures
npm run dev
```

The loopback-only playground plays generated VOD, live, alternate audio and captions. The browser suite also uses local CMAF and LL-HLS fixtures. See [playback qualification](docs/qualification.md) for browser, soak and release checks.

## License

ISC
