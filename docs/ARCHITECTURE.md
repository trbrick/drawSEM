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
│   └── extdata/                  ← Schema JSON examples
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
| `lastBuiltModel` | `ANY` | Cached mxModel from the most recent `as.MxModel()` or `mxRun()` call. `NULL` if not yet built. |
| `dataConnections` | `list` | Per-dataset connection state: `status` ("eager"/"lazy"/"unconnected"), `filepath`, `columns`. |

The schema deliberately excludes editor-only runtime ids. The web frontend may
assign internal ids while editing, but those are stripped when exporting schema
JSON so serialized models stay portable and backend-agnostic.

### Key R Functions

| Function | Purpose |
|----------|---------|
| `as.GraphModel(x, data=)` | Create a GraphModel from a schema list, JSON string, file path, or an existing `MxModel` |
| `as.MxModel(graphModel)` | Convert GraphModel → mxModel (builds on demand) |
| `mxRun(graphModel)` | Build and run; returns GraphModel with cached result in `lastBuiltModel` |
| `exportSchema(graphModel, path)` | Save schema to JSON file |
| `loadGraphModel(schemaFile, dataPath=)` | Load schema + data from disk |
| `validateSchema(schema)` | Validate schema structure and business logic |
| `plotGraphModel(graphModel, ...)` | Render interactive graph widget (auto-detects editability) |
| `plot(graphModel)` / `plot(mxModel)` | S3 plot dispatch; delegates to `plotGraphModel()` |
| `setLocation(graphModel, nodeId, x, y)` | Programmatically set node positions (vectorized, R recycling rules) |

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
5. Build `mxPath` list — skip `type: "data"` paths; flag unsupported features
  (link functions, 0-arrow paths, priors) into `@metadata$unsupported` for
  future round-tripping
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

---

## Implementation Status (v0.1)

### Complete
- R package: `GraphModel` S4 class, schema validation, schema → OpenMx
  conversion, `mxRun()`, `exportSchema()`, `loadGraphModel()`, `plotGraphModel()`,
  `plot.GraphModel()`, `plot.MxModel()`, `setLocation()`, 90+ testthat tests
- Web frontend: adapter pattern, dual-build, htmlwidgets binding, bidirectional
  Shiny messaging (Phase 1, Tasks 1–8)
- Web frontend: auto-layout algorithm (RAMPath), SVG renderer (Tasks 13–14)

### Specced, not yet implemented
- Web frontend: R plotting integration hooks, SVG/PNG export buttons, auto-layout
  toolbar button (Tasks 15–18)
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
npm test                 # Run vitest suite
```

### Git hooks — set up once after cloning
```bash
git config core.hooksPath .githooks
chmod +x .githooks/*
```
The pre-commit hook automatically runs `npm run build:widget` before every
commit so the committed widget assets stay in sync with the source.

---

## Where to Find More

| Topic | Location |
|-------|----------|
| Open design questions and settled decisions | `docs/DESIGN-DECISIONS.md` |
| OpenMx concepts AI tools commonly get wrong | `docs/OPENMX-PRIMER.md` |
| Current tasks and session notes | `ai-workflow/` (gitignored) |

> **Note on `Noise files/`:** This gitignored directory is where AI-generated
> working notes, task specs, and summaries accumulate during development. Treat
> as informal reference only — not authoritative. `docs/` is the source of truth.
