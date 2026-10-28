import {
  defaultWorkload,
  type Model,
  type Workload,
  type Filters,
  type Requirements,
  type Ranking,
  type Priority,
  type CostMode,
} from "./types";

export function estimateCost(model: Model, workload: Workload): number | null {
  if (model.inputPrice === null || model.outputPrice === null) return null;
  return (
    ((workload.inputTokens * model.inputPrice +
      workload.outputTokens * model.outputPrice) /
      1_000_000) *
    workload.requests
  );
}
export function estimateResponse(
  model: Model,
  workload: Workload,
): number | null {
  if (model.latency === null || model.speed === null || model.speed <= 0)
    return null;
  return model.latency + workload.outputTokens / model.speed;
}
export function costFor(
  model: Model,
  workload: Workload,
  mode: CostMode,
): number | null {
  return mode === "benchmark"
    ? model.benchmarkCost
    : estimateCost(model, workload);
}
export function budgetCost(
  model: Model,
  workload: Workload,
  period: Workload["period"],
): number | null {
  const requestCost = estimateCost(model, { ...workload, requests: 1 });
  if (requestCost === null) return null;
  if (period === "request") return requestCost;
  if (workload.period === "request") return null; // no assumed daily/monthly frequency
  const dailyVolume =
    workload.period === "month" ? workload.requests / 30 : workload.requests;
  return requestCost * dailyVolume * (period === "month" ? 30 : 1);
}
export function filterModels(
  models: Model[],
  filters: Filters,
  workload: Workload,
  mode: CostMode,
): Model[] {
  return models.filter((m) => {
    const cost = costFor(m, workload, mode);
    return (
      (!filters.query ||
        m.name.toLowerCase().includes(filters.query.toLowerCase())) &&
      (!filters.creator || m.creator === filters.creator) &&
      (!filters.version || m.version === filters.version) &&
      (filters.minIntelligence === null ||
        (m.intelligence !== null &&
          m.intelligence >= filters.minIntelligence)) &&
      (filters.minSpeed === null ||
        (m.speed !== null && m.speed >= filters.minSpeed)) &&
      (filters.maxCost === null || (cost !== null && cost <= filters.maxCost))
    );
  });
}
// Empirical midrank percentiles, bounded [0, 1]. Ties receive equal scores;
// magnitudes of outliers cannot dominate. Missing values receive no credit.
export function percentile(
  value: number | null,
  values: (number | null)[],
  reverse = false,
): number {
  if (value === null) return 0;
  const valid = values.filter((v): v is number => v !== null);
  if (!valid.length) return 0;
  const lower = valid.filter((v) => v < value).length;
  const ties = valid.filter((v) => v === value).length;
  const p = (lower + ties / 2) / valid.length;
  return reverse ? 1 - p : p;
}
const weights: Record<Priority, [number, number, number]> = {
  balanced: [0.45, 0.25, 0.3],
  quality: [0.75, 0.1, 0.15],
  speed: [0.2, 0.65, 0.15],
  cost: [0.2, 0.1, 0.7],
};
export function manualRequirements(
  priority: Priority,
  workload = defaultWorkload,
): Requirements {
  return {
    task: "general",
    difficulty: "moderate",
    workload,
    budget: null,
    minIntelligence: null,
    minSpeed: null,
    maxResponseSeconds: null,
    requiredCapabilities: [],
    priority,
    assumptions: [],
    followUp: null,
  };
}
// Compass fit scoring for recommendations; chart leaderboards use raw metrics.
export function scoreTradeoffs(
  models: Model[],
  priority: Priority,
  workload: Workload,
  qualities: (number | null)[] = models.map((model) => model.intelligence),
) {
  const speeds = models.map((model) => model.speed);
  const costs = models.map((model) => estimateCost(model, workload));
  const [qw, sw, cw] = weights[priority];
  return models
    .map((m, index) => ({
      m,
      cost: costs[index],
      responseSeconds: estimateResponse(m, workload),
      score:
        100 *
        (qw * percentile(qualities[index], qualities) +
          sw * percentile(m.speed, speeds) +
          cw * percentile(costs[index], costs, true)),
    }))
    .sort((a, b) => b.score - a.score || a.m.id.localeCompare(b.m.id));
}
export function rankModels(
  models: Model[],
  requirements: Requirements,
): Ranking {
  const r = requirements;
  const versions = new Set(models.map((m) => m.version));
  if (versions.size > 1)
    return {
      recommendations: [],
      eligible: 0,
      excluded: models.length,
      requirements: r,
      notes: [
        "Choose one Intelligence Index version before ranking. Incompatible benchmark versions are never combined.",
      ],
    };
  const eligible = models.filter((m) => {
    const cost = r.budget ? budgetCost(m, r.workload, r.budget.period) : null;
    const response = estimateResponse(m, r.workload);
    return (
      (r.minIntelligence === null ||
        (m.intelligence !== null && m.intelligence >= r.minIntelligence)) &&
      (r.minSpeed === null || (m.speed !== null && m.speed >= r.minSpeed)) &&
      (!r.budget || (cost !== null && cost <= r.budget.amount)) &&
      (r.maxResponseSeconds === null ||
        (response !== null && response <= r.maxResponseSeconds)) &&
      r.requiredCapabilities.every((c) => m.capabilities.includes(c)) &&
      (m.intelligence !== null ||
        (r.task !== "general" && !!m.taskScores[r.task]))
    );
  });
  const taskVersions = new Set(
    eligible.flatMap((m) =>
      m.taskScores[r.task] ? [m.taskScores[r.task].version] : [],
    ),
  );
  const useTask =
    r.task !== "general" &&
    eligible.length > 0 &&
    eligible.every((m) => m.taskScores[r.task]) &&
    taskVersions.size === 1 &&
    !taskVersions.has("unversioned");
  const qualities = eligible.map((m) =>
    useTask ? m.taskScores[r.task].value : m.intelligence,
  );
  const speeds = eligible.map((m) => m.speed);
  const costs = eligible.map((m) => estimateCost(m, r.workload));
  const ranked = scoreTradeoffs(eligible, r.priority, r.workload, qualities);
  const notes: string[] = [];
  if (r.task !== "general" && !useTask)
    notes.push(
      "Comparable task-specific scores are not available for every candidate; general intelligence is used as a proxy.",
    );
  if (r.budget && r.budget.period !== r.workload.period)
    notes.push(
      "Budget units are converted using a 30-day month. Per-request volume cannot imply daily or monthly usage.",
    );
  const recommendations: Ranking["recommendations"] = [];
  const add = (entry: (typeof ranked)[number] | undefined, role: string) => {
    if (!entry) return;
    const existing = recommendations.find((x) => x.modelId === entry.m.id);
    if (existing) {
      existing.roles.push(role);
      return;
    }
    const { m } = entry;
    const bestEntry = ranked[0];
    const quality = (model: Model) =>
      useTask ? model.taskScores[r.task].value : model.intelligence;
    const tradeoffs: string[] = [];
    if (m.speed === null) tradeoffs.push("Output speed is unavailable.");
    if (entry.cost === null) tradeoffs.push("Workload cost is unavailable.");
    if (bestEntry && bestEntry.m.id !== m.id) {
      if (
        quality(m) !== null &&
        quality(bestEntry.m) !== null &&
        quality(m)! < quality(bestEntry.m)!
      )
        tradeoffs.push("Lower benchmark quality score than the best fit.");
      if (
        entry.cost !== null &&
        bestEntry.cost !== null &&
        entry.cost > bestEntry.cost
      )
        tradeoffs.push("Higher estimated workload cost than the best fit.");
      if (
        m.speed !== null &&
        bestEntry.m.speed !== null &&
        m.speed < bestEntry.m.speed
      )
        tradeoffs.push("Lower output speed than the best fit.");
    } else {
      if (
        entry.cost !== null &&
        costs.some((c) => c !== null && c < entry.cost!)
      )
        tradeoffs.push("Cheaper eligible models are available.");
      if (m.speed !== null && speeds.some((s) => s !== null && s > m.speed!))
        tradeoffs.push("Faster eligible models are available.");
    }
    if (!tradeoffs.length)
      tradeoffs.push(
        "Benchmarks may not reflect your task; validate with representative examples.",
      );
    recommendations.push({
      modelId: m.id,
      roles: [role],
      why:
        role === "Best fit"
          ? `Highest Compass fit score across ${eligible.length} eligible models with your ${r.priority} priority.`
          : role === "Budget alternative"
            ? "Highest-scoring viable option with a lower estimated workload cost than the best fit."
            : "Highest-scoring viable option with higher output speed than the best fit.",
      score: Math.round(entry.score * 10) / 10,
      qualityBasis: useTask
        ? `${r.task} index (${m.taskScores[r.task].version})`
        : `Intelligence Index (${m.version})`,
      cost: entry.cost,
      responseSeconds: entry.responseSeconds,
      tradeoff: tradeoffs.slice(0, 2).join(" "),
    });
  };
  const best = ranked[0];
  add(best, "Best fit");
  if (best) {
    const cheaper = ranked
      .filter(
        (x) => x.cost !== null && best.cost !== null && x.cost < best.cost,
      )
      .sort((a, b) => b.score - a.score || a.m.id.localeCompare(b.m.id));
    const faster = ranked
      .filter(
        (x) =>
          x.m.speed !== null &&
          best.m.speed !== null &&
          x.m.speed > best.m.speed,
      )
      .sort((a, b) => b.score - a.score || a.m.id.localeCompare(b.m.id));
    add(
      cheaper[0] ?? (best.cost !== null ? best : undefined),
      "Budget alternative",
    );
    add(
      faster[0] ?? (best.m.speed !== null ? best : undefined),
      "Speed alternative",
    );
  }
  if (!ranked.length)
    notes.push(
      "No model meets all constraints with the available metrics. Relax a constraint or provide missing usage details.",
    );
  if (recommendations.some((x) => x.roles.length > 1))
    notes.push(
      "One model fills multiple roles because no cheaper or faster viable alternative improves on it.",
    );
  return {
    recommendations,
    eligible: eligible.length,
    excluded: models.length - eligible.length,
    requirements: r,
    notes,
  };
}
export function validateGrounding(ranking: Ranking, models: Model[]): void {
  const known = new Map(models.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const expected = rankModels(models, ranking.requirements);
  if (ranking.recommendations.length > 3)
    throw new Error("Too many recommendations");
  for (const rec of ranking.recommendations) {
    const model = known.get(rec.modelId);
    if (!model || seen.has(rec.modelId))
      throw new Error("Recommendation is outside the dataset or duplicated");
    seen.add(rec.modelId);
    const expectedRec = expected.recommendations.find(
      (x) => x.modelId === rec.modelId,
    );
    if (
      !expectedRec ||
      rec.score !== expectedRec.score ||
      rec.qualityBasis !== expectedRec.qualityBasis ||
      JSON.stringify(rec.roles) !== JSON.stringify(expectedRec.roles) ||
      rec.cost !== estimateCost(model, ranking.requirements.workload) ||
      rec.responseSeconds !==
        estimateResponse(model, ranking.requirements.workload)
    )
      throw new Error("Recommendation metrics do not match the dataset");
  }
}
export function bubbleRadius(
  cost: number,
  maxCost: number,
  maxRadius = 12,
): number {
  if (
    !Number.isFinite(cost) ||
    !Number.isFinite(maxCost) ||
    cost <= 0 ||
    maxCost <= 0
  )
    return 0;
  return maxRadius * Math.sqrt(Math.min(1, cost / maxCost));
}
