# Engineering roadmap

The recovery, authentication, quality and metrics upgrades shipped in 2.1.0. Version 2.1.1 fixed recovery and source lifecycle edge cases. The latest LL-HLS work adds desktop browser coverage in the working tree based on 2.1.1. [Changelog](../CHANGELOG.md) · [Verification report](verification-report.md)

## Completed milestones

| Milestone                             | Outcome                                                                                                                                                                                                                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 Reproducible baseline              | CI checks clean lockfile installs, builds, types, lint, formatting and audits. Packed consumers exercise the ESM and CommonJS exports, React compatibility and server rendering.                                                                                                                      |
| M2 Recovery                           | hls.js can restart loading or recover a decoder before the controller falls back to rebuilding the engine. Recovery shares a finite budget per source. Startup and stall deadlines are opt-in. Live recovery preserves live-edge or DVR intent where possible.                                        |
| M3 Authentication                     | Applications can supply abortable asynchronous headers and renew credentials through a single callback in flight per source. Refreshed URLs still have to match the existing origin policy. Native HLS consumers replace signed sources in the application.                                           |
| M4 Quality and metrics                | Applications can set automatic quality preferences and override them manually. Opt-in metrics distinguish startup, first presented frame, rebuffering and recovery.                                                                                                                                   |
| M5 Examples and desktop qualification | The usage guide covers React, Next.js and the core controller. Chrome, Edge and Firefox exercise real decoding, protected requests and teardown. The local LL-HLS fixture now checks blocking reloads, delta updates, full-playlist fallback and a rendition-report switch that presents 360p frames. |

See the [API reference](api.md), [security policy](../SECURITY.md) and [LL-HLS verification results](verification-report.md#ll-hls-delta-and-rendition-report-checks) for contracts and evidence.

## Outstanding qualification

| Item                            | Next step                                                                                                                                               | Evidence to record                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Physical Android playback       | Provision the dedicated runner and connect a physical device. The repository had no registered runner at the last check.                                | Successful `device-android` run and artefact for the tested commit, with presented frames and teardown.                                       |
| Deployment-specific LL-HLS      | Test a representative stream from the intended encoder and CDN. Check partial segments, blocking reloads and the playlist features the deployment uses. | Origin and browser conditions, playlist requests and playback results. Measure glass-to-glass latency if the deployment has a latency target. |
| Long-running encrypted playback | When a deployment rotates AES-128 key URLs, measure a continuous session at its expected rotation rate and duration.                                    | Playback continuity and resource trends across key rotation and teardown.                                                                     |

The current release procedure records physical Android results separately. Safari and iOS decoding, native decoder resource use and multi-hour stability remain unverified by the current suite. The earlier Safari and fixed-duration soak release gates are retired. [Qualification and release runbook](qualification.md) · [Historical verification](verification-report.md#performance-and-resource-evidence)

## Optional integrations and deferred features

| Feature                            | Decision                                                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| AirPlay and Chromecast             | A native AirPlay recipe and an optional Chromecast integration remain open. Keep casting dependencies outside the core.                         |
| DRM                                | A dedicated integration remains optional. The application can configure upstream DRM for trusted streams. Restricted request mode disables EME. |
| Offline VOD                        | Defer until storage, eviction, licensing and service-worker ownership are defined.                                                              |
| Advanced subtitles                 | Keep upstream and browser track support. Defer specialised rendering.                                                                           |
| Position persistence and playlists | Applications own saved position, privacy, expiry and playlist state. Use source replacement to move between streams.                            |
| Accessible UI package              | Keep native controls in examples. A separate UI package remains optional.                                                                       |
| OpenTelemetry                      | The usage guide describes an application-owned bridge. Export and network activity stay in the application.                                     |

See the [telemetry guidance](usage.md#bridge-application-telemetry) and [request-policy limits](../SECURITY.md).

## Historical record

The original milestone plan used commit `685c5c8d1f7439daf9e2969c1a57439596c3f450` and the working tree of that upgrade. The verification report preserves the candidate identities, original test results and measured resource costs. The production-readiness audit records the earlier upstream logger and rotating-key findings. [Verification report](verification-report.md) · [Production-readiness audit](../PRODUCTION-READINESS-AUDIT.md) · [Initial controller review](modernization.md)
