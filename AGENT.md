Build a working web app called **Model Compass**.

Tagline: **Find the right AI for your task.**

The app helps users choose AI language models by comparing intelligence, speed, and cost in one interactive chart, then recommending suitable models through a conversational advisor.

Deliver a functional local app, with real integrations where credentials are available, clear setup instructions, and meaningful validation. Make reasonable implementation decisions and continue autonomously. Ask only for information that blocks progress. Do not deploy publicly.

## 1. Data source: Artificial Analysis MCP

Use this remote MCP server as the primary data source:

https://mcp.artificialanalysis.ai/mcp

Documentation:

https://artificialanalysis.ai/data-api/docs/mcp

- Use MCP rather than scraping the website.
- Inspect current documentation, discover available tools, and inspect their schemas before implementing calls. Do not invent tool names or response fields.
- Verify the supported authentication method for a server application. Keep API keys, tokens, and credentials on the server.
- Distinguish connecting MCP to the development environment from connecting the running application. The finished app needs its own working server-side integration.
- Retrieve available model names, creators, intelligence scores, task-specific scores, speed, latency, prices, and benchmark cost per task.
- Respect subscription restrictions, rate limits, and data-use requirements. Show visible attribution linking to Artificial Analysis.
- Cache successful responses server-side with a configurable refresh interval. Display the last successful refresh time.
- Preserve a last-known-good snapshot when refresh fails and clearly mark stale data.
- Handle missing metrics as unavailable, never as zero.
- Preserve benchmark versions when supplied. Do not silently compare incompatible benchmark versions.
- Do not fall back to scraping or a different data source without explaining the issue.

If credentials are unavailable, implement the integration and connection setup screen. Provide an explicitly labeled demo mode using a separate fixture dataset. Never present demo data as live data.

## 2. Main experience

Create one responsive dashboard with:

- A header containing the name, tagline, data freshness, and connection status.
- A large interactive bubble chart.
- A conversational model advisor beside the chart on desktop and below it on mobile.
- Simple filters and priority controls.
- A compact comparison area for selected or recommended models.

The user’s main journey is:

1. Explore the chart or describe a task.
2. Specify budget and priorities.
3. Receive three useful model recommendations.
4. See those models highlighted on the chart.
5. Compare their metrics and estimated workload costs.

Keep the first version focused on this journey.

## 3. Bubble chart

Represent all three metrics in one chart:

- X-axis: output speed in tokens per second; farther right is faster.
- Y-axis: Artificial Analysis Intelligence Index; higher is better.
- Bubble area: cost; smaller means less expensive.

Requirements:

- Scale bubble area, rather than radius, to cost.
- Include clear axis labels, units, a bubble-size legend, and a brief explanation of how to read the chart.
- Use a restrained visual style and emphasize selected or recommended models.
- Show model names intelligently to avoid excessive overlap.
- Hover or keyboard focus should reveal model name, creator, intelligence, speed, cost, and relevant data provenance.
- Clicking a bubble selects the model for comparison.
- Allow selection of up to three models.
- Allow filtering by creator, model name, minimum intelligence, minimum speed, and maximum cost.
- Provide reset controls.
- Make overlapping points usable through suitable interactions such as zoom or focused selection.
- Provide an accessible table view of the same data.
- Handle empty results and missing metrics explicitly.

Support two cost modes when the required data exists:

1. **Benchmark cost per task:** use Artificial Analysis’s reported metric directly.
2. **Estimated workload cost:** calculate from user assumptions and available input/output prices.

Do not label token pricing as benchmark cost per task. If a metric is unavailable under the connected account’s plan, explain that limitation.

## 4. Task advisor

Add a real conversational advisor where users can describe what they want to accomplish.

Example requests:

- “Summarize 200 long reports every day for less than $20.”
- “Choose a fast model for a customer support chatbot.”
- “I need strong coding ability and can accept slower responses.”
- “Extract structured information from invoices as cheaply as possible.”

The advisor should identify relevant requirements:

- Task type and difficulty.
- Expected input and output length.
- Usage volume.
- Budget and its unit: per request, per day, or per month.
- Interactive response-time needs.
- Relative priority of cost, speed, and quality.
- Required capabilities, when supported by available data.

Ask concise follow-up questions when a missing detail materially affects the recommendation. Otherwise, proceed with clearly stated, editable assumptions.

Use an appropriate server-side AI integration for interpreting requests and explaining results. Select a maintained implementation based on current official documentation. Configure the advisor model through environment settings.

Artificial Analysis MCP supplies model data; it does not itself supply the chat model. Keep these integrations distinct. If the chat model is not configured, show an honest setup state and allow manual use of the chart and ranking controls.

## 5. Recommendation logic

Make recommendations reproducible and grounded in retrieved data.

- Let the language model interpret the task into structured requirements.
- Validate those requirements on the server.
- Apply hard constraints before ranking.
- Calculate rankings in application code using documented, inspectable logic.
- Let the chat model explain the resulting candidates.
- Validate that every recommended model and quoted metric exists in the retrieved dataset.

Use task-specific benchmarks, such as coding scores, when available and relevant. Otherwise, use the general intelligence score as a proxy and state the limitation.

Provide controls for favoring:

- Lower cost.
- Higher speed.
- Higher intelligence.
- A balanced tradeoff.

Use a documented normalization method that handles outliers and missing values appropriately. Explain the meaning of any combined score; do not imply that it is an official Artificial Analysis metric.

Return up to three recommendations:

1. **Best fit:** strongest match for the stated requirements.
2. **Budget alternative:** a cheaper viable option.
3. **Speed alternative:** a faster viable option.

