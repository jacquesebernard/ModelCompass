import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import express from "express";
import {
  mkdtemp,
  writeFile,
  readFile,
  symlink,
  lstat,
  readdir,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allowedHost, secureProviderURL } from "../server/security";
import { createApp } from "../server/app";
import { config } from "../server/config";
import { createAdvisor, type AdvisorProvider } from "../server/advisor";
import { SnapshotCache } from "../server/cache";
import { demoModels } from "../server/fixtures";
import { manualRequirements } from "../shared/engine";
import {
  defaultFilters,
  defaultWorkload,
  type Snapshot,
} from "../shared/types";

const input = {
  messages: [{ role: "user", content: "Help choose a model." }],
  filters: defaultFilters,
  workload: defaultWorkload,
  priority: "balanced",
  costMode: "workload",
};
test("host checks parse IPv6 authorities and reject remote, malformed and wildcard hosts", async () => {
  for (const host of ["localhost:5173", "127.0.0.1:5173", "[::1]:5173"])
    assert.equal(allowedHost(host, "127.0.0.1"), true);
  for (const host of [
    "[2001:db8::1]:5173",
    "[",
    "[bad:host]",
    "localhost:invalid",
    "localhost@evil.test",
    "localhost/path",
    "evil.test",
    "0.0.0.0:5173",
  ])
    assert.equal(allowedHost(host, "0.0.0.0"), false, host);
  assert.equal(allowedHost("[2001:db8::1]:5173", "2001:db8::1"), true);
  const app = createApp(undefined, null);
  assert.equal(
    (await request(app).get("/api/health").set("Host", "[2001:db8::1]:5173"))
      .status,
    403,
  );
  assert.equal(
    (await request(app).get("/api/health").set("Host", "[::1]:5173")).status,
    200,
  );
});

test("cross-origin and cross-site browser requests cannot trigger provider discovery", async () => {
  let discoveries = 0;
  const app = createApp(
    {
      discover: async () => {
        discoveries++;
        return [];
      },
      fetch: async () => {
        throw new Error("No live calls in tests");
      },
    },
    null,
  );
  for (const site of ["cross-site", "same-site"])
    assert.equal(
      (await request(app).get("/api/mcp/tools").set("Sec-Fetch-Site", site))
        .status,
      403,
    );
  assert.equal(
    (
      await request(app)
        .get("/api/mcp/tools")
        .set("Origin", "https://untrusted.test")
    ).status,
    403,
  );
  assert.equal(discoveries, 0);
  assert.equal(
    (
      await request(app)
        .get("/API/mcp/tools")
        .set("Sec-Fetch-Site", "cross-site")
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .post("/API/refresh")
        .set("Origin", "https://untrusted.test")
        .type("text/plain")
        .send("")
    ).status,
    403,
  );
  assert.equal(discoveries, 0);
  assert.equal(
    (
      await request(app)
        .get("/api/mcp/tools")
        .set("Host", "localhost:5173")
        .set("Origin", "http://localhost:5173")
        .set("Sec-Fetch-Site", "same-origin")
    ).status,
    200,
  );
  assert.equal(discoveries, 1);
});

test("API headers, input limits and rate limits return safe errors without echoing input", async () => {
  const app = createApp(undefined, null, { production: true });
  const health = await request(app).get("/api/health");
  assert.match(health.headers["content-security-policy"], /script-src 'self'/);
  assert.ok(!health.headers["content-security-policy"].includes("unsafe-eval"));
  assert.equal(health.headers["cache-control"], "no-store");
  assert.equal(health.headers["x-frame-options"], "DENY");
  assert.equal(health.headers["x-content-type-options"], "nosniff");
  assert.equal(health.headers["x-powered-by"], undefined);
  const large = await request(app)
    .post("/api/mode")
    .send({ content: "synthetic-sensitive-content".repeat(3000) });
  assert.equal(large.status, 413);
  assert.ok(!large.text.includes("synthetic-sensitive-content"));
  assert.equal(
    (await request(app).post("/api/mode").type("text/plain").send("mode=demo"))
      .status,
    415,
  );
  const malformed = await request(app)
    .post("/api/mode")
    .type("json")
    .send('{"synthetic-sensitive-content":');
  assert.equal(malformed.status, 400);
  assert.ok(!malformed.text.includes("synthetic-sensitive-content"));
  const limited = createApp(undefined, null);
  for (let i = 0; i < 100; i++)
    assert.equal((await request(limited).get("/api/health")).status, 200);
  const blocked = await request(limited).get("/api/health");
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers["retry-after"]);
});

test("MCP discovery coalesces concurrent calls and backs off after failures", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const app = createApp(
    {
      discover: async () => {
        calls++;
        await gate;
        throw new Error("synthetic-private-provider-error");
      },
      fetch: async () => {
        throw new Error("unused");
      },
    },
    null,
  );
  const pending = Promise.all(
    Array.from({ length: 5 }, () => request(app).get("/api/mcp/tools")),
  );
  release();
  const responses = await pending;
  assert.equal(calls, 1);
  assert.ok(
    responses.every(
      (response) =>
        response.status === 502 &&
        !response.text.includes("synthetic-private-provider-error"),
    ),
  );
  assert.equal((await request(app).get("/api/mcp/tools")).status, 502);
  assert.equal(calls, 1);
});

