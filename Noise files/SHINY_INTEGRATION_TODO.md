# Implementation TODO: Adapter Pattern & Multi-Backend Export

## Overview

This document outlines the 31 concrete tasks required to implement:
1. **Adapter Pattern**: Refactoring CanvasTool to use pluggable exporters
2. **Dual-Mode Support**: Standalone SPA + Shiny HTMLWidget from same codebase
3. **R Export Pipeline**: TypeScript exporters → R code (OpenMx, lavaan, blavaan)
4. **R Package**: Complete R integration with validators, runners, and schema converters

## Current Status

**Phase 1 Progress: 4/9 tasks completed (44%)**
- ✅ Task 1: Core types and interfaces (9 interfaces, 17 helpers)
- ✅ Task 2: Standalone file exporter (load/save/export with error handling)
- ✅ Task 3: Shiny message passing exporter (bidirectional communication)
- ✅ Task 4: useLocalState hook (debounced 500ms persistence)
- ⏳ Tasks 5-9: Entry points and configuration (not started)

**Test Coverage: 75/97 tests passing (77%)**
- ✅ Task 25: Adapter unit tests completed (23 localExporter + 29 shinyExporter)
- 22 tests skipped (export converters and integration tests - pending R exporters)
- 0 failures, zero TypeScript compilation errors

**Next Steps:** Tasks 5-9 (CanvasTool refactoring, entry points, vite config)

---

## Phase 1: Core Architecture & Refactoring (Tasks 1–9)

### Task 1: Create core types and interfaces
**Status:** ✅ COMPLETED  
**File:** `src/core/types.ts`

Define TypeScript interfaces for the exporter pattern:
- `GraphExporter` interface with methods:
  - `load(source: string): Promise<GraphSchema>`
  - `save(schema: GraphSchema): Promise<void>`
  - `export(schema: GraphSchema, format: 'openmx'|'lavaan'|'blavaan'): Promise<string>`
- `ExportOptions` interface with: `modelId`, `includeComments`, `variableNames`, etc.
- Export result types for success/error handling

Also re-export `GraphSchema` from schema validation for use throughout.

**Important:** Do NOT modify CanvasTool yet.

**Completed:** 9 interfaces + 17 helper functions. All TypeScript strict mode passing, zero compilation errors.

---

### Task 2: Create standalone file exporter adapter
**Status:** ✅ COMPLETED  
**File:** `src/adapters/standalone/localExporter.ts`

Implement `createLocalExporter()` function returning `GraphExporter`:
- `load()`: fetch JSON files from `/examples` or file input
- `save()`: trigger browser download of JSON via Blob
- `export()`: POST to `/api/export` endpoint with `{schema, format}`, return R code string

Include error handling for:
- Malformed JSON
- File not found
- Validation failures

Use existing `validateGraph.ts` for schema validation before returning loaded data.

**Completed:** ~280 lines, ExporterError class, 23 unit tests passing, zero compilation errors. Supports HTTPS, HTTP, /examples paths, and JSON strings.

---

### Task 3: Create Shiny adapter for exporter
**Status:** ✅ COMPLETED  
**File:** `src/adapters/shiny/shinyExporter.ts`

Implement `createShinyExporter()` function returning `GraphExporter`:
- `load()`: Use `window.Shiny.addCustomMessageHandler` to receive model from R
- `save()`: Call `Shiny.setInputValue('graph_model', schema)` to send to R as reactive input
- `export()`: POST to R via `Shiny.setInputValue('export_request', {schema, format})`, listen for `'export_result'` message with R code

Include:
- Shiny context detection (verify `window.Shiny` exists)
- Error handling for missing Shiny or message timeouts

**Completed:** ~330 lines, ShinyExporterError class, 29 unit tests passing, zero compilation errors. Includes bidirectional messaging, context detection, and message timeout handling (configurable, default 30s).

---

### Task 4: Create useLocalState hook for standalone mode
**Status:** ✅ COMPLETED  
**File:** `src/adapters/standalone/useLocalState.ts`

Create custom React hook that persists CanvasTool state to localStorage:
- Auto-save models on every change (debounced 500ms)
- Load from localStorage on mount if available
- Provide explicit `save()`, `load()`, `clear()` functions
- Return object: `{ savedModels, isSaved, lastSavedTime, ...setters }`

