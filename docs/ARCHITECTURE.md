# Architecture Overview

> **Naming note:** The R package is named `drawSEM` and the web frontend source
> lives in `drawsem-web/`. This document refers to components by role where
> that is clearer than repeating implementation-specific paths.

---

## Purpose

This project is a **visual editor for designing, editing, and visualizing
structural equation models (SEMs)**, with a focus on making even complex models
— including multilevel and growth-curve models — clear and easy to work with.

The tool is a **designer and visualizer, not a fitter.** It connects to
statistical backends (currently OpenMx; lavaan and blavaan planned) to run
models, but model fitting is delegated to those tools. The user builds and edits
the model graphically, then passes it to the fitting backend of their choice.

A primary goal is the **schema**: a standardized, backend-agnostic JSON
representation intended to be a portable, reproducible model specification
usable beyond this tool. The intent is for OpenMx and other SEM packages to
implement schema importers and exporters directly, enabling interoperability
across tools. This motivates the schema-first design principle:

> **The JSON schema is always the source of truth.** Backend objects (mxModel,
> etc.) are derived from the schema on demand. Saving, sharing, and versioning
> all operate on the schema.

---

## Two-Layer Structure

```
repo root/                        ← R package (DESCRIPTION, NAMESPACE here)
├── R/                            ← R source (S4 class, converters, validators)
├── tests/testthat/               ← R tests (testthat)
├── inst/
│   ├── htmlwidgets/              ← htmlwidgets binding (YAML, JS bridge)
│   │   └── lib/app/              ← Built web frontend (committed to git)
│   └── extdata/                  ← graph.schema.json (committed copy of drawsem-web/schema/, synced by `make`)
├── drawsem-web/                  ← Web frontend source (NOT in R tarball)
│   ├── src/                      ← TypeScript / React source
│   ├── vite.config.ts            ← Standalone build config
│   └── vite.widget.config.ts     ← Widget build config
└── docs/                         ← Architecture and design reference (authoritative)
```

**R users never need Node.js.** The built web frontend is committed to
`inst/htmlwidgets/lib/app/` and is included when the R package is installed via
`devtools::install_github()`.

**Frontend developers** work in `drawsem-web/` and run
`npm run build:widget` to update the committed assets before pushing. A
pre-commit git hook does this automatically (see `.githooks/`).

---

## Web Frontend: Two Build Targets

The same React codebase produces two outputs:

| Target | Command | Output path | Use |
|--------|---------|-------------|-----|
| Standalone SPA | `npm run build:standalone` | `dist/standalone/` | Browser / GitHub Pages |
| htmlwidgets widget | `npm run build:widget` | `inst/htmlwidgets/lib/app/` | Shiny, Quarto, RMarkdown, RStudio Viewer |

Both targets use the same `App` component. The difference is the **adapter**
injected via React Context:

- **Standalone — `localExporter`:** Loads and saves JSON schema files via the
  browser. No R backend; no R code generation.
- **Widget — `widgetAdapter`:** Bidirectional messaging with R via
  `window.Shiny`. Works in any R/htmlwidgets context (Shiny, Quarto, RMarkdown,
  RStudio Viewer).

Entry points: `src/main-standalone.tsx` and `src/main-widget.tsx`.

---

## R Package: Core Objects

### `GraphModel` S4 Class

The central R object. Slots:

| Slot | Type | Contents |
|------|------|----------|
| `schema` | `list` | The graph schema (nodes, paths, optimization). Node positions live here at `models[[k]]$nodes[[i]]$visual$x/y`. |
| `data` | `list` | Named list of data.frames or file paths, keyed by dataset node label. |
| `metadata` | `list` | UI state and non-schema information (e.g., unsupported features stored for round-tripping). Node positions are NOT here. |
| `lastBuiltModel` | `ANY` | Cached fitted mxModel from the most recent `runModel()` call (or the source model when created by `as.GraphModel(mxModel)`). `NULL` if not yet built. |
| `dataConnections` | `list` | Per-dataset connection state: `status` ("eager"/"lazy"/"unconnected"), `filepath`, `columns`. |

The schema deliberately excludes editor-only runtime ids. The web frontend may
assign internal ids while editing, but those are stripped when exporting schema
JSON so serialized models stay portable and backend-agnostic.

### Key R Functions

