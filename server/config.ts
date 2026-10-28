import "dotenv/config";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { secureProviderURL } from "./security";
const onVercel = process.env.VERCEL === "1";
const env = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(5173),
    HOST: z.string().default("127.0.0.1"),
    DATA_MODE: z.enum(["demo", "live"]).default("demo"),
    AA_API_KEY: z.string().default(""),
    AA_MCP_TOOL: z.string().default(""),
    AA_MCP_ARGS: z.string().default("{}"),
    AA_REFRESH_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(604800)
      .default(21600),
    AA_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(120000)
      .default(120000),
    AA_CACHE_PATH: z.string().default(
      onVercel
        ? join(tmpdir(), "model-compass", "aa-snapshot.json")
        : ".cache/aa-snapshot.json",
    ),
    AA_USE_CONFIRMED: z.enum(["true", "false"]).default("false"),
    ADVISOR_API_KEY: z.string().default(""),
    ADVISOR_MODEL: z.string().default(""),
    ADVISOR_BASE_URL: z
      .string()
      .url()
      .refine(
        secureProviderURL,
        "Use HTTPS, or HTTP on loopback only, without URL credentials, query or fragment.",
      )
      .default("https://api.openai.com/v1"),
    ADVISOR_MAX_OUTPUT_TOKENS: z.coerce
      .number()
      .int()
      .min(1024)
      .max(32768)
      .default(8192),
    ADVISOR_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(180000)
      .default(45000),
  })
  .parse(process.env);
export const config = {
  ...env,
  allowedHosts: [
    env.HOST,
    ...(onVercel
      ? [
          process.env.VERCEL_URL,
          process.env.VERCEL_BRANCH_URL,
          process.env.VERCEL_PROJECT_PRODUCTION_URL,
        ].filter((host): host is string => Boolean(host))
      : []),
  ],
  mode: env.DATA_MODE,
  tool: env.AA_MCP_TOOL,
  toolArgs: z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(env.AA_MCP_ARGS)),
  advisorConfigured: Boolean(env.ADVISOR_API_KEY && env.ADVISOR_MODEL),
};
