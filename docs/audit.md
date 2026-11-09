# Repository audit

The starting point was commit `d195bf1` plus a working tree with an updated hook, TypeScript build, and five jsdom regressions. The existing staged cleanup removed 531 paths, primarily checked-in dependencies and package output.

| Severity | Location                                   | Finding                                                                                                                                                                                                                                  |
| -------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | `d195bf1:src/useHlsVideoPlayer.ts`         | Async AES probing can outlive effect cleanup. The retained destroyed Hls ref blocks subsequent initialization, including Strict Mode replay and source changes. The manifest callback also treats its event argument as a playback time. |
| High     | Starting `src/useHlsVideoPlayer.ts`        | Raw upstream errors and setup exceptions can expose signed URLs, response content or credentials. Fatal errors report to an optional callback without a terminal state or a recovery budget.                                             |
| Medium   | Starting `src/useHlsVideoPlayer.ts`        | Per-effect reconciliation fixes the historical ref replacement bug, but playback state and engine lifecycle are still coupled to React. There is no generation guard for queued callbacks or playback promises.                          |
| Medium   | `d195bf1:package.json`, `rollup.config.js` | React and TypeScript were installed as runtime dependencies. hls.js was optional despite unconditional import. CommonJS output used a `.js` extension under an ESM package.                                                              |
| Medium   | Starting `test/player.test.mjs`            | Lifecycle and SSR smoke tests exist. Browser decoding, live windows, recovery, declaration consumers, and security policy are outside that suite. Next.js client integration had a source directive but no build gate.                   |

The starting `npm test` passed all five cases on Node 26 with React 19. The starting package used TypeScript 5.9, hls.js 1.7.4, and React 18.2/19 peers.

## Implementation sequence

1. Retain the dual TypeScript build, expand checks and CI, and keep npm output allowlisted.
2. Isolate a typed controller and two engine adapters with per-source ownership.
3. Add React stores and hooks, retaining the deprecated object-ref entry points.
4. Add track and live commands, bounded recovery, and optional metrics.
5. Exercise stale callbacks, auth boundaries and browser decoding against reproducible fixtures.
6. Verify packed consumers and document the release gates and migration.

The controller is an in-process TypeScript API over the browser media element. A hook-only design would keep the lifecycle inseparable from React. A custom streaming engine would duplicate playlist parsing, ABR, retry policy and buffer handling already maintained by hls.js. React and hls.js remain external to the emitted files. hls.js is the only direct runtime dependency; the lockfile pins integrity, and CI audits runtime and development dependencies. Node's test runner is retained for the fast suite. Playwright adds browser decoding coverage, fast-check adds generated lifecycle traces, and Vite is confined to the local playground and browser harness.