Benefits:
- Standalone mode gets automatic recovery on page reload
- **Do NOT use in Shiny mode** (Shiny manages persistence)

**Completed:** ~200 lines, includes useAutoSaveCallback helper, debounced persistence, error recovery. Zero compilation errors.

---

### Task 5: Refactor CanvasTool to accept exporter prop
**Status:** Not Started  
**File:** `src/components/CanvasTool.tsx`

Update component props to include:
- `exporter: GraphExporter` (required)
- `initialSchema?: GraphSchema` (optional)
- `onModelChange?: (schema: GraphSchema) => void` (callback for Shiny sync)

Replace all file I/O logic (import/export buttons) to use `exporter` methods instead of direct fetch/download.
- Remove hardcoded references to `/examples` or file paths
- When user clicks "Export to OpenMx", call `exporter.export(currentSchema, 'openmx')` and display result
- When user loads a model, call `exporter.load(source)` and update state

**Critical:** Keep all canvas rendering and state logic unchanged.  
**Do NOT** change internal state structure or rendering logic.

---

### Task 6: Create standalone entry point
**Status:** Not Started  
**File:** `src/main-standalone.tsx`

New file (rename current `main.tsx` or create alongside):
- Import `CanvasTool`, `createLocalExporter`, `useLocalState`
- Create exporter instance at top level
- Render `<CanvasTool exporter={exporter} />`
- Optionally integrate `useLocalState` hook for persistence
- Maintain current header/layout from `App.tsx` or integrate there

This is the entry point for Vite dev/build in standalone mode.

---

### Task 7: Create Shiny entry point
**Status:** Not Started  
**File:** `src/main-shiny.tsx`

New file for Shiny HTMLWidget mode:
- Import `CanvasTool`, `createShinyExporter`
- Create exporter instance
- Read `initialModel` from `window.graphToolConfig?.initialModel` (set by R)
- Render `<CanvasTool exporter={exporter} initialSchema={initialModel} />`
- After render, call `window.Shiny?.setInputValue('graph_tool_ready', true)` to signal R
- Add `onModelChange` callback that syncs to R via `exporter.save()`

**Do NOT** include file I/O or localStorage.  
All state management delegated to R via Shiny.

---

### Task 8: Update vite.config.ts for multi-entry build
**Status:** Not Started  
**File:** `vite.config.ts`

Modify `build.rollupOptions` to support two entry points:
```
input: {
  standalone: 'src/main-standalone.tsx',
  shiny: 'src/main-shiny.tsx'
}
output: [
  { dir: 'dist/standalone', entryFileNames: '[name].js' },
  { dir: '../r-package/inst/www', entryFileNames: '[name].js' }
]
```

Add npm scripts in `package.json`:
- `build:standalone` → `vite build --mode standalone`
- `build:shiny` → `vite build --mode shiny`
- `build:all` → runs both

Keep `npm run build` as standalone default for backward compatibility.

---

### Task 9: Create server-side export endpoint
**Status:** Not Started  
**File:** `src/server/exportServer.ts` (new, optional)

Create minimal Express server for standalone mode (optional, for dev convenience):
- `POST /api/export` endpoint accepting `{schema: GraphSchema, format: 'openmx'|'lavaan'|'blavaan'}`
- Call corresponding exporter function (created in tasks 10–12)
- Return R code as `text/plain`
- Include error handling with 400 responses
- Start on port 3000 by default

**Alternative:** Embed in Vite dev server plugin if simpler.

---

## Phase 2: TypeScript Exporters (Tasks 10–12)

### Task 10: Create OpenMx exporter module
**Status:** Not Started  
**File:** `src/core/exporters/openMxExporter.ts`

Export function: `exportToOpenMx(schema: GraphSchema, modelId?: string, options?: ExportOptions): string`

Logic:
1. Select model by ID or use first model if not specified
2. For each node:
   - Generate `mxPath()` or `mxData()` call based on `node.type`
   - Variable nodes → `mxPath()` with fromLabel/toLabel
   - Dataset nodes → skip (handled via `datasetFile` metadata)
