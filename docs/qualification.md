# Playback qualification and release

Install the lockfile with `npm ci --ignore-scripts`. CI runs on pushes to `master`, on pull requests and on manual dispatch. It checks package compatibility on Node 22, 24 and 26, including React 18.2 and the locked React version. TypeScript 7 builds the library. ESLint and the telemetry recipe test use the TypeScript 6 compiler API.

## Checks for each change

- Run `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm test`. The tests exercise source ownership, native adapter attachment and cleanup, recovery deadlines, stale callbacks, React Strict Mode and selective subscriptions.
- Run `npm run check:package` to install and exercise the packed library in isolated consumers. Set `CHECK_NEXT=1` to include Next.js prerendering and request-time SSR. CI also audits the lockfile and checks registry signatures.
- With FFmpeg on PATH, run `npm run fixtures`, `npx playwright install chromium firefox` and `npm run test:browser`. CI runs Chrome, Edge and Firefox against one fixture set. CI caches the fixtures by generator version. The Firefox job installs the system H.264 decoder separately. Set `PLAYWRIGHT_CHANNEL=chrome` or `msedge` to use an installed Chromium browser locally.
- The browser suite uses local media for rendition changes, alternate tracks, recovery and protected requests. The lifecycle regression reuses one video element across live CMAF and AES-128 sessions. It checks presented frames, distinct key requests, MediaSource URL revocation, media reset, interval cleanup and request completion or cancellation after each teardown.

The CI audit blocks moderate or higher findings and checks registry signatures on Node 24. `npm run audit:ci` reports the temporary exception for `picomatch` 4.0.7 and accepts only the named advisory on development-only lockfile entries. The runtime audit has no exceptions. Remove the exception when the lockfile can use a patched version. [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)

Safari and iOS decoding, multi-hour memory growth and native decoder resource use are outside this suite. See the [compatibility guide](compatibility.md).

## Low-Latency HLS

The local browser suite checks partial segments, blocking reloads and live seeking. The two-rendition fixture also checks consecutive delta updates, a full reload when skipped history is missing, and a manual switch to 360p using a rendition report. The browser tests check playlist requests and presented frames. [Recorded browser results](verification-report.md#ll-hls-delta-and-rendition-report-checks)

After generating the fixtures and installing the browsers, run the three delta and rendition-report tests with the following command.

```sh
node node_modules/@playwright/test/cli.js test --grep "LL-HLS (merges|requests a full|uses a rendition)"
```

For a separate origin smoke test, set `PUBLIC_LL_HLS` to a public LL-HLS manifest. The test checks partial segments, successful blocking reloads and presented frames. Use a public, unsigned URL and keep private URLs out of traces and artefacts. Deployment qualification needs the intended encoder, CDN, codecs and network conditions. [Browser compatibility](compatibility.md)

## VOD playlist and telemetry checks

Generate the fixtures and install the browsers as described above. Run the playlist browser checks and the telemetry recipe test.

```sh
node node_modules/@playwright/test/cli.js test test/browser/playlist.spec.mjs
node --test test/telemetry-recipe.test.mjs
```

The playlist checks use presented video frames, keyboard focus, caption cues and the restored playback time. They also check playback when browser storage is denied. The telemetry test checks that repeat snapshots produce one measurement per source, that only the selected fields reach the meter and that teardown removes both subscriptions. [Local verification results](verification-report.md#optional-integration-checks)

## AirPlay device check

Run the AirPlay recipe in Safari with a physical receiver available. Play a public HTTPS HLS VOD and use the AirPlay control to select the receiver. Confirm picture and sound on the receiver. Disconnect in Safari and confirm that playback stops on the receiver and can continue locally. Record the tested revision, Safari and OS versions, receiver model and stream format. Physical receiver verification is pending. [AirPlay recipe](usage.md#use-airplay-from-safari)

## Physical Android runner

Register the `hls-device-android` runner with a physical Android device, Chrome, FFmpeg and Appium UiAutomator2. Restrict its runner group to the qualification workflow on protected `master`. Set `DEVICE_DRIVER` to the WebDriver endpoint, `DEVICE_CAPABILITIES` to the Android Chrome capability object with its physical UDID, and `DEVICE_FIXTURE_ORIGIN` to the runner's private LAN origin on port 4175 as reachable by the device. The probe checks the fixture revision, presented frames, engine and teardown.

Dispatch **Android playback qualification** on `master`. Record the run and the revision in its `device-android` artefact alongside the desktop results. Record the check as unrun when a physical device or its runner is unavailable.

## Build a candidate in GitHub Actions

Dispatch **Validate and package** for the release branch with `gh workflow run ci.yml --ref master`. After the package and desktop browser jobs pass, download the tarball and runtime software bill of materials from the `npm-candidate` artefact. Use the local maintainer procedure for npm publication.

## Publish from a maintainer's machine

1. Stage the release changes, including the changelog and matching versions in `package.json` and `package-lock.json`. Run the package checks and record any failed or unrun checks, including physical Android qualification.
2. Run `git diff --exit-code` to confirm the working files match the staged release, then run `npm pack --json`. Inspect the file list and record the tarball name and integrity. Keep the staged files stable through publication.
3. Run `npm whoami` to check the active npm account. If the session has expired, run `npm login --auth-type=web`. Publish the verified tarball with `npm publish ./usehlsvideoplayer-X.Y.Z.tgz --ignore-scripts --access public --tag latest`, substituting the release version. Complete npm's browser approval if prompted.
4. Compare `npm view usehlsvideoplayer@X.Y.Z dist.integrity` with the pack result. Confirm that `npm dist-tag ls usehlsvideoplayer` shows the release as `latest`.
5. Commit the staged release, create the matching `vX.Y.Z` tag and push both. Verify that the remote branch and tag point to the release commit.
