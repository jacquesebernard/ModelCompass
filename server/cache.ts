import { readFile, mkdir, open, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { z } from "zod";
import { modelSchema, type Snapshot, type DataResponse } from "../shared/types";
export const snapshotSchema = z.object({
  models: z.array(modelSchema).min(1).max(10000),
  fetchedAt: z.string().datetime(),
  tier: z.string(),
  warnings: z.array(z.string()),
});
type Options = {
  intervalMs: number;
  path?: string;
  now?: () => number;
  load: () => Promise<Snapshot>;
};
async function persistSnapshot(path: string, snapshot: Snapshot) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  // Exclusive creation prevents a pre-existing file or symlink from being
  // followed. Renaming replaces the destination itself, never its link target.
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(JSON.stringify(snapshot));
    await file.close();
    await rename(temporary, path);
  } finally {
    await file.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
  }
}
export class SnapshotCache {
  private snapshot: Snapshot | null = null;
  private error: string | null = null;
  private inFlight: Promise<void> | null = null;
  private initialization: Promise<void> | null = null;
  private nextAttempt = 0;
  private now: () => number;
  constructor(private options: Options) {
    this.now = options.now ?? Date.now;
  }
  async initialize() {
    if (!this.initialization)
      this.initialization = (async () => {
        if (!this.options.path) return;
        try {
          const saved = snapshotSchema.parse(
            JSON.parse(await readFile(this.options.path, "utf8")),
          );
          if (saved.models.some((m) => m.source !== "artificial-analysis"))
            return;
          this.snapshot = saved;
        } catch {
          /* absent or invalid cache is never treated as live data */
        }
      })();
    await this.initialization;
  }
  async get(force = false): Promise<DataResponse> {
    await this.initialize();
    const expired =
      !this.snapshot ||
      this.now() - Date.parse(this.snapshot.fetchedAt) >=
        this.options.intervalMs;
    if ((force || expired) && this.now() >= this.nextAttempt) {
      if (!this.inFlight)
        this.inFlight = this.refresh().finally(() => {
          this.inFlight = null;
        });
      await this.inFlight;
    }
    const stale =
      !!this.error ||
      !!(
        this.snapshot &&
        this.now() - Date.parse(this.snapshot.fetchedAt) >=
          this.options.intervalMs
      );
    return {
      mode: "live",
      state: this.snapshot ? (stale ? "stale" : "connected") : "disconnected",
      snapshot: this.snapshot,
      error: this.error,
      refreshSeconds: this.options.intervalMs / 1000,
    };
  }
  private async refresh() {
    try {
      const next = snapshotSchema.parse(await this.options.load());
      if (next.models.some((m) => m.source !== "artificial-analysis"))
        throw new Error("Live integration returned non-live data.");
      this.snapshot = next;
      this.error = null;
      if (this.options.path) {
        try {
          await persistSnapshot(this.options.path, next);
        } catch {
          this.snapshot.warnings = [
            ...next.warnings,
            "Snapshot is cached in memory only; disk persistence failed.",
          ];
        }
      }
    } catch {
      // Do not forward provider messages: these may contain credentials or data.
      this.error =
        "Refresh failed. Check MCP authentication, the selected tool, schema compatibility, subscription access, or rate limits. The last successful snapshot is preserved.";
    } finally {
      this.nextAttempt = this.now() + 30_000;
    }
  }
}
