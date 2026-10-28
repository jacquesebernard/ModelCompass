import { z } from "zod";
import type { Model, Snapshot } from "../shared/types";
// Field paths verified against https://artificialanalysis.ai/data-api/docs/reference
// and authenticated MCP discovery (2026-10-27).
const nullableMetric = z.number().finite().nonnegative().nullish();
const rowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  model_creator: z.object({ name: z.string().min(1) }),
  evaluations: z.record(z.string(), z.unknown()).default({}),
  pricing: z
    .object({
      price_1m_input_tokens: nullableMetric,
      price_1m_output_tokens: nullableMetric,
    })
    .nullish(),
  performance: z
    .object({
      median_output_tokens_per_second: nullableMetric,
      median_time_to_first_token_seconds: nullableMetric,
    })
    .nullish(),
  artificial_analysis_intelligence_index_cost: z
    .object({
      cost_per_task: z.object({ total_cost: nullableMetric }).nullish(),
    })
    .nullish(),
});
const payloadSchema = z.object({
  tier: z.string(),
  intelligence_index_version: z.union([z.string(), z.number()]),
  data: z.array(z.unknown()).max(10000),
  pagination: z
    .object({
      page: z.number().int().positive(),
      has_more: z.boolean(),
      total_pages: z.number().int().positive(),
      page_size: z.number().int().positive().optional(),
    })
    .optional(),
});
function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
export function extractPayload(result: unknown): unknown {
  if (!result || typeof result !== "object")
    throw new Error("MCP returned no data object.");
  const r = result as Record<string, unknown>;
  if (r.isError)
    throw new Error(
      "The selected MCP tool reported an error. Check account access and arguments.",
    );
  if (payloadSchema.safeParse(r).success) return r;
  if (r.structuredContent) {
    const body = r.structuredContent as Record<string, unknown>;
    if (payloadSchema.safeParse(body).success) return body;
    // Some transports put the API response inside structuredContent.result.
    if (payloadSchema.safeParse(body.result).success) return body.result;
  }
  if (Array.isArray(r.content)) {
    for (const item of r.content) {
      if (item?.type === "text" && typeof item.text === "string") {
        try {
          const parsed = JSON.parse(item.text);
          if (payloadSchema.safeParse(parsed).success) return parsed;
        } catch {
          /* reject non-JSON text instead of guessing fields */
        }
      }
    }
  }
  throw new Error(
    "MCP output does not match the documented language-model response. Inspect the selected tool and its output schema; no fallback source was used.",
  );
}
export function normalizePage(raw: unknown): {
  snapshot: Snapshot;
  hasMore: boolean;
  page: number;
} {
  const payload = payloadSchema.parse(raw);
  if (
    payload.pagination?.has_more &&
    payload.pagination.page_size &&
    payload.data.length !== payload.pagination.page_size
  )
    throw new Error("MCP returned an incomplete page.");
  const version = `v${payload.intelligence_index_version}`;
  const models: Model[] = [];
  let skipped = 0;
  for (const item of payload.data) {
    const result = rowSchema.safeParse(item);
    if (!result.success) {
      skipped++;
      continue;
    }
    const r = result.data;
    const taskScores: Model["taskScores"] = {};
    const tasks = {
      coding: "artificial_analysis_coding_index",
      agentic: "artificial_analysis_agentic_index",
      finance: "artificial_analysis_finance_and_accounting_index",
      strategy: "artificial_analysis_strategy_and_ops_index",
      legal: "artificial_analysis_legal_index",
      healthcare: "artificial_analysis_healthcare_and_medical_index",
      engineering: "artificial_analysis_engineering_index",
      economics: "artificial_analysis_economics_index",
    };
    for (const [task, field] of Object.entries(tasks)) {
      const value = numberOrNull(r.evaluations[field]);
      // Coding/agentic are subsets of the Intelligence Index. Capability indices
      // are separately versioned; absent versions cannot be assumed compatible.
      if (value !== null)
        taskScores[task] = {
          value,
          version: ["coding", "agentic"].includes(task)
            ? `AA Intelligence Index ${version} (derived subset)`
            : "unversioned",
        };
    }
    models.push({
      id: r.id,
      name: r.name,
      creator: r.model_creator.name,
      intelligence: numberOrNull(
        r.evaluations.artificial_analysis_intelligence_index,
      ),
      speed: r.performance?.median_output_tokens_per_second ?? null,
      latency: r.performance?.median_time_to_first_token_seconds ?? null,
      inputPrice: r.pricing?.price_1m_input_tokens ?? null,
      outputPrice: r.pricing?.price_1m_output_tokens ?? null,
      benchmarkCost:
        r.artificial_analysis_intelligence_index_cost?.cost_per_task
          ?.total_cost ?? null,
      version,
      taskScores,
      capabilities: [],
      source: "artificial-analysis",
    });
  }
  if (!models.length)
    throw new Error(
      "No valid language models were returned; the previous snapshot is preserved.",
    );
  return {
    snapshot: {
      models,
      fetchedAt: new Date().toISOString(),
      tier: payload.tier,
      warnings: [
        ...(skipped
          ? [`${skipped} malformed model records were excluded.`]
          : []),
        ...(models.some((m) =>
          Object.values(m.taskScores).some((s) => s.version === "unversioned"),
        )
          ? [
              "Separate capability-index versions were not supplied. General intelligence is used for those task rankings.",
            ]
          : []),
      ],
    },
    hasMore: payload.pagination?.has_more ?? false,
    page: payload.pagination?.page ?? 1,
  };
}
