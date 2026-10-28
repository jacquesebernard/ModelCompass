import { useMemo, type Dispatch, type SetStateAction } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown, RotateCcw } from "lucide-react";
import type { Model, Workload, CostMode } from "../shared/types";
import {
  nextTableSort,
  sortTableModels,
  type TableSort,
  type TableColumn,
} from "../shared/table";
import { costFor } from "../shared/engine";
import { fmt, money, periodLabel } from "./format";

type Props = {
  filtered: Model[];
  defaultOrder: Model[];
  chartModelIds: string[];
  workload: Workload;
  costMode: CostMode;
  selected: string[];
  recommended: string[];
  tableSort: TableSort | null;
  setTableSort: Dispatch<SetStateAction<TableSort | null>>;
  onSelect: (id: string) => void;
  onResetFilters: () => void;
};
export default function ModelTable({
  filtered,
  defaultOrder,
  chartModelIds,
  workload,
  costMode,
  selected,
  recommended,
  tableSort,
  setTableSort,
  onSelect,
  onResetFilters,
}: Props) {
  const cohortIds = new Set(chartModelIds);
  const tableModels = useMemo(
    () =>
      tableSort
        ? sortTableModels(filtered, workload, costMode, tableSort, selected)
        : defaultOrder,
    [filtered, workload, costMode, tableSort, selected, defaultOrder],
  );
  const tableColumns: { column: TableColumn; label: string }[] = [
    { column: "selected", label: "Compare" },
    { column: "name", label: "Model / creator" },
    { column: "intelligence", label: "Intelligence" },
    { column: "speed", label: "Output tok/s" },
    {
      column: "cost",
      label:
        costMode === "benchmark"
          ? "Benchmark $/task"
          : `Estimated $/${periodLabel(workload)}`,
    },
    { column: "inputPrice", label: "Input $/1M" },
    { column: "outputPrice", label: "Output $/1M" },
    { column: "latency", label: "Latency (s)" },
    { column: "version", label: "Version / source" },
  ];
  return (
    <div className="table-scroll">
      <table>
        <caption>
          {tableSort
            ? `All filtered configurations, sorted by ${tableColumns.find((item) => item.column === tableSort.column)!.label.toLowerCase()}, ${tableSort.direction}. `
            : "Chart cohort first, followed by all other filtered configurations. "}
          Select a column header to sort; select it again to reverse. Missing
          metrics are always last; costs are USD.
          {tableSort && (
            <button
              className="text-button table-sort-reset"
              onClick={() => setTableSort(null)}
            >
              Restore chart order <RotateCcw size={11} />
            </button>
          )}
        </caption>
        <thead>
          <tr>
            {tableColumns.map(({ column, label }) => {
              const active = tableSort?.column === column;
              const SortIcon = active
                ? tableSort.direction === "ascending"
                  ? ArrowUp
                  : ArrowDown
                : ArrowUpDown;
              return (
                <th
                  key={column}
                  scope="col"
                  aria-sort={active ? tableSort.direction : "none"}
                >
                  <button
                    className="table-sort-button"
                    onClick={() =>
                      setTableSort((current) => nextTableSort(current, column))
                    }
                    aria-label={`${label}: sort ${nextTableSort(tableSort, column).direction}`}
                  >
                    {label}
                    <SortIcon size={12} aria-hidden="true" />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {tableModels.map((m) => (
            <tr
              key={m.id}
              className={selected.includes(m.id) ? "selected-row" : ""}
            >
              <td>
                <input
                  type="checkbox"
                  aria-label={`Compare ${m.name}`}
                  checked={selected.includes(m.id)}
                  onChange={() => onSelect(m.id)}
                />
              </td>
              <th scope="row">
                {m.name}
                <small>{m.creator}</small>
                {cohortIds.has(m.id) && (
                  <small>
                    Chart cohort
                    {m.speed === null || m.intelligence === null
                      ? " · missing chart metrics"
                      : ""}
                  </small>
                )}
                {recommended.includes(m.id) && <small>Recommended</small>}
              </th>
              <td>{fmt(m.intelligence)}</td>
              <td>{fmt(m.speed)}</td>
              <td>{money(costFor(m, workload, costMode))}</td>
              <td>{money(m.inputPrice)}</td>
              <td>{money(m.outputPrice)}</td>
              <td>{fmt(m.latency)}</td>
              <td>
                {m.version}
                <small>{m.source}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!filtered.length && (
        <div className="empty-state">
          <h3>No models match these filters</h3>
          <button className="text-button" onClick={onResetFilters}>
            Reset filters
          </button>
        </div>
      )}
    </div>
  );
}
