import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fetchModelSnapshot,
  mergeProjectedPages,
  nextPageArguments,
  type Tool,
} from "../server/mcp";
import { normalizePage } from "../server/normalize";
import { manualRequirements, rankModels } from "../shared/engine";

const tool: Tool = {
  name: "aa_language_models_free",
  eligible: true,
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "object",
        properties: { page: { type: "integer", minimum: 1 } },
        additionalProperties: false,
      },
      fields: { type: "array", items: { type: "string" } },
      limit_chars: { type: "integer", maximum: 75000 },
    },
    additionalProperties: false,
  },
};
function projection(page: number, group: number) {
  const id = `synthetic-page-${page}`;
  const parts = [
    {
      id,
      name: `Fictional Model ${page}`,
      model_creator: { name: "Synthetic Creator" },
      evaluations: { artificial_analysis_intelligence_index: 70 },
      performance: {
        median_output_tokens_per_second: 100,
        median_time_to_first_token_seconds: 0.5,
      },
    },
    {
      id,
      pricing: { price_1m_input_tokens: 1, price_1m_output_tokens: 2 },
      artificial_analysis_intelligence_index_cost: {
        cost_per_task: { total_cost: 0.01 },
      },
    },
    {
      id,
      evaluations: {
        artificial_analysis_coding_index: 80,
        artificial_analysis_agentic_index: 60,
        artificial_analysis_finance_and_accounting_index: 50,
      },
    },
    {
      id,
      evaluations: {
        artificial_analysis_legal_index: 40,
        artificial_analysis_engineering_index: 55,
      },
    },
  ];
  return {
    tier: "synthetic-test",
    intelligence_index_version: 99.1,
    pagination: { page, page_size: 1, total_pages: 2, has_more: page === 1 },
    data: [parts[group]],
  };
}
test("MCP paginates query.page and joins every field projection before returning a complete snapshot", async () => {
  const pages: number[] = [];
  const client: Parameters<typeof fetchModelSnapshot>[0] = {
    callTool: async (params) => {
      const args = params.arguments!;
      const page = (args.query as { page: number }).page;
      const group = pages.length % 4;
      pages.push(page);
      assert.equal(params.name, tool.name);
      assert.equal(args.limit_chars, 75000);
      assert.ok((args.fields as string[]).includes("pagination"));
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(projection(page, group)),
          },
          { type: "text" as const, text: "Synthetic quota metadata" },
        ],
      };
    },
  };
  const result = await fetchModelSnapshot(
    client,
    tool,
    { query: { page: 1 } },
    new AbortController().signal,
  );
  assert.deepEqual(pages, [1, 1, 1, 1, 2, 2, 2, 2]);
  assert.equal(result.models.length, 2);
  for (const model of result.models) {
    assert.equal(model.speed, 100);
    assert.equal(model.inputPrice, 1);
    assert.equal(model.benchmarkCost, 0.01);
    assert.equal(model.taskScores.coding.value, 80);
    assert.equal(model.taskScores.legal.value, 40);
    assert.match(model.taskScores.coding.version, /v99.1/);
    assert.equal(model.taskScores.legal.version, "unversioned");
  }
  assert.ok(
    result.warnings.some((w) => w.includes("capability-index versions")),
  );
  assert.ok(
    rankModels(result.models, {
      ...manualRequirements("balanced"),
      task: "legal",
    }).notes.some((n) => n.includes("proxy")),
  );
});
test("a failed projection on a later page rejects the refresh instead of returning partial model data", async () => {
  let calls = 0;
  const client: Parameters<typeof fetchModelSnapshot>[0] = {
    callTool: async (params) => {
      const group = calls++ % 4;
      if (calls === 6) throw new Error("Synthetic upstream failure");
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              projection(
                (params.arguments!.query as { page: number }).page,
                group,
              ),
            ),
          },
        ],
      };
    },
  };
  await assert.rejects(
    () =>
      fetchModelSnapshot(
        client,
        tool,
        { query: { page: 1 } },
        new AbortController().signal,
      ),
    /upstream failure/,
  );
});
test("MCP projections must have matching IDs, versions, pagination, and complete pages", () => {
  const first = projection(1, 0),
    second = projection(1, 1);
  assert.equal(
    (mergeProjectedPages([first, second]) as { data: unknown[] }).data.length,
    1,
  );
  const differentIds = structuredClone(second);
  differentIds.data[0].id = "not-in-first-projection";
  assert.throws(() => mergeProjectedPages([first, differentIds]), /Model IDs/);
  assert.throws(
    () =>
      mergeProjectedPages([
        first,
        { ...second, intelligence_index_version: 100 },
      ]),
    /metadata changed/,
  );
  assert.throws(
    () => mergeProjectedPages([first, { ...second, data: [] }]),
    /Incomplete/,
  );
  assert.throws(
    () =>
      normalizePage({
        ...first,
        pagination: { ...first.pagination, page_size: 2 },
      }),
    /incomplete page/,
  );
  const dangerous = JSON.parse(
    '{"id":"synthetic-page-1","__proto__":{"polluted":true}}',
  );
  assert.throws(
    () => mergeProjectedPages([first, { ...second, data: [dangerous] }]),
    /Unsafe/,
  );
});
test("MCP page arguments preserve operator options and reject missing pagination schemas", () => {
  assert.deepEqual(
    nextPageArguments(tool, { query: { page: 1 }, limit_chars: 75000 }, 2),
    { query: { page: 2 }, limit_chars: 75000 },
  );
  assert.deepEqual(
    nextPageArguments(
      { ...tool, inputSchema: { properties: { page: { type: "integer" } } } },
      { page: 1 },
      2,
    ),
    { page: 2 },
  );
  assert.throws(
    () =>
      nextPageArguments({ ...tool, inputSchema: { type: "object" } }, {}, 2),
    /neither/,
  );
});
