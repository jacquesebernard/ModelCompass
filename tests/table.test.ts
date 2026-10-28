import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextTableSort,
  sortTableModels,
  type TableColumn,
} from "../shared/table";
import { demoModels } from "../server/fixtures";
import { defaultWorkload } from "../shared/types";

test("table headers toggle directions and sort numeric values, zero and missing data correctly", () => {
  const models = [
    {
      ...demoModels[0],
      id: "ten",
      name: "Model 10",
      intelligence: 10,
      speed: 10,
      latency: 10,
      inputPrice: 10,
      outputPrice: 10,
      benchmarkCost: 10,
    },
    {
      ...demoModels[0],
      id: "two",
      name: "Model 2",
      intelligence: 2,
      speed: 2,
      latency: 2,
      inputPrice: 2,
      outputPrice: 2,
      benchmarkCost: 2,
    },
    {
      ...demoModels[0],
      id: "zero",
      name: "Model 0",
      intelligence: 0,
      speed: 0,
      latency: 0,
      inputPrice: 0,
      outputPrice: 0,
      benchmarkCost: 0,
    },
    {
      ...demoModels[0],
      id: "missing",
      name: "Model missing",
      intelligence: null,
      speed: null,
      latency: null,
      inputPrice: null,
      outputPrice: null,
      benchmarkCost: null,
    },
  ];
  const ids = models.map((model) => model.id);
  for (const column of [
    "intelligence",
    "speed",
    "latency",
    "inputPrice",
    "outputPrice",
    "cost",
  ] as TableColumn[]) {
    for (const direction of ["ascending", "descending"] as const) {
      const result = sortTableModels(
        models,
        defaultWorkload,
        "benchmark",
        { column, direction },
        [],
      );
      assert.deepEqual(
        result.map((model) => model.id),
        direction === "ascending"
          ? ["zero", "two", "ten", "missing"]
          : ["ten", "two", "zero", "missing"],
      );
    }
  }
  assert.deepEqual(
    sortTableModels(
      models,
      defaultWorkload,
      "workload",
      { column: "cost", direction: "ascending" },
      [],
    ).map((model) => model.id),
    ["zero", "two", "ten", "missing"],
  );
  assert.equal(
    sortTableModels(
      models,
      defaultWorkload,
      "workload",
      { column: "selected", direction: "descending" },
      ["two"],
    )[0].id,
    "two",
  );
  assert.deepEqual(
    sortTableModels(
      models,
      defaultWorkload,
      "workload",
      { column: "name", direction: "ascending" },
      [],
    ).map((model) => model.id),
    ["zero", "two", "ten", "missing"],
  );
  assert.deepEqual(
    models.map((model) => model.id),
    ids,
  );
  const initial = nextTableSort(null, "intelligence");
  assert.equal(initial.direction, "descending");
  assert.equal(nextTableSort(initial, "intelligence").direction, "ascending");
  assert.equal(nextTableSort(initial, "cost").direction, "ascending");
});
