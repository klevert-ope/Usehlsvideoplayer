# Modernization review

The [initial audit](audit.md) records the starting defects, their severity and the implementation sequence. The [API](api.md) and [security policy](../SECURITY.md) describe the runtime contracts.

## Primary Attack Vectors

| Finding                                                                                              | Classification              | Evidence                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A signed URL or exception can appear in public diagnostics.                                          | Refuted within tested scope | Error mapping creates fixed messages. Unit and Chrome tests supplied credential-bearing URLs, bodies and exceptions and inspected the exposed errors.                        |
| A hostile child playlist or redirect can forward an authentication header outside the intended path. | Refuted within tested scope | Chrome intercepted the requests. An allowed manifest and its segments received the test header. A disallowed child origin and a redirect destination received zero requests. |
| An unsupported Fetch environment can silently bypass request policy by falling back to XHR.          | Refuted within tested scope | A jsdom test reproduces hls.js leaving its progressive flag set without switching loaders. The adapter rejects setup before requesting the manifest.                         |
| The development dependency graph contained a minimatch denial-of-service advisory.                   | Verified                    | npm audit reported GHSA-g3hv-75wg-m249. The lock now uses a patched 11.0.5 override. Review the override when the lint dependencies adopt a patched range.                   |
| Origin or content trust can be inferred from a signed URL alone.                                     | Unverified                  | The production CDN, token issuer, redirect rules, headers and content pipeline belong to the integrating application.                                                        |

## Implicit Assumptions

| Finding                                                                | Classification              | Evidence                                                                                                                                                                                  |
| ---------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An old engine, timer, or pending play call can update the next source. | Refuted within tested scope | Generated source and teardown traces, late event injection, stale play rejection and fake-clock recovery tests assert session ownership.                                                  |
| Successful recovery gives the same source an unlimited retry budget.   | Refuted within tested scope | A fake-clock test forces duplicate errors and an attempt timeout, then verifies exhaustion and teardown.                                                                                  |
| `currentSrc` alone proves whether Chrome released a media source.      | Refuted within tested scope | Chrome retained the historical blob URL after a clear. The browser test checks source removal, reset readiness and object URL revocation directly.                                        |
| Native HLS behaves consistently across Apple platforms.                | Unverified                  | Windows WebKit did not advertise native HLS. The repository has a capability-gated native test and a macOS CI job that requires it.                                                       |
| Rolling HLS proves delivery from an LL-HLS origin.                     | Unverified                  | The fixture exercises standard live segments and DVR. LL-HLS server behavior, Safari and iOS playback, Firefox, codec diversity and long network impairments need separate qualification. |

## Falsification Proof

- `npm test` exercises exact transitions, controls, expiry classification, recovery success and exhaustion, SSR, Strict Mode, engine replacement and selective subscriptions. The property test uses 250 deterministic traces at seed 19027.
- `npm run test:browser:chromium` plays FFmpeg-generated H.264/AAC media. It asserts actual decoded frame size, caption cue content, alternate audio requests, live seek movement, resumed playback after HTTP 503, a terminal malformed-playlist error, and request policy enforcement.
- `npm run check:package` installs the tarball in an isolated consumer, loads all four package entries, typechecks ESM and CommonJS consumers and renders the React hook on the server. `CHECK_NEXT=1` additionally builds and prerenders a Next.js App Router consumer.
- `npm run audit`, `npm audit --omit=dev` and `npm audit signatures` check known advisories and registry integrity. CI disables dependency install scripts and uses pinned GitHub Actions revisions.

## Measurement method

The browser benchmark decodes local VOD, clears and reloads it five times, then switches to live. It measures readiness through the UI, records playback metrics, and samples Chrome's JavaScript heap after explicit garbage collection. Browser heap measurements include the harness and omit decoder, worker and native memory. The fixture runs on loopback and cannot establish production startup latency or behavior on a congested network. The package check reports gzip over the emitted ESM JavaScript, before bundler minification and excluding external dependencies.

The local Chrome run on Windows observed 2.69 s VOD startup and 0.50 s live startup. Source reloads reached readiness in 0.93–2.54 s. The VOD sample had zero rebuffer time and zero dropped frames over 35 frames. The live sample had a 2.69 s estimated media-edge distance and zero dropped frames over 16 frames. The post-GC JavaScript heap moved from 11,604,228 to 12,843,576 bytes. Each clear passed source removal, media reset and blob revocation checks. The heap delta includes the harness and offers a short-run baseline for follow-up measurements.

The library's emitted ESM JavaScript measured 43,383 bytes, or 9,671 bytes gzipped. The tarball also carries CommonJS, declarations, source maps and documentation. React and hls.js are external to the library build.

## Local verification

| Gate                                   | Result                                                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict TypeScript, lint and formatting | Passed on Windows with Node 26.12.1.                                                                                                                                            |
| Unit and integration                   | 17 passed with React 19.3.1 and 17 with React 18.2.0.                                                                                                                           |
| Chromium playback                      | Six passed in installed Chrome on Windows.                                                                                                                                      |
| Native playback                        | Windows WebKit skipped because native HLS was unavailable.                                                                                                                      |
| Supply chain                           | Runtime and full npm audits reported zero known vulnerabilities. npm verified 157 registry signatures and 48 attestations. The runtime CycloneDX SBOM listed only hls.js 1.7.4. |

The packed root and core entries passed ESM, CommonJS, strict declaration and SSR checks on React 18.2.0 and 19.3.1. Next.js 16.4.5 built and prerendered the App Router example with React 19.3.1.

## Release gate

The candidate workflow runs hosted package and browser checks, including native HLS, before building a tarball and SBOM. The external LL-HLS smoke test on Windows Chromium used the [Mux sample listed by hls.js](https://github.com/video-dev/hls.js/blob/master/tests/test-streams.js). Playback decoded video and advanced while the live origin advertised partial segments and returned successful blocking playlist reloads. The repository maintainer owns dependency review. The hls.js range stays within the verified 1.7 minor because the restricted loader relies on the upstream FetchLoader handoff. The lockfile and automated update PRs support reviewing hls.js advisories and removing the temporary minimatch override when upstream ranges permit.

The [npm Trusted Publisher](https://docs.npmjs.com/trusted-publishers/) for `usehlsvideoplayer` uses the GitHub owner `klevert-ope`, repository `Usehlsvideoplayer` and workflow filename `publish.yml`. Leave the environment field blank and enable direct `npm publish`. Set this up in the npm package settings once the workflow exists on GitHub. A new trust configuration needs a successful publish within two days.

Run **Validate and package** on the release commit in `master` to rehearse the package and browser checks. Once the release is approved, push an annotated tag matching the stable version in `package.json`, such as `v2.0.0`. **Publish to npm** runs the checks again for the tagged commit and publishes the candidate tarball via OIDC. Verify the release with `npm view usehlsvideoplayer dist-tags --registry=https://registry.npmjs.org`. Before rerunning a failed publish, check whether that version is already in the registry.
