# Model Compass

**Find the right AI for your task.** Compare intelligence, output speed and cost in one interactive chart, then build a grounded shortlist with manual controls or a conversational advisor.

Local-first React + TypeScript app with an Express server. No accounts, payments, telemetry, proprietary hosting requirement, or shared operator credentials.

## Run locally

Requires **Node.js 22.12+ within the 22.x release line** and npm. From this directory:

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. One server serves the UI and API. Without an `.env`, the app uses **explicitly labeled synthetic demo data**. All demo models, creators and measurements are fictional. The chart, filters, comparisons, estimates and manual ranking work without accounts or paid APIs. Chat shows an honest setup state until a provider is configured.

The dashboard places a large bubble chart beside the advisor on desktop; the advisor stacks below it on mobile. A table offers keyboard-accessible access to every filtered model, including those without plottable metrics. To capture a project screenshot, use demo mode only; no live-data screenshot is included because redistribution rights have not been established.

## Configure Artificial Analysis

```sh
cp .env.example .env
```

1. Obtain your own organization key from [Artificial Analysis](https://artificialanalysis.ai/data-api). The [MCP documentation](https://artificialanalysis.ai/data-api/docs/mcp) supports API keys in `x-api-key` or a bearer token for unattended servers. This app uses `x-api-key`, on the Node server only.
2. Set `AA_API_KEY` in `.env` and restart the server. **Do not paste credentials into chat, frontend code, screenshots, or a `VITE_` variable.**
3. Open **Connections → Discover MCP tools**, or run `npm run mcp:inspect`. Inspect actual tool descriptions and input/output schemas, then select the read-only language-model listing tool appropriate to your subscription. Names are not guessed or hardcoded.
4. Enter arguments matching its discovered schema. Persist the selection using `AA_MCP_TOOL` and `AA_MCP_ARGS` in `.env`; the UI selection lasts until restart. Pagination supports the authenticated AA tools’ nested `query.page` argument, as well as a top-level `page` for compatible tools. Language-model listings use four field projections per page to stay under the MCP response-size limit. Projections are joined by model ID only when their record sets, tier, version and pagination agree; partial snapshots are rejected.
5. Review [DATA_RIGHTS.md](DATA_RIGHTS.md). Set `AA_USE_CONFIRMED=true` only for a use permitted by your agreement. Switch to **Use live connection**, or set `DATA_MODE=live` and restart.

Connecting MCP to a coding assistant **does not authenticate the running app**. OAuth for interactive clients and the application's server API key are separate. No scraping or REST fallback is implemented.

`AA_REFRESH_SECONDS` controls cache refresh (default 21,600 / six hours; minimum 60). The UI checks freshness each minute. `AA_CACHE_PATH` is the prefix for normalized last-known-good snapshots in an ignored local directory with restrictive file permissions. Filenames include an opaque fingerprint of the credentials, selected tool and arguments so connections do not share snapshots. A failed refresh leaves the previous successful timestamp and visibly marks the snapshot stale. Refreshes are coalesced, have an overall timeout, and are throttled to once per 30 seconds. A transient HTTP error may retry once; a long `Retry-After` is respected by stopping and asking the operator to wait. All pages must succeed before the snapshot is replaced. The default MCP timeout is 120 seconds for a complete refresh. Each AA field projection is a data request: a full refresh currently uses four calls per page. Budget refresh frequency against your account’s shared quota; manual refreshes also consume it. Delete local cache copies when your data agreement requires it.

Current documented model fields are normalized from the MCP tool's API-shaped output. Unexpected envelopes, incompatible versions across pages, invalid records, or unknown pagination schemas fail visibly. Missing prices, benchmark costs, speed and latency remain unavailable. Account restrictions are never bypassed. Capability claims are intentionally left unknown until a verified source mapping exists.

## Configure the AI advisor

Set your own server-side `ADVISOR_API_KEY`, `ADVISOR_MODEL`, and optionally `ADVISOR_BASE_URL`. The default URL is `https://api.openai.com/v1`; no model is silently selected. Choose a model available to your account that supports **Responses API structured outputs**. Restart after editing `.env`.

Remote provider URLs require HTTPS, with no URL credentials, query or fragment; local providers can use HTTP on `localhost`, `127.0.0.1` or `[::1]`. Provider redirects are rejected. `ADVISOR_MAX_OUTPUT_TOKENS` sets the output budget per call (default 8,192, range 1,024–32,768); this may include reasoning tokens. Up to two advisor requests can run concurrently. This limit and the output budget bound resource use, but do not replace provider billing controls or private access control.

`openrouter/free` was tested with `ADVISOR_BASE_URL=https://openrouter.ai/api/v1` and a 120,000 ms advisor timeout. Its automatic routing can have variable latency and model behavior. OpenRouter requests require endpoints that support the supplied parameters; malformed answers remain rejected. Set `ADVISOR_TIMEOUT_MS=120000` when using it. The maintained `openai` JavaScript SDK uses the [Responses structured-output API](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) and [streaming responses](https://developers.openai.com/api/docs/guides/streaming-responses). Other providers must implement the same Responses/structured-output contract or supply the small `AdvisorProvider` interface in `server/advisor.ts`; a Chat Completions-only endpoint is insufficient.

The AI interprets task requirements; Zod validates them. A conservative server guard preserves a single unambiguous USD budget stated with its period in the latest message, even if the model omits it; the assumption is shown in the UI. Code applies hard constraints and ranks actual dataset candidates. A second structured, streamed call selects fit explanations and caveats for fixed candidate slots; the server binds each slot to its trusted model ID. Empty shortlists receive a direct explanation without another provider call. Names, metrics and quantitative claims are rendered from the dataset, not unrestricted generated prose. The model has **no tools**, filesystem access, or access to data-provider credentials. The browser receives validated NDJSON events for progress, assumptions, clarification questions, ranking, and the final grounded explanation. Stop cancels the provider request.

**Privacy:** the configured advisor receives the submitted task and up to 18 recent chat messages, current editable assumptions, and then the ranked candidate metrics needed to explain results. Artificial Analysis receives authenticated, read-only model-data tool calls, not your task descriptions. Chat is held in browser memory and is not logged or persisted by this app. Fonts are served locally. Provider-side retention and your rights to send candidate data to a chat provider must be checked with your agreements; `store:false` is requested from the advisor API.

## Use it

- Explore bubbles with a pointer or keyboard. Enter/Space selects a model. Numbered rings indicate selections; dashed rings indicate recommendations. Scroll over the plot to zoom around the mouse, then drag to pan in either direction. Zoom reveals more names; the three highest-intelligence plotted models keep priority labels while in view. Zoom and X/Y position sliders provide keyboard alternatives; Reset restores the full plot.
- Use **Show → Top 10 / Top 15 / Top 20 / All** to control chart density (default: Top 15 by highest Intelligence Index). **Rank by** also supports fastest output, lowest benchmark cost per task, lowest workload estimate, or the combined leaders across intelligence/speed/benchmark cost. Combined leaders take the top N per metric and deduplicate, so the total can exceed N. Chart rankings use raw metrics, independently of recommendation priorities.
- **One configuration per model** keeps the highest-intelligence configuration by default. Turn it off to include other settings, or use **Choose models** to select an exact comparison set, including specific configurations. This chart cohort is independent of the three-model comparison shortlist. Active filters still apply. Selected/recommended matches stay visible in addition to the chart limit; the table lists all filtered configurations, with the chart cohort first by default. A top model missing an axis metric stays in the table with an explicit chart notice.
- Select a **table column header** to sort, then select it again to reverse direction. Numeric columns use actual values, with unavailable metrics last in both directions. Cost sorting follows the selected cost mode and workload. **Restore chart order** returns to the default cohort order.
- Search names, filter creators and set minimum intelligence/speed or maximum cost. Different Intelligence Index versions must be selected separately.
- Edit input/output tokens, request volume and period. Bubble size can use the calculated workload estimate or the source's benchmark cost per task.
- Select a priority and **Find my matches** without AI, or describe a task after connecting an advisor. Relevant missing information prompts a concise follow-up. Assumptions and task constraints remain visible; workload assumptions are editable. Every advisor reply includes a reminder that AI can make mistakes and to experiment with different models for your business use case. Clear task constraints to start over.
- Compare up to three models, their token prices, benchmark costs and estimated latency plus generation. Unsupported metrics remain unavailable.

## Methods and architecture

See [METHODOLOGY.md](METHODOLOGY.md) for formulas, ranking weights, unit conversion, missing-value rules and limitations. The same explanation is available in the app.

```text
src/                 React dashboard, accessible SVG chart, advisor and setup UI
shared/types.ts      Validated public data and requirements contracts
shared/engine.ts     Pure cost, filtering, normalization and ranking functions
shared/chart.ts      Raw-metric chart ordering, configuration grouping and cohorts
shared/table.ts      Column sorting with explicit missing-value ordering
src/Dialog.tsx       Shared dialog focus management and keyboard behavior
src/ModelTable.tsx   Accessible table view and sorting controls
src/CohortDialog.tsx Exact chart model selection and temporary search state
src/MethodologyDialog.tsx  In-app methodology documentation
server/mcp.ts        Streamable HTTP MCP transport, key auth, discovery and schemas
server/normalize.ts  Documented AA field mapping; no inferred prices or latency
server/cache.ts      Atomic last-known-good snapshot and stale-data handling
server/advisor.ts    Replaceable interpretation / explanation provider interface
server/app.ts        Validated local API and cancellable NDJSON chat stream
server/security.ts   Host/origin checks, browser policy and resource limits
server/fixtures.ts   Fictional, independently authored demo dataset
tests/               Credential-free engine, cache, normalization and API tests
```

`DataSource` and `AdvisorProvider` are the small integration boundaries. Charting, cost calculation and ranking do not depend on a chat vendor.

## Checks and self-hosting

```sh
npm run check
npm test
npm run build
npm start
```

`npm start` serves the production build with the same server and `.env`. Keep the default loopback binding for personal use. For an ordinary private self-hosted installation, configure `HOST` and `PORT`, use a TLS reverse proxy with access control, and ensure its forwarded Host/Origin matches the configured hostname. The app intentionally has no account system and rejects unrecognized hosts and cross-origin API access. Protect a credential-bearing installation with private access control.

CI runs type checking, synthetic unit/integration tests and the production build without network APIs or credentials. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

### Vercel deployment

Vercel needs both the static frontend and an API function. `vercel.json` builds the Vite UI into `dist` and routes `/api/*` to `api/index.ts`, which exports the Express app without starting a port listener. Deploying only `dist` causes `/api/models` and `/api/connection` to return Vercel 404s; adding API keys alone cannot fix missing routes. Local development and `npm start` continue using `server/index.ts`.

Use the repository root as the Vercel project root, the **Vite** framework preset, and Node.js **22.x**. The package engine range keeps deployments on that major version while allowing compatible minor and patch updates. Enable **Fluid Compute** for the configured 300-second function limit and **Automatically expose System Environment Variables** so the API can recognize the exact deployment, branch and production hostnames. Additional custom domains can be allowed by setting `HOST` to the hostname without `https://`; `HOST` does not start a listener in the Vercel function. The configuration applies the production security headers to the static frontend as well as the API. Protect the hosted demo with access control, such as appropriate Vercel Deployment Protection; the app has no built-in authentication.

Add server environment variables to the intended Vercel environment (Production and, if used, Preview):

| Variable | Value |
| --- | --- |
| `DATA_MODE` | `live` for the live connection |
| `AA_API_KEY` | Your own Artificial Analysis key |
| `AA_MCP_TOOL` | The discovered read-only language-model tool selected locally |
| `AA_MCP_ARGS` | The same JSON arguments used locally, without surrounding shell quotes |
| `AA_USE_CONFIRMED` | `true` only for a use permitted by your agreement |
| `ADVISOR_API_KEY` | Your own chat-provider key, if using the advisor |
| `ADVISOR_MODEL` | The configured advisor model, if using the advisor |
| `ADVISOR_BASE_URL` | The same provider URL used locally; required for providers other than the default |
| `ADVISOR_TIMEOUT_MS` | Keep the value tested locally; `120000` was tested with OpenRouter free routing |
| `AA_CACHE_PATH` | Leave unset for the writable temporary-directory default, or use `/tmp/model-compass/aa-snapshot.json` |

Never prefix secrets with `VITE_`. A local `.env` is ignored by source control and does not configure a Git-based Vercel deployment. Redeploy after changing code or environment variables.

After deployment, open `/api/health`: it must return `{"status":"ok"}` even without provider keys. `/api/connection` reports configuration flags, and `/api/models` reports connection/setup errors as JSON. A platform 404 indicates a deployment/routing problem; an `Unrecognized host` 403 indicates missing hostname configuration. Check Vercel function logs for startup failures caused by invalid environment values. The explicit `typeRoots` in `tsconfig.json` keep TypeScript 7's function transpilation pointed at the repository's installed typings when Vercel creates a temporary compiler config outside the project; missing `node` or `vite/client` typings at that stage are build configuration errors, rather than API-key errors.

Mode changes, MCP selections, rate limits and snapshots are per function instance. Persist the mode and tool selection in environment variables rather than relying on Connections UI changes across cold starts. The temporary cache is not durable or shared across instances, so cold starts and scaling can cause additional AA fetches. This deployment does not provide a distributed cache or global provider spending limits.

## Verification and current limitations

- Authenticated MCP discovery and complete paginated Free-tier model retrieval were exercised successfully on 2026-10-27 through the running app. Model data is cached locally and excluded from the repository.
- Live OpenRouter task interpretation and grounded explanation were exercised with `openrouter/free`; automated tests use fake providers and make no paid calls.
- Automated checks pass for the engine, cache, normalization, API and simulated DOM dashboard interactions. Production build and local HTTP health/page checks pass. Desktop browser control timed out and the in-app browser is unavailable, so visual desktop/mobile QA and screenshots remain **unverified**. The chart adapts its internal coordinates to measured width; this resize behavior is exercised in simulated DOM tests, which do not verify actual browser layout.
- A tool's response must match the current documented language-model response. Provider-specific latency profiles and detailed modalities need verified mappings before use. Coding/agentic indices share their Intelligence Index context. Separately versioned capability scores with no supplied version are stored as unversioned and cannot drive comparative task ranking; general intelligence is used as the disclosed proxy.
- Benchmark measurements and estimated response times are proxies; evaluate shortlisted models on your actual task. The fit score is an app-defined relative score, not an official AA metric or accuracy guarantee.
- Review data rights before distributing a live installation. Approved external chart use requires AA-supplied branding; no fabricated logo is included. No real API responses, third-party benchmark datasets, or live screenshots are committed.

## License

Application code and original synthetic fixtures are [MIT licensed](LICENSE). This does not license Artificial Analysis data, services, trademarks or other third-party materials. Operators provide their own service credentials and permissions. Artificial Analysis does not endorse Model Compass.
