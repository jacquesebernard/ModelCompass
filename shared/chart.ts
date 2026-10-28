import type { Model, Workload } from "./types";
import { estimateCost } from "./engine";

export type ChartLimit = 10 | 15 | 20 | "all";
export type ChartOrder =
  | "intelligence"
  | "speed"
  | "benchmarkCost"
  | "workloadCost"
  | "leaders"
  | "custom";
type Metric = Exclude<ChartOrder, "leaders" | "custom">;

function configurationKey(model: Model) {
  // Only group explicit configuration suffixes. Dates/releases, model sizes,
  // Pro/Mini variants and different creators remain distinct.
  const suffix = model.name.match(/\s+\(([^()]*)\)\s*$/);
  const configured =
    suffix &&
    /\b(?:max|xhigh|high|medium|low|minimal|none|default|fallback|reasoning|thinking|reflect|adaptive|budget|effort)\b/i.test(
      suffix[1],
    );
  const base = configured
    ? model.name.slice(0, suffix!.index).trim()
    : model.name;
  return `${model.creator.toLowerCase()}\u0000${base.toLowerCase()}`;
}
function metricValue(
  model: Model,
  metric: Metric,
  workload: Workload,
): number | null {
  return metric === "workloadCost"
    ? estimateCost(model, workload)
    : model[metric];
}
export function sortByChartMetric(
  models: Model[],
  workload: Workload,
  metric: Metric,
): Model[] {
  const ascending = metric === "benchmarkCost" || metric === "workloadCost";
  return [...models].sort((a, b) => {
    const av = metricValue(a, metric, workload),
      bv = metricValue(b, metric, workload);
    if (av === null && bv !== null) return 1;
    if (av !== null && bv === null) return -1;
    if (av !== null && bv !== null && av !== bv)
      return ascending ? av - bv : bv - av;
    return (
      (b.intelligence ?? -Infinity) - (a.intelligence ?? -Infinity) ||
      (b.speed ?? -Infinity) - (a.speed ?? -Infinity) ||
      a.id.localeCompare(b.id)
    );
  });
}
export function selectChartModels(
  models: Model[],
  workload: Workload,
  order: ChartOrder,
  limit: ChartLimit,
  pinnedIds: string[] = [],
  groupConfigurations = true,
  customIds: string[] = [],
) {
  const plottable = (model: Model) =>
    model.intelligence !== null && model.speed !== null;
  const available = models.filter(plottable);
  const empty = {
    models: [] as Model[],
    topModels: [] as Model[],
    unplottableLeaders: [] as Model[],
    tableModels: models,
    availableCount: available.length,
    extraCount: 0,
    missingCount: models.length - available.length,
    cohortCount: 0,
  };
  if (new Set(models.map((model) => model.version)).size > 1) return empty;

  // Use the highest-intelligence configuration for consistent cross-metric
  // comparisons when grouping is enabled. No name is used as a ranking score.
  const bestConfigurations = sortByChartMetric(
    models,
    workload,
    "intelligence",
  );
  const seenConfigurations = new Set<string>();
  const chosen = new Set(customIds);
  const cohort =
    order === "custom"
      ? models.filter((model) => chosen.has(model.id))
      : groupConfigurations
        ? bestConfigurations.filter((model) => {
            const key = configurationKey(model);
            if (seenConfigurations.has(key)) return false;
            seenConfigurations.add(key);
            return true;
          })
        : models;
  const primaryMetric =
    order === "leaders" || order === "custom" ? "intelligence" : order;
  const ordered = sortByChartMetric(cohort, workload, primaryMetric);
  let top: Model[];
  if (limit === "all") top = ordered;
  else if (order === "leaders") {
    const leaders = new Map<string, Model>();
    for (const metric of ["intelligence", "speed", "benchmarkCost"] as const) {
      for (const model of sortByChartMetric(cohort, workload, metric)
        .filter((model) => metricValue(model, metric, workload) !== null)
        .slice(0, limit))
        leaders.set(model.id, model);
    }
    top = [...leaders.values()];
  } else if (order === "custom") top = ordered.slice(0, limit);
  else
    top = ordered
      .filter((model) => metricValue(model, order, workload) !== null)
      .slice(0, limit);

  const topIds = new Set(top.map((model) => model.id));
  const pins = new Set(pinnedIds);
  const extras = available.filter(
    (model) => pins.has(model.id) && !topIds.has(model.id),
  );
  // Rank before checking axes. A leading model with missing speed must be
  // disclosed and kept in the table, rather than silently replaced.
  return {
    models: [...top.filter(plottable), ...extras],
    topModels: top,
    unplottableLeaders: top.filter((model) => !plottable(model)),
    tableModels: [
      ...top,
      ...sortByChartMetric(models, workload, primaryMetric).filter(
        (model) => !topIds.has(model.id),
      ),
    ],
    availableCount: available.length,
    extraCount: extras.length,
    missingCount: models.length - available.length,
    cohortCount: cohort.length,
  };
}
