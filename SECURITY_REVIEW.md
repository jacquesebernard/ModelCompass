# Security review — October 27, 2026

Scope: application source, server routes, browser rendering, MCP/advisor transports, cached snapshots, development file serving, production browser policy, and locked dependencies. Tests use synthetic data and local mocks. No paid provider requests or public deployment were needed. This is a scoped code review and regression check, not a penetration test or a guarantee of security.

## Findings addressed

| Area                     | Finding and impact                                                                                                                                                                         | Resolution                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host validation          | Splitting Host on `:` treated arbitrary IPv6 literals like loopback, weakening the host allowlist.                                                                                         | Parse authorities and compare complete hostnames; allow loopback or the explicitly configured non-wildcard bind host.                                                           |
| Browser request boundary | Originless cross-site GET requests could trigger quota-consuming discovery. Case-sensitive API checks did not match Express's case-insensitive routes.                                     | Reject cross-site and same-site sibling Fetch Metadata, retain Origin and JSON checks, and normalize API path case.                                                             |
| Provider resource use    | Concurrent advisor requests and simultaneous/failed MCP discovery could multiply upstream calls. Provider output had no explicit token budget.                                             | Two active advisor requests maximum; release slots on finish/close. Coalesce discovery and back off on failure as well as success. Apply a configurable per-call output budget. |
| Provider transport       | Configuration allowed remote plaintext HTTP, and advisor redirects were not explicitly rejected.                                                                                           | HTTPS for remote providers; loopback HTTP remains supported. Disallow URL credentials/query/fragment and reject redirects.                                                      |
| Cache persistence        | A predictable `.tmp` path could follow a planted symlink in an operator-configured shared directory; existing temporary-file permissions were not replaced by the requested creation mode. | Random temporary filenames, exclusive creation with mode `0600`, atomic rename, and cleanup. Tests verify unrelated files are untouched.                                        |
| Browser/file policies    | The development server's default denylist did not cover private cache/diagnostic folders. Production had no resource-restricting CSP.                                                      | Explicit private-path denylist, production same-origin script/connect policy, frame/object/base restrictions and disabled unused browser permissions.                           |
| Error handling           | Oversized JSON returned a generic server-error status.                                                                                                                                     | Return a sanitized `413` without reflecting submitted text; retain sanitized validation/provider failures.                                                                      |

These are hardening fixes within the local application's trust model. Their practical impact increases if an operator exposes the server or places its cache in a shared writable directory.

## Verification

- Final validation passed: **48 automated tests**, TypeScript checks (including unused declarations/parameters), and the production build. A scan of the rebuilt client assets found no configured Artificial Analysis or advisor API keys.
- The regression suite covers model selection, chart zoom/panning/labels, table sorting, estimates, recommendations, advisor disclaimers, setup, MCP pagination and stale-cache behavior after the component refactor.
- Security regressions cover IPv6/malformed hosts, normal and case-variant API paths, Origin/Fetch Metadata, JSON limits, rate limits, advisor concurrency, discovery coalescing/backoff, private cache permissions and symlink safety, provider URL/redirect policy, and actual Vite middleware access to private files.
- `npm audit --json` reported **zero known advisories** across production and development dependencies on the review date. This database result does not establish that dependencies contain no vulnerabilities.
- Existing local `.env` and `.cache` permissions were `0600` and `0700`; their contents were not printed or added to source files.

## Remaining boundaries

- The app has no user authentication or tenant isolation. Keep loopback/private access; a self-hosted deployment needs an authenticated gateway and TLS. Host/Origin checks are not authentication, and non-browser clients can forge request headers.
- Resource controls are process-local. Multiple instances need shared rate/concurrency controls and provider billing limits. The token setting bounds output per call, not total spending or input cost. Some reasoning models need a larger output allowance to finish valid structured output.
- The operator chooses the advisor endpoint and must trust its retention and data-handling policies. The advisor still receives task content and candidate metrics. Structured outputs and grounded IDs do not prove that inferred suitability is correct.
- Cache directories and backups must remain private and subject to data-use terms. Exclusive temporary files do not protect against another process running as the same OS user or an attacker controlling the parent directory.
- UI interaction tests use a simulated DOM. Browser policy headers and real Vite middleware are tested, but this review did not include a full visual browser or external penetration test.

## References

Fetch Metadata handling follows [OWASP's CSRF prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). Exclusive cache creation uses [Node's filesystem open flags](https://nodejs.org/api/fs.html#file-system-flags). Development serving restrictions use [Vite's filesystem denylist](https://vite.dev/config/server-options#server-fs-deny); production browser restrictions use [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy).