3. For each path:
   - Generate: `mxPath(from, to, arrows=numberOfArrows, values=value, free=free)`
   - If `parameterType` defined, apply bounds/priors from `optimization.parameterTypes`
   - Handle dataset-to-variable paths (set `fixed=TRUE`)
4. Generate `mxModel()` wrapper: `mxModel(name='modelId', paths=[...], mxData(...))`
5. Add comments with model label and metadata
6. Return formatted R code string

**Handle edge cases:**
- Self-loops (use `loopSide`)
- Two-sided arrows (covariances)
- Missing labels

**Reference:** `graph.schema.json` structure, `examples/graph.example.json`

---

### Task 11: Create lavaan exporter module
**Status:** Not Started  
**File:** `src/core/exporters/lavaarExporter.ts`

Export function: `exportToLavaan(schema: GraphSchema, modelId?: string, options?: ExportOptions): string`

Logic:
1. Select model by ID or use first model
2. Build lavaan model string with sections:
   - **Regressions:** `y ~ x` (single-headed paths)
   - **Covariances:** `x ~~ y` (two-headed paths)
   - **Latent variables:** `f =~ var1 + var2` (mark latent indicator nodes)
3. For each path:
   - If `numberOfArrows=1` → regression: `fromLabel ~ toLabel`
   - If `numberOfArrows=2` → covariance: `fromLabel ~~ toLabel`
   - Add label if `path.label` provided: `name*value`
   - Add constraints from `optimization.bounds` if present
4. Mark latent variables (nodes with `type='variable'` that have incoming paths from constants/other latents)
5. Add comments with model metadata
6. Return formatted model string (ready for `lavaan()` call)

**Handle:**
- Multilevel syntax (`|~` for within-level)
- Priors
- Equality constraints via labels

**Reference:** lavaan syntax documentation

---

### Task 12: Create blavaan exporter module
**Status:** Not Started  
**File:** `src/core/exporters/blavaarExporter.ts`

Export function: `exportToBlavaan(schema: GraphSchema, modelId?: string, options?: ExportOptions): string`

Logic:
1. Base structure identical to lavaan (reuse model string generation from Task 11)
2. Add Bayesian-specific handling:
   - For each path with `parameterType` defined:
     - Extract `prior` from `optimization.parameterTypes[parameterType].prior`
     - Add to blavaan syntax: `label ~ prior('priorString')`
   - For paths with `optimization.bounds`, add constraints
3. Include default priors for parameter types (e.g., loadings ~ `normal(0, 1)`)
4. Wrap in `blavaan()` call with MCMC options:
   - Default: `n.chains=4, n.iter=5000, burnin=1000`
   - Comment these as configurable
5. Add helpful comments about Bayesian interpretation
6. Return formatted R code

**Handle:**
- Posterior predictive checks
- Model comparison priors

**Reference:** blavaan documentation and prior specification format

---

## Phase 3: R Package Infrastructure (Tasks 13–24)

### Task 13: Create R package skeleton
**Status:** Not Started  
**Directory:** `../r-package/` (create at same level as `visual-web-tool/`)

Create directory structure:
```
R/
  graphTool.R (main functions)
  exporters.R (schema importers)
  validators.R (schema validation)
  converters.R (helpers)
  runners.R (run models)
man/                              (roxygen2 docs, autogenerated)
inst/
  www/                            (Vite output after build:shiny)
  extdata/
    graph.schema.json             (copy from visual-web-tool/)
  htmlwidgets/
    graphTool.yaml
    graphTool.js
tests/
  testthat/
    test-exporters.R
    test-validators.R
DESCRIPTION
NAMESPACE
.gitignore
README.md
```

**Method:** Run `usethis::create_package()` or manually create all files.  
**Do NOT** populate functions yet (handled in tasks 14+).

---

### Task 14: Write R package graphTool HTMLWidget binding
**Status:** Not Started  
**Files:**
- `R/graphTool.R`
- `inst/htmlwidgets/graphTool.yaml`
- `inst/htmlwidgets/graphTool.js`

