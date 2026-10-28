import { useEffect, useMemo, useRef, useState } from "react";
import {
  Compass,
  ArrowUpRight,
  ArrowRight,
  Search,
  SlidersHorizontal,
  RotateCcw,
  ChartScatter,
  Table2,
  RefreshCw,
  Plug,
  X,
  ChevronDown,
  Check,
  Leaf,
  Gauge,
  BrainCircuit,
  Scale,
  Info,
  ExternalLink,
  Plus,
  CircleHelp,
} from "lucide-react";
import type {
  Connection,
  DataResponse,
  Filters,
  Workload,
  Priority,
  CostMode,
  Ranking,
  Requirements,
  Model,
} from "../shared/types";
import { defaultFilters, defaultWorkload } from "../shared/types";
import {
  selectChartModels,
  type ChartLimit,
  type ChartOrder,
} from "../shared/chart";
import type { TableSort } from "../shared/table";
import { filterModels, estimateCost, estimateResponse } from "../shared/engine";
import Chart from "./Chart";
import Advisor from "./Advisor";
import Connections from "./Connections";
import ModelTable from "./ModelTable";
import CohortDialog from "./CohortDialog";
import MethodologyDialog from "./MethodologyDialog";
import { api, money, fmt, creatorColor, periodLabel } from "./format";

