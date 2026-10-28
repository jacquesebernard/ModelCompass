# Recommendation methodology

Measured source facts (intelligence, throughput, prices, benchmark cost), calculated estimates, and inferred suitability are displayed separately. Scores never promise task accuracy.

## Token costs and budgets

```text
base USD per request =
  (input tokens × input USD per million
   + output tokens × output USD per million) / 1,000,000

workload USD = base USD per request × request volume
```

Both token prices must be available. A known zero price is zero; a missing price is unavailable. Estimates exclude unmeasured reasoning tokens, cache effects, tools, provider fees, taxes and unavailable billing details. Benchmark cost per task uses `artificial_analysis_intelligence_index_cost.cost_per_task.total_cost` directly; it is never reconstructed from token prices.

Budgets apply before scoring. Per-request budgets use a single request's cost, regardless of workload volume. Daily/monthly budgets use declared volume with a **30-day month** conversion. A request/batch period cannot establish daily or monthly frequency, so those constraints exclude candidates until usage is clarified. The budget period and assumptions are visible in the advisor panel. A batch's request count is the explicitly entered total, not an implied rate.

## Speed and response duration

The chart uses output tokens/second, not complete response time. When both latency and positive output speed exist:

```text
estimated seconds = measured time to first token + output tokens / output speed
```

Additional reasoning/processing time is not measured. Unknown latency never becomes zero. A hard estimated-duration constraint excludes models without enough data. Latency measurements may use a different prompt length, load or provider than your workload.

## Hard constraints

Apply active name, creator, benchmark-version, minimum intelligence, minimum speed, maximum chart cost, budget, estimated-duration and required-capability constraints first. A missing required metric cannot satisfy a hard constraint. Unknown capabilities cannot satisfy a capability requirement. No model is manufactured to fill an empty shortlist.

General quality is the versioned Intelligence Index. For a task with mapped scores, use its task index only if **every eligible candidate** has a score with the same supplied benchmark context. Otherwise use general intelligence for all candidates and disclose that proxy. Do not compare a task score on one scale with general intelligence on another. Different Intelligence Index versions block combined ranking. Coding/agentic indices are derived subsets of the Intelligence Index and retain that version context. The six capability indices are separately versioned. When their version is absent, their scores are labeled unversioned and cannot replace general intelligence in a comparative ranking.

## Robust relative scores

For each metric in the eligible set, normalize using empirical midrank percentiles:

```text
p(x) = (number of measured values below x + 0.5 × number tied with x)
       / number of measured values
```

Ties receive identical values; extreme magnitudes cannot dominate. Quality and speed use `p`. Cost uses `1 - p`. Missing values earn **no credit**, including on the reversed cost metric, and weights are not redistributed. Thus incomplete metrics cannot inflate a score. A single measured value has percentile 0.5; a Compass score is relative and need not reach 100.

| Priority            | Quality | Output speed | Estimated workload cost |
| ------------------- | ------: | -----------: | ----------------------: |
| Balanced            |     45% |          25% |                     30% |
| Lower cost          |     20% |          10% |                     70% |
| Higher speed        |     20% |          65% |                     15% |
| Higher intelligence |     75% |          10% |                     15% |

`Compass fit score = 100 × weighted sum of normalized metrics`. This is **Model Compass's score**, not an official Artificial Analysis metric. Recommendation ranking always uses the declared workload cost; changing chart cost mode changes the display and maximum-cost filter, not this scoring definition. Model ID resolves score ties deterministically. Difficulty informs the AI's stated requirements; it is not an undocumented score multiplier.

Best fit is the top score. Budget alternative is the highest-scoring eligible model strictly cheaper than best fit; speed alternative is the highest-scoring eligible model strictly faster. If no such alternative exists, the best model fills the role when that metric is known. Duplicate models are merged into one card with multiple roles; at most three candidates are returned. Notes explain shared roles or an empty result.

## AI boundary and grounding