**R/graphTool.R:**
```r
#' @export
graphTool <- function(
  initialModel = NULL,
  outputId = NULL,
  width = '100%',
  height = '600px',
  ...
) {
  # Validate initialModel if provided using validateGraphSchema()
  # Call htmlwidgets::createWidget(
  #   'graphTool',
  #   list(model = initialModel),
  #   width = width,
  #   height = height,
  #   package = 'visualWebTool'
  # )
  # Register renderGraphTool() S3 method
}
```

**graphTool.yaml:**
- Name: `graphTool`
- Dependencies: `shiny (>= 1.5)`
- Script: `www/main-shiny.js` (generated by Vite)

**graphTool.js:**
- Define `HTMLWidgets.widget('graphTool', ...)`
- `renderValue()`: Set `window.graphToolConfig = {initialModel: x.model}`
- Load Vite dist files (`main-shiny.js`)

**Reference:** htmlwidgets documentation

---

### Task 15: Write R schema validator function
**Status:** Not Started  
**File:** `R/validators.R`

Export function: `validateGraphSchema(schema, verbose = TRUE)`

Logic:
- Load JSON schema from `inst/extdata/graph.schema.json`
- Use `jsonschema` package: `jsonschema::validate(schema, schema_obj)`
- If invalid, throw error with validation messages
- If `verbose`, cat() success message
- Return `TRUE` invisibly if valid

**Support:**
- Both list (parsed JSON) and character (JSON string) input
- Helper to read schema JSON from file

**Dependency:** Add `jsonschema` to `Imports` in `DESCRIPTION`

---

### Task 16: Write R OpenMx exporter
**Status:** Not Started  
**File:** `R/exporters.R` (or `R/openMxExporter.R`)

Export function: `exportToOpenMx(schema, modelId = NULL, includeComments = TRUE)`

Logic:
- Validate schema using `validateGraphSchema()`
- Select model: if `modelId` is NULL, use first model by name
- Build mxModel code:
  - Extract nodes from `schema[[modelId]]$nodes`
  - For variable nodes: create `mxPath()` calls
  - Extract paths from `schema[[modelId]]$paths`
  - For each path: `mxPath(from=fromLabel, to=toLabel, arrows=numberOfArrows, values=value, free=free)`
  - Apply `optimization.parameterTypes` bounds/priors if present
  - Handle parameter type lookups: if `path$parameterType` defined, fetch defaults from `schema[[modelId]]$optimization$parameterTypes[[parameterType]]`
- Return as character string of formatted R code
- Optionally include comments (model name, metadata, node labels)

**Dependency:** `glue` package for string interpolation  
**Test:** Against `examples/graph.example.json` to ensure valid mxModel output

---

### Task 17: Write R lavaan exporter
**Status:** Not Started  
**File:** `R/exporters.R` (append to file from Task 16)

Export function: `exportToLavaan(schema, modelId = NULL, includeComments = TRUE, syntax = 'standard')`

Logic:
- Validate schema
- Select model
- Build lavaan model string (not wrapped in `lavaan()` call yet):
  - Iterate paths, separate by `numberOfArrows`:
    - `numberOfArrows=1`: regression section (`y ~ x`)
    - `numberOfArrows=2`: covariance section (`x ~~ y`)
  - Include labels if `path$label` provided
  - Add values if `path$value != 1.0`: `label*value`
  - Add constraints from `optimization.bounds` as comments or direct constraints
  - Add multilevel syntax if any nodes have `levelOfMeasurement` (`|~` for within, regular for between)
- Return formatted model string (ready to paste into `lavaan()` call)
- Optional: Return as character vector with section names for clarity

**Support:** `syntax='standard'` or `syntax='extended'` for future enhancements  
**Test:** With `examples/graph.example.json`

---

### Task 18: Write R blavaan exporter
**Status:** Not Started  
**File:** `R/exporters.R` (append to file from Tasks 16–17)

Export function: `exportToBlavaan(schema, modelId = NULL, priors = 'default', includeComments = TRUE)`

