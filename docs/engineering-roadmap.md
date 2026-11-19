# Engineering roadmap

Version 2.1.0 added recovery, authentication, quality and metrics options. Version 2.1.1 fixed recovery and source lifecycle issues. The unreleased changes add LL-HLS browser coverage, a VOD playlist example and integration recipes. [Changelog](../CHANGELOG.md#unreleased) · [Verification report](verification-report.md)

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

| Feature                            | Decision                                                                                                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AirPlay                            | The [native Safari recipe](usage.md#use-airplay-from-safari) is available. The [physical receiver check](qualification.md#airplay-device-check) is pending.                                          |
| Chromecast                         | Plan a standalone HTTPS sender with Google's Default Media Receiver when a physical receiver and a public unencrypted HLS VOD with CORS are available.                                               |
| DRM                                | Revisit a dedicated integration with a target key system, devices, licensed stream and test licence endpoint. Trusted applications can configure upstream DRM. Restricted request mode disables EME. |
| Offline VOD                        | Defer until an application owns the service worker and defines storage limits, eviction, deletion and offline playback rights.                                                                       |
| Advanced subtitles                 | The VOD example uses upstream and browser tracks. Revisit specialised rendering for a concrete caption requirement.                                                                                  |
| Position persistence and playlists | The [VOD playlist example](usage.md#build-a-vod-playlist-with-resume) saves positions per asset and per tab on request. Applications own persistence and playlist policy.                            |
| Accessible UI package              | The VOD example uses native controls with labelled playlist and caption selectors. Revisit a UI package when those controls fall short of a concrete need.                                           |
| OpenTelemetry                      | The [application-owned bridge](usage.md#bridge-application-telemetry) records playback events and timing metrics. Export and network activity stay in the application.                               |

See the [optional integration checks](verification-report.md#optional-integration-checks) and [request policy](../SECURITY.md).

## Historical record

The original milestone plan used commit `685c5c8d1f7439daf9e2969c1a57439596c3f450` and the working tree of that upgrade. The verification report preserves the candidate identities, original test results and measured resource costs. The production-readiness audit records the earlier upstream logger and rotating-key findings. [Verification report](verification-report.md) · [Production-readiness audit](../PRODUCTION-READINESS-AUDIT.md) · [Initial controller review](modernization.md)