test("advisor concurrency is capped and slots are released on completion and validation errors", async () => {
  const releases: (() => void)[] = [];
  let started!: () => void;
  const twoStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let hold = true;
  const advisor: AdvisorProvider = {
    interpret: async (_messages, defaults) => {
      if (hold)
        await new Promise<void>((resolve) => {
          releases.push(resolve);
          if (releases.length === 2) started();
        });
      return { ...defaults, followUp: "How many requests?" };
    },
    explain: async () => {
      throw new Error("A clarification must not explain");
    },
  };
  const app = createApp(undefined, advisor);
  const first = request(app)
    .post("/api/advisor")
    .send(input)
    .then((response) => response);
  const second = request(app)
    .post("/api/advisor")
    .send(input)
    .then((response) => response);
  await twoStarted;
  const blocked = await request(app).post("/api/advisor").send(input);
  assert.equal(blocked.status, 429);
  assert.equal(releases.length, 2);
  hold = false;
  releases.forEach((release) => release());
  assert.ok(
    (await Promise.all([first, second])).every(
      (response) => response.status === 200,
    ),
  );
  assert.equal((await request(app).post("/api/advisor").send({})).status, 400);
  assert.equal(
    (await request(app).post("/api/advisor").send(input)).status,
    200,
  );
});

test("cache writes do not follow planted symlinks and create private snapshot files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "model-compass-security-"));
  const path = join(directory, "snapshot.json"),
    victim = join(directory, "unrelated.txt");
  await writeFile(victim, "synthetic-private-file");
  await symlink(victim, `${path}.tmp`);
  await symlink(victim, path);
  const snapshot: Snapshot = {
    models: demoModels.map((model) => ({
      ...model,
      source: "artificial-analysis",
    })),
    fetchedAt: new Date().toISOString(),
    tier: "synthetic-test",
    warnings: [],
  };
  const cache = new SnapshotCache({
    intervalMs: 60000,
    path,
    load: async () => snapshot,
  });
  assert.equal((await cache.get()).state, "connected");
  assert.equal(await readFile(victim, "utf8"), "synthetic-private-file");
  assert.equal((await lstat(path)).isSymbolicLink(), false);
  if (process.platform !== "win32")
    assert.equal((await lstat(path)).mode & 0o777, 0o600);
  assert.deepEqual((await readdir(directory)).sort(), [
    "snapshot.json",
    "snapshot.json.tmp",
    "unrelated.txt",
  ]);
});

test("provider URLs require encrypted remote transport and requests reject redirects", async () => {
  for (const url of [
    "https://api.example.test/v1",
    "http://127.0.0.1:8080/v1",
    "http://[::1]:8080/v1",
    "http://localhost:8080/v1",
  ])
    assert.equal(secureProviderURL(url), true);
  for (const url of [
    "http://api.example.test/v1",
    "file:///tmp/provider",
    "https://user:password@api.example.test/v1",
    "https://api.example.test/v1?key=secret",
    "https://api.example.test/v1#fragment",
  ])
    assert.equal(secureProviderURL(url), false);
  const old = {
    configured: config.advisorConfigured,
    key: config.ADVISOR_API_KEY,
    model: config.ADVISOR_MODEL,
    url: config.ADVISOR_BASE_URL,
  };
  const previousFetch = globalThis.fetch;
  let calls = 0;
  config.advisorConfigured = true;
  config.ADVISOR_API_KEY = "synthetic-test-key";
  config.ADVISOR_MODEL = "synthetic-test-model";
  config.ADVISOR_BASE_URL = "http://127.0.0.1:8080/v1";
  globalThis.fetch = async (_url, options) => {
    calls++;
    assert.equal(options?.redirect, "error");
    assert.equal(
      JSON.parse(String(options?.body)).max_output_tokens,
      config.ADVISOR_MAX_OUTPUT_TOKENS,
    );
    return new Response(null, {
      status: 302,
      headers: { Location: "https://untrusted.test" },
    });
  };
  try {
    await assert.rejects(
      createAdvisor()!.interpret(
        input.messages as { role: "user"; content: string }[],
        manualRequirements("balanced"),
        new AbortController().signal,
      ),
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    config.advisorConfigured = old.configured;
    config.ADVISOR_API_KEY = old.key;
    config.ADVISOR_MODEL = old.model;
    config.ADVISOR_BASE_URL = old.url;
  }
});

test("development middleware denies private files while ordinary assets remain readable", async () => {
  const { createServer } = await import("vite");
  const { default: viteConfig } = await import("../vite.config");
  const root = await mkdtemp(join(tmpdir(), "model-compass-vite-security-"));
  await mkdir(join(root, ".cache"));
  await mkdir(join(root, ".local"));
  for (const file of [".env", ".cache/snapshot.json", ".local/diagnostic.mjs"])
    await writeFile(join(root, file), "synthetic-private-file");
  await writeFile(join(root, "visible.json"), '{"public":true}');
  const vite = await createServer({
    configFile: false,
    root,
    publicDir: false,
    logLevel: "silent",
    appType: "custom",
    cacheDir: join(root, "vite-cache"),
    server: {
      ...viteConfig.server,
      middlewareMode: true,
      hmr: false,
      watch: null,
    },
    optimizeDeps: { noDiscovery: true, entries: [] },
  });
  const app = express();
  app.use(vite.middlewares);
  try {
    assert.equal((await request(app).get("/visible.json")).status, 200);
    for (const path of [
      "/.env",
      "/.cache/snapshot.json",
      "/.cache/snapshot.json?raw",
      "/.cache/snapshot.json?import",
      "/.local/diagnostic.mjs",
      `/@fs${join(root, ".cache/snapshot.json")}`,
    ]) {
      const result = await request(app).get(path);
      assert.equal(result.status, 403, path);
      assert.ok(!result.text.includes("synthetic-private-file"));
    }
  } finally {
    await vite.close();
  }
});
