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

```tsx
const request = {
  allowedOrigins: ["https://media.example.com"],
  credentials: "omit" as const,
  headers: () => ({ Authorization: `Bearer ${getCurrentToken()}` }),
};

const { videoRef, error } = useHlsPlayer({ src: signedManifest, request });
```

Use a stable header provider in a component. After a committed React render applies a changed allowlist, a replacement session enforces the new list. For the core controller, apply changes with `setSource()`. Already delivered requests and credentials cannot be recalled. Use short expiry and server-side revocation for immediate access changes. A server receiving allowed credentials can read them. The browser and server still control CORS, cookie policy, caching and redirects outside the restricted path. A redirect blocked by Fetch can surface as a generic network or manifest failure because Fetch withholds response details.

hls.js has a shared loader logger. Enabling debug on a separate instance of the same hls.js module can make it log URLs from this player. Keep hls.js debugging disabled throughout applications that use signed URLs, or isolate debug sessions. The structured `PlaybackError` and metrics do not contain those URLs.

## Dependencies and publishing

CI installs locked dependencies with lifecycle scripts disabled, audits npm packages and validates the packed exports in isolated consumers. Automated update PRs cover npm and GitHub Actions. The candidate workflow builds a tarball and runtime SBOM after fast and browser checks. Publishing requires successful extended qualification for the exact source commit and approval through the `npm-release` environment. Bind the same environment in npm Trusted Publishing so historical, environment-free workflows cannot publish. See [qualification and release setup](docs/qualification.md).
