# usehlsvideoplayer

Play HLS streams in an HTML video element with React hooks or a TypeScript controller. You supply the video element and choose between the browser's controls and your own.

Authentication renewal, recovery deadlines, automatic quality preferences, and extended metrics are available from version 2.1.0. See the [changelog](CHANGELOG.md#210) and use the documentation for your installed version.

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

- [Usage guide](docs/usage.md) for source changes, live playback, recovery deadlines, credential renewal, and quality preferences.
- [Playback API reference](docs/api.md) for options, commands, state, events, and metrics.
- [Browser compatibility](docs/compatibility.md) and [playback troubleshooting](docs/troubleshooting.md).
- [Migrate from 1.x](docs/migration.md) if you use `Usehlsplayer` or `useHlsVideoPlayer`.
- [Upgrade verification](docs/verification-report.md) for recorded results and remaining release gates, and the [engineering roadmap](docs/engineering-roadmap.md) for implementation decisions.
- [Security policy](SECURITY.md) for request policy limits and private vulnerability reporting.

## Development

Use Node 24 or 26. Fixture generation also needs FFmpeg with libx264. CI checks Node 22, 24, and 26 with React 18.2 and the locked React 19 version.

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm run lint
npm run format:check
npm run check:package
npm run fixtures
npm run dev
```

Open the local URL printed by Vite to play generated VOD, live, alternate audio, and captions. See [playback qualification](docs/qualification.md) for local browser checks and the release process. The [engineering record](docs/modernization.md) tracks the package and playback changes.

The build uses the TypeScript 7 package aliased as `typescript-native`. TypeScript 6 supplies the compiler API used by ESLint. Run the npm scripts to select the intended compiler.

## License

[ISC](LICENSE)