Avoid forcing three distinct models when the dataset does not support them. Explain when one model fills multiple roles or when no model meets the constraints.

Each recommendation should include:

- Model and creator.
- Why it fits.
- Intelligence or relevant task-specific score.
- Output speed.
- Estimated cost and assumptions, when calculable.
- Main tradeoff.
- A control to highlight it on the chart.

Do not promise task accuracy based only on benchmark scores. Distinguish measured facts, calculated estimates, and inferred suitability.

## 6. Cost and speed estimates

Provide editable inputs for:

- Input tokens per request.
- Output tokens per request.
- Number of requests.
- Usage period.

Calculate base token cost as:

(input tokens × input price per million
+ output tokens × output price per million)
÷ 1,000,000

Then multiply by request volume.

Label this as an estimate. Explain exclusions where relevant, including unmeasured reasoning tokens, caching, tools, provider-specific fees, and other unavailable billing details.

Keep benchmark cost separate from this calculation.

Also distinguish output tokens per second from complete response time. If estimating response duration, use available latency plus generation time and clearly disclose missing reasoning or processing time. Do not invent latency values.

## 7. Design direction

Use the attached screenshot as a reference for the metrics and data presentation, not as a layout to reproduce.

Create a polished, calm, modern interface:

- Light background.
- Strong typography and readable labels.
- A restrained accent color.
- Clear spacing and subtle borders.
- A prominent chart with a comfortable chat panel.
- Useful loading, empty, disconnected, stale-data, and error states.
- Responsive desktop and mobile layouts.
- Keyboard-accessible controls, visible focus states, and sufficient contrast.
- Do not rely on color alone to communicate recommendations.

Include a few clickable example prompts to help users start.

## 8. Technical expectations

Inspect the existing project first and follow applicable repository instructions. Reuse the existing stack where appropriate. For a new project, choose a simple, maintained stack suitable for an interactive chart, server-side MCP access, and streaming chat.

Use clear separation between:

- MCP transport and authentication.
- Data normalization and caching.
- Cost estimation.
- Filtering and ranking.
- Advisor interpretation and explanations.
- User interface.

Additional requirements:

- Validate external data and user inputs.
- Keep secrets out of browser bundles, logs, and source control.
- Provide an example environment file containing placeholders only.
- Add request timeouts and sensible retry behavior.
- Respect cancellation and rate limits.
- Treat retrieved content and chat input as untrusted data.
- Restrict the advisor to the necessary read-only tools.
- Avoid logging sensitive task descriptions by default.
- Do not add user accounts, payments, or unrelated features to this first version.

## 9. Validation

Run checks appropriate to the implementation.

Include meaningful tests for:

- Cost calculations and units.
- Hard-constraint filtering.
- Ranking behavior.
- Missing metrics.
- Invalid or out-of-dataset recommendations.
- MCP failures and stale-cache behavior.

Verify the main user flows:

- Connect or configure data access.
- Load and interact with the chart.
- Filter and compare models.
- Describe a task and receive grounded recommendations.
- Highlight recommendations on the chart.
- Change assumptions and update estimated costs.
- Handle unavailable credentials and failed refreshes honestly.
- Use the app on a narrow screen.

Do not claim that live integration works unless it was actually exercised successfully.

## 10. Deliverables

Provide:

- The working application.
- A concise README with installation, local startup, authentication, and environment setup.
- An explanation of the ranking and cost-estimation methods.
- A summary of what was tested.
- Any remaining limitations, missing credentials, or plan restrictions.

Start by inspecting the project and verifying the MCP capabilities, then implement the app. Continue until the local version is complete or a specific external requirement blocks further progress.

## 11. Open-source requirements

Model Compass will be released as an open-source project. Build it for other people to clone, run, understand, and contribute to.

### Licensing and data rights

- Ask me which code license to use before adding one. Do not assume a license.
- Clearly distinguish the application’s code license from Artificial Analysis’s data rights and terms.
- Verify current requirements for attribution, caching, display, and redistribution. Document any unresolved restrictions.
- Do not commit real API responses, benchmark datasets, or screenshots containing third-party data unless redistribution is explicitly permitted.
- Use clearly labeled synthetic fixtures for demos, automated tests, and documentation examples.
- Explain that an open-source code license does not grant rights to third-party data or services.

### Installation and credentials

- Support a straightforward local setup with documented prerequisites and a single development command after installation.
- Let each operator configure their own Artificial Analysis credentials and chat-provider credentials.
- Never require my personal credentials or route installations through an account I control.
- Include `.env.example` with placeholders, appropriate ignore rules, and clear credential instructions.
- Make demo mode usable without paid accounts or credentials.
- Document that connecting the MCP server to a coding assistant does not automatically authenticate the running app.

### Architecture and portability

- Keep core charting, cost calculations, filtering, and ranking independent of the chat provider.
- Put MCP access and chat-provider access behind small, documented interfaces.
- Make the advisor model configurable; avoid unnecessary coupling to a specific AI vendor.
- Support ordinary self-hosting without requiring a proprietary hosting platform.
- Do not add telemetry or external tracking by default.
- Document which services receive user task descriptions and what information is transmitted.

### Repository quality

Include:

- `README.md` covering purpose, screenshots, setup, demo mode, architecture, and limitations.
- `CONTRIBUTING.md` with development and testing instructions.
- `SECURITY.md` explaining safe credential handling and how to report vulnerabilities. Ask for a reporting contact rather than inventing one.
- A short explanation of recommendation methodology, including formulas, assumptions, and limitations.
- A CI workflow that runs relevant checks without real credentials or paid API calls.
- A dependency lockfile and