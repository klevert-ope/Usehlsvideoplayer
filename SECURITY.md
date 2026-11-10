# Security policy

Report suspected vulnerabilities privately through GitHub Security Advisories when private reporting is enabled. Include a reproducer with synthetic URLs and credentials.

## Application and server boundaries

| Surface               | Library responsibility                                                                                                            | Application or server responsibility                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Signed URLs           | Validate the source scheme and reject embedded credentials. Errors and metrics omit the URL, response body and exception text.    | Issue short-lived, narrowly scoped URLs. Configure referrer policy and redact URLs from CDN logs, browser reporting, traces and analytics.                         |
| Tokens and cookies    | Call a request header provider only for validated allowed origins. Keep no credentials in browser storage.                        | Keep tokens in application memory or use appropriately scoped cookies. Rotate on expiry. Never embed shared signing keys in browser code.                          |
| Cross-origin requests | Keep browser CORS enforcement. The opt-in policy uses exact origins and blocks all redirects before credentials can be forwarded. | Allow the app's origin and required headers on each approved CDN, key and media origin. Configure CDN redirects before issuing the final signed URL.               |
| Untrusted playlists   | In policy mode, reject requests outside the allowlist, including child playlists, media and key URLs.                             | Approve media origins and content. Use CSP `connect-src` and `media-src` to constrain requests, including native playback. Apply CDN limits and validate ingest.   |
| Diagnostics           | Expose fixed messages, categories, numeric status and metrics. Disable hls.js debug output.                                       | Treat source input, raw network logs, Playwright traces and manifest-supplied track labels as untrusted. Render labels as text and sanitize data before telemetry. |

Without `request`, hls.js or the native media element uses its normal network behaviour. Native playback can use signed URLs and browser cookies, but cannot receive injected headers or enforce the per-request allowlist. Set native `crossOrigin` on the element before attaching the source when required. Custom hls.js loaders, DRM and interstitials are trusted application integrations. Restricted request mode overrides custom loaders and disables EME and interstitial playback. Allowlisted origins use HTTPS, with HTTP permitted for local loopback development.

See [Send credentials with HLS requests](docs/usage.md#send-credentials-with-hls-requests) for a React example.

Use a stable header provider in a component. A server receiving allowed credentials can read them. The browser and server still control CORS, cookie policy, caching and redirects outside the restricted path. A redirect blocked by Fetch can surface as a generic network or manifest failure because Fetch withholds response details.

## Dependencies and publishing

CI installs locked dependencies with lifecycle scripts disabled, audits npm packages and validates the packed exports in isolated consumers. Automated update PRs cover npm and GitHub Actions. The manually dispatched candidate workflow builds a tarball and runtime SBOM after the checks pass. Publishing requires separate maintainer authorization. Use npm Trusted Publishing with provenance and restrict release permissions to the publishing environment.
