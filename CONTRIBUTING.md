# Contributing

Use Node.js 22.12+ and npm. Run `npm ci`, then `npm run dev`. Demo mode requires no credentials. Run `npm run check`, `npm test`, and `npm run build` before submitting changes. CI uses only synthetic data and fake providers.

Keep changes focused on exploration, task requirements, grounded recommendations and comparisons. Preserve the pure engine in `shared/engine.ts` and the small `DataSource` / `AdvisorProvider` interfaces. New provider mappings must cite current official field documentation, validate inputs and outputs, preserve versions, and handle unknown metrics explicitly.

The table, chart model chooser and methodology have separate components. Reuse `src/Dialog.tsx` for focus trapping, Escape handling and focus restoration. Keep API protection in `server/security.ts`; its path matching must stay consistent with Express routing. TypeScript checks unused local declarations and parameters.

Add meaningful tests for changed calculations, hard constraints, data normalization, cache failure handling or grounding. Never make paid external calls in tests. For UI changes, check keyboard operation, visible focus, table parity, empty/disconnected/stale states, and a narrow viewport. Screenshots must use fictional demo data.

Do not contribute credentials, `.env`, real API responses, cached benchmark data or live screenshots. Respect [DATA_RIGHTS.md](DATA_RIGHTS.md). Confirm third-party asset and data rights separately from the application's MIT license. There is no default telemetry.

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

Colors are centralized in `src/styles.css`; creator colors are in `src/format.ts`. The brand color is `#2165BF`, with darker blue derivatives for text and buttons and pale blue surfaces. Preserve the palette's targets of at least [7:1 for text](https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html) and [3:1 for meaningful control boundaries and graphics](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Check tinted backgrounds, alpha-composited badges and bubbles, placeholders, hover/focus states, and operating-system forced colors when changing the palette. Decorative separators can remain subtle. These color targets do not constitute a full accessibility audit.