| Function | Purpose |
|----------|---------|
| `as.GraphModel(x, data=)` | Create a GraphModel from a schema list, JSON string, file path, or an existing `MxModel` |
| `as.MxModel(graphModel)` | Convert GraphModel → mxModel (builds on demand) |
| `runModel(graphModel)` | Build and fit (OpenMx backend); returns a new GraphModel with fit results in the schema and the fitted model cached in `lastBuiltModel` |
| `exportSchema(graphModel, path)` | Save schema to JSON file |
| `loadGraphModel(filepath, data=, datapath=)` | Load schema + data from disk |
| `validateSchema(schema)` | Validate schema structure and business logic |
| `plotGraphModel(graphModel, ...)` | Render interactive graph widget (auto-detects editability) |
| `plot(graphModel)` / `plot(mxModel)` | S3 plot dispatch; delegates to `plotGraphModel()` |
| `setLocation(graphModel, nodeId, x, y)` | Programmatically set node positions (vectorized, R recycling rules) |
| `setVisualization(graphModel, viewport=, activeLayer=, offLayerVisibility=)` | Set or clear the saved editor view (`visualization`); `NA` = unchanged, `FALSE` = clear |
| `exportImage(graphModel, file, ...)` | Write a diagram to SVG/PNG/PDF headlessly (needs `chromote`; PNG/PDF need `rsvg`) |

### Schema ↔ OpenMx Conversion

Both directions are implemented. `as.MxModel(graphModel)` converts schema →
mxModel; `as.GraphModel(mxModel)` converts in the other direction, extracting
nodes, paths, parameter values, and data from any RAM-type model.

`schemaToOpenMx()` converts a schema to an `mxModel` in six phases:

1. Validate schema; extract optimization settings (fit function, missingness)
2. Find dataset nodes; build `mxData` from incoming `type: "data"` paths
  (`path$label` is the source column name, `path$to` is the target variable)
3. Find constant nodes; collect mean/intercept paths (schema constant label
  `"1"` becomes `"one"` only in OpenMx)
4. Infer manifest variables (from incoming `type: "data"` paths, or explicit
   `variableCharacteristics$manifestLatent`); all other variable nodes are latent
5. Build `mxPath` list — skip `type: "data"` paths. Non-core features already
   relocated to `extensions$pendingCore` on import (link functions, operator
   nodes, 0-arrow paths) are handled per `schemaToOpenMx(onUnsupported=)`:
   `"stop"` (default) refuses with an error listing them; `"ignore"` builds a
   reduced model that omits them, with a warning. Priors stay in core schema
   content; the OpenMx backend is frequentist-only and silently does not apply
   them, with a warning.
6. Assemble `mxModel(type="RAM", ...)` and apply non-ML fit function if specified

Path parameter state is carried by `freeParameter` plus `value` in the schema.
`freeParameter: true` creates an anonymous free parameter; a string value makes
the parameter free and names it in the backend, which also carries equality
constraint semantics in OpenMx. If `freeParameter` is absent, the parameter is
fixed.

Fit results stored on the schema use `fitResults.parameterEstimates`. Mutable
dirty-state is not persisted; staleness is derived transiently from the stored
`structureHash` when fit results are accessed.

For full path-type semantics and the complete conversion spec, see
`docs/DESIGN-DECISIONS.md`.

### Image export (`exportImage()`)

`exportImage()` produces a static SVG/PNG/PDF of a model from the R command line,
matching the editor's *Export Image* button. The SVG is generated by the widget
bundle's own `modelToSVG` generator — exposed as `window.drawSEMExportSVG` — run
in a headless Chrome session via `chromote`; PNG and PDF are converted from that
SVG with `rsvg`, so PDF is true vector output. It calls the generator on the
embedded schema (a pure function of the schema, not a scrape of the interactive
canvas), filling any missing node positions with the frontend `autoLayout` first.
Requires a Chrome/Chromium install; `chromote` and `rsvg` are `Suggests`.

---

## Implementation Status (v0.1)

### Complete
- R package: `GraphModel` S4 class, schema validation, schema → OpenMx
  conversion, `runModel()`, `exportSchema()`, `loadGraphModel()`, `plotGraphModel()`,
  `plot.GraphModel()`, `plot.MxModel()`, `setLocation()`, `setVisualization()`,
  `exportImage()`,
  430+ testthat test cases
- Web frontend: adapter pattern, dual-build, htmlwidgets binding, bidirectional
  Shiny messaging (model load/save, fit requests, save-to-env, fit-status updates)
- Web frontend: auto-layout algorithm (RAMPath) with a toolbar button, SVG
  renderer, SVG/PNG export buttons
- Web frontend: in-memory undo/redo (`src/hooks/useHistory.ts`; Cmd/Ctrl+Z,
  Cmd/Ctrl+Shift+Z, Ctrl+Y) and keyboard shortcuts scoped to the editor
  instance in use (`src/hooks/useEditorKeyboard.ts`): Escape, V/C/P/T tools,
  arrow-key nudge, Delete/Backspace, Cmd/Ctrl+A (select all in the active
  layer), Cmd/Ctrl+L
