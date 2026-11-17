# Engineering roadmap

## Implementation status

The local upgrade implements the recovery, authentication, quality, metrics, and integration work below. The [verification report](verification-report.md) records 37 fast tests, Chrome and Firefox playback checks, packed consumers, and two local 30-minute soak workloads. Those browser and endurance results identify the recorded runtime fingerprint, rather than a subsequently committed release SHA.

Physical-device, six-hour, 24-hour, and hosted exact-commit qualification remain open. The release workflow requires that evidence before publication. See the [qualification runbook](qualification.md). The milestone sections below preserve the planning rationale and acceptance criteria.

## Baseline and decisions

Planning baseline: `685c5c8d1f7439daf9e2969c1a57439596c3f450` plus the then-uncommitted candidate. The following baseline assessments describe that earlier tree, before this upgrade.

CONFIRMED: a framework-independent controller, native/hls.js adapters, guarded source ownership, React external-store hooks, legacy adapters, bounded retries, exact-origin restricted requests, sanitised errors, optional metrics and dual-format packaging already exist. The planning baseline passed 24 fast tests, 12 Chromium cases, 10 Firefox cases, strict types, lint, package consumers and npm audit. Formatting failed in troubleshooting documentation. Native WebKit skipped on Windows.

PARTIAL: all fatal recoveries rebuild the engine; native stalls have no deadline; credentials are synchronous without coordinated renewal; diagnostics lack recovery/session/quality measurements. A fake-clock native-adapter probe remained buffering after five minutes; this is not a reproduced Safari defect.

UNVERIFIED: physical Safari/iOS/Android, current-candidate long soaks, deployment-specific LL-HLS, native decoder memory and rotating encrypted-key retention. Historical qualification is not current-candidate evidence.

NOT APPLICABLE: custom streaming/ABR engines, an authentication service, mandatory telemetry or a mandatory UI framework.

Decisions: application-owned abortable authentication renewal; automatic quality preferences with manual override; preserve the physical-device and 30-minute, six-hour, and 24-hour release gates. Committing and pushing repository work does not satisfy these release gates.

## Prioritised milestones

### M1 — Reproducible baseline (high impact, low complexity/cost)

Problem → Current evidence spans different revisions and the formatting gate fails.

Evidence → Executed baseline checks above and the dirty-tree inventory.

Alternatives → Rewrite tooling or retain and refresh the existing checks.

Recommendation → Retain tooling; update compatible development dependencies, preserve the TypeScript compiler/lint split while the lint peer range requires it, and fix formatting.

Implementation → Isolated clean installation, explicit candidate identity, packed consumers and a final verification report.

Tests → Installation, build, lint, formatting, declarations, package exports, SSR and audits.

Acceptance → Reproducible checks with explicit outcomes and no unexplained package changes.

### M2 — Recovery (high impact/likelihood, medium complexity/cost)

Problem → Unconditional engine recreation discards useful engine state; silent stalls can persist.

Evidence → Controller fatal-failure path and native-adapter fake-clock probe.

Alternatives → Leave recovery unchanged; create a custom buffer controller; use upstream recovery with bounded fallback.

Recommendation → Use hls.js loading restart and supported decoder recovery; reconstruct when unavailable or unsuccessful. Keep upstream ABR, gap handling and non-fatal retries.

Implementation → Optional adapter recovery operations; every action consumes the existing source-wide budget. Require progress for requested playback. Add opt-in startup/stall deadlines, cancel stale work, preserve near-edge versus DVR intent, and retain default retry/backoff limits.

Tests → Duplicate errors, recovery timeout/exhaustion, source replacement, reentrancy, pause/seek, hidden-page suspension, deferred loading, live restoration and actual interruption recovery.

Acceptance → Recovery either makes progress or terminates within its configured budget; no concurrent retries or stale publications. Omitted watchdogs preserve prior behaviour.

### M3 — Authentication (high impact, medium complexity/cost)

Problem → Expiring credentials require application orchestration without SDK cancellation or coalescing.

Evidence → RequestOptions accepts synchronous headers only; authentication failures are terminal.

Alternatives → Recipes only; SDK-managed identity integrations; application callbacks.

Recommendation → Application callbacks with no token storage, identity dependency or native interception promise.

