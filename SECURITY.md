# Security policy

Report suspected vulnerabilities privately through GitHub Security Advisories when private reporting is enabled. Include a reproducer with synthetic URLs and credentials.

## Application and server boundaries

| Surface               | Library responsibility                                                                                                            | Application or server responsibility                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Signed URLs           | Validate the source scheme and reject embedded credentials. Errors and metrics omit the URL, response body and exception text.    | Issue short-lived, narrowly scoped URLs. Configure referrer policy and redact URLs from CDN logs, browser reporting, traces and analytics.                         |
| Tokens and cookies    | Call a request header provider only for validated allowed origins. Keep no credentials in browser storage.                        | Keep tokens in application memory or use appropriately scoped cookies. Rotate on expiry. Never embed shared signing keys in browser code.                          |
| Cross-origin requests | Keep browser CORS enforcement. The opt-in policy uses exact origins and blocks all redirects before credentials can be forwarded. | Allow the app's origin and required headers on each approved CDN, key and media origin. Configure CDN redirects before issuing the final signed URL.               |
| Untrusted playlists   | In policy mode, reject requests outside the allowlist, including child playlists, media and key URLs.                             | Approve media origins and content. Use CSP `connect-src` and `media-src` to constrain requests, including native playback. Apply CDN limits and validate ingest.   |
| Diagnostics           | Expose fixed messages, categories, numeric status and metrics. Construct hls.js with debugging disabled.                          | Treat source input, raw network logs, Playwright traces and manifest-supplied track labels as untrusted. Render labels as text and sanitize data before telemetry. |

Without `request`, hls.js or the native media element uses its normal network behaviour. Native playback can use signed URLs and browser cookies, but cannot receive injected headers or enforce the per-request allowlist. Set native `crossOrigin` on the element before attaching the source when required. Custom hls.js loaders, DRM and interstitials are trusted application integrations. Restricted request mode overrides custom loaders and disables EME and interstitial playback. Allowlisted origins use HTTPS, with HTTP permitted for local loopback development.

See [Send credentials with HLS requests](docs/usage.md#send-credentials-with-hls-requests) for a React example.

Use a stable header provider in a component. After a committed React render applies a changed allowlist, a replacement session enforces the new list. For the core controller, apply changes with `setSource()`. Already delivered requests and credentials cannot be recalled. Use short expiry and server-side revocation for immediate access changes. A server receiving allowed credentials can read them. The browser and server still control CORS, cookie policy, caching and redirects outside the restricted path. A redirect blocked by Fetch can surface as a generic network or manifest failure because Fetch withholds response details.

hls.js has a shared loader logger. Enabling debug on a separate instance of the same hls.js module can make it log URLs from this player. Keep hls.js debugging disabled throughout applications that use signed URLs, or isolate debug sessions. The structured `PlaybackError` and metrics do not contain those URLs.

## Credential renewal and cancellation

Async header providers receive an AbortSignal after origin validation. Request/session teardown aborts the signal and the SDK rejects late results before dispatch. Applications must honour cancellation in their own network work; cancellation cannot revoke credentials already delivered to an allowed server.

The opt-in renewal callback owns neither token issuance nor storage. It can update application-owned credentials or return a renewed source within the original allowlist. It cannot widen the policy. One renewal runs per source and consumes the recovery budget. Default renewal handles 401; include 403 only when the server's expiry contract requires it. Rejection, timeout or explicit refusal terminates playback with a fixed error. Native HLS cannot expose these interception/status guarantees.

Proactive renewal and cross-player coordination belong in the application. Do not reset the recovery budget automatically from every error event. Keep URLs and credentials out of application telemetry. Trusted custom hls.js configuration still owns upstream retry/time-out settings; avoid unbounded values and use the opt-in controller deadlines where needed.

## Dependencies and publishing

CI installs locked dependencies with lifecycle scripts disabled, audits npm packages and validates the packed exports in isolated consumers. Automated update PRs cover npm and GitHub Actions. The candidate workflow builds a tarball and runtime SBOM after fast and browser checks.

The GitHub publishing workflow requires physical Android qualification for the tagged commit and uses the `npm-release` environment. Configure required reviewers in GitHub and bind the environment in npm Trusted Publishing. A local maintainer publish uses npm account authentication and records its verification results in the release evidence. See [qualification and release setup](docs/qualification.md).
