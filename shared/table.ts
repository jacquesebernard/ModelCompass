import type { CostMode, Model, Workload } from "./types";
import { costFor } from "./engine";

export type TableColumn =
  | "selected"
  | "name"
  | "intelligence"
  | "speed"
  | "cost"
  | "inputPrice"
  | "outputPrice"
  | "latency"
  | "version";
export type TableSort = {
  column: TableColumn;
  direction: "ascending" | "descending";
};
export function nextTableSort(
  current: TableSort | null,
  column: TableColumn,
): TableSort {
  return {
    column,
    direction:
      current?.column === column
        ? current.direction === "ascending"
          ? "descending"
          : "ascending"
        : ["selected", "intelligence", "speed"].includes(column)
          ? "descending"
          : "ascending",
  };
}
export function sortTableModels(
  models: Model[],
  workload: Workload,
  costMode: CostMode,
  sort: TableSort,
  selected: string[],
) {
  const value = (model: Model): number | string | null =>
    sort.column === "cost"
      ? costFor(model, workload, costMode)
      : sort.column === "selected"
        ? Number(selected.includes(model.id))
        : model[sort.column];
  return [...models].sort((a, b) => {
    const av = value(a),
      bv = value(b);
    // Missing data always follows measured data, including in descending order.
    if (av === null && bv !== null) return 1;
    if (av !== null && bv === null) return -1;
    const comparison =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv, "en", { numeric: true, sensitivity: "base" })
          : 0;
    return (
      comparison * (sort.direction === "ascending" ? 1 : -1) ||
      a.id.localeCompare(b.id)
    );
  });
}