- Web frontend: multi-selection (`src/utils/selection.ts`; nodes and paths
  together), the same in every context: Shift/Cmd/Ctrl-click toggles an
  element (on macOS only Shift/Cmd; there Ctrl+click acts as a right click,
  `src/utils/platform.ts`); a left-drag on the background draws a selection
  rectangle (the nodes drawn entirely inside it, and each path attached to a
  selected node of which it covers an unbroken 24 units, or half when the
  path is shorter: a path's visible line, curve, self-loop or, for a data
  path, its cable branch without the shared trunk, measured from the path data
  the canvas draws minus the parts under its endpoint nodes. So a box close
  around a node leaves out its paths and a broad one takes them; a path with
  no selected endpoint is never selected. `marqueeSelection()` in
  `src/utils/selection.ts`. Active layer only; the toggle modifiers add to the
  selection, and the existing selection's nodes count as endpoints; while
  dragging, what it would select is drawn as selected, and the selection
  itself changes on release). Nodes are drawn over paths, and a press on
  a node's label selects the node. Dragging, nudging and deleting act on the
  whole selection, one undo step each
- Web frontend: drag-to-many paths (`src/utils/groupEdits.ts`). A path drag
  (right-drag from a node, or the P/T path tools) that starts on a node of a
  multi-selection draws from every selected node; released on a selected node
  it targets every selected node; from one selected node to another it adds
  just that path (one-headed) or a covariance between every pair of selected
  nodes (two-headed). Holding Shift during the drag makes it two-headed (the
  release decides; the T tool is always two-headed). Invalid and duplicate
  pairs are skipped; everything is added as one undo step and summarized in a
  transient notice. The preview shows a line from every source, or the paths
  a release on the hovered node would add
- Web frontend: the popup for a multi-selection shows a summary and, outside
  layout-only mode, group actions (one undo step each): Add means (free
  `mean` paths from the selected constant, else "1", else a new constant below
  the selection), Correlate all (free `covariance` paths between selected
  variables; the paths either adds, and a constant Add means creates, join the selection), free/fixed, parameter name and value for all selected structural
  paths, and the manifest/latent lock for all selected variables ("mixed" when
  they differ), and Duplicate
- Web frontend: copy, cut, paste and duplicate of the selection
  (`src/utils/clipboard.ts`), the same in every context: Cmd/Ctrl+C,
  Cmd/Ctrl+X, Cmd/Ctrl+V, Cmd/Ctrl+D (duplicate, without the clipboard) and
  the multi-selection popup's Duplicate. The clipboard holds a
  JSON fragment in schema shapes (`{"drawSEMClipboard": 1, nodes, paths,
  external}`; labels and `from`/`to`, no runtime ids; `external` names the
  label and type of each path endpoint outside the copy; other text is
  ignored), written with
  `navigator.clipboard` and read from the paste event (else `readText`), so
  a copy in one window pastes in another; an in-memory copy is the fallback
  when the system clipboard is unavailable. Each Cmd/Ctrl+V pastes once,
  whichever of its paste event and `readText` comes first. A real page text
  selection leaves Cmd/Ctrl+C and X to the browser; a press on the diagram
  (background, node or path) clears it. Copied: the selected variables and
  constants (never datasets) and only the selected paths with at least one
  endpoint among them, data paths included (a path between two copied nodes
  only when it is itself selected). In the SEM layer, where data paths cannot
  be selected, the data paths into copied variables come along. Copying only
  paths copies nothing. On paste, an endpoint outside the copy re-attaches to
  the target model's node of the same label and type (variable, constant or
  dataset); the path is dropped when there is none or the types do not fit it
  (a data path runs from a dataset to a variable). Copies get no
  `manifestLatent` lock. Pasted labels are made unique like new nodes
  (`V<n>`, `1b`, else `name_2`); named free parameters are renamed the same
  way (paths sharing a name keep sharing the new one); a pasted data path
  maps the column named like its pasted variable (`X3` mapping `X3` pastes as
  `X3_2` mapping `X3_2`), linked to it (see the data mapping row below).
  Duplicate follows the same rules. Pastes and duplicates step right only, by 1.5 times the width
  of the copied nodes' bounding box (repeated pastes of the same content step
  further); the first paste after a cut is in place. Pastes become the
  selection and are one undo step each, as is a cut, which removes only what
  was copied (with every path touching it): selected datasets stay, selected.
  Layout-only mode: copy only
