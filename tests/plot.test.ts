import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  initialViewport,
  maxPlotZoom,
  zoomPlot,
  panPlot,
  plotWindow,
  layoutPlotLabels,
} from "../src/plot";
import { demoModels } from "../server/fixtures";
import { defaultWorkload } from "../shared/types";

test("two-axis zoom preserves the mouse anchor and panning stays inside the data extent", () => {
  const anchor = { x: 0.3, y: 0.7 };
  const zoomed = zoomPlot(initialViewport, 4, anchor);
  const window = plotWindow(zoomed);
  assert.ok(Math.abs(window.minX + anchor.x * window.span - anchor.x) < 1e-12);
  assert.ok(Math.abs(window.minY + anchor.y * window.span - anchor.y) < 1e-12);
  const panned = panPlot(zoomed, 0.2, -0.1);
  assert.ok(Math.abs(panned.centerX - zoomed.centerX + 0.05) < 1e-12);
  assert.ok(Math.abs(panned.centerY - zoomed.centerY + 0.025) < 1e-12);
  const edge = plotWindow(panPlot(zoomed, 100, -100));
  assert.equal(edge.minX, 0);
  assert.equal(edge.minY, 0);
  assert.equal(zoomPlot(zoomed, 100).zoom, maxPlotZoom);
  assert.deepEqual(zoomPlot(panned, 0), initialViewport);
});

test("the top three labels retain separate space at dense plot edges and are painted last", () => {
  const labels = layoutPlotLabels(
    Array.from({ length: 20 }, (_, index) => ({
      id: String(index),
      name: `Fictional ${index}`,
      x: 73,
      y: 36,
      radius: 12,
      intelligence: 100 - index,
      priority: index < 3,
      emphasized: index === 10,
    })),
    { x: 72, y: 35, width: 222, height: 300 },
    1,
  );
  assert.deepEqual(
    new Set(labels.filter((label) => label.priority).map((label) => label.id)),
    new Set(["0", "1", "2"]),
  );
  assert.ok(labels.slice(-3).every((label) => label.priority));
  for (let i = 0; i < labels.length; i++) {
    const a = labels[i];
    assert.ok(a.x >= 72 && a.x + a.width <= 294);
    assert.ok(a.y >= 35 && a.y <= 335);
    for (const b of labels.slice(i + 1))
      assert.ok(
        Math.abs(a.y - b.y) >= 18 ||
          a.x + a.width + 8 <= b.x ||
          b.x + b.width + 8 <= a.x,
      );
  }
});

test("mouse wheel zoom reveals labels, drag pans both axes without selecting, and reset restores the view", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost",
  });
  for (const key of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "SVGElement",
    "Element",
    "Node",
    "MutationObserver",
  ] as const)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: dom.window[key],
    });
  class PointerEvent extends dom.window.MouseEvent {
    pointerId: number;
    constructor(
      type: string,
      options: MouseEventInit & { pointerId?: number } = {},
    ) {
      super(type, options);
      this.pointerId = options.pointerId ?? 1;
    }
  }
  Object.defineProperty(dom.window, "PointerEvent", {
    configurable: true,
    value: PointerEvent,
  });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    writable: true,
    value: true,
  });
  const { createElement } = await import("react");
  const { render, screen, fireEvent, cleanup, within } =
    await import("@testing-library/react");
  const { default: Chart } = await import("../src/Chart");
  const models = Array.from({ length: 32 }, (_, index) => ({
    ...demoModels[0],
    id: `point-${index}`,
    name: `Model ${index}`,
    speed: 80 + (index % 8) * 5,
    intelligence: 40 + Math.floor(index / 8) * 5,
  }));
  const selected: string[] = [];
  try {
    render(
      createElement(Chart, {
        models,
        workload: defaultWorkload,
        costMode: "workload",
        selected: [],
        recommended: [],
        creators: [models[0].creator],
        onSelect: (id) => selected.push(id),
      }),
    );
    const svg = screen.getByRole("group", { name: /Model comparison:/ });
    assert.equal(svg.querySelectorAll(".priority-label").length, 3);
    const originalLabelCount = svg.querySelectorAll(".point-label").length;
    const wheelAllowed = fireEvent.wheel(svg, {
      clientX: 418,
      clientY: 185,
      deltaY: -500,
      cancelable: true,
    });
    assert.equal(
      wheelAllowed,
      false,
      "Wheel zoom must prevent simultaneous page scrolling",
    );
    const zoom = screen.getByRole("slider", {
      name: "Chart zoom",
    }) as HTMLInputElement;
    assert.ok(Number(zoom.value) > 2);
    assert.ok(svg.querySelectorAll(".point-label").length > originalLabelCount);
    assert.equal(svg.querySelectorAll(".priority-label").length, 3);
    assert.ok(screen.getByRole("slider", { name: "Chart vertical position" }));
    const bubble = within(svg).getByRole("button", { name: /^Model 31,/ });
    const before = bubble.getAttribute("transform")!;
    fireEvent.pointerDown(bubble, {
      pointerId: 1,
      button: 0,
      clientX: 418,
      clientY: 185,
    });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 388, clientY: 209 });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 388, clientY: 209 });
    const after = bubble.getAttribute("transform")!;
    const coords = (transform: string) =>
      transform.match(/-?[\d.]+/g)!.map(Number);
    assert.ok(Math.abs(coords(after)[0] - coords(before)[0] + 30) < 1e-8);
    assert.ok(Math.abs(coords(after)[1] - coords(before)[1] - 24) < 1e-8);
    fireEvent.click(bubble);
    assert.equal(
      selected.length,
      0,
      "A completed drag must not select its starting bubble",
    );
    fireEvent.pointerDown(bubble, {
      pointerId: 2,
      button: 0,
      clientX: 418,
      clientY: 185,
    });
    fireEvent.pointerUp(svg, { pointerId: 2, clientX: 418, clientY: 185 });
    fireEvent.click(bubble);
    assert.deepEqual(selected, ["point-31"]);
    const previousZoom = zoom.value;
    assert.equal(
      fireEvent.wheel(svg, {
        clientX: 10,
        clientY: 10,
        deltaY: -500,
        cancelable: true,
      }),
      true,
    );
    assert.equal(zoom.value, previousZoom);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    assert.equal(zoom.value, "1");
    assert.equal(
      screen.queryByRole("slider", { name: "Chart horizontal position" }),
      null,
    );
    assert.equal(within(svg).getAllByRole("button").length, models.length);
  } finally {
    cleanup();
    dom.window.close();
  }
});
