# Skill Insights

Skill Insights turns AI skill definitions into inspectable visual flows. It is designed to plug into Visual Studio Code so developers can trace triggers, decisions, tool calls, permissions, validation, outputs, and failure paths alongside the source that defines them.

![Switching detail levels and filters in the Skill Insights flow view](media/demo.gif)

![The Skill Insights flow view](media/flow-view.png)

![A prompt-injection finding on a skill block](media/findings.png)

Development happens in `src/`. The implementation parses skill definitions into a model-neutral `SkillGraph`, validates that graph, and renders it in an IR-driven React editor with source navigation, findings, responsive layout, manual positioning, and undo/redo. The same editor is hosted both in a standalone browser app and in a VS Code extension.

## Project Status

Workstreams W1-W5 are implemented: the IR and immutable graph operations, Markdown skill parser, validation engine, React visual editor, standalone browser host, and VS Code host integration. Provider emitters, structural diff, and CLI support remain planned workstreams.

See [docs/specification.md](docs/specification.md) for the product definition and [docs/implementation-plan.md](docs/implementation-plan.md) for the engineering roadmap.

## Repository Structure

```text
src/
  ir/                  SkillGraph schema and immutable graph operations
  parsers/             Provider-neutral parser registry and Markdown adapter
  validation/          Rule registry and validation packs
  editor/              Layout, viewport, navigation, findings, history, and host message contract
  app/                 React editor, standalone browser host, and VS Code webview entry
  extension/           VS Code host integration
  testing/             Test-only builders and fixture helpers
e2e/                   Playwright end-to-end specs for the browser host
fixtures/              Clean, malformed, adversarial, and real skill inputs
docs/
  specification.md     Product definition and architecture
  implementation-plan.md
```

## Prerequisites

- Node.js 20 or later
- npm

## Development

Install dependencies from the repository root:

```powershell
npm install
```

Start the standalone browser host with Vite:

```powershell
npm run dev
```

Open the URL printed by Vite, normally `http://127.0.0.1:5173/`. The host loads real fixtures through the parser and validation pipeline. Use the sample selector to inspect clean and adversarial graphs.

## VS Code Extension

Build the bundles, then press `F5` to launch an Extension Development Host:

```powershell
npm run build
```

Open a skill graph from the **Skill Insights** Activity Bar icon, the graph button on a conforming skill editor, or **Open Skill Graph** in a skill file's context menu. The graph opens beside the source, includes a location-grouped skill list, and stays synchronized as workspace or personal skill files change.

Built-in personal locations include `~/.agents/skills`, `~/.copilot`, and the VS Code user prompts folder. Add more roots with `skillInsights.personalSkillLocations`. To inspect a repository in isolation, turn off `skillInsights.includePersonalSkills`; this excludes both built-in and configured personal locations while keeping workspace and explicitly opened skill files.

## Builds

Production builds are split between the reusable TypeScript library and browser bundle:

```powershell
npm run build
npm run build:web
```

## Testing

Run the full repository check before opening a pull request:

```powershell
npm run check
```

This runs linting, strict type checking, the TypeScript build, the browser build, and all Vitest suites. Individual checks are also available:

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:watch
npm run test:e2e
```

`npm run test:e2e` runs the Playwright end-to-end suite against the browser host. It is not part of `npm run check` and needs a one-time browser install; see [End-to-end tests](#end-to-end-tests) below.

Vitest tests are colocated with implementation files as `*.test.ts` or `*.test.tsx`. Parser inputs and expected graphs live under `fixtures/`.

### End-to-end tests

Playwright drives the standalone browser host in a real Chromium instance. Specs live in the top-level `e2e/` directory, which is deliberately outside `src/` so Vitest never collects them and the library build config stays untouched.

Install the browser binary once per machine:

```powershell
npx playwright install chromium
```

Then run the suite:

```powershell
npm run test:e2e
npm run test:e2e:ui
```

Playwright starts the Vite dev server itself on `http://127.0.0.1:5173` with `--strictPort`, and reuses an already running `npm run dev` outside CI. Traces, screenshots, and video are captured on failure under `test-results/`, with an HTML report in `playwright-report/`.

Specs are split by journey:

| Spec | Covers |
| --- | --- |
| `e2e/smoke.spec.ts` | The host renders at all: editor, canvas, inspector, source, view controls. |
| `e2e/samples.spec.ts` | Switching samples re-parses, re-validates, swaps the graph and source, and resets the cursor. |
| `e2e/flow-view.spec.ts` | Detail levels, group expand/collapse, and the built-in graph filters. |
| `e2e/inspection.spec.ts` | Block selection, inspector contents, findings rendering, and go-to-source. |
| `e2e/editing.spec.ts` | Inspector field edits, undo/redo, drag to reposition, and flow-view persistence. |
| `e2e/markdown-preview.spec.ts` | Opening, rendering, and closing the inspector's rich Markdown preview. |

Shared locators and sample helpers live in `e2e/helpers.ts`.

Notes for contributors:

- Specs must use accessible selectors (`getByRole`, `getByLabel`), never `vss-*` CSS classes.
- Specs must not import from `src/testing/`; those helpers are in-process Node utilities and cannot run in a browser-driving test. Choose fixtures through the UI sample selector instead, which exercises parse → validate → render end to end.
- Canvas blocks are viewport-virtualised (`visibleNodeIds` in `src/editor/viewport.ts`), so a small window silently drops blocks from the DOM. Specs pin the wider `wideViewport` from `e2e/helpers.ts`. That window is large enough for the small samples but **not** for `complex`, which still virtualises — never assert an exhaustive block set on it.
- Prefer the `role="status"` block tally (`"{n} of {total} blocks match"`) when asserting that a filter narrowed the graph. It is derived from the projection and is therefore independent of virtualisation.
- Specs pin their sample explicitly through the selector rather than relying on whichever sample loads first, so adding a sample cannot silently retarget them.
- Several assertions pin exact block and finding counts drawn from the fixtures. Editing anything under `fixtures/` will require updating those numbers.
- The inspector's Confidence label wraps both an `<output>` and the range input, and `<output>` is labelable, so `getByLabel('Confidence')` resolves to the readout rather than the slider. Use the `confidenceSlider` and `confidenceOutput` helpers, which address them by role.
- Editing is in-memory only; there is no emitter layer, so nothing is written back to disk. Only the flow-view state reaches `localStorage`, keyed per graph id.
- `npm run test:e2e` is intentionally not part of `npm run check` yet. `npm run typecheck` does type check `e2e/` via `npm run typecheck:e2e`. CI wiring lands in a later change.

## Technology

- TypeScript in strict mode
- React 19, Vite, and Lucide icons
- esbuild for the sandboxed VS Code webview
- VS Code extension and chat APIs
- Zod for runtime schemas and trust-boundary validation
- Unified, Remark, and YAML for skill parsing
- Vitest and Oxlint
