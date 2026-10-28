import { z } from "zod";

const metric = z.number().finite().nonnegative().nullable();
export const modelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  creator: z.string().min(1),
  intelligence: metric,
  speed: metric,
  latency: metric,
  inputPrice: metric,
  outputPrice: metric,
  benchmarkCost: metric,
  version: z.string().min(1),
  taskScores: z.record(
    z.string(),
    z.object({ value: z.number().finite().nonnegative(), version: z.string() }),
  ),
  capabilities: z.array(z.string()),
  source: z.enum(["synthetic", "artificial-analysis"]),
});
export type Model = z.infer<typeof modelSchema>;
export const workloadSchema = z.object({
  inputTokens: z.number().int().min(0).max(100_000_000),
  outputTokens: z.number().int().min(0).max(10_000_000),
  requests: z.number().int().min(1).max(1_000_000_000),
  period: z.enum(["request", "day", "month"]),
});
export type Workload = z.infer<typeof workloadSchema>;
export const defaultWorkload: Workload = {
  inputTokens: 2000,
  outputTokens: 500,
  requests: 1000,
  period: "month",
};
export const filtersSchema = z.object({
  query: z.string().max(200).default(""),
  creator: z.string().max(200).default(""),
  minIntelligence: z.number().nonnegative().nullable().default(null),
  minSpeed: z.number().nonnegative().nullable().default(null),
  maxCost: z.number().nonnegative().nullable().default(null),
  version: z.string().max(100).default(""),
});
export type Filters = z.infer<typeof filtersSchema>;
export const defaultFilters: Filters = {
  query: "",
  creator: "",
  minIntelligence: null,
  minSpeed: null,
  maxCost: null,
  version: "",
};
export const prioritySchema = z.enum(["balanced", "cost", "speed", "quality"]);
export type Priority = z.infer<typeof prioritySchema>;
export type CostMode = "workload" | "benchmark";
export const requirementsSchema = z.object({
  task: z.enum([
    "general",
    "coding",
    "agentic",
    "finance",
    "strategy",
    "legal",
    "healthcare",
    "engineering",
    "economics",
  ]),
  difficulty: z.enum(["routine", "moderate", "complex"]),
  workload: workloadSchema,
  budget: z
    .object({
      amount: z.number().finite().nonnegative(),
      period: z.enum(["request", "day", "month"]),
    })
    .nullable(),
  minIntelligence: z.number().finite().nonnegative().nullable(),
  minSpeed: z.number().finite().nonnegative().nullable(),
  maxResponseSeconds: z.number().finite().positive().nullable(),
  requiredCapabilities: z.array(z.string().max(100)).max(10),
  priority: prioritySchema,
  assumptions: z.array(z.string().max(300)).max(10),
  followUp: z.string().max(400).nullable(),
});
export type Requirements = z.infer<typeof requirementsSchema>;
export type Recommendation = {
  modelId: string;
  roles: string[];
  why: string;
  score: number;
  qualityBasis: string;
  cost: number | null;
  responseSeconds: number | null;
  tradeoff: string;
};
export type Ranking = {
  recommendations: Recommendation[];
  eligible: number;
  excluded: number;
  notes: string[];
  requirements: Requirements;
};
export type Snapshot = {
  models: Model[];
  fetchedAt: string;
  tier: string;
  warnings: string[];
};
export type DataResponse = {
  mode: "demo" | "live";
  state: "demo" | "connected" | "stale" | "disconnected";
  snapshot: Snapshot | null;
  error: string | null;
  refreshSeconds: number;
};
export type Connection = {
  mode: "demo" | "live";
  dataKeyConfigured: boolean;
  useConfirmed: boolean;
  advisorConfigured: boolean;
  advisorModel: string | null;
  advisorHost: string;
  selectedTool: string | null;
  refreshSeconds: number;
};
