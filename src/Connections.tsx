import { useState } from "react";
import { Check, CircleHelp, Plug, RefreshCw, ArrowUpRight } from "lucide-react";
import type { Connection } from "../shared/types";
import { api } from "./format";
import Dialog from "./Dialog";
type Tool = {
  name: string;
  description?: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  eligible: boolean;
};
export default function Connections({
  connection,
  onClose,
  onChanged,
}: {
  connection: Connection | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tools, setTools] = useState<Tool[]>([]),
    [chosen, setChosen] = useState(""),
    [args, setArgs] = useState("{}"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState("");
  const discover = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ tools: Tool[] }>("/api/mcp/tools");
      setTools(result.tools);
      setNote(
        `${result.tools.length} tools discovered. Inspect the schema and choose a read-only language-model listing tool.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const select = async () => {
    setBusy(true);
    setError("");
    try {
      const input = JSON.parse(args);
      const result = await api<{ note: string }>("/api/mcp/select", {
        name: chosen,
        args: input,
      });
      setNote(result.note);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (mode: "demo" | "live") => {
    setBusy(true);
    try {
      await api("/api/mode", { mode });
      onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      className="connections"
      titleId="connection-title"
      closeLabel="Close connections"
      onClose={onClose}
    >
      <span className="eyebrow">YOUR CONNECTIONS</span>
      <h2 id="connection-title">Good decisions start with good data.</h2>
      <p className="muted">
        Each installation uses its own server credentials. Connecting an MCP
        server to your coding assistant does not connect this app.
      </p>
      <div className="connection-block">
        <div className="connection-heading">
          <div className="connection-icon">
            <Plug size={20} />
          </div>
          <div>
            <h3>Artificial Analysis MCP</h3>
            <p>Model intelligence, performance & pricing</p>
          </div>
          <span
            className={`badge ${connection?.dataKeyConfigured ? "connected" : ""}`}
          >
            {connection?.dataKeyConfigured ? "Key configured" : "Not connected"}
          </span>
        </div>
        <p>
          Add these settings to <code>.env</code> and restart{" "}
          <code>npm run dev</code>. Never put keys in frontend variables.
        </p>
        <pre>
          {
            "AA_API_KEY=your_own_key\nAA_USE_CONFIRMED=true\nAA_REFRESH_SECONDS=21600\nAA_TIMEOUT_MS=120000"
          }
        </pre>
        <p className="fine-print">
          Review{" "}
          <a
            href="https://artificialanalysiscdn.com/legal/ProDataPlatformTerms.pdf"
            target="_blank"
            rel="noreferrer"
          >
            data-use terms <ArrowUpRight size={12} />
          </a>{" "}
          before confirming your permitted use. Public model-selection products
          require written consent. Caching rights and external chart branding
          should be confirmed for your intended use.
        </p>
        <button
          className="secondary-button"
          disabled={!connection?.dataKeyConfigured || busy}
          onClick={discover}
        >
          <RefreshCw size={14} className={busy ? "spin" : ""} /> Discover MCP
          tools
        </button>
        {connection?.selectedTool && (
          <p className="fine-print">
            Selected: <code>{connection.selectedTool}</code>
          </p>
        )}
        {tools.length > 0 && (
          <div className="tool-picker">
            <label>
              Read-only language-model tool
              <select
                value={chosen}
                onChange={(e) => setChosen(e.target.value)}
              >
                <option value="">Choose after inspecting schemas</option>
                {tools.map((t) => (
                  <option key={t.name} value={t.name} disabled={!t.eligible}>
                    {t.name}
                    {!t.eligible ? " (not read-only)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {chosen && (
              <>
                <p className="fine-print">
                  {tools.find((t) => t.name === chosen)?.description}
                </p>
                <details>
                  <summary>Discovered input / output schemas</summary>
                  <pre>
                    {JSON.stringify(
                      {
                        input: tools.find((t) => t.name === chosen)
                          ?.inputSchema,
                        output:
                          tools.find((t) => t.name === chosen)?.outputSchema ??
                          "Not supplied",
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
                <label>
                  Arguments (JSON)
                  <textarea
                    value={args}
                    onChange={(e) => setArgs(e.target.value)}
                    rows={3}
                  />
                </label>
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={select}
                >
                  <Check size={14} /> Use this tool
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="connection-block">
        <div className="connection-heading">
          <div className="connection-icon">
            <CircleHelp size={20} />
          </div>
          <div>
            <h3>Conversational advisor</h3>
            <p>Independent from the data connection</p>
          </div>
          <span
            className={`badge ${connection?.advisorConfigured ? "connected" : ""}`}
          >
            {connection?.advisorConfigured ? "Configured" : "Setup needed"}
          </span>
        </div>
        <pre>
          {
            "ADVISOR_API_KEY=your_provider_key\nADVISOR_MODEL=your_model_id\nADVISOR_BASE_URL=https://api.openai.com/v1"
          }
        </pre>
        <p className="fine-print">
          Requires a Responses-compatible provider with structured outputs. Task
          descriptions and recent chat are sent to this provider; the
          explanation call also sends the ranked candidates. No chat content is
          logged or persisted by this app.
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {note && (
        <p className="success" role="status">
          {note}
        </p>
      )}
      <div className="dialog-actions">
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => toggle("demo")}
        >
          Use synthetic demo
        </button>
        <button
          className="primary-button"
          disabled={busy}
          onClick={() => toggle("live")}
        >
          Use live connection <ArrowUpRight size={15} />
        </button>
      </div>
      <p className="fine-print">
        Mode and tool changes last until restart. Persist them with DATA_MODE,
        AA_MCP_TOOL and AA_MCP_ARGS in .env.
      </p>
    </Dialog>
  );
}
