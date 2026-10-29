import { ExternalLink } from "lucide-react";
import Dialog from "./Dialog";
export default function MethodologyDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <Dialog
      className="methodology"
      titleId="method-title"
      closeLabel="Close methodology"
      onClose={onClose}
    >
      <span className="eyebrow">A LITTLE TRANSPARENCY</span>
      <h2 id="method-title">A compass, not a crystal ball.</h2>
      <p>
        Measured facts, calculated costs, and inferred suitability each play a
        different part.
      </p>
      <h3>Read the landscape</h3>
      <p>
        X is median output tokens per second. Y is the Intelligence Index with
        its version preserved. Bubble area is proportional to cost; radius =
        maximum radius × √(cost / maximum cost). Diamonds mean unavailable cost;
        a cross means zero cost.
      </p>
      <p>
        Scroll over the plot to zoom around your mouse, and drag to pan
        horizontally or vertically. Zoom reveals more names. The top three
        plotted models by intelligence keep priority labels while in view. Zoom
        and position sliders also support keyboard use. Table column headers
        sort in either direction, with unavailable values always last.
      </p>
      <p>
        Top models rank by the raw chart metric, starting with highest
        intelligence. One configuration per model uses its highest intelligence
        setting. Choose another metric, combine leaders across metrics, or use
        Choose models for an exact comparison set. Models missing either axis
        stay in the table.
      </p>
      <h3>Estimate the bill</h3>
      <pre>
        {
          "((input tokens × input $/1M)\n+ (output tokens × output $/1M))\n÷ 1,000,000 × requests"
        }
      </pre>
      <p>
        Budget conversions use a 30-day month. A per-request budget is checked
        against one request. A monthly or daily budget needs a volume with a
        matching or convertible period. Benchmark cost per task comes directly
        from the source and never from token prices.
      </p>
      <h3>Recommend reproducibly</h3>
      <p>
        Hard constraints and active filters apply first. Quality, speed, and
        estimated workload cost are normalized using empirical midrank
        percentiles: (count below + ½ count tied) / count measured. Missing
        values receive no score credit; candidates are excluded when missing
        data prevents them from meeting an explicit hard constraint. Cost
        percentiles are reversed. We combine these metrics with the weights
        below:
      </p>
      <table>
        <thead>
          <tr>
            <th>Priority</th>
            <th>Quality</th>
            <th>Speed</th>
            <th>Estimated workload cost</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Balanced</td>
            <td>45%</td>
            <td>25%</td>
            <td>30%</td>
          </tr>
          <tr>
            <td>Lower cost</td>
            <td>20%</td>
            <td>10%</td>
            <td>70%</td>
          </tr>
          <tr>
            <td>Higher speed</td>
            <td>20%</td>
            <td>65%</td>
            <td>15%</td>
          </tr>
          <tr>
            <td>Higher intelligence</td>
            <td>75%</td>
            <td>10%</td>
            <td>15%</td>
          </tr>
        </tbody>
      </table>
      <p>
        Recommendation scores and budget alternatives always use estimated
        workload cost from your current workload. The chart’s Bubble size
        setting changes the displayed cost measure and maximum-cost filter, but
        not recommendation scoring.
      </p>
      <p>
        The Compass fit score is this app’s relative score, not an official
        Artificial Analysis metric. Comparable task-specific indices replace
        general intelligence only when every eligible candidate has the same
        benchmark context. Otherwise we state the proxy limitation. IDs break
        ties deterministically.
      </p>
      <h3>Keep the shortlist honest</h3>
      <p>
        Best fit is the highest score. Alternatives are the highest-scoring
        viable candidates that are cheaper or faster than the best fit. A model
        can fill multiple roles. Unknown capabilities cannot satisfy a hard
        capability requirement. Benchmark results do not promise accuracy on
        your task.
      </p>
      <h3>Know the source</h3>
      <p>
        Demo mode uses only fictional fixtures. Live data comes from the
        server’s Artificial Analysis MCP connection, with a configurable cache
        and a visible last successful refresh. No scraping or alternative data
        source is used. Artificial Analysis does not endorse this app.
      </p>
      <a
        className="text-button"
        href="https://artificialanalysis.ai/data-api/docs/mcp"
        target="_blank"
        rel="noreferrer"
      >
        Artificial Analysis documentation <ExternalLink size={13} />
      </a>
    </Dialog>
  );
}
