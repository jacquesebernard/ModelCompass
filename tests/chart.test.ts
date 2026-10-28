import { test } from "node:test";
import assert from "node:assert/strict";
import { selectChartModels, sortByChartMetric } from "../shared/chart";
import { defaultWorkload, type Model } from "../shared/types";
import { demoModels } from "../server/fixtures";

const models: Model[] = Array.from({ length: 25 }, (_, index) => ({
  ...demoModels[0],
  id: `synthetic-${index}`,
  name: `Fictional ${index}`,
  intelligence: 30 + index,
  speed: 50 + ((index * 37) % 290),
  inputPrice: 1 + ((index * 13) % 24),
  outputPrice: 2 + ((index * 13) % 24),
}));
test("raw-metric chart ordering never uses the model name or a combined fit score", () => {
  const candidates = [
    {
      ...models[0],
      id: "intelligence",
      name: "Z premium",
      intelligence: 99,
      speed: 1,
      inputPrice: 100,
      outputPrice: 100,
      benchmarkCost: 10,
    },
    {
      ...models[0],
      id: "speed",
      name: "A fast",
      intelligence: 10,
      speed: 1000,
      inputPrice: 1,
      outputPrice: 1,
      benchmarkCost: 2,
    },
    {
      ...models[0],
      id: "benchmark",
      name: "M benchmark",
      intelligence: 50,
      speed: 50,
      inputPrice: 20,
      outputPrice: 20,
      benchmarkCost: 0.001,
    },
    {
      ...models[0],
      id: "workload",
      name: "B workload",
      intelligence: 60,
      speed: 20,
      inputPrice: 0.001,
      outputPrice: 0.001,
      benchmarkCost: 5,
    },
  ];
  for (const [metric, expected] of [
    ["intelligence", "intelligence"],
    ["speed", "speed"],
    ["benchmarkCost", "benchmark"],
    ["workloadCost", "workload"],
  ] as const) {
    assert.equal(
      selectChartModels(candidates, defaultWorkload, metric, 10, [], false)
        .topModels[0].id,
      expected,
    );
    const renamed = candidates
      .map((model, index) => ({ ...model, name: `Renamed ${3 - index}` }))
      .reverse();
    assert.deepEqual(
      sortByChartMetric(candidates, defaultWorkload, metric).map(
        (model) => model.id,
      ),
      sortByChartMetric(renamed, defaultWorkload, metric).map(
        (model) => model.id,
      ),
    );
  }
});
test("configuration grouping keeps the best intelligence configuration while preserving distinct models and explicit pins", () => {
  const candidates = [
    {
      ...models[0],
      id: "low",
      name: "Fictional Core (Low)",
      intelligence: 60,
      speed: 300,
    },
    {
      ...models[0],
      id: "high",
      name: "Fictional Core (Max, Default Fallback)",
      intelligence: 90,
      speed: 50,
    },
    {
      ...models[0],
      id: "mini",
      name: "Fictional Core Mini (High)",
      intelligence: 70,
    },
    {
      ...models[0],
      id: "other-creator",
      name: "Fictional Core (Max)",
      creator: "Another Creator",
      intelligence: 80,
    },
    {
      ...models[0],
      id: "dated",
      name: "Fictional Core (2025-01)",
      intelligence: 65,
    },
  ];
  const grouped = selectChartModels(
    candidates,
    defaultWorkload,
    "intelligence",
    10,
  );
  assert.equal(grouped.topModels.length, 4);
  assert.equal(grouped.topModels[0].id, "high");
  assert.ok(!grouped.topModels.some((model) => model.id === "low"));
  assert.equal(
    selectChartModels(
      candidates,
      defaultWorkload,
      "intelligence",
      10,
      [],
      false,
    ).topModels.length,
    5,
  );
  const pinned = selectChartModels(
    candidates,
    defaultWorkload,
    "intelligence",
    10,
    ["low"],
  );
  assert.ok(pinned.models.some((model) => model.id === "low"));
  assert.equal(pinned.extraCount, 1);
});
test("metric leaders combine each numeric leaderboard and disclose leaders missing chart axes", () => {
  const candidates = Array.from({ length: 30 }, (_, index) => ({
    ...models[0],
    id: `candidate-${index}`,
    name: `Fictional Leader ${index}`,
    intelligence: index,
    speed: 30 - index,
    benchmarkCost: Math.abs(index - 15),
  }));
  const result = selectChartModels(candidates, defaultWorkload, "leaders", 10);
  const expected = new Set(
    ["intelligence", "speed", "benchmarkCost"].flatMap((metric) =>
      sortByChartMetric(
        candidates,
        defaultWorkload,
        metric as "intelligence" | "speed" | "benchmarkCost",
      )
        .slice(0, 10)
        .map((model) => model.id),
    ),
  );
  assert.deepEqual(
    new Set(result.topModels.map((model) => model.id)),
    expected,
  );
  assert.equal(
    new Set(result.models.map((model) => model.id)).size,
    result.models.length,
  );
  const missing = {
    ...models[0],
    id: "missing-speed",
    name: "Fictional Unmeasured Leader",
    intelligence: 100,
    speed: null,
  };
  const leaders = selectChartModels(
    [...models, missing],
    defaultWorkload,
    "intelligence",
    10,
  );
  assert.equal(leaders.topModels.length, 10);
  assert.equal(leaders.topModels[0].id, missing.id);
  assert.equal(leaders.models.length, 9);
  assert.equal(leaders.unplottableLeaders[0].id, missing.id);
  assert.equal(leaders.tableModels[0].id, missing.id);
});
test("missing benchmark cost is excluded from a cost leaderboard and never replaced by token prices", () => {
  const candidates = [
    {
      ...models[0],
      id: "unknown",
      name: "Fictional Unknown",
      benchmarkCost: null,
      inputPrice: 0,
      outputPrice: 0,
    },
    { ...models[1], id: "zero", name: "Fictional Zero", benchmarkCost: 0 },
    {
      ...models[2],
      id: "priced",
      name: "Fictional Priced",
      benchmarkCost: 0.1,
    },
  ];
  const view = selectChartModels(
    candidates,
    defaultWorkload,
    "benchmarkCost",
    10,
  );
  assert.deepEqual(
    view.topModels.map((model) => model.id),
    ["zero", "priced"],
  );
  assert.equal(
    selectChartModels(candidates, defaultWorkload, "benchmarkCost", "all")
      .topModels.length,
    3,
  );
});
test("a custom cohort includes exact configurations independently of comparison limits and grouping", () => {
  const candidates = [
    ...models,
    {
      ...models[0],
      id: "configured-low",
      name: "Fictional Core (Low)",
      intelligence: 80,
    },
    {
      ...models[1],
      id: "configured-high",
      name: "Fictional Core (Max)",
      intelligence: 90,
    },
  ];
  const ids = [
    ...models.slice(0, 4).map((model) => model.id),
    "configured-low",
    "configured-high",
    "unknown-id",
  ];
  const custom = selectChartModels(
    candidates,
    defaultWorkload,
    "custom",
    "all",
    [],
    true,
    ids,
  );
  assert.equal(custom.topModels.length, 6);
  assert.equal(custom.models.length, 6);
  assert.ok(custom.models.some((model) => model.id === "configured-low"));
  assert.ok(custom.models.some((model) => model.id === "configured-high"));
  assert.equal(custom.topModels[0].id, "configured-high");
  assert.equal(
    selectChartModels(
      candidates.filter((model) => model.id !== "configured-low"),
      defaultWorkload,
      "custom",
      "all",
      [],
      true,
      ids,
    ).topModels.length,
    5,
  );
});
test("chart limits apply to plottable matches, include All, and do not mutate the dataset", () => {
  for (const limit of [10, 15, 20, "all"] as const) {
    const result = selectChartModels(
      models,
      defaultWorkload,
      "intelligence",
      limit,
    );
    assert.equal(result.models.length, limit === "all" ? 25 : limit);
    assert.equal(result.availableCount, 25);
    assert.equal(result.extraCount, 0);
  }
  assert.equal(models.length, 25);
  assert.equal(models[0].id, "synthetic-0");
  assert.equal(
    selectChartModels([], defaultWorkload, "intelligence", 15).models.length,
    0,
  );
});
test("selected and recommended matches outside the limit stay visible once, without bypassing missing metrics or filters", () => {
  const top = selectChartModels(models, defaultWorkload, "intelligence", 10);
  const extra = models.find(
    (model) => !top.models.some((shown) => shown.id === model.id),
  )!;
  const unavailable = { ...models[0], id: "unavailable", speed: null };
  const result = selectChartModels(
    [...models, unavailable],
    defaultWorkload,
    "intelligence",
    10,
    [top.models[0].id, extra.id, extra.id, unavailable.id, "unknown"],
  );
  assert.equal(result.models.length, 11);
  assert.equal(result.extraCount, 1);
  assert.equal(result.missingCount, 1);
  assert.ok(result.models.some((model) => model.id === extra.id));
  assert.equal(
    result.models.filter((model) => model.id === extra.id).length,
    1,
  );
  const filtered = models.filter((model) => model.id !== extra.id);
  assert.ok(
    !selectChartModels(filtered, defaultWorkload, "intelligence", 10, [
      extra.id,
    ]).models.some((model) => model.id === extra.id),
  );
});
test("chart top ordering uses raw metrics and refuses incompatible benchmark versions", () => {
  const candidates = [
    {
      ...models[0],
      id: "intelligence",
      name: "Z strongest",
      intelligence: 99,
      speed: 10,
      inputPrice: 20,
      outputPrice: 20,
    },
    {
      ...models[0],
      id: "budget",
      name: "A cheapest",
      intelligence: 50,
      speed: 20,
      inputPrice: 0.1,
      outputPrice: 0.1,
    },
    {
      ...models[0],
      id: "fast",
      name: "M fastest",
      intelligence: 70,
      speed: 300,
      inputPrice: 5,
      outputPrice: 5,
    },
  ];
  assert.equal(
    selectChartModels(candidates, defaultWorkload, "intelligence", 10).models[0]
      .id,
    "intelligence",
  );
  assert.equal(
    selectChartModels(candidates, defaultWorkload, "workloadCost", 10).models[0]
      .id,
    "budget",
  );
  assert.equal(
    selectChartModels(candidates, defaultWorkload, "speed", 10).models[0].id,
    "fast",
  );
  assert.deepEqual(
    selectChartModels(
      [
        ...models,
        { ...models[0], id: "different", version: "incompatible-v2" },
      ],
      defaultWorkload,
      "intelligence",
      10,
    ).models,
    [],
  );
});
