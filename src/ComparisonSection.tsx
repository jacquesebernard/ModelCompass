import {
  ArrowUpRight,
  ChartScatter,
  Check,
  CircleHelp,
  Info,
  Plus,
  X,
} from "lucide-react";
import type {
  Model,
  Priority,
  Ranking,
  Requirements,
  Workload,
} from "../shared/types";
import { estimateCost, estimateResponse } from "../shared/engine";
import { creatorColor, fmt, money, periodLabel } from "./format";

type Props = {
  displayed: Model[];
  selectedCount: number;
  ranking: Ranking | null;
  priority: Priority;
  demo: boolean;
  requirements: Requirements | null;
  workload: Workload;
  filtered: Model[];
  creators: string[];
  notice: string;
  onClear: () => void;
  onSelect: (id: string) => void;
  onHighlight: (model: Model) => void;
  onBrowseTable: () => void;
  onMethodology: () => void;
};

export default function ComparisonSection({
  displayed,
  selectedCount,
  ranking,
  priority,
  demo,
  requirements,
  workload,
  filtered,
  creators,
  notice,
  onClear,
  onSelect,
  onHighlight,
  onBrowseTable,
  onMethodology,
}: Props) {
  return (
    <section className="comparison" aria-labelledby="comparison-title">
      <div className="comparison-heading">
        <div>
          <span className="small-eyebrow">A CLOSER LOOK</span>
          <h2 id="comparison-title">
            {ranking ? "Your shortlist" : "Compare your contenders"}{" "}
            <span>{selectedCount}/3</span>
          </h2>
        </div>
        <div className="comparison-actions">
          {ranking && (
            <span className="fine-print">
              {ranking.eligible} eligible · {ranking.excluded} excluded
            </span>
          )}
          {(selectedCount > 0 || ranking) && (
            <button className="text-button" onClick={onClear}>
              Clear comparison <X size={13} />
            </button>
          )}
        </div>
      </div>
      {notice && (
        <p className="selection-notice" role="status">
          {notice}
        </p>
      )}
      {ranking && (
        <div className="ranking-notes" role="status">
          <span>
            <Check size={14} /> Ranked in application code · {priority} priority
            · {demo ? "synthetic data" : "retrieved data"}
          </span>
          {ranking.notes.map((note, index) => (
            <p key={index}>{note}</p>
          ))}
        </div>
      )}
      <div className="comparison-grid">
        {displayed.map((model, index) => {
          const recommendation = ranking?.recommendations.find(
            (item) => item.modelId === model.id,
          );
          const estimatedCost = estimateCost(model, workload);
          const responseSeconds = estimateResponse(model, workload);
          const isFiltered = filtered.some((item) => item.id === model.id);

          return (
            <article className="model-card" key={model.id}>
              <div className="model-card-top">
                <span
                  className="model-number"
                  style={{
                    color: creatorColor(model.creator, creators),
                    background: `${creatorColor(model.creator, creators)}14`,
                  }}
                >
                  {index + 1}
                </span>
                <span className="model-role">
                  {recommendation
                    ? recommendation.roles.join(" · ")
                    : "Selected model"}
                </span>
                <button
                  className="icon-button"
                  aria-label={`Remove ${model.name}`}
                  onClick={() => onSelect(model.id)}
                >
                  <X size={14} />
                </button>
              </div>
              <h3>{model.name}</h3>
              <p className="model-creator">
                <i
                  style={{ background: creatorColor(model.creator, creators) }}
                />
                {model.creator} <span>{model.version}</span>
              </p>
              <div className="model-metrics">
                <div>
                  <span>Intelligence</span>
                  <strong
                    className={model.intelligence === null ? "unavailable" : ""}
                  >
                    {fmt(model.intelligence)}
                  </strong>
                </div>
                <div>
                  <span>Output speed</span>
                  <strong className={model.speed === null ? "unavailable" : ""}>
                    {fmt(model.speed)}
                    <small> tok/s</small>
                  </strong>
                </div>
                <div>
                  <span>Estimated / {periodLabel(workload)}</span>
                  <strong
                    className={estimatedCost === null ? "unavailable" : ""}
                  >
                    {money(estimatedCost)}
                  </strong>
                </div>
              </div>
              <dl className="model-details">
                <dt>Input / output per 1M</dt>
                <dd>
                  {money(model.inputPrice)} / {money(model.outputPrice)}
                </dd>
                <dt>Benchmark cost / task</dt>
                <dd>{money(model.benchmarkCost)}</dd>
                <dt>Est. latency + generation</dt>
                <dd>
                  {responseSeconds === null
                    ? "Unavailable"
                    : `${fmt(responseSeconds)} s`}
                </dd>
                {requirements?.task === "coding" && (
                  <>
                    <dt>Coding score</dt>
                    <dd>{fmt(model.taskScores.coding?.value)}</dd>
                  </>
                )}
                {recommendation && (
                  <>
                    <dt>
                      Compass fit score{" "}
                      <button
                        className="inline-help"
                        aria-label="About Compass fit scores"
                        onClick={onMethodology}
                      >
                        <CircleHelp size={11} />
                      </button>
                    </dt>
                    <dd>{recommendation.score}/100</dd>
                  </>
                )}
              </dl>
              {recommendation && (
                <p className="fit-reason">{recommendation.why}</p>
              )}
              <p className="tradeoff">
                {recommendation
                  ? `${recommendation.qualityBasis}. ${recommendation.tradeoff}`
                  : "Select a priority and find matches to see how this model compares."}
              </p>
              {!isFiltered && (
                <p className="metric-warning">
                  Outside the current chart filters.
                </p>
              )}
              <button
                className="highlight-button"
                onClick={() => onHighlight(model)}
              >
                <ChartScatter size={13} />{" "}
                {model.speed === null || model.intelligence === null
                  ? "View in table"
                  : "Highlight on chart"}{" "}
                <ArrowUpRight size={12} />
              </button>
            </article>
          );
        })}
        {!displayed.length && (
          <button
            className="empty-comparison empty-comparison-full"
            onClick={onBrowseTable}
          >
            <span>
              <Plus size={20} />
            </span>
            <strong>Choose models to compare</strong>
            <small>Select a bubble or browse the table · Up to 3 models</small>
          </button>
        )}
      </div>
      {displayed.length > 0 && (
        <p className="estimate-note">
          <Info size={13} /> Response estimate = available time to first token +
          output tokens ÷ output speed. Additional reasoning or processing time
          is not measured. Suitability is inferred; task accuracy is not
          guaranteed.
        </p>
      )}
    </section>
  );
}
