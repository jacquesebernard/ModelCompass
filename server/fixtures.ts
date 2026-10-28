import type { Model, Snapshot } from "../shared/types";
// Entirely fictional names, creators and numbers. Not an AA API response.
const rows: [
  string,
  string,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
][] = [
  ["Atlas Pro", "Northstar", 83, 72, 2.5, 12, 0.088, 0.7, 81],
  ["Atlas Mini", "Northstar", 62, 194, 0.2, 0.8, 0.012, 0.28, 55],
  ["Lyra Reason", "Lumen", 88, 49, 3, 15, 0.12, 1.2, 91],
  ["Lyra Swift", "Lumen", 67, 228, 0.35, 1.4, 0.017, 0.22, 60],
  ["Cedar One", "Canopy", 76, 121, 1.1, 4.4, 0.043, 0.48, 78],
  ["Cedar Nano", "Canopy", 48, 285, 0.08, 0.25, 0.004, 0.15, 39],
  ["Orion Code", "Meridian", 80, 96, 0.7, 3.5, 0.035, 0.52, 89],
  ["Orion Lite", "Meridian", 59, 245, 0.15, 0.6, 0.009, 0.2, 57],
  ["Nova Focus", "Lumen", 72, 168, 0.5, 2, 0.025, 0.32, 69],
  ["Summit Max", "Northstar", 92, 34, 8, 24, 0.24, 1.8, 94],
  ["Cedar Plus", "Canopy", 79, 116, 1.5, 6, 0.055, 0.55, 82],
  ["Prism Edge", "Meridian", 55, 322, 0.12, 0.45, 0.007, 0.12, 46],
  ["Atlas Open", "Northstar", 70, 145, 0.3, 1.2, 0.021, 0.4, 65],
  ["Lyra Preview", "Lumen", 85, 61, null, null, null, null, 87],
  ["Cedar Research", "Canopy", 74, null, 1, 4, 0.04, null, 73],
];
export const demoModels: Model[] = rows.map(
  (
    [
      name,
      creator,
      intelligence,
      speed,
      inputPrice,
      outputPrice,
      benchmarkCost,
      latency,
      coding,
    ],
    i,
  ): Model => ({
    id: `demo-${i + 1}`,
    name,
    creator,
    intelligence,
    speed,
    inputPrice,
    outputPrice,
    benchmarkCost,
    latency,
    version: "synthetic-v1",
    taskScores:
      coding === null
        ? {}
        : { coding: { value: coding, version: "synthetic-coding-v1" } },
    capabilities: [],
    source: "synthetic",
  }),
);
export const demoSnapshot: Snapshot = {
  models: demoModels,
  fetchedAt: "2026-10-01T00:00:00.000Z",
  tier: "synthetic fixture",
  warnings: [
    "All model names, creators and metrics are fictional. These are not Artificial Analysis measurements.",
  ],
};