Logic:
- Validate schema
- Select model
- Build blavaan model string (extend lavaan from Task 17):
  - Include all lavaan model specification
  - Add prior section:
    - For each path with `parameterType` defined:
      - Fetch `prior` from `schema[[modelId]]$optimization$parameterTypes[[parameterType]]$prior`
      - Format as blavaan prior: `label ~ 'normal(0, 1)'` or similar
    - Use `priors='default'` to supply sensible defaults (`normal(0,1)` for loadings, etc.)
    - Use `priors='none'` to skip priors
  - Add bounds from `optimization.bounds` as constraints
- Return model string + MCMC configuration as comments
- Optional: Include sampler settings (`n.chains`, `n.iter`, `burnin`) with defaults

**Test:** Output is valid for `blavaan::blavaan()`  
**Handle:** Prior specification format conversion (schema format → blavaan syntax)

---

### Task 19: Write R runOpenMx wrapper
**Status:** Not Started  
**File:** `R/runners.R` (or new file)

Export function: `runOpenMx(schema, modelId = NULL, dataName = NULL, returnCode = FALSE)`

Logic:
- Export code using `exportToOpenMx()`
- If `returnCode=TRUE`, return code string (for inspection)
- Otherwise:
  - `eval(parse(text=code))` in caller's environment via `eval.parent()`
  - Load data if `dataName` provided (dataset mapping from `schema$nodes`)
  - Return mxModel object invisibly (or model fit if user runs `mxRun`)
  - Print success message with model name
- Include error handling: if eval fails, show error + code for debugging

**Enables:**
- `result <- runOpenMx(schema); result <- mxRun(result)`
- Or: `runOpenMx(schema); myModel <- mxRun(myModel)`

**Dependency:** OpenMx installed (check with `requireNamespace`)

---

### Task 20: Write R runLavaan and runBlavaan wrappers
**Status:** Not Started  
**File:** `R/runners.R` (extend from Task 19)

Export function: `runLavaan(schema, modelId = NULL, data = NULL, returnCode = FALSE, ...)`
- Export code using `exportToLavaan()`
- If `returnCode=TRUE`, return code string
- Otherwise:
  - `eval(parse(text=code))` with `...` args passed to `lavaan::lavaan()`
  - Auto-pass data if provided or inferred from `schema$datasetFile`
  - Return fit object
  - Print summary of model fit

Export function: `runBlavaan(schema, modelId = NULL, data = NULL, returnCode = FALSE, inpfile = NULL, ...)`
- Export code using `exportToBlavaan()`
- If `returnCode=TRUE`, return code
- Otherwise:
  - `eval(parse(text=code))` with `...` passed to `blavaan::blavaan()`
  - Handle MCMC options (`.rng_seed`, `parallel=`, etc.)
  - Optional: save to `inpfile` for reproducibility
  - Return blavaan fit object (requires MCMC to complete)

**Dependencies:** `lavaan`, `blavaan` (optional/suggested)

---

### Task 21: Write R schema-to-dataframe converters
**Status:** Not Started  
**File:** `R/converters.R` (new file)

Export helper functions for R users working with schema directly:

**nodesAsDataFrame(schema, modelId = NULL):**
- Return `data.frame` with columns: `label`, `type`, `levelOfMeasurement`, `x`, `y`, `width`, `height`
- One row per node
- Easy to inspect/modify node properties in R

**pathsAsDataFrame(schema, modelId = NULL):**
- Return `data.frame`: `fromLabel`, `toLabel`, `numberOfArrows`, `value`, `free`, `parameterType`, `label`, `description`
- Easy to inspect/modify paths in R

**Enables:**
```r
nodes <- nodesAsDataFrame(schema)
nodes$x <- nodes$x + 100  # batch edit positions

paths <- pathsAsDataFrame(schema)
paths$value[paths$parameterType=='loading'] <- 1.0
```

**Future:** Include reverse converters (dataFrameToSchema) if needed later

---

### Task 22: Create R tests for exporters
**Status:** Not Started  
**File:** `tests/testthat/test-exporters.R` (new)

Test each exporter function:

