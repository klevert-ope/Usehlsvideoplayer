# usehlsvideoplayer

Play HLS streams in an HTML video element with React hooks or a TypeScript controller. You supply the video element and choose between the browser's controls and your own.

## Play a stream in React

1. Install the package in a React app. The React entry supports React 18.2 and React 19.

   ```sh
   npm install usehlsvideoplayer
   ```

2. Create `StreamPlayer.tsx` with this component.

   ```tsx
   "use client";

   import { useHlsPlayer } from "usehlsvideoplayer";

   export function StreamPlayer({ src }: { src: string }) {
     const { videoRef, state, error } = useHlsPlayer({ src });

     return (
       <>
         <video ref={videoRef} controls playsInline />
         <p role="status">{state.status}</p>
         {state.status === "error" && error && (
           <p role="alert">{error.message}</p>
         )}
       </>
     );
   }
   ```

3. Render `<StreamPlayer src="/streams/master.m3u8" />` where you want the player. Replace the path with a reachable HLS playlist. If the stream uses a different origin, allow your app's origin on the HLS server for hls.js requests.
4. Once the status reaches `ready`, select **Play** in the video controls. The status changes to `playing` when playback starts.

Pass the playlist URL to the hook. Leave the video's `src` attribute and `<source>` children unset. In Next.js App Router, keep `"use client"` at the top of the player module and pass the URL as a string prop. The server renders the `idle` state. Playback starts in the browser.

## Framework-independent usage

The `usehlsvideoplayer/core` entry works without React. See how to [attach a stream to a video element and release it on teardown](docs/usage.md#play-a-stream-without-react).

## Documentation

- [Usage guide](docs/usage.md) for source changes, live playback, track selection, recovery, and authenticated streams.
- [Playback API reference](docs/api.md) for options, commands, state, events, and metrics.
- [Browser compatibility](docs/compatibility.md) and [playback troubleshooting](docs/troubleshooting.md).
- [Migrate from 1.x](docs/migration.md) if you use `Usehlsplayer` or `useHlsVideoPlayer`.
- [Security policy](SECURITY.md) for request policy limits and private vulnerability reporting.

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

Open the local URL printed by Vite to play generated VOD, live, alternate audio, and captions. See the [engineering record](docs/modernization.md) for browser checks and release notes.

## License

[ISC](LICENSE)
