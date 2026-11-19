# Playback qualification and release

Install the lockfile with `npm ci --ignore-scripts`. CI runs on pushes to `master`, on pull requests and on manual dispatch. It checks package compatibility on Node 22, 24 and 26, including React 18.2 and the locked React version. TypeScript 7 builds the library. TypeScript 6 supplies the compiler API used by ESLint.

## Checks for each change

- Run `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm test`. The tests exercise source ownership, native adapter attachment and cleanup, recovery deadlines, stale callbacks, React Strict Mode and selective subscriptions.
- Run `npm run check:package` to install and exercise the packed library in isolated consumers. Set `CHECK_NEXT=1` to include Next.js prerendering and request-time SSR. CI also audits the lockfile and checks registry signatures.
- With FFmpeg on PATH, run `npm run fixtures`, `npx playwright install chromium firefox` and `npm run test:browser`. CI runs Chrome, Edge and Firefox against one fixture set. CI caches the fixtures by generator version. The Firefox job installs the system H.264 decoder separately. Set `PLAYWRIGHT_CHANNEL=chrome` or `msedge` to use an installed Chromium browser locally.
- The browser suite uses local media for rendition changes, alternate tracks, recovery, protected requests and LL-HLS blocking reloads. The lifecycle regression reuses one video element across live CMAF and AES-128 sessions. It waits for presented frames, observes distinct key requests and checks MediaSource URL revocation, media reset, interval cleanup and completion or cancellation of fixture requests after each destruction.

The CI audit blocks moderate or higher findings and checks registry signatures on Node 24. `npm run audit:ci` reports the temporary exception for `picomatch` 4.0.7 and accepts only the named advisory on development-only lockfile entries. The runtime audit has no exceptions. Remove the exception when the lockfile can use a patched version. [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)

Safari and iOS decoding, multi-hour memory growth and native decoder resource use are outside this suite. See the [compatibility guide](compatibility.md).

Set `PUBLIC_LL_HLS` to a public LL-HLS manifest to check an origin's partial segments and blocking reloads. Keep signed or private URLs out of this input, traces and artefacts.

## Physical Android runner

Register the `hls-device-android` runner with a physical Android device, Chrome, FFmpeg and Appium UiAutomator2. Restrict its runner group to the qualification workflow on protected `master`. Set `DEVICE_DRIVER` to the WebDriver endpoint, `DEVICE_CAPABILITIES` to the Android Chrome capability object with its physical UDID, and `DEVICE_FIXTURE_ORIGIN` to the runner's private LAN origin on port 4175 as reachable by the device. The probe checks the fixture revision, presented frames, engine and teardown.

## Build a candidate in GitHub Actions

Dispatch **Validate and package** for the release branch with `gh workflow run ci.yml --ref master`. After the package and desktop browser jobs pass, download the tarball and runtime software bill of materials from the `npm-candidate` artefact. Use the local maintainer procedure for npm publication.

## Publish from a maintainer's machine

1. Stage the release changes, including the changelog and matching versions in `package.json` and `package-lock.json`. Run the package checks and record any failed or unrun checks, including physical Android qualification.
2. Run `git diff --exit-code` to confirm the working files match the staged release, then run `npm pack --json`. Inspect the file list and record the tarball name and integrity. Keep the staged files stable through publication.
3. Run `npm whoami` to check the active npm account. If the session has expired, run `npm login --auth-type=web`. Publish the verified tarball with `npm publish ./usehlsvideoplayer-X.Y.Z.tgz --ignore-scripts --access public --tag latest`, substituting the release version. Complete npm's browser approval if prompted.
4. Compare `npm view usehlsvideoplayer@X.Y.Z dist.integrity` with the pack result. Confirm that `npm dist-tag ls usehlsvideoplayer` shows the release as `latest`.
5. Commit the staged release, create the matching `vX.Y.Z` tag and push both. Verify that the remote branch and tag point to the release commit.
