import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));

test("Vercel's temporary TypeScript config resolves the project's installed typings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "model-compass-deployment-"));
  try {
    const project = join(directory, "tsconfig.json");
    // Vercel's TypeScript 7 adapter extends the project config from a temporary
    // directory. A normal tsc run in the repository does not catch this failure.
    await writeFile(project, JSON.stringify({
      extends: join(root, "tsconfig.json"),
      compilerOptions: {
        sourceMap: true,
        inlineSources: true,
        declaration: false,
        declarationMap: false,
        emitDeclarationOnly: false,
        noEmit: false,
        outDir: join(directory, "output"),
        rootDir: root,
        incremental: false,
        composite: false,
        noCheck: true,
        rewriteRelativeImportExtensions: true,
      },
      files: [join(root, "api/index.ts")],
      include: [],
      exclude: [],
    }));
    const { stdout, stderr } = await run(process.execPath, [
      join(root, "node_modules/typescript/bin/tsc"), "--project", project,
    ], { cwd: root, timeout: 30000 });
    assert.equal(stdout, "");
    assert.equal(stderr, "");
    const entrypoint = await readFile(join(directory, "output/api/index.js"), "utf8");
    assert.match(entrypoint, /export default createApp/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
