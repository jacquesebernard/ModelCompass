import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SnapshotCache } from "../server/cache";
import { demoModels } from "../server/fixtures";
import { extractPayload, normalizePage } from "../server/normalize";
import {
  readOnly,
  validateToolArguments,
  type Tool,
  type DataSource,
} from "../server/mcp";
import {
  renderGroundedExplanation,
  bindExplanationSlots,
  createAdvisor,
  enforceExplicitBudget,
  type AdvisorProvider,
} from "../server/advisor";
import { createApp } from "../server/app";
import { config } from "../server/config";
import { rankModels, manualRequirements } from "../shared/engine";
import {
  defaultFilters,
  defaultWorkload,
  type Snapshot,
} from "../shared/types";

test("explicit USD budgets remain hard constraints when the chat model omits or changes them", () => {
  const defaults = manualRequirements("speed");
  const guarded = enforceExplicitBudget(
    defaults,
    "Use 1,000 requests per month with a budget of 5 USD per month.",
  );
  assert.deepEqual(guarded.budget, { amount: 5, period: "month" });
  assert.ok(
    guarded.assumptions.some((a) => a.includes("explicit USD 5 per month")),
  );
  assert.deepEqual(
    enforceExplicitBudget(
      { ...defaults, budget: { amount: 2, period: "request" } },
      "Summarize reports for less than $20 a day.",
    ).budget,
    { amount: 20, period: "day" },
  );
  assert.equal(
    enforceExplicitBudget(defaults, "This provider charges $5 per month.")
      .budget,
    null,
  );
  assert.equal(
    enforceExplicitBudget(defaults, "Budget under $10.").budget,
    null,
  );
  assert.equal(
    enforceExplicitBudget(defaults, "Budget is $5 per day or $100 per month.")
      .budget,
    null,
  );
});
const snapshot = (time: number): Snapshot => ({
  models: demoModels.map((m) => ({ ...m, source: "artificial-analysis" })),
  fetchedAt: new Date(time).toISOString(),
  tier: "synthetic-test-account",
  warnings: [],
});
// Fake response with entirely synthetic numbers, shaped like the documented API.
const payload = {
  tier: "synthetic-test",
  intelligence_index_version: 99.1,
  pagination: { page: 1, total_pages: 1, has_more: false },
  data: [
    {
      id: "synthetic-model",
      name: "Fictional Test Model",
      model_creator: { name: "Test Creator" },
      evaluations: {
        artificial_analysis_intelligence_index: 70,
        artificial_analysis_coding_index: 80,
      },
      pricing: { price_1m_input_tokens: 1, price_1m_output_tokens: 2 },
      performance: {
        median_output_tokens_per_second: 100,
        median_time_to_first_token_seconds: 0.5,
      },
      artificial_analysis_intelligence_index_cost: {
        cost_per_task: { total_cost: 0.01 },
      },
    },
  ],
};
test("normalization preserves version and benchmark units and accepts structured or JSON-text MCP envelopes", () => {
  for (const result of [
    { structuredContent: payload },
    { content: [{ type: "text", text: JSON.stringify(payload) }] },
  ]) {
    const { snapshot: s } = normalizePage(extractPayload(result));
    const model = s.models[0];
    assert.equal(model.version, "v99.1");
    assert.equal(model.benchmarkCost, 0.01);
    assert.equal(model.inputPrice, 1);
    assert.equal(model.speed, 100);
    assert.equal(model.taskScores.coding.value, 80);
  }
  const missing = structuredClone(payload);
  delete (missing.data[0] as { pricing?: unknown }).pricing;
  assert.equal(normalizePage(missing).snapshot.models[0].inputPrice, null);
  assert.throws(() => normalizePage({ ...payload, data: [] }));
  assert.throws(() => extractPayload({ isError: true, content: [] }));
  assert.throws(() =>
    extractPayload({ structuredContent: { invented_field: [] } }),
  );
});
test("cache coalesces requests, atomically persists successes and preserves last-known-good on failure", async () => {
  let now = Date.parse("2026-01-01T00:00:00Z"),
    calls = 0,
    fail = false;
  const directory = await mkdtemp(join(tmpdir(), "model-compass-cache-"));
  const path = join(directory, "snapshot.json");
  const cache = new SnapshotCache({
    intervalMs: 60000,
    path,
    now: () => now,
    load: async () => {
      calls++;
      if (fail) throw new Error("secret upstream text");
      return snapshot(now);
    },
  });
  const first = await Promise.all([cache.get(), cache.get(), cache.get()]);
  assert.equal(calls, 1);
  assert.equal(first[0].state, "connected");
  const restored = new SnapshotCache({
    intervalMs: 60000,
    path,
    now: () => now,
    load: async () => {
      calls++;
      throw new Error("Fresh cache must avoid network calls");
    },
  });
  const restoredResults = await Promise.all([
    restored.get(),
    restored.get(),
    restored.get(),
  ]);
  assert.ok(restoredResults.every((result) => result.state === "connected"));
  assert.equal(calls, 1);
  assert.equal(
    JSON.parse(await readFile(path, "utf8")).fetchedAt,
    first[0].snapshot!.fetchedAt,
  );
  now += 61000;
  fail = true;
  const stale = await cache.get();
  assert.equal(stale.state, "stale");
  assert.equal(stale.snapshot!.fetchedAt, first[0].snapshot!.fetchedAt);
  assert.ok(!JSON.stringify(stale).includes("secret upstream"));
  const restarted = new SnapshotCache({
    intervalMs: 60000,
    path,
    now: () => now,
    load: async () => {
      throw new Error("offline");
    },
  });
  assert.equal((await restarted.get()).state, "stale");
  assert.equal(
    JSON.parse(await readFile(path, "utf8")).fetchedAt,
    first[0].snapshot!.fetchedAt,
  );
  now += 61000;
  fail = false;
  assert.equal((await cache.get()).state, "connected");
});
test("no snapshot on a failed first request; invalid cache and invalid refresh never become live data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "model-compass-invalid-"));
  const path = join(directory, "snapshot.json");
  await writeFile(path, '{"bad":"cache"}');
  const cache = new SnapshotCache({
    intervalMs: 60000,
    path,
    load: async () => {
      throw new Error("offline");
    },
  });
  assert.equal((await cache.get()).state, "disconnected");
  assert.equal((await cache.get()).snapshot, null);
  const synthetic = new SnapshotCache({
    intervalMs: 60000,
    load: async () => ({ ...snapshot(Date.now()), models: demoModels }),
  });
  assert.equal((await synthetic.get()).state, "disconnected");
});
test("MCP arguments use discovered schemas and only read-only tools are callable", () => {
  const tool: Tool = {
    name: "get_synthetic_test",
    eligible: true,
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: { page: { type: "integer", minimum: 1 } },
      required: ["page"],
      additionalProperties: false,
    },
  };
  assert.equal(readOnly(tool), true);
  validateToolArguments(tool, { page: 1 });
  assert.throws(() => validateToolArguments(tool, { page: "one" }));
  assert.throws(() => validateToolArguments(tool, { page: 1, extra: "x" }));
  assert.equal(
    readOnly({ ...tool, annotations: { readOnlyHint: false } }),
    false,
  );
  assert.throws(() =>
    validateToolArguments({ ...tool, eligible: false }, { page: 1 }),
  );
  assert.equal(readOnly({ name: "delete_model", inputSchema: {} }), false);
});
test("AI explanations cannot introduce model names, IDs, metrics or uncontrolled prose", () => {
  const ranking = rankModels(demoModels, manualRequirements("balanced"));
  const explanations = ranking.recommendations.map((r) => ({
    modelId: r.modelId,
    fit: "balanced",
    caveat: "test_your_task",
  }));
  assert.match(
    renderGroundedExplanation(
      { introduction: "Ready to compare.", explanations },
      ranking,
      demoModels,
    ),
    /representative examples/,
  );
  assert.throws(() =>
    renderGroundedExplanation(
      {
        introduction: "Ready to compare.",
        explanations: [
          { modelId: "made-up", fit: "balanced", caveat: "test_your_task" },
        ],
      },
      ranking,
      demoModels,
    ),
  );
  assert.throws(() =>
    renderGroundedExplanation(
      {
        introduction: "Ready to compare.",
        explanations: explanations.map((x) => ({
          ...x,
          fit: "Guaranteed 100% accuracy",
        })),
      },
      ranking,
      demoModels,
    ),
  );
});
test("explanation slots bind trusted candidate IDs and reject missing, extra or fabricated fields", () => {
  const ranking = rankModels(demoModels, manualRequirements("balanced"));
  const slots = Object.fromEntries(
    ranking.recommendations.map((_rec, index) => [
      `candidate_${index + 1}`,
      { fit: "balanced", caveat: "test_your_task" },
    ]),
  );
  assert.ok(
    bindExplanationSlots(slots, ranking, demoModels).includes(
      demoModels.find((m) => m.id === ranking.recommendations[0].modelId)!.name,
    ),
  );
  assert.throws(() =>
    bindExplanationSlots(
      { ...slots, candidate_99: { fit: "cost", caveat: "cost_exclusions" } },
      ranking,
      demoModels,
    ),
  );
  assert.throws(() =>
    bindExplanationSlots(
      { ...slots, candidate_1: { ...slots.candidate_1, modelId: "invented" } },
      ranking,
      demoModels,
    ),
  );
  assert.throws(() => bindExplanationSlots({}, ranking, demoModels));
});
test("an empty shortlist gets a grounded explanation without a provider request", async () => {
  const old = {
    configured: config.advisorConfigured,
    key: config.ADVISOR_API_KEY,
    model: config.ADVISOR_MODEL,
  };
  config.advisorConfigured = true;
  config.ADVISOR_API_KEY = "synthetic-unit-test-key";
  config.ADVISOR_MODEL = "synthetic-test-model";
  try {
    const result = await createAdvisor()!.explain(
      rankModels([], manualRequirements("balanced")),
      [],
      new AbortController().signal,
      () => {},
    );
    assert.match(result, /No model meets every constraint/);
  } finally {
    config.advisorConfigured = old.configured;
    config.ADVISOR_API_KEY = old.key;
    config.ADVISOR_MODEL = old.model;
  }
});
test("local API supports demo, filtering, ranking, honest missing-credential states, and input protection", async () => {
  const old = { mode: config.mode, key: config.AA_API_KEY };
  config.mode = "demo";
  config.AA_API_KEY = "";
  try {
    const app = createApp(undefined, null);
    const data = await request(app).get("/api/models");
    assert.equal(data.status, 200);
    assert.equal(data.body.mode, "demo");
    assert.ok(
      data.body.snapshot.models.every(
        (m: { source: string }) => m.source === "synthetic",
      ),
    );
    const input = {
      filters: defaultFilters,
      workload: defaultWorkload,
      priority: "balanced",
      costMode: "workload",
    };
    const ranked = await request(app).post("/api/rank").send(input);
    assert.equal(ranked.status, 200);
    assert.ok(ranked.body.recommendations.length > 0);
    assert.ok(ranked.body.recommendations.length <= 3);
    const filtered = await request(app)
      .post("/api/rank")
      .send({
        ...input,
        filters: { ...defaultFilters, minIntelligence: 1000 },
      });
    assert.equal(filtered.body.recommendations.length, 0);
    assert.equal(
      (
        await request(app)
          .post("/api/rank")
          .send({
            ...input,
            workload: { ...defaultWorkload, inputTokens: -10 },
          })
      ).status,
      400,
    );
    assert.equal(
      (await request(app).post("/api/advisor").send({})).status,
      503,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/mode")
          .set("Origin", "https://untrusted.test")
          .send({ mode: "live" })
      ).status,
      403,
    );
    assert.equal(
      (await request(app).get("/api/connection").set("Host", "evil.test"))
        .status,
      403,
    );
    await request(app).post("/api/mode").send({ mode: "live" });
    const live = await request(app).get("/api/models");
    assert.equal(live.body.state, "disconnected");
    assert.equal(live.body.snapshot, null);
    assert.match(live.body.error, /AA_API_KEY/);
    const connection = await request(app).get("/api/connection");
    assert.equal(connection.body.advisorConfigured, false);
    assert.ok(!JSON.stringify(connection.body).includes("ADVISOR_API_KEY"));
  } finally {
    config.mode = old.mode;
    config.AA_API_KEY = old.key;
  }
});
test("streaming advisor uses validated requirements and code rankings with a fake provider, and supports follow-up turns", async () => {
  const old = config.mode;
  config.mode = "demo";
  try {
    let followup = true;
    const advisor: AdvisorProvider = {
      interpret: async (_messages, defaults) => ({
        ...defaults,
        task: "coding",
        followUp: followup ? "What is your daily request volume?" : null,
      }),
      explain: async (r, models) => {
        validate(r, models);
        return "Synthetic test explanation.";
      },
    };
    const app = createApp(undefined, advisor);
    const input = {
      messages: [{ role: "user", content: "Help with coding" }],
      filters: defaultFilters,
      workload: defaultWorkload,
      priority: "balanced",
      costMode: "workload",
    };
    const question = await request(app).post("/api/advisor").send(input);
    assert.match(question.text, /"type":"question"/);
    assert.ok(!question.text.includes('"type":"ranking"'));
    followup = false;
    const answer = await request(app).post("/api/advisor").send(input);
    const events = answer.text
      .trim()
      .split("\n")
      .map((s) => JSON.parse(s));
    assert.ok(events.some((e) => e.type === "requirements"));
    assert.ok(events.some((e) => e.type === "ranking"));
    assert.ok(events.some((e) => e.type === "answer"));
    const rank = events.find((e) => e.type === "ranking").ranking;
    assert.equal(rank.requirements.task, "coding");
    assert.ok(
      rank.recommendations.every((r: { modelId: string }) =>
        demoModels.some((m) => m.id === r.modelId),
      ),
    );
    const broken: AdvisorProvider = {
      interpret: async () => ({
        ...manualRequirements("balanced"),
        workload: { ...defaultWorkload, inputTokens: -1 },
      }),
      explain: async () => {
        throw new Error("must not explain");
      },
    };
    const invalid = await request(createApp(undefined, broken))
      .post("/api/advisor")
      .send(input);
    assert.match(invalid.text, /"type":"error"/);
    assert.ok(!invalid.text.includes('"type":"ranking"'));
  } finally {
    config.mode = old;
  }
});
function validate(r: ReturnType<typeof rankModels>, models: typeof demoModels) {
  for (const rec of r.recommendations)
    assert.ok(models.some((m) => m.id === rec.modelId));
}
test("connection tool selection rejects undiscovered tools and invalid arguments", async () => {
  const tool: Tool = {
    name: "get_synthetic_test",
    eligible: true,
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: { page: { type: "integer" } },
      required: ["page"],
    },
  };
  const source: DataSource = {
    discover: async () => [tool],
    fetch: async () => {
      throw new Error("No live access in tests");
    },
  };
  const app = createApp(source, null);
  assert.equal(
    (
      await request(app)
        .post("/api/mcp/select")
        .send({ name: tool.name, args: { page: 1 } })
    ).status,
    400,
  );
  assert.equal((await request(app).get("/api/mcp/tools")).status, 200);
  assert.equal(
    (
      await request(app)
        .post("/api/mcp/select")
        .send({ name: tool.name, args: { page: "wrong" } })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/mcp/select")
        .send({ name: tool.name, args: { page: 1 } })
    ).status,
    200,
  );
});