The chat model interprets the conversation into a strict requirements schema. Server validation checks types, finite numbers, ranges and units. A conservative guard independently preserves one unambiguous USD limit with an explicit period in the latest message and shows any correction as an assumption. Ambiguous, negated or multiple limits remain subject to interpretation and clarification; this guard is not a general financial-language parser. Missing material details lead to follow-up questions; defaults are stated as editable assumptions. Application code determines candidates and metrics. Before explanation, candidate IDs and calculated costs/durations are checked against the dataset. The explanation model can select only finite fit/caveat categories for fixed, schema-required candidate slots. The server binds slots to trusted candidate IDs, so the model never generates IDs. Extra or missing slots, unsupported categories and mismatched metrics are rejected. Names and every displayed number come from validated records. The AI receives no tools.

Every rendered advisor answer or clarification is followed by a fixed disclaimer: AI can make mistakes, and users should experiment with different models for their business use case and validate results. This presentation text is independent of provider output and is not added to conversation history sent to the provider.

## Chart scale

The chart defaults to **Top 15 by highest Intelligence Index**, with Top 10, Top 20 and All options. After active filters, chart ordering uses the selected raw metric: intelligence or speed descending, benchmark cost per task or estimated workload cost ascending. No weighted fit score or alphabetical model order determines this leaderboard. Ties use intelligence, speed, then model ID. Missing ranking metrics are excluded from Top N and sorted last in All; known zero costs remain valid. Benchmark costs are never inferred from token prices.

By default, **One configuration per model** retains the highest-intelligence configuration so one base model does not occupy many slots. This is a name-based grouping heuristic: recognized trailing configuration labels such as `(High)` or `(Max, Default Fallback)` are removed within the same creator. Distinct base variants and date/release suffixes remain separate. Disable grouping to compare all configurations. **Leaders across metrics** combines the top N each for intelligence, speed and benchmark cost, deduplicating IDs; its total can be up to three times N. **Choose models** instead uses an exact, user-selected cohort and bypasses configuration grouping, independently of the three-model comparison limit. This supports reproducing a reference comparison set without hardcoding model names or claiming to know the source website's curated cohort.

Rank selection happens before checking chart axes. A cohort model with missing intelligence or speed remains at the front of the table and triggers an explicit notice instead of being silently replaced by a lower-ranked model. Selected/recommended matches outside the cohort are added once when plottable and counted explicitly. The table retains all filtered configurations, with the cohort first; chart limits and grouping do not restrict advisor candidates. Mixed Intelligence Index versions require a version choice before displaying a ranked cohort. Zoom resets when the limit, ranking metric or grouping setting changes.

`radius = max radius × sqrt(cost / max visible-model cost)` so **area**, not radius, is proportional to cost. The radius is capped at **12 px** (9 px on chart widths below 500 px) to keep costs from overwhelming the plot. The visual legend uses the same radii and area ratios (1/16, 1/4 and maximum). A diamond indicates unavailable cost; a cross indicates zero cost. Both still have a keyboard and pointer target independent of visible area. Missing speed/intelligence records are omitted from the plot and retained in the table. Zoom and pan plus keyboard focus/table selection make overlaps usable.

Mouse-wheel zoom scales both axes from 1× to 12× around the cursor; dragging pans the viewport within the data extent. Bubble size remains fixed during navigation so zoom does not exaggerate cost. The three highest-intelligence plottable models in the chosen chart dataset reserve label space while in view, with connector lines and priority over other names. Other labels avoid collisions and their density limit increases with zoom. Long names may be shortened on narrow plots; bubble tooltips and accessible names retain the full name. Zoom and both position sliders remain available for keyboard use.

The table initially places the chart cohort first. A column-header sort applies to all filtered rows and is independent of chart ranking. Repeated activation reverses direction; unavailable values remain last in both directions and known zeros are sorted numerically. Costs use the active cost mode and current workload estimate. Model names and versions use natural string order; model ID breaks ties. Restore chart order clears the column sort.