```r
test_that('exportToOpenMx generates valid mxModel code', {
  schema <- jsonlite::read_json('fixtures/graph.example.json')
  code <- exportToOpenMx(schema, 'model1')
  expect_is(code, 'character')
  expect_match(code, 'mxModel')
  # eval code and verify it creates an mxModel object
})

test_that('exportToLavaan generates valid model string', {
  code <- exportToLavaan(schema, 'model1')
  expect_match(code, '~')
  expect_no_match(code, '<<<')  # no incomplete interpolations
})

test_that('exportToBlavaan includes prior specifications', {
  code <- exportToBlavaan(schema, 'model1')
  expect_match(code, 'prior')
})

test_that('validateGraphSchema rejects invalid schema', {
  expect_error(validateGraphSchema(list(schemaVersion=1)))  # missing models
})
```

**Use:** `testthat` package  
**Include:** Fixtures (JSON files) in `tests/testthat/fixtures/`

---

### Task 23: Create R package documentation
**Status:** Not Started  
**Files:** `man/*.Rd` (auto-generated from roxygen2 comments)

Add roxygen2 comments to all exported functions:
- `graphTool()` → create visual editor widget
- `exportToOpenMx()`, `exportToLavaan()`, `exportToBlavaan()` → export schema to code
- `runOpenMx()`, `runLavaan()`, `runBlavaan()` → export and run models
- `validateGraphSchema()` → validate JSON against schema
- `nodesAsDataFrame()`, `pathsAsDataFrame()` → inspect schema as R objects

For each function document:
- `@title`: Brief title
- `@description`: Longer description
- `@param`: All parameters with examples
- `@return`: What function returns
- `@examples`: Working example code
- `@export`: Mark for exporting

**Process:**
- Run `devtools::document()` to generate `man/*.Rd` from roxygen2
- Build reference site: `pkgdown::build_site()`

---

### Task 24: Copy schema file to R package
**Status:** Not Started  
**File:** `../r-package/inst/extdata/graph.schema.json`

Copy (or symlink) `visual-web-tool/schema/graph.schema.json` to R package.

- `R/validators.R` will load from this location
- Ensure both stay in sync (document this in copilot-instructions or build script)
- **Alternative:** Add build script to Vite that copies schema as part of `build:shiny`

---

## Phase 4: Testing & Documentation (Tasks 25–31)

### Task 25: Add integration tests: TypeScript exporters
**Status:** ✅ COMPLETED  
**Files:** `tests/adapters/localExporter.test.ts`, `tests/adapters/shinyExporter.test.ts`

Unit test coverage for both adapters:

**localExporter.test.ts:** 23 tests
- load() tests: HTTPS, HTTP, /examples paths, JSON strings, error cases
- save() tests: download triggers, timestamp filenames, error handling
- export() tests: all three formats (openmx, lavaan, blavaan), options, error handling

**shinyExporter.test.ts:** 29 tests
- isShinyContext() and context detection (3 tests)
- load() tests: initialModel, message handlers, timeouts, error cases (6 tests)
- save() tests: message passing, validation, error cases (4 tests)
- export() tests: bidirectional messaging, all formats, timeouts, error cases (10 tests)
- Error handling and code properties (6 tests)

**Test Results:** 75 tests passing (including 18 validation tests, 5 fixture tests), 22 skipped, 0 failures. All TypeScript strict mode, zero compilation errors.

---

### Task 26: Update GitHub Actions / CI for dual builds
**Status:** Not Started  
**File:** `.github/workflows/build.yml` (or update existing)

Add CI steps:
1. `npm install` (TypeScript)
2. `npm run build:standalone && npm run build:shiny` (generate both Vite outputs)
3. Copy dist outputs to `r-package/inst/www/` (or Vite config does this)
4. `cd ../r-package && R CMD check` (R package validation)
5. `npm run test` (TypeScript tests)
6. `cd ../r-package && devtools::test()` (R tests)

**Ensure:** Both TS and R tests pass before merge  
**Add:** Artifact uploads for built Vite dist and R package tarball

---

### Task 27: Create example R scripts demonstrating all export modes
**Status:** Not Started  
**File:** `../r-package/inst/examples/export_examples.R`

Show all three workflows:

