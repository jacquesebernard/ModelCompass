import "dotenv/config";
import { z } from "zod";
import { secureProviderURL } from "./security";
const env = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(5173),
    HOST: z
      .string()
      .default(process.env.RENDER === "true" ? "0.0.0.0" : "127.0.0.1"),
    RENDER_EXTERNAL_HOSTNAME: z.string().optional(),
    ALLOWED_HOSTS: z.string().default(""),
    ACCESS_USERNAME: z.string().default(""),
    ACCESS_PASSWORD: z.string().default(""),
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
    AA_CACHE_PATH: z.string().default(".cache/aa-snapshot.json"),
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
  .superRefine((value, context) => {
    if (Boolean(value.ACCESS_USERNAME) !== Boolean(value.ACCESS_PASSWORD))
      context.addIssue({
        code: "custom",
        path: ["ACCESS_PASSWORD"],
        message:
          "Set both ACCESS_USERNAME and ACCESS_PASSWORD, or leave both empty.",
      });
    if (
      process.env.RENDER === "true" &&
      (!value.ACCESS_USERNAME || !value.ACCESS_PASSWORD)
    )
      context.addIssue({
        code: "custom",
        path: ["ACCESS_PASSWORD"],
        message:
          "Set ACCESS_USERNAME and ACCESS_PASSWORD before running publicly on Render.",
      });
  })
  .parse(process.env);
export const config = {
  ...env,
  allowedHosts: [
    env.RENDER_EXTERNAL_HOSTNAME ?? "",
    ...env.ALLOWED_HOSTS.split(","),
  ]
    .map((host) => host.trim())
    .filter(Boolean),
  accessCredentials:
    env.ACCESS_USERNAME && env.ACCESS_PASSWORD
      ? { username: env.ACCESS_USERNAME, password: env.ACCESS_PASSWORD }
      : null,
  mode: env.DATA_MODE,
  tool: env.AA_MCP_TOOL,
  toolArgs: z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(env.AA_MCP_ARGS)),
  advisorConfigured: Boolean(env.ADVISOR_API_KEY && env.ADVISOR_MODEL),
};