- Web frontend: data mapping row (`src/utils/dataMapping.ts`). A selected
  variable's popup has one row per data path into it: the dataset, the column
  it maps (the data path's `label`) and a "Same as variable name" checkbox.
  While ticked, the column field is greyed out and shows the variable's label,
  and renaming the variable (inline or in the popup) renames the mapping in
  the same undo step; ticking maps the variable's label, unticking frees the
  field. The tick is a runtime-only flag on the data path (`mappingLinked`),
  never serialized. It is set on load (import, initial load, R `load`) for
  every data path whose column equals its variable's label; R pushes that keep
  the history (`data`, `fit`) keep the flags of data paths that still exist
  (same dataset and variable labels) and tick new ones whose names match; a
  column dropped from the dataset panel ticks the new variable's data path
  (onto an existing node, only when it is named like the column; the node
  keeps its label), as does a dataset -> variable path drag; pasted and
  duplicated data paths are ticked. Once unticked it stays unticked. When the
  dataset's columns are known (its data is loaded), a data path mapping a
  column the dataset lacks is flagged in its row and its cable label is drawn
  as a warning (not in image export)
- Undo history across R round trips (`src/utils/editHistory.ts`): R's
  `update_model` messages carry `kind` (`load` starts a new history, `data` is
  an undo step, `fit` keeps the history); undo/redo carry fit results
  (`provenance`) forward. In `drawSEM()` and the addin the history goes to R on
  Done and is kept in `GraphModel@metadata$editHistory` (never in the schema),
  and comes back when the model is reopened
- Web frontend: zoom/pan (`src/utils/viewport.ts`), the same controls in every
  context: mouse wheel zooms about the cursor; trackpad two-finger scroll pans
  (mouse vs trackpad is a best-effort guess, `isTrackpadWheel()`); pinch and
  Cmd/Ctrl+wheel zoom; right-drag on the background, middle-drag and
  Space+drag pan (Ctrl+drag on macOS counts as a right-drag; right-drag from
  a node still draws a path; left-drag on the background draws a selection
  rectangle). The one exception: the
  embedded widget (`plotGraphModel()`, Quarto/RMarkdown) leaves the plain wheel
  and two-finger scroll to the page and briefly shows a "Ctrl + scroll to zoom"
  (⌘ on macOS) hint. A "Show All" toolbar button (Shift+1) fits the view to
  the model
- Saved view: the viewport and layer state are stored in
  `models[k].visualization` (`viewport`, `activeLayer`, `offLayerVisibility`).
  Applied on load in every context (else the view fits the model). Zoom/pan/
  layer changes are not undo steps and are not synced per edit; the live view
  is written only by the standalone Save and by the RStudio addin's Done (as a
  `setVisualization()` call, when the view changed). `drawSEM()` never writes
  the view back to R; image export ignores it. R: `setVisualization()`
- Headless image export: `exportImage()` (R) via `window.drawSEMExportSVG` (widget)

### Specced, not yet implemented
- lavaan and blavaan backends (v0.2+)
- Link function nodes (ordinal/categorical variables) (v0.2+)
- Operator nodes (log transforms, polynomials, interactions) (v0.3+)
- Multi-model schemas (v0.2+)

---

## Key Commands

### R — run from repo root
```r
devtools::load_all()     # Load package for interactive testing
devtools::test()         # Run testthat suite
devtools::check()        # Full CRAN-style check
```

### TypeScript — run from `drawsem-web/`
```bash
npm install              # First-time setup
npm run dev              # Dev server at localhost:5173 (standalone mode)
npm run build            # Build both standalone + widget
npm run build:widget     # Build widget only (updates inst/htmlwidgets/lib/app/)
npm test -- --run        # Run vitest suite (non-interactive)
```

### Git hooks — set up once after cloning
```bash
git config core.hooksPath .githooks
chmod +x .githooks/*
```
The pre-commit hook fails if the staged `inst/extdata/graph.schema.json`
differs from `drawsem-web/schema/graph.schema.json` (run `make` to sync it),
and, when web-tool sources are staged, runs `npm run build:widget` and stages
the rebuilt widget assets so they stay in sync with the source.
`tests/testthat/test-schema-sync.R` also checks the schema copy, for clones
without hooks enabled.

---

## Where to Find More

| Topic | Location |
|-------|----------|
| Open design questions and settled decisions | `docs/DESIGN-DECISIONS.md` |
| OpenMx concepts AI tools commonly get wrong | `docs/OPENMX-PRIMER.md` |
| Long-term schema vision (target `schemaVersion: 1`) | `docs/SCHEMA-VISION.md` |
| Target schema design — relational core, composition, data layer, expressions | `docs/SCHEMA-DESIGN.md` |
| Application-model benchmark (what must be expressible) | `docs/APPLICATION-MODEL-CATALOG.md` |
| Current tasks and session notes | `ai-workflow/` (gitignored) |

> **Note on `Noise files/`:** This gitignored directory is where AI-generated
> working notes, task specs, and summaries accumulate during development. Treat
> as informal reference only — not authoritative. `docs/` is the source of truth.
