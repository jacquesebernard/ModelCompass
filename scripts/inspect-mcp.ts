import { aaSource } from "../server/mcp";
try {
  const tools = await aaSource.discover();
  console.log(JSON.stringify({ tools }, null, 2));
  console.log(
    "Choose a read-only language-model listing tool. Configure AA_MCP_TOOL and AA_MCP_ARGS from its schema. No model data has been retrieved.",
  );
} catch {
  console.error(
    "Discovery failed. Configure AA_API_KEY and verify network access. No tool names or schemas were inferred.",
  );
  process.exitCode = 1;
}