const priorities: { id: Priority; label: string; icon: typeof Scale }[] = [
  { id: "balanced", label: "Balanced", icon: Scale },
  { id: "cost", label: "Lower cost", icon: Leaf },
  { id: "speed", label: "Higher speed", icon: Gauge },
  { id: "quality", label: "Higher intelligence", icon: BrainCircuit },
];
const emptyModels: Model[] = [];
const chartOrders: { id: ChartOrder; label: string; description: string }[] = [
  {
    id: "intelligence",
    label: "Intelligence · highest",
    description: "Highest Artificial Analysis Intelligence Index first.",
  },
  {
    id: "speed",
    label: "Output speed · fastest",
    description: "Highest measured output tokens per second first.",
  },
  {
    id: "benchmarkCost",
    label: "Benchmark cost / task · lowest",
    description:
      "Lowest reported benchmark cost per task first. Missing costs are excluded from Top N.",
  },
  {
    id: "workloadCost",
    label: "Workload estimate · lowest",
    description: "Lowest estimated token cost for your workload first.",
  },
  {
    id: "leaders",
    label: "Leaders across metrics",
    description:
      "Combines intelligence, speed and benchmark-cost leaders; duplicates are counted once.",
  },
  {
    id: "custom",
    label: "Custom model cohort",
    description: "Uses your chosen configurations, ordered by intelligence.",
  },
];
export default function App() {
  const [data, setData] = useState<DataResponse | null>(null),
    [connection, setConnection] = useState<Connection | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [filters, setFilters] = useState<Filters>(defaultFilters),
    [workload, setWorkload] = useState<Workload>(defaultWorkload),
    [priority, setPriority] = useState<Priority>("balanced"),
    [costMode, setCostMode] = useState<CostMode>("workload");
  const [chartLimit, setChartLimit] = useState<ChartLimit>(15);
  const [chartOrder, setChartOrder] = useState<ChartOrder>("intelligence");
  const [tableSort, setTableSort] = useState<TableSort | null>(null);
  const [groupConfigurations, setGroupConfigurations] = useState(true);
  const [chartIncludedIds, setChartIncludedIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]),
    [ranking, setRanking] = useState<Ranking | null>(null),
    [requirements, setRequirements] = useState<Requirements | null>(null),
    [rankingBusy, setRankingBusy] = useState(false),
    [view, setView] = useState<"chart" | "table">("chart"),
    [expanded, setExpanded] = useState(false),
    [modal, setModal] = useState<
      "connections" | "methodology" | "cohort" | null
    >(null);
  const [advisorBusy, setAdvisorBusy] = useState(false),
    [focusedId, setFocusedId] = useState<string | null>(null);
  const rankAbort = useRef<AbortController | null>(null);
  const comparison = useRef<HTMLElement | null>(null);
  const load = async (force = false) => {
    setLoading(true);
    setError("");
    try {
      const [d, c] = await Promise.all([
        api<DataResponse>(
          force ? "/api/refresh" : "/api/models",
          force ? {} : undefined,
        ),
        api<Connection>("/api/connection"),
      ]);
      setData(d);
      setConnection(c);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 60000);
    return () => {
      clearInterval(interval);
      rankAbort.current?.abort();
    };
  }, []);

  const models = data?.snapshot?.models ?? emptyModels;
  const creators = [...new Set(models.map((m) => m.creator))].sort();
  const versions = [...new Set(models.map((m) => m.version))];
  const filtered = useMemo(
    () => filterModels(models, filters, workload, costMode),
    [models, filters, workload, costMode],
  );
  const recommended = ranking?.recommendations.map((r) => r.modelId) ?? [];
  const chartSelection = useMemo(
    () =>
      selectChartModels(
        filtered,
        workload,
        chartOrder,
        chartLimit,
        [...selected, ...recommended],
        groupConfigurations,
        chartIncludedIds,
      ),
    [
      filtered,
      workload,
      chartOrder,
      chartLimit,
      selected,
      ranking,
      groupConfigurations,
      chartIncludedIds,
    ],
  );
  const displayed = selected
    .map((id) => models.find((m) => m.id === id))
    .filter((m): m is Model => !!m);
  const demo = data?.mode === "demo";
  const openCohortPicker = () => setModal("cohort");
  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const updateWorkload = (
    key: keyof Workload,
    value: number | Workload["period"],
  ) => setWorkload((w) => ({ ...w, [key]: value }));
  const toggleSelect = (id: string) => {
    setNotice("");
    setSelected((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id);
      if (ids.length >= 3) {
        setNotice("You can compare up to 3 models. Remove one to add another.");
        return ids;
      }
      return [...ids, id];
    });
  };
  const acceptRanking = (r: Ranking) => {
    setRanking(r);
    setSelected(r.recommendations.map((x) => x.modelId));
  };
  const acceptRequirements = (r: Requirements) => {
    setRequirements(r);
    setWorkload(r.workload);
    setPriority(r.priority);
  };
  const rank = async () => {
    rankAbort.current?.abort();
    const controller = new AbortController();
    rankAbort.current = controller;
    setRankingBusy(true);
    setError("");
    try {
      const r = await api<Ranking>(
        "/api/rank",
        {
          filters,
          workload,
          priority,
          costMode,
          ...(requirements ? { requirements } : {}),
        },
        controller.signal,
      );
      acceptRanking(r);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      if (rankAbort.current === controller) setRankingBusy(false);
    }
  };
  useEffect(() => {
    if (!ranking || advisorBusy) return;
    const timer = setTimeout(() => void rank(), 350);
    return () => clearTimeout(timer);
  }, [
    JSON.stringify(filters),
    JSON.stringify(workload),
    priority,
    costMode,
    requirements,
    data?.snapshot?.fetchedAt,
    advisorBusy,
  ]);
  const reset = () => {
    setFilters(defaultFilters);
    setWorkload(defaultWorkload);
    setPriority("balanced");
    setCostMode("workload");
    setChartLimit(15);
    setChartOrder("intelligence");
    setTableSort(null);
    setGroupConfigurations(true);
    setChartIncludedIds([]);
    setSelected([]);
    setRanking(null);
    setRequirements(null);
    setNotice("");
  };
  const numeric = (value: string) => (value === "" ? null : Number(value));
  const refreshLabel =
    data?.state === "demo"
      ? "Synthetic fixture · no live feed"
      : data?.snapshot
        ? `Last successful refresh ${new Date(data.snapshot.fetchedAt).toLocaleString()}`
        : "No successful refresh yet";
  return (
    <>
      <div className="app-shell" inert={modal !== null}>
        <header className="site-header">
          <a href="#main" className="brand" aria-label="Model Compass home">
            <span className="brand-mark">
              <Compass size={25} strokeWidth={1.65} />
            </span>
            <span>
              Model<span className="brand-light">Compass</span>
              <small>Find the right AI for your task.</small>
            </span>
          </a>
          <nav aria-label="Main navigation">
            <a className="nav-active" href="#explore">
              Explore models
            </a>
            <button onClick={() => setModal("methodology")}>
              How it works <ArrowUpRight size={13} />
            </button>
          </nav>
          <button
            className="connection-button"
            onClick={() => setModal("connections")}
          >
            <span
              className={`status-dot ${data?.state === "connected" ? "" : "amber"}`}
            />
            {demo
              ? "Demo workspace"
              : data?.state === "connected"
                ? "Connected"
                : data?.state === "stale"
                  ? "Stale data"
                  : "Connections"}
            <Plug size={14} />
          </button>
        </header>
        <main id="main">
          <section className="page-intro">
            <div>
              <span className="eyebrow">
                <span className="mini-line" /> A LITTLE CLARITY IN A FAST-MOVING
                WORLD
              </span>
              <h1>
                The right model.
                <br className="mobile-break" /> A clearer choice<span>.</span>
              </h1>
              <p>Explore the tradeoffs. Describe your task. Find your fit.</p>
            </div>
            <div className="source-status">
              <span
                className={`badge ${demo ? "sand" : data?.state === "connected" ? "connected" : ""}`}
              >
                <span className="status-dot" />
                {demo
                  ? "SYNTHETIC DEMO"
                  : data?.state === "connected"
                    ? "LIVE DATA"
                    : data?.state === "stale"
                      ? "STALE SNAPSHOT"
                      : "DISCONNECTED"}
              </span>
              <small>{refreshLabel}</small>
              <button
                className="text-button"
                disabled={loading}
                onClick={() => void load(true)}
              >
                <RefreshCw size={12} className={loading ? "spin" : ""} />
                {loading ? "Loading…" : "Refresh data"}
              </button>
            </div>
          </section>
          {(error || data?.error) && (
            <div className="alert" role="alert">
              <Info size={18} />
              <span>{error || data?.error}</span>
              <button
                className="text-button"
                onClick={() => setModal("connections")}
              >
                Connections <ArrowRight size={13} />
              </button>
            </div>
          )}
          {demo && (
            <div className="demo-strip">
              <span>
                <Info size={14} />
                <strong>A space to explore.</strong> All names and numbers are
                fictional. Connect your own data when you’re ready.
              </span>
              <button onClick={() => setModal("connections")}>
                Connect Artificial Analysis <ArrowUpRight size={13} />
              </button>
            </div>
          )}
          <div className="workspace" id="explore">
            <div className="explorer-column">
              <section
                className="explorer-card"
                aria-labelledby="explorer-title"
              >
                <div className="panel-heading">
                  <div>
                    <span className="small-eyebrow">THE MODEL LANDSCAPE</span>
                    <h2 id="explorer-title">Intelligence meets efficiency</h2>
                  </div>
                  <div className="view-toggle" aria-label="Data view">
                    <button
                      className={view === "chart" ? "active" : ""}
                      onClick={() => setView("chart")}
                      aria-label="Chart view"
                      aria-pressed={view === "chart"}
                    >
                      <ChartScatter size={16} />
                    </button>
                    <button
                      className={view === "table" ? "active" : ""}
                      onClick={() => setView("table")}
                      aria-label="Accessible table view"
                      aria-pressed={view === "table"}
                    >
                      <Table2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="filter-bar">
                  <label className="search-box">
                    <Search size={16} />
                    <span className="sr-only">Search model names</span>
                    <input
                      placeholder="Find a model…"
                      value={filters.query}
                      onChange={(e) => setFilter("query", e.target.value)}
                    />
                    {filters.query && (
                      <button
                        aria-label="Clear model search"
                        className="icon-button"
                        onClick={() => setFilter("query", "")}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </label>
                  <label className="creator-select">
                    <span className="sr-only">Filter by creator</span>
                    <select
                      value={filters.creator}
                      onChange={(e) => setFilter("creator", e.target.value)}
                    >
                      <option value="">All creators</option>
                      {creators.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} />
                  </label>
                  <button
                    className={`filter-button ${expanded ? "active" : ""}`}
                    onClick={() => setExpanded(!expanded)}
                    aria-expanded={expanded}
                  >
                    <SlidersHorizontal size={14} />
                    <span>Filters</span>
                    {[
                      filters.minIntelligence,
                      filters.minSpeed,
                      filters.maxCost,
                    ].some((x) => x !== null) && <i />}
                  </button>
                  <button
                    className="icon-button reset-filters"
                    aria-label="Reset filters"
                    onClick={() => setFilters(defaultFilters)}
                  >
                    <RotateCcw size={15} />
                  </button>
                </div>
                {expanded && (
                  <div className="expanded-filters">
                    <label>
                      Minimum intelligence
                      <input
                        type="number"
                        min="0"
                        placeholder="Any score"
                        value={filters.minIntelligence ?? ""}
                        onChange={(e) =>
                          setFilter("minIntelligence", numeric(e.target.value))
                        }
                      />
                    </label>
                    <label>
                      Minimum speed (tok/s)
                      <input
                        type="number"
                        min="0"
                        placeholder="Any speed"
                        value={filters.minSpeed ?? ""}
                        onChange={(e) =>
                          setFilter("minSpeed", numeric(e.target.value))
                        }
                      />
                    </label>
                    <label>
                      Maximum{" "}
                      {costMode === "benchmark"
                        ? "benchmark $/task"
                        : `estimated $/${periodLabel(workload)}`}
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="No limit"
                        value={filters.maxCost ?? ""}
                        onChange={(e) =>
                          setFilter("maxCost", numeric(e.target.value))
                        }
                      />
                    </label>
                  </div>
                )}
                <div className="chart-meta">
                  <span>
                    <strong>
                      {view === "chart"
                        ? chartSelection.models.length
                        : filtered.length}
                    </strong>{" "}
                    {view === "chart"
                      ? `of ${chartSelection.availableCount} plotted`
                      : `of ${models.length} models`}{" "}
                    <i />{" "}
                    {demo
                      ? "Synthetic index v1"
                      : versions.length === 1
                        ? `AA Intelligence Index ${versions[0]}`
                        : "Choose an index version"}
                  </span>
                  <label className="cost-selector">
                    <span>Bubble size</span>
                    <select
                      aria-label="Bubble cost mode"
                      value={costMode}
                      onChange={(e) => {
                        setCostMode(e.target.value as CostMode);
                        setFilter("maxCost", null);
                      }}
                    >
                      <option value="workload">Estimated workload cost</option>
                      <option value="benchmark">Benchmark cost per task</option>
                    </select>
                    <ChevronDown size={11} />
                  </label>
                </div>
                {view === "chart" && (
                  <div className="chart-density-toolbar">
                    <label htmlFor="chart-model-limit">
                      Show
                      <select
                        id="chart-model-limit"
                        aria-label="Models shown on chart"
                        aria-describedby="chart-density-hint"
                        value={chartLimit}
                        onChange={(event) =>
                          setChartLimit(
                            event.target.value === "all"
                              ? "all"
                              : (Number(event.target.value) as ChartLimit),
                          )
                        }
                      >
                        <option value="10">
                          {chartOrder === "leaders"
                            ? "10 per metric"
                            : "Top 10"}
                        </option>
                        <option value="15">
                          {chartOrder === "leaders"
                            ? "15 per metric"
                            : "Top 15"}
                        </option>
                        <option value="20">
                          {chartOrder === "leaders"
                            ? "20 per metric"
                            : "Top 20"}
                        </option>
                        <option value="all">All</option>
                      </select>
                    </label>
                    <label htmlFor="chart-order">
                      Rank by
                      <select
                        id="chart-order"
                        aria-label="Chart ranking metric"
                        value={chartOrder}
                        onChange={(event) => {
                          const order = event.target.value as ChartOrder;
                          if (order === "custom" && !chartIncludedIds.length) {
                            openCohortPicker();
                            return;
                          }
                          setChartOrder(order);
                          if (
                            order === "benchmarkCost" ||
                            order === "leaders"
                          ) {
                            setCostMode("benchmark");
                            setFilter("maxCost", null);
                          }
                          if (order === "workloadCost") {
                            setCostMode("workload");
                            setFilter("maxCost", null);
                          }
                        }}
                      >
                        {chartOrders.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="chart-group-configurations">
                      <input
                        type="checkbox"
                        checked={groupConfigurations}
                        disabled={chartOrder === "custom"}
                        onChange={(event) =>
                          setGroupConfigurations(event.target.checked)
                        }
                      />
                      One configuration per model
                    </label>
                    <button className="text-button" onClick={openCohortPicker}>
                      Choose models
                      {chartIncludedIds.length
                        ? ` (${chartIncludedIds.length})`
                        : ""}{" "}
                      <SlidersHorizontal size={13} />
                    </button>
                    <span id="chart-density-hint" aria-live="polite">
                      {chartLimit === "all"
                        ? "All matching models in the selected cohort."
                        : chartOrder === "leaders"
                          ? `Top ${chartLimit} per metric, combined (${chartSelection.topModels.length} models).`
                          : chartOrders.find(
                              (option) => option.id === chartOrder,
                            )!.description}{" "}
                      {groupConfigurations && chartOrder !== "custom"
                        ? "Each model uses its highest-intelligence configuration. "
                        : ""}
                      {chartSelection.extraCount > 0
                        ? `+${chartSelection.extraCount} selected / recommended kept visible.`
                        : chartLimit !== "all"
                          ? "Selected and recommended matches stay visible."
                          : ""}
                    </span>
                  </div>
                )}
                {view === "chart" &&
                  chartSelection.unplottableLeaders.length > 0 && (
                    <p className="metric-warning chart-leader-warning">
                      {chartSelection.unplottableLeaders.length}{" "}
                      {chartSelection.unplottableLeaders.length === 1
                        ? "model in this cohort lacks"
                        : "models in this cohort lack"}{" "}
                      speed or intelligence data and cannot be plotted.{" "}
                      <button
                        className="text-button"
                        onClick={() => setView("table")}
                      >
                        View models in the table <ArrowRight size={12} />
                      </button>
                    </p>
                  )}
                {versions.length > 1 && (
                  <label className="version-picker">
                    Benchmark version
                    <select
                      value={filters.version}
                      onChange={(e) => setFilter("version", e.target.value)}
                    >
                      <option value="">Choose a version to compare</option>
                      {versions.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                )}
                {versions.length > 1 && !filters.version ? (
                  <div className="empty-state">
                    <Info size={24} />
                    <h3>Choose a benchmark version</h3>
                    <p>
                      Models measured with incompatible versions cannot share a
                      comparison.
                    </p>
                  </div>
                ) : loading && !data ? (
                  <div className="empty-state">
                    <RefreshCw className="spin" />
                    <p>Loading the model landscape…</p>
                  </div>
                ) : models.length === 0 ? (
                  <div className="empty-state">
                    <Plug size={30} />
                    <h3>Your model landscape starts here</h3>
                    <p>
                      Connect Artificial Analysis or explore the synthetic demo.
                    </p>
                    <button
                      className="primary-button"
                      onClick={() => setModal("connections")}
                    >
                      Open connections <ArrowUpRight size={14} />
                    </button>
                  </div>
                ) : view === "chart" ? (
                  <Chart
                    key={`${chartLimit}:${chartOrder}:${groupConfigurations}`}
                    models={chartSelection.models}
                    unplottableCount={chartSelection.missingCount}
                    workload={workload}
                    costMode={costMode}
                    selected={selected}
                    recommended={recommended}
                    creators={creators}
                    focusedId={focusedId}
                    onSelect={toggleSelect}
                  />
                ) : (
                  <ModelTable
                    filtered={filtered}
                    defaultOrder={chartSelection.tableModels}
                    chartModelIds={chartSelection.topModels.map(
                      (model) => model.id,
                    )}
                    workload={workload}
                    costMode={costMode}
                    selected={selected}
                    recommended={recommended}
                    tableSort={tableSort}
                    setTableSort={setTableSort}
                    onSelect={toggleSelect}
                    onResetFilters={() => setFilters(defaultFilters)}
                  />
                )}
                {costMode === "benchmark" &&
                  filtered.some((m) => m.benchmarkCost === null) && (
                    <p className="metric-warning">
                      Benchmark cost is unavailable for some models under this
                      dataset or account plan. Token prices are never
                      substituted.
                    </p>
                  )}
                <div className="panel-attribution">
                  <span>
                    {demo ? "Synthetic data · demonstration only" : "Source: "}
                    <a
                      href="https://artificialanalysis.ai"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {demo
                        ? "Data integration: Artificial Analysis"
                        : "Artificial Analysis (artificialanalysis.ai)"}{" "}
                      <ExternalLink size={10} />
                    </a>
                  </span>
                  <button onClick={() => setModal("methodology")}>
                    Understand the metrics <CircleHelp size={12} />
                  </button>
                </div>
              </section>
              <section
                className="workload-card"
                aria-labelledby="workload-title"
              >
                <div className="workload-heading">
                  <div>
                    <h2 id="workload-title">Your workload</h2>
                    <p>A few assumptions. A much more useful estimate.</p>
                  </div>
                  <span className="badge">USD ESTIMATE</span>
                </div>
                <div className="workload-inputs">
                  <label>
                    Input tokens / request
                    <input
                      type="number"
                      min="0"
                      max="100000000"
                      step="100"
                      value={workload.inputTokens}
                      onChange={(e) =>
                        updateWorkload(
                          "inputTokens",
                          Math.max(
                            0,
                            Math.min(
                              100000000,
                              Math.trunc(Number(e.target.value)),
                            ),
                          ),
                        )
                      }
                    />
                  </label>
                  <span className="input-plus">+</span>
                  <label>
                    Output tokens / request
                    <input
                      type="number"
                      min="0"
                      max="10000000"
                      step="100"
                      value={workload.outputTokens}
                      onChange={(e) =>
                        updateWorkload(
                          "outputTokens",
                          Math.max(
                            0,
                            Math.min(
                              10000000,
                              Math.trunc(Number(e.target.value)),
                            ),
                          ),
                        )
                      }
                    />
                  </label>
                  <span className="input-plus">×</span>
                  <label>
                    Requests
                    <input
                      type="number"
                      min="1"
                      max="1000000000"
                      value={workload.requests}
                      onChange={(e) =>
                        updateWorkload(
                          "requests",
                          Math.max(
                            1,
                            Math.min(
                              1000000000,
                              Math.trunc(Number(e.target.value)),
                            ),
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Usage period
                    <select
                      value={workload.period}
                      onChange={(e) =>
                        updateWorkload(
                          "period",
                          e.target.value as Workload["period"],
                        )
                      }
                    >
                      <option value="request">per request / batch</option>
                      <option value="day">per day</option>
                      <option value="month">per month</option>
                    </select>
                  </label>
                </div>
                <p className="fine-print">
                  Base token estimate only. Excludes unmeasured reasoning
                  tokens, caching, tools and provider fees. Benchmark cost is a
                  separate measured metric.
                </p>
              </section>
            </div>
            <Advisor
              connection={connection}
              filters={filters}
              workload={workload}
              priority={priority}
              costMode={costMode}
              requirements={requirements}
              onRequirements={acceptRequirements}
              onRanking={acceptRanking}
              onManual={() => void rank()}
              onSetup={() => setModal("connections")}
              onReset={() => {
                setRequirements(null);
                setRanking(null);
                setSelected([]);
              }}
              onBusy={setAdvisorBusy}
              demo={demo}
            />
          </div>
          <section className="priorities-bar">
            <div>
              <span className="small-eyebrow">WHAT MATTERS MOST?</span>
              <p>A good fit starts with your priorities.</p>
            </div>
            <div className="priority-options">
              {priorities.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={priority === id ? "active" : ""}
                  aria-pressed={priority === id}
                  onClick={() => setPriority(id)}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>
            <button
              className="primary-button rank-button"
              disabled={rankingBusy || advisorBusy || !models.length}
              onClick={() => void rank()}
            >
              {rankingBusy ? (
                <RefreshCw size={15} className="spin" />
              ) : (
                <>
                  Find my matches <ArrowRight size={15} />
                </>
              )}
            </button>
          </section>
          <section
            className="comparison"
            ref={comparison}
            aria-labelledby="comparison-title"
          >
            <div className="comparison-heading">
              <div>
                <span className="small-eyebrow">A CLOSER LOOK</span>
                <h2 id="comparison-title">
                  {ranking ? "Your shortlist" : "Compare your contenders"}{" "}
                  <span>{selected.length}/3</span>
                </h2>
              </div>
              <div className="comparison-actions">
                {ranking && (
                  <span className="fine-print">
                    {ranking.eligible} eligible · {ranking.excluded} excluded
                  </span>
                )}
                <button
                  className="text-button"
                  onClick={() => {
                    setSelected([]);
                    setRanking(null);
                  }}
                >
                  Clear comparison <X size={13} />
                </button>
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
                  <Check size={14} /> Ranked in application code · {priority}{" "}
                  priority · {demo ? "synthetic data" : "retrieved data"}
                </span>
                {ranking.notes.map((n, i) => (
                  <p key={i}>{n}</p>
                ))}
              </div>
            )}
            <div className="comparison-grid">
              {displayed.map((m, i) => {
                const rec = ranking?.recommendations.find(
                  (r) => r.modelId === m.id,
                );
                return (
                  <article className="model-card" key={m.id}>
                    <div className="model-card-top">
                      <span
                        className="model-number"
                        style={{
                          color: creatorColor(m.creator, creators),
                          background: `${creatorColor(m.creator, creators)}14`,
                        }}
                      >
                        {i + 1}
                      </span>
                      <span className="model-role">
                        {rec ? rec.roles.join(" · ") : "Selected model"}
                      </span>
                      <button
                        className="icon-button"
                        aria-label={`Remove ${m.name}`}
                        onClick={() => toggleSelect(m.id)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <h3>{m.name}</h3>
                    <p className="model-creator">
                      <i
                        style={{
                          background: creatorColor(m.creator, creators),
                        }}
                      />
                      {m.creator} <span>{m.version}</span>
                    </p>
                    <div className="model-metrics">
                      <div>
                        <span>Intelligence</span>
                        <strong
                          className={
                            m.intelligence === null ? "unavailable" : ""
                          }
                        >
                          {fmt(m.intelligence)}
                        </strong>
                      </div>
                      <div>
                        <span>Output speed</span>
                        <strong
                          className={m.speed === null ? "unavailable" : ""}
                        >
                          {fmt(m.speed)}
                          <small> tok/s</small>
                        </strong>
                      </div>
                      <div>
                        <span>Estimated / {periodLabel(workload)}</span>
                        <strong
                          className={
                            estimateCost(m, workload) === null
                              ? "unavailable"
                              : ""
                          }
                        >
                          {money(estimateCost(m, workload))}
                        </strong>
                      </div>
                    </div>
                    <dl className="model-details">
                      <dt>Input / output per 1M</dt>
                      <dd>
                        {money(m.inputPrice)} / {money(m.outputPrice)}
                      </dd>
                      <dt>Benchmark cost / task</dt>
                      <dd>{money(m.benchmarkCost)}</dd>
                      <dt>Est. latency + generation</dt>
                      <dd>
                        {estimateResponse(m, workload) === null
                          ? "Unavailable"
                          : `${fmt(estimateResponse(m, workload))} s`}
                      </dd>
                      {requirements?.task === "coding" && (
                        <>
                          <dt>Coding score</dt>
                          <dd>{fmt(m.taskScores.coding?.value)}</dd>
                        </>
                      )}
                      {rec && (
                        <>
                          <dt>
                            Compass fit score{" "}
                            <button
                              className="inline-help"
                              aria-label="About Compass fit scores"
                              onClick={() => setModal("methodology")}
                            >
                              <CircleHelp size={11} />
                            </button>
                          </dt>
                          <dd>{rec.score}/100</dd>
                        </>
                      )}
                    </dl>
                    {rec && <p className="fit-reason">{rec.why}</p>}
                    <p className="tradeoff">
                      {rec
                        ? `${rec.qualityBasis}. ${rec.tradeoff}`
                        : "Select a priority and find matches to see how this model compares."}
                    </p>
                    {!filtered.some((x) => x.id === m.id) && (
                      <p className="metric-warning">
                        Outside the current chart filters.
                      </p>
                    )}
                    <button
                      className="highlight-button"
                      onClick={() => {
                        setView(
                          m.speed === null || m.intelligence === null
                            ? "table"
                            : "chart",
                        );
                        setFilters({ ...defaultFilters, version: m.version });
                        setFocusedId(m.id);
                        document
                          .getElementById("explorer-title")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          });
                      }}
                    >
                      <ChartScatter size={13} />{" "}
                      {m.speed === null || m.intelligence === null
                        ? "View in table"
                        : "Highlight on chart"}{" "}
                      <ArrowUpRight size={12} />
                    </button>
                  </article>
                );
              })}
              {Array.from({ length: 3 - displayed.length }, (_, i) => (
                <button
                  className="empty-comparison"
                  key={`empty${i}`}
                  onClick={() => {
                    setView("table");
                    document
                      .getElementById("explorer-title")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  <span>
                    <Plus size={20} />
                  </span>
                  <strong>
                    {displayed.length + i === 0
                      ? "Your next great fit starts here"
                      : "Room for another perspective"}
                  </strong>
                  <small>Select a bubble or browse the table to compare</small>
                </button>
              ))}
            </div>
            {displayed.length > 0 && (
              <p className="estimate-note">
                <Info size={13} /> Response estimate = available time to first
                token + output tokens ÷ output speed. Additional reasoning or
                processing time is not measured. Suitability is inferred; task
                accuracy is not guaranteed.
              </p>
            )}
          </section>
          {data?.snapshot?.warnings.map((warning, i) => (
            <p key={i} className="dataset-warning">
              <Info size={13} />
              {warning}
            </p>
          ))}
        </main>
        <footer className="site-footer">
          <span>
            <Compass size={16} /> Model Compass{" "}
            <span className="footer-divider">/</span> Less guesswork. Better
            decisions.
          </span>
          <div>
            <span>Independent project · No tracking</span>
            <button onClick={() => setModal("methodology")}>
              Methodology <ArrowUpRight size={12} />
            </button>
            <button onClick={reset}>
              Reset workspace <RotateCcw size={12} />
            </button>
          </div>
        </footer>
      </div>
      {modal === "cohort" && (
        <CohortDialog
          filtered={filtered}
          initialIds={
            chartIncludedIds.length
              ? chartIncludedIds
              : chartSelection.topModels.map((model) => model.id)
          }
          onClose={() => setModal(null)}
          onApply={(ids) => {
            setChartIncludedIds(ids);
            setChartOrder("custom");
            setChartLimit("all");
            setModal(null);
          }}
        />
      )}
      {modal === "connections" && (
        <Connections
          connection={connection}
          onClose={() => setModal(null)}
          onChanged={() => {
            setRanking(null);
            setRequirements(null);
            setSelected([]);
            setChartIncludedIds([]);
            setChartOrder("intelligence");
            setTableSort(null);
            void load();
          }}
        />
      )}
      {modal === "methodology" && (
        <MethodologyDialog onClose={() => setModal(null)} />
      )}
    </>
  );
}
