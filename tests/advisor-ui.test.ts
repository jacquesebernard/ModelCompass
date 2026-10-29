import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  defaultFilters,
  defaultWorkload,
  type Connection,
} from "../shared/types";

test("every advisor answer and clarification is followed by the business-use disclaimer", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost",
  });
  for (const key of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "Node",
    "MutationObserver",
  ] as const)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: dom.window[key],
    });
  dom.window.HTMLElement.prototype.scrollIntoView = () => undefined;
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    writable: true,
    value: true,
  });
  const previousFetch = globalThis.fetch;
  const requests: { messages: { role: string; content: string }[] }[] = [];
  globalThis.fetch = async (_input, options) => {
    requests.push(JSON.parse(String(options?.body)));
    return new Response(
      JSON.stringify(
        requests.length === 1
          ? { type: "question", text: "How many requests do you expect?" }
          : {
              type: "answer",
              text: "Compare the shortlisted models using a representative sample.",
            },
      ) + "\n",
      {
        headers: { "Content-Type": "application/x-ndjson" },
      },
    );
  };
  const { createElement } = await import("react");
  const { render, screen, fireEvent, waitFor, cleanup } =
    await import("@testing-library/react");
  const { default: Advisor } = await import("../src/Advisor");
  const connection: Connection = {
    mode: "demo",
    dataKeyConfigured: false,
    useConfirmed: false,
    advisorConfigured: true,
    advisorModel: "synthetic-test",
    advisorHost: "localhost",
    selectedTool: null,
    refreshSeconds: 3600,
  };
  try {
    render(
      createElement(Advisor, {
        connection,
        filters: defaultFilters,
        workload: defaultWorkload,
        priority: "balanced",
        costMode: "workload",
        requirements: null,
        demo: true,
        onRequirements: () => {},
        onRanking: () => {},
        onSetup: () => {},
        onReset: () => {},
        onBusy: () => {},
      }),
    );
    for (const [index, text] of [
      "Help choose a model for support.",
      "One thousand requests per month.",
    ].entries()) {
      fireEvent.change(
        screen.getByRole("textbox", { name: "Describe your task" }),
        { target: { value: text } },
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Send task to advisor" }),
      );
      await waitFor(() =>
        assert.equal(
          document.querySelectorAll(".message.assistant").length,
          index + 1,
        ),
      );
      await screen.findByRole("button", { name: "Send task to advisor" });
    }
    for (const message of document.querySelectorAll(".message.assistant")) {
      const content = message.querySelector("p")!;
      assert.ok(
        content.nextElementSibling?.classList.contains("advisor-disclaimer"),
      );
      assert.match(
        content.nextElementSibling!.textContent!,
        /AI can make mistakes.*different models.*business use case/s,
      );
    }
    assert.equal(
      document.querySelectorAll(".message.user .advisor-disclaimer").length,
      0,
    );
    assert.ok(
      requests[1].messages.some((message) => message.role === "assistant"),
    );
    assert.ok(
      requests[1].messages.every(
        (message) => !message.content.includes("AI can make mistakes"),
      ),
      "The presentation disclaimer must not alter conversation content sent to the provider",
    );
  } finally {
    cleanup();
    globalThis.fetch = previousFetch;
    dom.window.close();
  }
});
