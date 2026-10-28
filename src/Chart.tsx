import { useEffect, useMemo, useRef, useState } from "react";
import { ZoomIn, MousePointer2, ArrowUpRight } from "lucide-react";
import type { Model, Workload, CostMode } from "../shared/types";
import { costFor, bubbleRadius } from "../shared/engine";
import { fmt, money, creatorColor, periodLabel } from "./format";
import {
  initialViewport,
  maxPlotZoom,
  limitViewport,
  plotWindow,
  zoomPlot,
  panPlot,
  layoutPlotLabels,
  type PlotViewport,
} from "./plot";
type Props = {
  models: Model[];
  workload: Workload;
  costMode: CostMode;
  selected: string[];
  recommended: string[];
  creators: string[];
  focusedId?: string | null;
  unplottableCount?: number;
  onSelect: (id: string) => void;
};
export default function Chart({
  models,
  workload,
  costMode,
  selected,
  recommended,
  creators,
  focusedId,
  unplottableCount,
  onSelect,
}: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [viewport, setViewport] = useState(initialViewport);
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    viewport: PlotViewport;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const plotRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(810);
  useEffect(() => {
    if (!plotRef.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setCanvasWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(plotRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (focusedId) {
      setHovered(focusedId);
      setViewport(initialViewport);
    }
  }, [focusedId]);
  const points = models.filter(
    (m) => m.intelligence !== null && m.speed !== null,
  );
  const maxSpeed = Math.max(
    100,
    Math.ceil(Math.max(...points.map((m) => m.speed!), 0) / 100) * 100,
  );
  const maxY = Math.max(
    100,
    Math.ceil(Math.max(...points.map((m) => m.intelligence!), 0) / 20) * 20,
  );
  const left = 72,
    top = 35,
    width = canvasWidth - 118,
    height = 300;
  const { zoom } = viewport;
  const window = plotWindow(viewport);
  const minX = window.minX * maxSpeed;
  const minY = window.minY * maxY;
  const x = (v: number) =>
    left + ((v / maxSpeed - window.minX) / window.span) * width;
  const y = (v: number) =>
    top + height - ((v / maxY - window.minY) / window.span) * height;
  const localPoint = (event: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x:
        ((event.clientX - rect.left) * canvasWidth) /
        (rect.width || canvasWidth),
      y: ((event.clientY - rect.top) * 405) / (rect.height || 405),
    };
  };
  const inPlot = (point: { x: number; y: number }) =>
    point.x >= left &&
    point.x <= left + width &&
    point.y >= top &&
    point.y <= top + height;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const wheel = (event: WheelEvent) => {
      const point = localPoint(event);
      if (!inPlot(point)) return;
      event.preventDefault();
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
      const factor = Math.exp(-Math.max(-500, Math.min(500, delta)) * 0.002);
      setViewport((view) =>
        zoomPlot(view, view.zoom * factor, {
          x: (point.x - left) / width,
          y: (top + height - point.y) / height,
        }),
      );
      setHovered(null);
    };
    // A non-passive listener keeps wheel zoom from also scrolling the page.
    svg.addEventListener("wheel", wheel, { passive: false });
    return () => svg.removeEventListener("wheel", wheel);
  }, [canvasWidth]);
  const maxCost = Math.max(
    ...points.map((m) => costFor(m, workload, costMode) ?? 0),
    0,
  );
  const maxBubbleRadius = canvasWidth < 500 ? 9 : 12;
  const legendWidth = 3.5 * maxBubbleRadius + 16;
  const legendHeight = 2 * maxBubbleRadius + 8;
  const radiusFor = (model: Model) => {
    const cost = costFor(model, workload, costMode);
    return cost === null ? 6 : bubbleRadius(cost, maxCost, maxBubbleRadius);
  };
  const visible = points.filter(
    (m) =>
      m.speed! >= minX &&
      m.speed! <= minX + maxSpeed / zoom &&
      m.intelligence! >= minY &&
      m.intelligence! <= minY + maxY / zoom,
  );
  const active = models.find((m) => m.id === hovered);
  const missingCount = unplottableCount ?? models.length - points.length;
  const topThree = useMemo(
    () =>
      new Set(
        [...points]
          .sort(
            (a, b) =>
              b.intelligence! - a.intelligence! ||
              b.speed! - a.speed! ||
              a.id.localeCompare(b.id),
          )
          .slice(0, 3)
          .map((model) => model.id),
      ),
    [models],
  );
  const labels = layoutPlotLabels(
    visible.map((model) => ({
      id: model.id,
      name: model.name,
      x: x(model.speed!),
      y: y(model.intelligence!),
      radius: radiusFor(model),
      intelligence: model.intelligence!,
      priority: topThree.has(model.id),
      emphasized:
        selected.includes(model.id) ||
        recommended.includes(model.id) ||
        hovered === model.id,
    })),
    { x: left, y: top, width, height },
    zoom,
  );
  const accessible = (m: Model) =>
    `${m.name}, ${m.creator}. Intelligence ${fmt(m.intelligence)}, speed ${fmt(m.speed)} tokens per second, ${costMode === "benchmark" ? "benchmark cost per task" : "estimated workload cost"} ${money(costFor(m, workload, costMode))}. ${m.version}. ${selected.includes(m.id) ? "Selected. Press Enter to remove." : "Press Enter to compare."}`;
  return (
    <>
      <div className="plot-wrap" ref={plotRef}>
        <svg
          ref={svgRef}
          className={`bubble-chart ${dragging ? "dragging" : ""}`}
          viewBox={`0 0 ${canvasWidth} 405`}
          aria-label="Model comparison: output speed on the horizontal axis, intelligence on the vertical axis, bubble area proportional to cost"
          role="group"
          aria-describedby="plot-interaction-hint"
          onPointerDown={(event) => {
            if (event.button !== 0 || drag.current) return;
            const point = localPoint(event);
            if (!inPlot(point)) return;
            suppressClick.current = false;
            drag.current = {
              pointerId: event.pointerId,
              ...point,
              viewport,
              moved: false,
            };
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start || start.pointerId !== event.pointerId) return;
            const point = localPoint(event);
            const dx = point.x - start.x,
              dy = point.y - start.y;
            if (!start.moved && Math.hypot(dx, dy) < 4) return;
            start.moved = true;
            suppressClick.current = true;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            setDragging(true);
            setHovered(null);
            setViewport(panPlot(start.viewport, dx / width, dy / height));
          }}
          onPointerUp={(event) => {
            if (drag.current?.pointerId !== event.pointerId) return;
            drag.current = null;
            setDragging(false);
            if (event.currentTarget.hasPointerCapture?.(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
          }}
          onPointerLeave={() => {
            if (!drag.current?.moved) drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
            setDragging(false);
          }}
          onClickCapture={(event) => {
            if (suppressClick.current) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        >
          <defs>
            <linearGradient id="plot-tint" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--surface)" />
              <stop offset="100%" stopColor="var(--chart-surface)" />
            </linearGradient>
            <clipPath id="plot-clip">
              <rect
                x={left - 1}
                y={top - 15}
                width={width + 2}
                height={height + 30}
              />
            </clipPath>
          </defs>
          <rect
            x={left}
            y={top}
            width={width}
            height={height}
            fill="url(#plot-tint)"
          />
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => (
            <g key={`y${t}`}>
              <line
                x1={left}
                x2={left + width}
                y1={top + height - t * height}
                y2={top + height - t * height}
                className="grid-line"
              />
              <text
                x={left - 16}
                y={top + height - t * height + 4}
                textAnchor="end"
                className="tick"
              >
                {fmt(minY + (t * maxY) / zoom, zoom > 3 ? 1 : 0)}
              </text>
            </g>
          ))}
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => (
            <g key={`x${t}`}>
              <line
                x1={left + t * width}
                x2={left + t * width}
                y1={top}
                y2={top + height}
                className="grid-line vertical"
              />
              <text
                x={left + t * width}
                y={top + height + 26}
                textAnchor="middle"
                className="tick"
              >
                {fmt(minX + (t * maxSpeed) / zoom, 0)}
              </text>
            </g>
          ))}
          <text
            x={left + width - 2}
            y={top - 13}
            textAnchor="end"
            className="quadrant"
          >
            MORE INTELLIGENT + FASTER ↗
          </text>
          <text
            transform={`translate(20 ${top + height / 2}) rotate(-90)`}
            textAnchor="middle"
            className="axis-label"
          >
            Intelligence Index {models[0]?.version ?? ""}
          </text>
          <text
            x={left + width / 2}
            y={height + top + 62}
            textAnchor="middle"
            className="axis-label"
          >
            Output speed{" "}
            <tspan className="axis-unit">/ tokens per second →</tspan>
          </text>
          <path
            className="axis-line"
            d={`M ${left} ${top} V ${top + height} H ${left + width}`}
            fill="none"
          />
          <g clipPath="url(#plot-clip)">
            {[...visible]
              .sort(
                (a, b) =>
                  Number(selected.includes(a.id)) -
                  Number(selected.includes(b.id)),
              )
              .map((m) => {
                const cost = costFor(m, workload, costMode),
                  r = radiusFor(m);
                const isSelected = selected.includes(m.id),
                  isRecommended = recommended.includes(m.id);
                return (
                  <g
                    key={m.id}
                    transform={`translate(${x(m.speed!)},${y(m.intelligence!)})`}
                    role="button"
                    tabIndex={0}
                    aria-label={accessible(m)}
                    aria-pressed={isSelected}
                    className={`bubble ${isSelected ? "selected" : ""}`}
                    onClick={() => onSelect(m.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(m.id);
                      }
                    }}
                    onMouseEnter={() => setHovered(m.id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(m.id)}
                    onBlur={() => setHovered(null)}
                  >
                    <circle
                      className="bubble-hit-target"
                      r={Math.max(r + 6, 13)}
                      fill="transparent"
                    />
                    {(isSelected || isRecommended) && (
                      <circle
                        r={Math.max(r, 5) + 4}
                        fill="none"
                        stroke={isSelected ? "var(--text)" : "var(--focus)"}
                        strokeWidth={isSelected ? 2.5 : 2}
                        strokeDasharray={isSelected ? undefined : "3 3"}
                      />
                    )}
                    {cost === null ? (
                      <path
                        className="bubble-mark"
                        d="M 0 -6 L 6 0 L 0 6 L -6 0 Z"
                        fill="var(--surface)"
                        stroke={creatorColor(m.creator, creators)}
                        strokeWidth="2"
                      />
                    ) : (
                      <circle
                        className="bubble-mark"
                        r={r}
                        fill={creatorColor(m.creator, creators)}
                        fillOpacity={isSelected ? 0.18 : 0.12}
                        stroke={creatorColor(m.creator, creators)}
                        strokeWidth="2"
                      />
                    )}
                    {cost === 0 && (
                      <path
                        d="M -4 0 H 4 M 0 -4 V 4"
                        stroke={creatorColor(m.creator, creators)}
                        strokeWidth="2"
                      />
                    )}
                    {isSelected && (
                      <text
                        className="bubble-number"
                        textAnchor="middle"
                        y="4"
                        fontSize="12"
                        fontWeight="700"
                      >
                        {selected.indexOf(m.id) + 1}
                      </text>
                    )}
                  </g>
                );
              })}
            {labels.map((l) => (
              <g key={l.id} pointerEvents="none">
                {l.priority && (
                  <line
                    className="label-connector"
                    x1={l.pointX}
                    y1={l.pointY}
                    x2={Math.max(l.x, Math.min(l.x + l.width, l.pointX))}
                    y2={l.y - 4}
                  />
                )}
                <text
                  x={l.x}
                  y={l.y}
                  data-model-id={l.id}
                  className={`point-label ${l.priority ? "priority-label" : ""} ${l.priority || selected.includes(l.id) || recommended.includes(l.id) ? "emphasis" : ""}`}
                >
                  {l.name}
                  <title>{l.fullName}</title>
                </text>
              </g>
            ))}
          </g>
        </svg>
        {active &&
          visible.some((model) => model.id === active.id) &&
          active.speed !== null &&
          active.intelligence !== null && (
            <div
              className="chart-tooltip"
              role="status"
              style={{
                left: `${Math.max(3, Math.min(((canvasWidth - 230) / canvasWidth) * 100, (x(active.speed) / canvasWidth) * 100))}%`,
                top: `${Math.min(52, Math.max(4, (y(active.intelligence) / 405) * 100 + 7))}%`,
              }}
            >
              <strong>{active.name}</strong>
              <span>
                {active.creator} · {active.version}
              </span>
              <dl>
                <dt>Intelligence</dt>
                <dd>{fmt(active.intelligence)}</dd>
                <dt>Output speed</dt>
                <dd>{fmt(active.speed)} tok/s</dd>
                <dt>
                  {costMode === "benchmark"
                    ? "Benchmark / task"
                    : "Estimated / " + periodLabel(workload)}
                </dt>
                <dd>{money(costFor(active, workload, costMode))}</dd>
                <dt>Source</dt>
                <dd>
                  {active.source === "synthetic"
                    ? "Synthetic fixture"
                    : "Artificial Analysis MCP"}
                </dd>
              </dl>
            </div>
          )}
        {!visible.length && (
          <div className="chart-empty">
            <strong>No models to plot</strong>
            <span>
              {points.length
                ? "Pan to another area or reset the chart zoom."
                : "Adjust your filters or view unavailable metrics in the table."}
            </span>
          </div>
        )}
      </div>
      <div className="chart-tools">
        <span id="plot-interaction-hint">
          <MousePointer2 size={13} /> Drag to pan · Scroll to zoom · Click to
          compare
        </span>
        <div>
          <ZoomIn size={14} />
          <label htmlFor="zoom">Zoom</label>
          <input
            id="zoom"
            aria-label="Chart zoom"
            type="range"
            min="1"
            max={maxPlotZoom}
            step=".25"
            value={zoom}
            onChange={(e) =>
              setViewport((view) => zoomPlot(view, Number(e.target.value)))
            }
          />
          <output aria-live="polite">{fmt(zoom, 1)}×</output>
          {zoom > 1 && (
            <>
              <label htmlFor="pan">X</label>
              <input
                id="pan"
                aria-label="Chart horizontal position"
                type="range"
                min="0"
                max="100"
                value={(window.minX / (1 - window.span)) * 100}
                onChange={(e) =>
                  setViewport((view) =>
                    limitViewport({
                      ...view,
                      centerX:
                        0.5 / view.zoom +
                        ((1 - 1 / view.zoom) * Number(e.target.value)) / 100,
                    }),
                  )
                }
              />
              <label htmlFor="pan-y">Y</label>
              <input
                id="pan-y"
                aria-label="Chart vertical position"
                type="range"
                min="0"
                max="100"
                value={(window.minY / (1 - window.span)) * 100}
                onChange={(e) =>
                  setViewport((view) =>
                    limitViewport({
                      ...view,
                      centerY:
                        0.5 / view.zoom +
                        ((1 - 1 / view.zoom) * Number(e.target.value)) / 100,
                    }),
                  )
                }
              />
            </>
          )}
          <button
            className="text-button"
            onClick={() => {
              setViewport(initialViewport);
            }}
          >
            Reset
          </button>
        </div>
      </div>
      <div className="chart-legend">
        <div className="creator-legend">
          {creators
            .filter((creator) =>
              points.some((model) => model.creator === creator),
            )
            .map((c) => (
              <span key={c}>
                <i style={{ background: creatorColor(c, creators) }} />
                {c}
              </span>
            ))}
        </div>
        <div className="size-legend">
          {maxCost > 0 ? (
            <>
              <svg
                viewBox={`0 0 ${legendWidth} ${legendHeight}`}
                width={legendWidth}
                height={legendHeight}
                style={{ width: legendWidth, height: legendHeight }}
                aria-label={`Bubble area scale: ${money(maxCost / 16)}, ${money(maxCost / 4)}, ${money(maxCost)}`}
              >
                {[1 / 16, 1 / 4, 1].map((ratio, index) => (
                  <circle
                    key={ratio}
                    cx={
                      [
                        2 + maxBubbleRadius / 4,
                        8 + maxBubbleRadius,
                        14 + 2.5 * maxBubbleRadius,
                      ][index]
                    }
                    cy={legendHeight / 2}
                    r={bubbleRadius(maxCost * ratio, maxCost, maxBubbleRadius)}
                  />
                ))}
              </svg>
              <span>
                Cost scale
                <br />
                <small>
                  {money(maxCost / 16)} → {money(maxCost)}
                </small>
              </span>
            </>
          ) : (
            <span>
              {points.some(
                (model) => costFor(model, workload, costMode) !== null,
              )
                ? "Available costs are $0.00"
                : "Cost scale unavailable"}
            </span>
          )}
        </div>
      </div>
      <p className="chart-note">
        <ArrowUpRight size={15} /> Up is smarter. Right is faster. Smaller
        bubbles cost less.{" "}
        <span>
          Top 3 by intelligence stay labeled in view · Zoom reveals more names.{" "}
          ◇ Cost unavailable · dashed ring: recommendation
          {missingCount > 0
            ? ` · ${missingCount} matching models missing speed/intelligence (see table)`
            : ""}
        </span>
      </p>
    </>
  );
}
