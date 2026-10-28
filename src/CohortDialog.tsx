import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { Model } from "../shared/types";
import { fmt, money } from "./format";
import Dialog from "./Dialog";
export default function CohortDialog({
  filtered,
  initialIds,
  onApply,
  onClose,
}: {
  filtered: Model[];
  initialIds: string[];
  onApply: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [cohortDraftIds, setCohortDraftIds] = useState(initialIds);
  const [cohortSearch, setCohortSearch] = useState("");
  const cohortCandidates = useMemo(
    () =>
      filtered
        .filter((model) =>
          `${model.name} ${model.creator}`
            .toLowerCase()
            .includes(cohortSearch.toLowerCase()),
        )
        .sort(
          (a, b) =>
            (b.intelligence ?? -Infinity) - (a.intelligence ?? -Infinity) ||
            a.id.localeCompare(b.id),
        ),
    [filtered, cohortSearch],
  );
  return (
    <Dialog
      className="cohort-dialog"
      titleId="cohort-title"
      closeLabel="Close model chooser"
      onClose={onClose}
    >
      <span className="eyebrow">YOUR COMPARISON COHORT</span>
      <h2 id="cohort-title">Choose the models on your chart.</h2>
      <p>
        Choose exact configurations to reproduce a comparison set. Chart choices
        are separate from the three-model comparison shortlist. Active filters
        still apply.
      </p>
      <label className="cohort-search">
        Search models
        <input
          type="search"
          value={cohortSearch}
          onChange={(event) => setCohortSearch(event.target.value)}
          placeholder="Search a model or creator…"
        />
      </label>
      <div className="cohort-selection-summary">
        <span>
          {cohortDraftIds.length} chosen · {cohortCandidates.length} matching
          configurations
        </span>
        <button className="text-button" onClick={() => setCohortDraftIds([])}>
          Clear chosen models
        </button>
      </div>
      <div className="cohort-model-list">
        {cohortCandidates.map((model) => (
          <label className="cohort-model" key={model.id}>
            <input
              type="checkbox"
              aria-label={`Include ${model.name} by ${model.creator}`}
              checked={cohortDraftIds.includes(model.id)}
              onChange={(event) =>
                setCohortDraftIds((ids) =>
                  event.target.checked
                    ? [...ids, model.id]
                    : ids.filter((id) => id !== model.id),
                )
              }
            />
            <span>
              <strong>{model.name}</strong>
              <small>
                {model.creator} · Intelligence {fmt(model.intelligence)} ·{" "}
                {fmt(model.speed)} tok/s · Benchmark / task{" "}
                {money(model.benchmarkCost)}
              </small>
            </span>
          </label>
        ))}
        {!cohortCandidates.length && (
          <p className="fine-print">
            No matching models. Adjust this search or the dashboard filters.
          </p>
        )}
      </div>
      <div className="dialog-actions">
        <button className="secondary-button" onClick={() => onClose()}>
          Cancel
        </button>
        <button
          className="primary-button"
          disabled={!cohortDraftIds.length}
          onClick={() => {
            onApply(cohortDraftIds);
          }}
        >
          Show chosen models <ArrowRight size={14} />
        </button>
      </div>
    </Dialog>
  );
}
