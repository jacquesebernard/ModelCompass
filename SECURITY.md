# Security

Report suspected vulnerabilities privately to **support@telijans.com**. Include the affected version, reproduction steps and impact, with credentials and task content removed. Do not post exploit details or secrets in a public issue. No response-time commitment is implied.

Keys are configured only in the server environment. Never put credentials in `VITE_` variables or frontend code. `.env`, `.cache` and `.local` are ignored. Rotate any exposed key at its provider; removing it from a file is not sufficient. The app does not log task descriptions or provider responses by default.

The server binds to loopback by default and parses host authorities, including IPv6, against an explicit allowlist. API paths are checked case-insensitively to match Express routing. Origin and Fetch Metadata checks reject cross-origin browser access; same-site sibling origins are not trusted. JSON request sizes and API rates are bounded. At most two advisor requests run concurrently, with time and configurable output-token limits. MCP discovery is coalesced and backs off for 30 seconds after successes or failures. MCP tools are discovered, schema-validated and restricted to read-only operations. The advisor has no tools and treats user input and retrieved data as untrusted. Its generated categories cannot directly add candidate IDs, arbitrary prose or quoted metrics to a recommendation.

Remote advisor endpoints require HTTPS; HTTP is supported only for loopback providers. URL credentials, queries and fragments are rejected, as are provider redirects. Production responses include a Content Security Policy restricting scripts and connections to the same origin. Development retains Vite's hot-reload behavior and denies serving `.env`, `.git`, `.cache`, `.local` and certificate/key files. Snapshots use random, exclusively created temporary files with mode `0600`, followed by an atomic rename; writes do not follow a pre-existing temporary-file symlink.

This local application does not include user authentication or tenant isolation. Protect a self-hosted instance with private access control and TLS. Do not expose server credentials through an anonymous deployment. Configure upstream providers you trust; `ADVISOR_BASE_URL` receives user tasks and candidate metrics. Treat the local cached snapshot as private third-party data with applicable retention/deletion requirements. Disk files are created with restrictive permissions; protect backups too.

Dependencies are locked. Review dependency updates and run credential-free CI checks. Follow the provider's retention, credential and account-access policies in addition to this guidance.

See [SECURITY_REVIEW.md](SECURITY_REVIEW.md) for the review scope, fixes, verification and remaining limits from October 27, 2026.