Implementation → Async headers with AbortSignal; optional refreshAuthentication callback; one refresh in flight per source; default 401 handling with explicit 403 opt-in; bounded timeout and existing source-wide recovery budget. Revalidate refreshed signed URLs against the unchanged allowlist. Proactive renewal belongs in the application credential provider.

Tests → Concurrent expiry, rejection, timeout, source revocation, ignored cancellation, malformed/foreign URLs, redirects, malicious child/key/segment URLs and credential-safe diagnostics.

Acceptance → No request/provider invocation for forbidden origins; late credentials cannot revive an old session; failed renewal terminates safely. Native consumers replace signed sources themselves.

### M4 — Quality preferences and measurements (medium impact, medium complexity/cost)

Problem → Applications cannot cap automatic quality through the controller; recovery and quality effects are hard to measure.

Evidence → Manual selection and basic metrics exist, but preference and diagnostic fields do not.

Alternatives → Custom ABR/telemetry frameworks; upstream controls and existing snapshots.

Recommendation → Optional maxHeight/maxBitrate/startBitrate preferences mapped to hls.js; lowest-rendition fallback and manual override. No separate downgrade algorithm.

Implementation → Conservative automatic cap; optional session/recovery/failure/quality/bandwidth/first-frame metrics; optional recovery action field with unchanged event discriminants.

Tests → Unordered ladders, no matching rendition, manual/auto transitions, default behaviour, metric arithmetic, no collection while disabled, privacy and browser decoding.

Acceptance → Playback remains functional without preferences, defaults remain upstream-owned, and disabled telemetry adds no sampler/frame observer.

### M5 — Integration and qualification (high impact, medium ongoing cost)

Problem → New contracts need examples and evidence beyond unit tests.

Evidence → Existing playground, packed consumers and qualification lanes provide reusable infrastructure.

Alternatives → New demo/test frameworks; extend existing infrastructure.

Recommendation → Extend existing playground/docs/tests and retain strict release gates.

Implementation → React/Next/core examples, authentication and data-saving recipes, declaration compatibility, adversarial browser tests, final changeset review and docs/verification-report.md.

Tests → Fast/property tests; Chromium/Firefox decode; Next production build; native/device lanes; resource soak, rotating encrypted keys and real origins where available.

Acceptance → Report PASSED/FAILED/BLOCKED/NOT_RUN with exact commands and revision identity. Missing physical/device/endurance evidence blocks release, not local implementation.

## Interfaces, compatibility and migration

Preserve package exports, module formats, legacy hooks, existing event discriminants and custom adapters. New adapter methods and diagnostic fields are optional. Synchronous header callbacks remain assignable. New watchdogs are opt-in. No new runtime dependency. Additive APIs warrant a future minor release; this work does not publish or change release authority.

Maintain separate startup-to-playing and first-presented-frame measurements. Existing rebuffer ratio excludes recovery; add recovery duration rather than silently change its denominator. Request URLs, headers, raw errors and manifest labels must never enter SDK diagnostics. Applications own token issuance, cross-player renewal coordination, CORS/cookies and CDN authorisation.

## Advanced feature decisions and risks

| Feature                     | Decision                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| Offline VOD                 | Defer: storage, eviction, licensing and service-worker ownership require a separate product contract. |
| DRM                         | Optional integration, not restricted request mode or core identity machinery.                         |
| Advanced subtitles          | Keep existing upstream/browser support; defer specialised rendering.                                  |
| Position persistence        | Application-owned, with explicit privacy and expiry policy.                                           |
| Playlists/source management | Application-owned; use source replacement.                                                            |
| Accessible UI               | Optional separate package/project; retain native controls in examples.                                |
| AirPlay/Chromecast          | Native AirPlay recipe and optional casting integration; no core dependency.                           |
| OpenTelemetry               | Application bridge recipe; no mandatory exporter or network activity.                                 |

Native media does not expose reliable HTTP statuses or request hooks. Quality preferences are not hard bandwidth/security limits. Browser scheduling, codecs and device implementations affect recovery. The existing upstream shared-logger and rotating-key retention concerns need explicit qualification; do not patch private hls.js internals. Preserve hardware/endurance release gates even when runners are unavailable.
