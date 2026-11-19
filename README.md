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

- [Usage guide](docs/usage.md) for playback, source changes, recovery, authentication and quality. It also includes recipes for [VOD resume](docs/usage.md#build-a-vod-playlist-with-resume), [Safari AirPlay](docs/usage.md#use-airplay-from-safari) and [OpenTelemetry](docs/usage.md#bridge-application-telemetry).
- [Playback API reference](docs/api.md) for options, commands, state, events, and metrics.
- [Browser compatibility](docs/compatibility.md) and [playback troubleshooting](docs/troubleshooting.md).
- [Migrate from 1.x](docs/migration.md) if you use `Usehlsplayer` or `useHlsVideoPlayer`.
- [Engineering roadmap](docs/engineering-roadmap.md) for completed milestones, outstanding qualification and optional integrations.
- [Verification results](docs/verification-report.md) for the tested revisions, local playback checks and device qualification status.
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

Open the local URL printed by Vite to play the generated streams. Select **VOD playlist example** to switch between two videos, try captions and save a position for each video in the current tab. The qualification runbook covers browser checks and release preparation. [Qualification runbook](docs/qualification.md)

The build uses TypeScript 7 through the `typescript-native` alias. ESLint and the telemetry recipe test use the TypeScript 6 compiler API. Run the npm scripts to select the intended compiler.

## License

[ISC](LICENSE)
