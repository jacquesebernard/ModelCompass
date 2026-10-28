import { test } from "node:test";
import assert from "node:assert/strict";
import { demoModels } from "../server/fixtures";
import {
  estimateCost,
  estimateResponse,
  budgetCost,
  filterModels,
  manualRequirements,
  rankModels,
  validateGrounding,
  percentile,
  bubbleRadius,
} from "../shared/engine";
import {
  defaultFilters,
  defaultWorkload,
  workloadSchema,
  requirementsSchema,
  type Model,
} from "../shared/types";
const m = (patch: Partial<Model> = {}): Model => ({
  ...demoModels[0],
  ...patch,
});
test("token estimate uses per-million units then volume, including zero-price tokens", () => {
  assert.equal(
    estimateCost(m({ inputPrice: 2, outputPrice: 8 }), {
      inputTokens: 1000,
      outputTokens: 500,
      requests: 200,
      period: "day",
    }),
    1.2,
  );
  assert.equal(
    estimateCost(m({ inputPrice: 0, outputPrice: 0 }), defaultWorkload),
    0,
  );
  assert.equal(estimateCost(m({ inputPrice: null }), defaultWorkload), null);
});
test("budgets convert units explicitly and never invent daily usage from a request", () => {
  const model = m({ inputPrice: 2, outputPrice: 8 });
  const workload = {
    inputTokens: 1000,
    outputTokens: 500,
    requests: 200,
    period: "day" as const,
  };
  assert.equal(budgetCost(model, workload, "request"), 0.006);
  assert.equal(budgetCost(model, workload, "month"), 36);
  assert.equal(
    budgetCost(model, { ...workload, requests: 6000, period: "month" }, "day"),
    1.2,
  );
  assert.equal(
    budgetCost(model, { ...workload, period: "request" }, "day"),
    null,
  );
});
test("complete response estimate requires measured latency and nonzero throughput", () => {
  assert.equal(
    estimateResponse(m({ latency: 0.5, speed: 100 }), {
      ...defaultWorkload,
      outputTokens: 500,
    }),
    5.5,
  );
  assert.equal(estimateResponse(m({ latency: null }), defaultWorkload), null);
  assert.equal(estimateResponse(m({ speed: 0 }), defaultWorkload), null);
});
test("all active filters are hard constraints, with missing metrics excluded only when required", () => {
  const rows = [
    m({ id: "a", intelligence: 80, speed: 100, inputPrice: 1, outputPrice: 1 }),
    m({ id: "b", intelligence: null, speed: 200, inputPrice: null }),
    m({ id: "c", intelligence: 60, speed: 200 }),
  ];
  assert.equal(
    filterModels(rows, defaultFilters, defaultWorkload, "workload").length,
    3,
  );
  assert.deepEqual(
    filterModels(
      rows,
      { ...defaultFilters, minIntelligence: 75, minSpeed: 90, maxCost: 3 },
      defaultWorkload,
      "workload",
    ).map((m) => m.id),
    ["a"],
  );
  assert.equal(
    filterModels(
      rows,
      { ...defaultFilters, maxCost: 0.001 },
      defaultWorkload,
      "workload",
    ).length,
    0,
  );
  assert.equal(
    filterModels(
      [m({ benchmarkCost: null, inputPrice: 0, outputPrice: 0 })],
      { ...defaultFilters, maxCost: 1 },
      defaultWorkload,
      "benchmark",
    ).length,
    0,
  );
});
test("ranking applies budget, response time, quality, speed and capabilities before scoring", () => {
  const rows = [
    m({
      id: "ok",
      intelligence: 80,
      speed: 100,
      latency: 0,
      inputPrice: 0.1,
      outputPrice: 0.1,
      capabilities: ["json"],
    }),
    m({ id: "costly", inputPrice: 100 }),
    m({ id: "unknown", latency: null, capabilities: [] }),
  ];
  const r = {
    ...manualRequirements("balanced"),
    minIntelligence: 70,
    minSpeed: 80,
    maxResponseSeconds: 6,
    budget: { amount: 1, period: "month" as const },
    requiredCapabilities: ["json"],
  };
  const result = rankModels(rows, r);
  assert.equal(result.eligible, 1);
  assert.deepEqual(
    result.recommendations.map((r) => r.modelId),
    ["ok"],
  );
  assert.equal(
    rankModels(rows, { ...r, budget: { amount: 0, period: "month" } })
      .recommendations.length,
    0,
  );
});
test("percentile ranking limits outliers, gives ties the same score and missing metrics no credit", () => {
  assert.equal(percentile(2, [1, 2, 1e20]), 0.5);
  assert.equal(percentile(2, [1, 2, 2, 3]), 0.5);
  assert.equal(percentile(null, [1, 2], true), 0);
  const rows = [
    m({
      id: "quality",
      intelligence: 99,
      speed: 10,
      inputPrice: 20,
      outputPrice: 20,
    }),
    m({
      id: "budget",
      intelligence: 50,
      speed: 20,
      inputPrice: 0.1,
      outputPrice: 0.1,
    }),
    m({
      id: "fast",
      intelligence: 70,
      speed: 300,
      inputPrice: 5,
      outputPrice: 5,
    }),
  ];
  assert.equal(
    rankModels(rows, manualRequirements("quality")).recommendations[0].modelId,
    "quality",
  );
  assert.equal(
    rankModels(rows, manualRequirements("cost")).recommendations[0].modelId,
    "budget",
  );
  assert.equal(
    rankModels(rows, manualRequirements("speed")).recommendations[0].modelId,
    "fast",
  );
  assert.deepEqual(
    rankModels([...rows].reverse(), manualRequirements("balanced")),
    rankModels(rows, manualRequirements("balanced")),
  );
});
test("task scores are used only when all eligible candidates have compatible task context", () => {
  const rows = [
    m({
      id: "a",
      intelligence: 90,
      taskScores: { coding: { value: 10, version: "code-v1" } },
    }),
    m({
      id: "b",
      intelligence: 70,
      taskScores: { coding: { value: 90, version: "code-v1" } },
    }),
  ];
  const r = { ...manualRequirements("quality"), task: "coding" as const };
  assert.equal(rankModels(rows, r).recommendations[0].modelId, "b");
  const mixed = [
    rows[0],
    { ...rows[1], taskScores: { coding: { value: 90, version: "code-v2" } } },
  ];
  assert.equal(rankModels(mixed, r).recommendations[0].modelId, "a");
  assert.match(rankModels(mixed, r).notes[0], /proxy/);
  assert.equal(
    rankModels([m(), m({ id: "other", version: "v2" })], r).recommendations
      .length,
    0,
  );
});
test("recommendations use cheaper and faster viable alternatives, allowing shared roles", () => {
  const rows = [
    m({
      id: "best",
      intelligence: 90,
      speed: 100,
      inputPrice: 2,
      outputPrice: 2,
    }),
    m({
      id: "cheap",
      intelligence: 80,
      speed: 80,
      inputPrice: 1,
      outputPrice: 1,
    }),
    m({
      id: "fast",
      intelligence: 80,
      speed: 200,
      inputPrice: 3,
      outputPrice: 3,
    }),
  ];
  const result = rankModels(rows, manualRequirements("quality"));
  assert.deepEqual(
    result.recommendations.map((r) => r.modelId),
    ["best", "cheap", "fast"],
  );
  const singleton = rankModels([rows[0]], manualRequirements("balanced"));
  assert.equal(singleton.recommendations.length, 1);
  assert.equal(singleton.recommendations[0].roles.length, 3);
});
test("grounding rejects unknown IDs, duplicate candidates, and fabricated metrics", () => {
  const valid = rankModels(demoModels, manualRequirements("balanced"));
  validateGrounding(valid, demoModels);
  const fake = structuredClone(valid);
  fake.recommendations[0].modelId = "invented";
  assert.throws(() => validateGrounding(fake, demoModels));
  const tampered = structuredClone(valid);
  tampered.recommendations[0].cost = 0;
  assert.throws(() => validateGrounding(tampered, demoModels));
  const wrongScore = structuredClone(valid);
  wrongScore.recommendations[0].score = 10000;
  assert.throws(() => validateGrounding(wrongScore, demoModels));
  const duplicate = structuredClone(valid);
  duplicate.recommendations = [
    valid.recommendations[0],
    valid.recommendations[0],
  ];
  assert.throws(() => validateGrounding(duplicate, demoModels));
});
test("bubble area, rather than radius, scales linearly to cost", () => {
  const a = bubbleRadius(1, 4),
    b = bubbleRadius(4, 4);
  assert.equal((b * b) / (a * a), 4);
  assert.equal(bubbleRadius(0, 4), 0);
  assert.equal(bubbleRadius(4, 4), 12);
  assert.equal(bubbleRadius(400, 4), 12);
  assert.equal(bubbleRadius(4, 4, 9), 9);
  assert.equal(bubbleRadius(1, 0), 0);
  assert.equal(bubbleRadius(-1, 4), 0);
});
test("external requirements and workloads reject invalid numbers and units", () => {
  assert.equal(
    workloadSchema.safeParse({ ...defaultWorkload, inputTokens: -1 }).success,
    false,
  );
  assert.equal(
    workloadSchema.safeParse({ ...defaultWorkload, period: "year" }).success,
    false,
  );
  assert.equal(
    requirementsSchema.safeParse({
      ...manualRequirements("balanced"),
      budget: { amount: -20, period: "day" },
    }).success,
    false,
  );
});
