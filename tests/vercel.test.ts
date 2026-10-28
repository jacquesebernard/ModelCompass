import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { defaultFilters, defaultWorkload } from "../shared/types";
import { allowedHost } from "../server/security";

// Each test file runs in its own process. Exercise the actual function entry
// point with Vercel metadata, without loading local credentials or making calls.
Object.assign(process.env, {
  DOTENV_CONFIG_PATH: "/dev/null",
  VERCEL: "1",
  VERCEL_URL: "model-compass-deployment.vercel.app",
  VERCEL_BRANCH_URL: "model-compass-git-main.vercel.app",
  VERCEL_PROJECT_PRODUCTION_URL: "model-compass-nine.vercel.app",
  HOST: "models.example.test",
  DATA_MODE: "demo",
  AA_API_KEY: "",
  AA_MCP_TOOL: "",
  AA_MCP_ARGS: "{}",
  AA_USE_CONFIRMED: "false",
  ADVISOR_API_KEY: "",
  ADVISOR_MODEL: "",
  ADVISOR_BASE_URL: "https://api.openai.com/v1",
});
delete process.env.AA_CACHE_PATH;
const { default: app } = await import("../api/index");
const { config } = await import("../server/config");

test("Vercel function serves API paths on known domains and rejects unrelated hosts and origins", async () => {
  for (const host of [
    "model-compass-deployment.vercel.app",
    "model-compass-git-main.vercel.app",
    "model-compass-nine.vercel.app",
    "models.example.test",
  ]) {
    const health = await request(app).get("/api/health").set("Host", host);
    assert.equal(health.status, 200, host);
    assert.deepEqual(health.body, { status: "ok" });
    assert.equal(health.headers["cache-control"], "no-store");
    assert.match(health.headers["content-security-policy"], /script-src 'self'/);
  }
  assert.equal(
    (await request(app).get("/api/health").set("Host", "another-project.vercel.app")).status,
    403,
  );
  assert.equal(
    (await request(app)
      .get("/api/health")
      .set("Host", "model-compass-nine.vercel.app")
      .set("Origin", "https://another-project.vercel.app")).status,
    403,
  );
});

test("Vercel function handles connection, models, JSON ranking and nested API errors", async () => {
  const host = "model-compass-nine.vercel.app";
  const connection = await request(app).get("/api/connection").set("Host", host);
  assert.equal(connection.status, 200);
  assert.equal(connection.body.dataKeyConfigured, false);
  assert.equal(connection.body.advisorConfigured, false);

  const models = await request(app).get("/api/models").set("Host", host);
  assert.equal(models.status, 200);
  assert.equal(models.body.mode, "demo");
  assert.ok(models.body.snapshot.models.length > 0);

  const ranking = await request(app)
    .post("/api/rank")
    .set("Host", host)
    .set("Origin", `https://${host}`)
    .send({
      filters: defaultFilters,
      workload: defaultWorkload,
      priority: "balanced",
      costMode: "workload",
    });
  assert.equal(ranking.status, 200);
  assert.ok(ranking.body.recommendations.length > 0);

  const missing = await request(app).get("/api/mcp/missing").set("Host", host);
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, "Unknown API endpoint.");
});

test("Vercel configuration uses temporary storage and allows only known deployment hosts", () => {
  assert.equal(config.AA_CACHE_PATH, join(tmpdir(), "model-compass", "aa-snapshot.json"));
  assert.equal(allowedHost("model-compass-nine.vercel.app", config.allowedHosts), true);
  assert.equal(allowedHost("model-compass-deployment.vercel.app", config.allowedHosts), true);
  assert.equal(allowedHost("model-compass-git-main.vercel.app", config.allowedHosts), true);
  assert.equal(allowedHost("models.example.test", config.allowedHosts), true);
  assert.equal(allowedHost("another-project.vercel.app", config.allowedHosts), false);
});
