import express from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { config } from "./config";
import { aaSource, validateToolArguments, type DataSource } from "./mcp";
import { SnapshotCache } from "./cache";
import { demoSnapshot } from "./fixtures";
import {
  filtersSchema,
  workloadSchema,
  prioritySchema,
  requirementsSchema,
  type DataResponse,
} from "../shared/types";
import {
  filterModels,
  rankModels,
  manualRequirements,
  validateGrounding,
} from "../shared/engine";
import { createAdvisor, type AdvisorProvider } from "./advisor";
import { installSecurity, apiRateLimit, concurrentRequests } from "./security";

const rankInput = z.object({
  filters: filtersSchema,
  workload: workloadSchema,
  priority: prioritySchema,
  costMode: z.enum(["workload", "benchmark"]),
  requirements: requirementsSchema.optional(),
});
export function createApp(
  source: DataSource = aaSource,
  advisor: AdvisorProvider | null = createAdvisor(),
  options: { production?: boolean } = {},
) {
  const app = express();
  let mode = config.mode;
  let tool = config.tool;
  let args = config.toolArgs;
  let nextDiscovery = 0;
  let discoveryInFlight: Promise<void> | null = null;
  let discoveryFailed = false;
  let discovery: Awaited<ReturnType<DataSource["discover"]>> = [];
  const makeCache = () => {
    const cacheTool = tool,
      cacheArgs = structuredClone(args);
    const scope = createHash("sha256")
      .update(JSON.stringify([config.AA_API_KEY, cacheTool, cacheArgs]))
      .digest("hex")
      .slice(0, 16);
    return new SnapshotCache({
      intervalMs: config.AA_REFRESH_SECONDS * 1000,
      path: `${config.AA_CACHE_PATH}.${scope}`,
      load: () => source.fetch(cacheTool, cacheArgs),
    });
  };
  let cache = makeCache();
  const data = async (force = false): Promise<DataResponse> => {
    if (mode === "demo")
      return {
        mode,
        state: "demo",
        snapshot: demoSnapshot,
        error: null,
        refreshSeconds: config.AA_REFRESH_SECONDS,
      };
    const error = !config.AA_API_KEY
      ? "Artificial Analysis is disconnected. Configure AA_API_KEY on the server."
      : config.AA_USE_CONFIRMED !== "true"
        ? "Review the data-use terms, then set AA_USE_CONFIRMED=true for your permitted use."
        : !tool
          ? "Discover and select a language-model tool in Connections."
          : null;
    if (error)
      return {
        mode,
        state: "disconnected",
        snapshot: null,
        error,
        refreshSeconds: config.AA_REFRESH_SECONDS,
      };
    return cache.get(force);
  };
  installSecurity(
    app,
    config.HOST,
    options.production ?? process.env.NODE_ENV === "production",
    {
      allowedHosts: config.allowedHosts,
      access: config.accessCredentials,
    },
  );
  app.use("/api", apiRateLimit());
  app.use(express.json({ limit: "48kb" }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/connection", (_req, res) =>
    res.json({
      mode,
      dataKeyConfigured: !!config.AA_API_KEY,
      useConfirmed: config.AA_USE_CONFIRMED === "true",
      advisorConfigured: !!advisor,
      advisorModel: config.ADVISOR_MODEL || null,
      advisorHost: new URL(config.ADVISOR_BASE_URL).host,
      selectedTool: tool || null,
      refreshSeconds: config.AA_REFRESH_SECONDS,
    }),
  );
  app.get("/api/models", async (_req, res) => res.json(await data()));
  app.post("/api/refresh", async (_req, res) => res.json(await data(true)));
  app.post("/api/mode", (req, res) => {
    mode = z.object({ mode: z.enum(["demo", "live"]) }).parse(req.body).mode;
    res.json({ mode });
  });
  app.get("/api/mcp/tools", async (_req, res) => {
    if (!discoveryInFlight && Date.now() >= nextDiscovery) {
      discoveryInFlight = Promise.resolve()
        .then(() => source.discover())
        .then((tools) => {
          discovery = tools;
          discoveryFailed = false;
        })
        .catch(() => {
          discoveryFailed = true;
        })
        .finally(() => {
          nextDiscovery = Date.now() + 30_000;
          discoveryInFlight = null;
        });
    }
    await discoveryInFlight;
    if (discoveryFailed)
      return res.status(502).json({
        error:
          "MCP discovery failed. Verify AA_API_KEY, network access and subscription. Tool names and schemas are unavailable until authenticated discovery succeeds.",
      });
    res.json({ tools: discovery });
  });
  app.post("/api/mcp/select", (req, res) => {
    const selection = z
      .object({
        name: z.string().max(200),
        args: z.record(z.string(), z.unknown()),
      })
      .parse(req.body);
    const found = discovery.find(
      (t) => t.name === selection.name && t.eligible,
    );
    if (!found)
      return res.status(400).json({
        error: "Select a read-only tool from successful discovery first.",
      });
    try {
      validateToolArguments(found, selection.args);
    } catch {
      return res.status(400).json({
        error: "Arguments do not match the discovered read-only tool schema.",
      });
    }
    tool = selection.name;
    args = selection.args;
    cache = makeCache();
    res.json({
      selectedTool: tool,
      note: "Selection is in memory until restart. Add AA_MCP_TOOL and AA_MCP_ARGS to .env to persist it.",
    });
  });
  app.post("/api/rank", async (req, res) => {
    const input = rankInput.parse(req.body);
    const loaded = await data();
    if (!loaded.snapshot)
      return res.status(503).json({
        error:
          "No dataset is available. Connect Artificial Analysis or explicitly switch to demo mode.",
      });
    const models = filterModels(
      loaded.snapshot.models,
      input.filters,
      input.workload,
      input.costMode,
    );
    const r =
      input.requirements ?? manualRequirements(input.priority, input.workload);
    const result = rankModels(models, {
      ...r,
      priority: input.priority,
      workload: input.workload,
    });
    validateGrounding(result, models);
    res.json({
      ...result,
      dataMode: loaded.mode,
      dataState: loaded.state,
      fetchedAt: loaded.snapshot.fetchedAt,
    });
  });
  app.post("/api/advisor", concurrentRequests(2), async (req, res) => {
    if (!advisor)
      return res.status(503).json({
        error:
          "AI advisor is not configured. Set ADVISOR_API_KEY and ADVISOR_MODEL on the server. Manual ranking works without AI.",
      });
    const input = rankInput
      .extend({
        messages: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().min(1).max(6000),
            }),
          )
          .min(1)
          .max(20),
      })
      .parse(req.body);
    const abort = new AbortController();
    const signal = AbortSignal.any([
      abort.signal,
      AbortSignal.timeout(config.ADVISOR_TIMEOUT_MS),
    ]);
    res.on("close", () => {
      if (!res.writableEnded) abort.abort();
    });
    res.status(200).set({
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const emit = (value: unknown) => {
      if (!res.destroyed) res.write(`${JSON.stringify(value)}\n`);
    };
    try {
      emit({ type: "status", text: "Understanding your task…" });
      const requirements = requirementsSchema.parse(
        await advisor.interpret(
          input.messages,
          input.requirements ??
            manualRequirements(input.priority, input.workload),
          signal,
        ),
      );
      signal.throwIfAborted();
      emit({ type: "requirements", requirements });
      if (requirements.followUp) {
        emit({ type: "question", text: requirements.followUp });
        return res.end();
      }
      const loaded = await data();
      signal.throwIfAborted();
      if (!loaded.snapshot) throw new Error("No dataset");
      const models = filterModels(
        loaded.snapshot.models,
        input.filters,
        requirements.workload,
        input.costMode,
      );
      const ranking = rankModels(models, requirements);
      validateGrounding(ranking, models);
      emit({
        type: "ranking",
        ranking,
        dataMode: loaded.mode,
        dataState: loaded.state,
      });
      let progressSent = false;
      const text = await advisor.explain(ranking, models, signal, (t) => {
        if (!progressSent) {
          emit({ type: "status", text: t });
          progressSent = true;
        }
      });
      signal.throwIfAborted();
      emit({ type: "answer", text });
    } catch (error) {
      const status =
        typeof error === "object" &&
        error &&
        "status" in error &&
        typeof error.status === "number"
          ? error.status
          : null;
      const invalidOutput =
        error instanceof z.ZodError ||
        error instanceof SyntaxError ||
        (error instanceof Error &&
          /explanation|incomplete|metrics do not match/i.test(error.message));
      const code = signal.aborted
        ? "timeout"
        : invalidOutput
          ? "invalid_output"
          : status === 429
            ? "rate_limit"
            : status === 401 || status === 403
              ? "authentication"
              : "provider_error";
      emit({
        type: "error",
        code,
        status,
        text: signal.aborted
          ? "The advisor exceeded the configured response timeout. Free model routing can be slow; increase ADVISOR_TIMEOUT_MS or retry. Any displayed ranking is still grounded in the dataset."
          : "The advisor could not complete this request. Check provider credentials, model support, limits, and data connection. Any displayed ranking was calculated from the dataset; manual controls remain available.",
      });
    } finally {
      res.end();
    }
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Unknown API endpoint." }),
  );
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (res.headersSent) return res.end();
      const tooLarge =
        typeof err === "object" &&
        err !== null &&
        "type" in err &&
        err.type === "entity.too.large";
      res
        .status(
          tooLarge
            ? 413
            : err instanceof z.ZodError || err instanceof SyntaxError
              ? 400
              : 500,
        )
        .json({
          error: tooLarge
            ? "Request is too large. Shorten the conversation or inputs."
            : err instanceof z.ZodError
              ? "Invalid input. Check field types, ranges and required values."
              : "Request failed. Check server configuration.",
        });
    },
  );
  return app;
}
