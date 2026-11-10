# Changelog

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
