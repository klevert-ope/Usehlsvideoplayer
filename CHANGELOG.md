# Changelog

## 2.1.0

- Added bounded loading and decoder recovery with optional startup and stall deadlines.
- Added cancellable asynchronous request headers and application-owned authentication renewal within the existing origin policy and retry budget.
- Added optional automatic quality preferences with manual override and lowest-rendition fallback.
- Extended opt-in metrics with session, recovery, failure, quality, bandwidth and first-frame measurements.
- Added a short browser regression for repeated live playback, encrypted media, and resource cleanup in Chrome, Edge and Firefox.
- Fixed interrupted and browser-blocked play requests being reported as unknown errors when the video belongs to another window.
- Hardened media-element ownership across ESM and CommonJS, reentrant source changes, and stale callbacks.
- Hardened restricted requests against custom-loader bypass, redirects, forbidden child resources, and spoofed policy errors.
- The GitHub publishing workflow requires the package and desktop browser suites and a successful physical Android check for the tagged commit.
- Added isolated lockfile installation, strict declaration consumers, React-free core checks, tree-shaking checks, and Next.js production SSR verification.
- Split the TypeScript 7 build compiler from the TypeScript 6 compiler API used by ESLint and refreshed compatible development dependencies.

See the [API reference](docs/api.md), [usage guide](docs/usage.md), and [verification report](docs/verification-report.md).

## 2.0.1

- Added a shorter React quick start and a usage guide for core playback, live controls, recovery, and authenticated streams.
- Separated the API reference, browser compatibility, troubleshooting, and migration guides.
- Restored the build toolchain used for 2.0.0 to fix clean development installs.

## 2.0.0

- Added an independent playback controller and native and hls.js adapters.
- Added React hooks with stable controls, selective subscriptions and optional metrics.
- Added manual quality, track controls, live and DVR seeking, structured recovery and opt-in origin-scoped authentication.
- Retained the deprecated object-ref hooks with sanitized errors.
- Added explicit ESM and CommonJS entries, type declarations, browser fixtures and CI checks for npm releases.

See the [migration guide](docs/migration.md) for contract changes.
