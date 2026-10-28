import { resolve } from "node:path";
import express from "express";
import { config } from "./config";
import { createApp } from "./app";
const production =
  process.env.NODE_ENV === "production" ||
  process.argv.includes("--production");
const app = createApp(undefined, undefined, { production });
if (production) {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const server = app.listen(config.PORT, config.HOST, () => {
  console.log(
    `Model Compass ready at http://${config.HOST}:${config.PORT} (${config.mode} data)`,
  );
});
server.on("error", (error) => {
  console.error(`Unable to start Model Compass: ${error.message}`);
  process.exitCode = 1;
});
for (const event of ["SIGINT", "SIGTERM"] as const)
  process.on(event, () => server.close(() => process.exit(0)));