```r
# Load from Shiny widget
library(visualWebTool)
ui <- fluidPage(graphTool(outputId='graph'))
server <- function(input, output) {
  observeEvent(input$graph_model, {
    cat('User modified model:', jsonlite::toJSON(input$graph_model))
    code <- exportToOpenMx(input$graph_model)
    print(code)
  })
}
shinyApp(ui, server)

# Standalone: Load JSON and export
schema <- jsonlite::read_json('graph.example.json')
code <- exportToOpenMx(schema, 'model1')
model <- eval(parse(text=code))
fit <- mxRun(model)

# All three exporters
lapply(c('openmx', 'lavaan', 'blavaan'), function(fmt) {
  code <- get(paste0('exportTo', tools::toTitleCase(fmt)))(schema, 'model1')
  cat('\n---', fmt, '---\n', code, sep='')
})
```

**Include:** Comments explaining each approach

---

### Task 28: Write README for R package
**Status:** Not Started  
**File:** `../r-package/README.md`

Cover:
- **Package purpose:** Export visual models from web tool to R backends (OpenMx, lavaan, blavaan)
- **Installation:** `devtools::install_github('trb21/.../r-package')`
- **Quick start:**
  - As Shiny widget: `graphTool()` in UI
  - Standalone: `exportToOpenMx(schema)` → code
  - Run directly: `runOpenMx(schema)` → fit
- **API overview:** What each function does
- **Schema format:** Brief explanation of `graph.schema.json` structure
- **Examples:** Point to `inst/examples/`
- **Development:** How schema is validated, how to extend

**Keep:** Concise; full docs in `man/` pages

---

### Task 29: Update copilot-instructions.md with new architecture
**Status:** Not Started  
**File:** `.github/copilot-instructions.md`

Add sections:
- **Architecture overview:** core + standalone adapter + Shiny adapter
- **File structure:** where each layer lives
- **Exporter pattern:** `GraphExporter` interface, how adapters work
- **R integration:** schema→exporters→R code pipeline
- **Build process:** `npm run build:standalone` vs `build:shiny`
- **Testing:** how to test both TS and R layers
- **Development workflow:** how to modify exporters, test changes, deploy

**Update:**
- References to file locations (new `src/core/`, `src/adapters/` paths)
- Mention R package location and dependencies

---

### Task 30: Update project README with dual-mode documentation
**Status:** Not Started  
**Files:** `visual-web-tool/README.md` and/or project root `README.md`

At project root or main README:
- **Explain two modes:** standalone (SPA) and Shiny (HTMLWidget)
- **Quick start for each:**
  - Standalone: `npm run dev` → `http://localhost:5173`
  - Shiny: `devtools::load_all(); graphTool()`
- **Link** to both TS and R package docs
- **Architecture diagram** (ASCII or reference)
- **Directory structure** showing both tools

**Keep:** High-level; link to detailed `copilot-instructions` for developers

---

### Task 31: Create migration guide for existing users
**Status:** Not Started  
**File:** `MIGRATION.md` or `Noise files/MIGRATION_TO_ADAPTERS.md`

Document breaking changes (if any):
- `CanvasTool` now requires `exporter` prop (used to be optional)
- Main entry point changed from `main.tsx` to `main-standalone.tsx` or `main-shiny.tsx`
- File I/O logic moved to adapters (users of `CanvasTool` directly need to update)

Provide examples:
- How to update custom integrations to use new exporter pattern
- How to create custom exporter for other backends

**Note:** This should be brief; architecture is backward-compatible in spirit (schema unchanged)

---

## Task Summary by Timeline

| Phase | Tasks | Priority | Est. Effort |
|-------|-------|----------|------------|
| **Phase 1: Core** | 1–9 | **Critical** | 2–3 weeks |
| **Phase 2: TS Exporters** | 10–12 | **High** | 1–2 weeks |
| **Phase 3: R Package** | 13–24 | **High** | 2–3 weeks |
| **Phase 4: Testing & Docs** | 25–31 | **Medium** | 1–2 weeks |

**Total estimated effort:** 6–10 weeks for full implementation

---

## Notes

- All tasks build on the existing `graph.schema.json` (no schema changes needed)
- Tasks can be parallelized: Phase 2 exporters can start once Phase 1 is complete
- Phase 3 R package can be developed in parallel with Phase 1–2
- Phase 4 happens at the end to validate everything works together
- Each task is self-contained with clear acceptance criteria
