import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { demoSnapshot } from "../server/fixtures";
import { filterModels, rankModels, manualRequirements } from "../shared/engine";
import type {
  Filters,
  Workload,
  Priority,
  CostMode,
  Requirements,
} from "../shared/types";

test("dashboard interactions: chart selection, filtering, estimates, ranking, table parity and setup state", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://127.0.0.1:5173",
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
    "getComputedStyle",
  ] as const) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value:
        key === "getComputedStyle"
          ? dom.window.getComputedStyle.bind(dom.window)
          : dom.window[key],
    });
  }
  dom.window.HTMLElement.prototype.scrollIntoView = () => undefined;
  // Exercise the chart's measured-width adaptation without claiming browser layout QA.
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: class {
      constructor(private callback: (entries: unknown[]) => void) {}
      observe() {
        this.callback([{ contentRect: { width: 340 } }]);
      }
      disconnect() {}
    },
  });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    writable: true,
    value: true,
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const path = String(input);
    let body: unknown;
    if (path === "/api/models" || path === "/api/refresh")
      body = {
        mode: "demo",
        state: "demo",
        snapshot: demoSnapshot,
        error: null,
        refreshSeconds: 3600,
      };
    else if (path === "/api/connection")
      body = {
        mode: "demo",
        dataKeyConfigured: false,
        useConfirmed: false,
        advisorConfigured: false,
        advisorModel: null,
        advisorHost: "api.openai.com",
        selectedTool: null,
        refreshSeconds: 3600,
      };
    else if (path === "/api/rank") {
      const args = JSON.parse(String(options?.body)) as {
        filters: Filters;
        workload: Workload;
        priority: Priority;
        costMode: CostMode;
        requirements?: Requirements;
      };
      body = rankModels(
        filterModels(
          demoSnapshot.models,
          args.filters,
          args.workload,
          args.costMode,
        ),
        {
          ...(args.requirements ??
            manualRequirements(args.priority, args.workload)),
          priority: args.priority,
          workload: args.workload,
        },
      );
    } else throw new Error(`Unexpected UI request: ${path}`);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const { createElement } = await import("react");
  const { render, screen, fireEvent, waitFor, cleanup, within } =
    await import("@testing-library/react");
  const { default: App } = await import("../src/App");
  try {
    render(createElement(App));
    await screen.findByText("SYNTHETIC DEMO");
    await waitFor(() =>
      assert.equal(
        screen
          .getByRole("group", { name: /Model comparison:/ })
          .getAttribute("viewBox"),
        "0 0 340 405",
      ),
    );
    assert.equal(
      screen
        .getByRole("button", { name: "Send task to advisor" })
        .hasAttribute("disabled"),
      true,
    );
    assert.ok(screen.getByText("AI advisor needs a connection"));
    const limit = screen.getByRole("combobox", {
      name: "Models shown on chart",
    }) as HTMLSelectElement;
    assert.equal(limit.value, "15");
    const metric = screen.getByRole("combobox", {
      name: "Chart ranking metric",
    }) as HTMLSelectElement;
    assert.equal(metric.value, "intelligence");
    assert.equal(
      (
        screen.getByRole("checkbox", {
          name: "One configuration per model",
        }) as HTMLInputElement
      ).checked,
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose models" }));
    const chooser = screen.getByRole("dialog", {
      name: "Choose the models on your chart.",
    });
    fireEvent.click(
      within(chooser).getByRole("button", { name: "Clear chosen models" }),
    );
    for (const model of demoSnapshot.models.slice(0, 4))
      fireEvent.click(
        within(chooser).getByRole("checkbox", {
          name: `Include ${model.name} by ${model.creator}`,
        }),
      );
    fireEvent.click(
      within(chooser).getByRole("button", { name: "Show chosen models" }),
    );
    assert.equal(
      (
        screen.getByRole("combobox", {
          name: "Chart ranking metric",
        }) as HTMLSelectElement
      ).value,
      "custom",
    );
    assert.equal(
      within(
        screen.getByRole("group", { name: /Model comparison:/ }),
      ).getAllByRole("button").length,
      4,
    );
    assert.equal(document.querySelectorAll(".model-card").length, 0);
    fireEvent.change(
      screen.getByRole("combobox", { name: "Chart ranking metric" }),
      { target: { value: "intelligence" } },
    );
    fireEvent.change(limit, { target: { value: "10" } });
    const chart = () =>
      screen.getByRole("group", { name: /Model comparison:/ });
    assert.equal(within(chart()).getAllByRole("button").length, 9);
    assert.ok(
      screen.getByText(/1 model in this cohort lacks speed or intelligence/),
    );
    fireEvent.change(metric, { target: { value: "speed" } });
    assert.equal(within(chart()).getAllByRole("button").length, 10);
    assert.ok(within(chart()).getByRole("button", { name: /^Prism Edge,/ }));
    fireEvent.change(metric, { target: { value: "benchmarkCost" } });
    assert.equal(
      (
        screen.getByRole("combobox", {
          name: "Bubble cost mode",
        }) as HTMLSelectElement
      ).value,
      "benchmark",
    );
    assert.ok(within(chart()).getByRole("button", { name: /^Cedar Nano,/ }));
    fireEvent.change(metric, { target: { value: "leaders" } });
    assert.ok(within(chart()).getByRole("button", { name: /^Prism Edge,/ }));
    assert.ok(within(chart()).getByRole("button", { name: /^Summit Max,/ }));
    assert.ok(within(chart()).getByRole("button", { name: /^Cedar Nano,/ }));
    fireEvent.change(metric, { target: { value: "intelligence" } });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Bubble cost mode" }),
      { target: { value: "workload" } },
    );
    for (const circle of chart().querySelectorAll<SVGCircleElement>(
      "circle.bubble-mark",
    ))
      assert.ok(
        Number(circle.getAttribute("r")) <= 9,
        "Narrow chart bubbles must stay within the compact 9px radius",
      );
    const hidden = demoSnapshot.models.find(
      (model) =>
        model.speed !== null &&
        model.intelligence !== null &&
        !within(chart()).queryByRole("button", {
          name: new RegExp(`^${model.name},`),
        }),
    )!;
    fireEvent.click(
      screen.getByRole("button", { name: "Accessible table view" }),
    );
    assert.equal(
      within(screen.getByRole("table")).getAllByRole("row").length,
      16,
    );
    assert.ok(
      within(
        within(screen.getByRole("table")).getAllByRole("row")[1],
      ).getByText("Summit Max"),
    );
    const tableRows = () =>
      within(screen.getByRole("table")).getAllByRole("row").slice(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Output tok/s: sort descending" }),
    );
    assert.ok(within(tableRows()[0]).getByText("Prism Edge"));
    assert.equal(
      screen
        .getByRole("columnheader", { name: /Output tok\/s/ })
        .getAttribute("aria-sort"),
      "descending",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Output tok/s: sort ascending" }),
    );
    assert.equal(within(tableRows()[0]).queryByText("Cedar Research"), null);
    assert.ok(within(tableRows().at(-1)!).getByText("Cedar Research"));
    assert.equal(
      screen
        .getByRole("columnheader", { name: /Output tok\/s/ })
        .getAttribute("aria-sort"),
      "ascending",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Model / creator: sort ascending" }),
    );
    assert.ok(within(tableRows()[0]).getByText("Atlas Mini"));
    fireEvent.click(
      screen.getByRole("button", { name: "Restore chart order" }),
    );
    assert.ok(within(tableRows()[0]).getByText("Summit Max"));
    fireEvent.click(
      screen.getByRole("checkbox", { name: `Compare ${hidden.name}` }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Chart view" }));
    assert.equal(within(chart()).getAllByRole("button").length, 10);
    const pinned = within(chart()).getByRole("button", {
      name: new RegExp(`^${hidden.name},`),
    });
    assert.equal(pinned.getAttribute("aria-pressed"), "true");
    fireEvent.click(pinned);
    assert.equal(within(chart()).getAllByRole("button").length, 9);
    for (const value of ["15", "20", "all"]) {
      fireEvent.change(
        screen.getByRole("combobox", { name: "Models shown on chart" }),
        { target: { value } },
      );
      assert.equal(within(chart()).getAllByRole("button").length, 14);
    }
    fireEvent.change(
      screen.getByRole("combobox", { name: "Models shown on chart" }),
      { target: { value: "15" } },
    );
    const atlas = screen.getByRole("button", { name: /^Atlas Pro, Northstar/ });
    fireEvent.keyDown(atlas, { key: "Enter" });
    await waitFor(() =>
      assert.equal(
        screen
          .getByRole("button", { name: /^Atlas Pro, Northstar/ })
          .getAttribute("aria-pressed"),
        "true",
      ),
    );
    const comparison = document.querySelector(".comparison")!;
    assert.ok(within(comparison as HTMLElement).getByText("Atlas Pro"));
    assert.ok(
      within(comparison as HTMLElement).getAllByText("$11.00").length > 0,
    );
    fireEvent.change(screen.getByLabelText("Requests"), {
      target: { value: "2000" },
    });
    await waitFor(() =>
      assert.ok(
        within(comparison as HTMLElement).getAllByText("$22.00").length > 0,
      ),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search model names" }),
      { target: { value: "Orion" } },
    );
    assert.equal(
      screen.queryByRole("button", { name: /^Atlas Pro, Northstar/ }),
      null,
    );
    assert.ok(screen.getByRole("button", { name: /^Orion Code, Meridian/ }));
    fireEvent.click(screen.getByRole("button", { name: "Clear model search" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Accessible table view" }),
    );
    const table = screen.getByRole("table");
    assert.ok(
      within(table).getByRole("checkbox", { name: "Compare Cedar Research" }),
    );
    assert.equal(within(table).getAllByRole("row").length, 16);
    fireEvent.click(
      within(table).getByRole("checkbox", { name: "Compare Cedar Research" }),
    );
    assert.ok(within(comparison as HTMLElement).getByText("Cedar Research"));
    assert.ok(
      within(comparison as HTMLElement).getByRole("button", {
        name: "View in table",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Find my matches" }));
    await screen.findByText("Your shortlist");
    await waitFor(() =>
      assert.ok(document.querySelectorAll(".model-card").length > 0),
    );
    assert.ok(document.querySelectorAll(".model-card").length <= 3);
    fireEvent.click(screen.getByRole("button", { name: "Chart view" }));
    assert.ok(screen.getByRole("group", { name: /Model comparison:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Connections" }));
    const dialog = screen.getByRole("dialog");
    assert.ok(within(dialog).getByText("Artificial Analysis MCP"));
    assert.equal(
      within(dialog)
        .getByRole("button", { name: "Discover MCP tools" })
        .hasAttribute("disabled"),
      true,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    assert.equal(screen.queryByRole("dialog"), null);
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.change(screen.getByLabelText("Minimum intelligence"), {
      target: { value: "1000" },
    });
    await screen.findByText("No models to plot");
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    assert.ok(screen.getByRole("button", { name: /^Atlas Pro, Northstar/ }));
  } finally {
    cleanup();
    globalThis.fetch = previousFetch;
    dom.window.close();
  }
});
