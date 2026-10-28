import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Ajv } from "ajv";
import { config } from "./config";
import { extractPayload, normalizePage } from "./normalize";
import type { Snapshot } from "../shared/types";

export const MCP_URL = "https://mcp.artificialanalysis.ai/mcp";
export type Tool = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  eligible: boolean;
};
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
export function readOnly(tool: Omit<Tool, "eligible">): boolean {
  if (
    tool.annotations?.destructiveHint ||
    tool.annotations?.readOnlyHint === false
  )
    return false;
  return (
    tool.annotations?.readOnlyHint === true ||
    /^(get|list|search|read)(_|[A-Z])/.test(tool.name)
  );
}
export function validateToolArguments(
  tool: Tool,
  args: Record<string, unknown>,
) {
  if (!tool.eligible || !readOnly(tool))
    throw new Error("Only discovered read-only tools are allowed.");
  const valid = ajv.compile(tool.inputSchema);
  if (!valid(args))
    throw new Error(
      `Arguments do not match the discovered input schema: ${ajv.errorsText(valid.errors)}`,
    );
}
// Small transport interface: server owns keys, discovery, schema validation and calls.
export interface DataSource {
  discover(signal?: AbortSignal): Promise<Tool[]>;
  fetch(
    tool: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Snapshot>;
}
async function withClient<T>(
  work: (client: Client, signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!config.AA_API_KEY)
    throw new Error("Set AA_API_KEY in the server environment to connect.");
  const timeout = AbortSignal.timeout(config.AA_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const client = new Client(
    { name: "model-compass", version: "0.1.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { "x-api-key": config.AA_API_KEY } },
    fetch: async (url, init) => {
      const requestSignal = init?.signal
        ? AbortSignal.any([combined, init.signal])
        : combined;
      for (let attempt = 0; ; attempt++) {
        const response = await fetch(url, {
          ...init,
          signal: requestSignal,
          redirect: "error",
        });
        if (response.status === 401 || response.status === 403)
          throw new Error(
            "Artificial Analysis denied access. Verify the server API key and subscription.",
          );
        if (
          response.status === 429 ||
          [502, 503, 504].includes(response.status)
        ) {
          const retryHeader = response.headers.get("retry-after");
          const retrySeconds = retryHeader
            ? /^\d+(\.\d+)?$/.test(retryHeader)
              ? Number(retryHeader)
              : Math.max(0, (Date.parse(retryHeader) - Date.now()) / 1000)
            : 0.6;
          if (attempt || !Number.isFinite(retrySeconds) || retrySeconds > 2)
            throw new Error(
              response.status === 429
                ? "Artificial Analysis rate limit reached. Wait before refreshing."
                : "Artificial Analysis is temporarily unavailable.",
            );
          await response.body?.cancel();
          await new Promise<void>((resolve, reject) => {
            const abort = () => {
              clearTimeout(timer);
              reject(new Error("MCP request cancelled."));
            };
            const timer = setTimeout(
              () => {
                requestSignal.removeEventListener("abort", abort);
                resolve();
              },
              Math.max(0.2, retrySeconds) * 1000,
            );
            requestSignal.addEventListener("abort", abort, { once: true });
            if (requestSignal.aborted) abort();
          });
          continue;
        }
        return response;
      }
    },
  });
  try {
    await client.connect(transport, { timeout: config.AA_TIMEOUT_MS });
    return await work(client, combined);
  } finally {
    await client.close().catch(() => undefined);
  }
}
async function listAll(client: Client, signal: AbortSignal): Promise<Tool[]> {
  const tools: Tool[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const result = await client.listTools(
      { cursor },
      { signal, timeout: config.AA_TIMEOUT_MS },
    );
    for (const t of result.tools)
      tools.push({ ...t, eligible: readOnly(t) } as Tool);
    cursor = result.nextCursor;
    if (!cursor) return tools;
  }
  throw new Error("MCP tool discovery exceeded the safety page limit.");
}
// Verified through authenticated discovery on 2026-10-27. AA fixes pages at
// 200 records and caps each MCP result at 75,000 characters. Project fields in
// groups, then join by ID; every group and page must agree before caching.
const metricGroups = [
  [
    "data.id",
    "data.name",
    "data.model_creator.name",
    "data.evaluations.artificial_analysis_intelligence_index",
    "data.performance.median_output_tokens_per_second",
    "data.performance.median_time_to_first_token_seconds",
  ],
  [
    "data.id",
    "data.pricing.price_1m_input_tokens",
    "data.pricing.price_1m_output_tokens",
    "data.artificial_analysis_intelligence_index_cost.cost_per_task.total_cost",
  ],
  [
    "data.id",
    "data.evaluations.artificial_analysis_coding_index",
    "data.evaluations.artificial_analysis_agentic_index",
    "data.evaluations.artificial_analysis_finance_and_accounting_index",
    "data.evaluations.artificial_analysis_strategy_and_ops_index",
  ],
  [
    "data.id",
    "data.evaluations.artificial_analysis_legal_index",
    "data.evaluations.artificial_analysis_healthcare_and_medical_index",
    "data.evaluations.artificial_analysis_engineering_index",
    "data.evaluations.artificial_analysis_economics_index",
  ],
];
export function nextPageArguments(
  tool: Tool,
  args: Record<string, unknown>,
  page: number,
): Record<string, unknown> {
  const properties = tool.inputSchema.properties as
    Record<string, unknown> | undefined;
  if (properties?.query && typeof properties.query === "object") {
    return {
      ...args,
      query: { ...(args.query as Record<string, unknown> | undefined), page },
    };
  }
  if (properties?.page) return { ...args, page };
  throw new Error(
    "This paginated MCP tool exposes neither query.page nor page. Partial results were not cached.",
  );
}
function mergeFields(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...a };
  for (const [key, value] of Object.entries(b)) {
    if (["__proto__", "prototype", "constructor"].includes(key))
      throw new Error("Unsafe MCP object key.");
    const previous = merged[key];
    merged[key] =
      previous &&
      value &&
      typeof previous === "object" &&
      typeof value === "object" &&
      !Array.isArray(previous) &&
      !Array.isArray(value)
        ? mergeFields(
            previous as Record<string, unknown>,
            value as Record<string, unknown>,
          )
        : value;
  }
  return merged;
}
export function mergeProjectedPages(pages: unknown[]): unknown {
  const objects = pages as {
    tier: string;
    intelligence_index_version: string | number;
    pagination?: {
      page: number;
      has_more: boolean;
      total_pages: number;
      page_size?: number;
    };
    data: Record<string, unknown>[];
  }[];
  const first = objects[0];
  if (!first) throw new Error("No MCP projection returned.");
  const rows = new Map(first.data.map((row) => [String(row.id), row]));
  if (
    rows.size !== first.data.length ||
    first.data.some((row) => typeof row.id !== "string")
  )
    throw new Error("Invalid or duplicate model IDs in MCP projection.");
  for (const part of objects.slice(1)) {
    if (
      part.tier !== first.tier ||
      part.intelligence_index_version !== first.intelligence_index_version ||
      JSON.stringify(part.pagination) !== JSON.stringify(first.pagination)
    )
      throw new Error("MCP metadata changed between field projections.");
    if (
      part.data.length !== rows.size ||
      new Set(part.data.map((row) => row.id)).size !== rows.size
    )
      throw new Error("Incomplete MCP field projection.");
    for (const row of part.data) {
      if (typeof row.id !== "string" || !rows.has(row.id))
        throw new Error("Model IDs changed between MCP field projections.");
      rows.set(row.id, mergeFields(rows.get(row.id)!, row));
    }
  }
  return { ...first, data: [...rows.values()] };
}
export async function fetchModelSnapshot(
  client: Pick<Client, "callTool">,
  tool: Tool,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Snapshot> {
  validateToolArguments(tool, args);
  const project =
    ["aa_language_models_free", "aa_language_models"].includes(tool.name) &&
    args.fields === undefined;
  let pageArgs = { ...args };
  const startPage =
    (args.query as Record<string, unknown> | undefined)?.page ?? args.page ?? 1;
  if (startPage !== 1)
    throw new Error("A complete dataset refresh must start at page 1.");
  const snapshots: Snapshot[] = [];
  for (let page = 1; page <= 50; page++) {
    const projections: unknown[] = [];
    for (const fields of project ? metricGroups : [undefined]) {
      const callArgs = fields
        ? {
            ...pageArgs,
            fields: [
              "tier",
              "intelligence_index_version",
              "pagination",
              ...fields,
            ],
            limit_chars: args.limit_chars ?? 75000,
          }
        : pageArgs;
      validateToolArguments(tool, callArgs);
      const output = await client.callTool(
        { name: tool.name, arguments: callArgs },
        undefined,
        { signal, timeout: config.AA_TIMEOUT_MS },
      );
      if (
        tool.outputSchema &&
        output.structuredContent &&
        !ajv.validate(tool.outputSchema, output.structuredContent)
      )
        throw new Error(
          "MCP structured output failed the discovered output schema.",
        );
      projections.push(extractPayload(output));
    }
    const parsed = normalizePage(mergeProjectedPages(projections));
    if (parsed.page !== page)
      throw new Error("MCP returned an unexpected page number.");
    snapshots.push(parsed.snapshot);
    if (!parsed.hasMore) {
      const versions = new Set(
        snapshots.flatMap((x) => x.models.map((m) => m.version)),
      );
      const tiers = new Set(snapshots.map((x) => x.tier));
      if (versions.size !== 1 || tiers.size !== 1)
        throw new Error(
          "Benchmark versions or account tiers changed during pagination.",
        );
      const models = snapshots.flatMap((x) => x.models);
      if (new Set(models.map((m) => m.id)).size !== models.length)
        throw new Error("MCP returned duplicate model IDs across pages.");
      return {
        ...snapshots[0],
        models,
        fetchedAt: new Date().toISOString(),
        warnings: [...new Set(snapshots.flatMap((x) => x.warnings))],
      };
    }
    pageArgs = nextPageArguments(tool, args, page + 1);
  }
  throw new Error(
    "MCP data pagination exceeded 50 pages. No partial snapshot was saved.",
  );
}
export const aaSource: DataSource = {
  discover: (signal) => withClient((c, s) => listAll(c, s), signal),
  fetch: (name, args, signal) =>
    withClient(async (client, s) => {
      const tools = await listAll(client, s);
      const tool = tools.find((t) => t.name === name);
      if (!tool)
        throw new Error(
          "The configured tool was not found in authenticated MCP discovery. Open Connections.",
        );
      return fetchModelSnapshot(client, tool, args, s);
    }, signal),
};
