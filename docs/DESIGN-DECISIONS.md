# Design Decisions

This document has two sections:

- **Settled decisions:** Choices that have been made and are reflected in the
  current code. AI tools must not re-litigate these unless explicitly asked.
- **Open questions:** Genuinely undecided design questions. AI tools must not
  resolve these unilaterally — raise them with the developer before proceeding.

**Scope of this document.** These decisions describe the **currently implemented**
schema, designated `schemaVersion: 0`. The **target** architecture
(`schemaVersion: 1`) lives in `SCHEMA-VISION.md` (the vision) and `SCHEMA-DESIGN.md`
(the design); several open questions below carry a proposed target direction there,
noted inline. Do not build target-design features against the current schema without
explicit direction.

---

## Settled Decisions

### Schema

- The JSON schema is the source of truth. Backend objects (mxModel, etc.) are
  derived on demand and are never themselves the canonical representation.
- The schema is intended to be a **portable, backend-agnostic model spec** —
  not just an internal format. The goal is for SEM packages (starting with
  OpenMx) to implement schema importers and exporters directly.
- Current schema version: **`schemaVersion: 0`**; `1` is reserved for the
  target design (`SCHEMA-DESIGN.md`).
- Schema design should favour **readability and unambiguity**: a schema should
  be straightforward for a human to read and understand, and equally
  straightforward for an AI to generate, validate, or modify correctly. Prefer
  explicit structure over clever inference; avoid representations that require
  context outside the schema to interpret.

### Node Types

| Type | Purpose | Status |
|------|---------|--------|
| `variable` | Statistical variable (latent or manifest) | Implemented |
| `constant` | Unit vector / intercept node (label `"1"`) | Implemented |
| `dataset` | Data source (CSV or data.frame) | Implemented |
| `linkFunction` | Threshold/link transform for ordinal variables | v0.2+ |
| `operator` | General transform (log, polynomial, interaction, etc.) | v0.3+ |

### Manifest/Latent Inference

- Manifest vs. latent is **inferred** from structure, not required as a node
  property.  
- A `variable` node is manifest if it has an incoming `type: "data"` path from
  a `dataset` node, or if `variableCharacteristics.manifestLatent` is
  explicitly set to `"manifest"`.
- All other `variable` nodes are treated as latent.
- Explicit `variableCharacteristics.manifestLatent` always overrides inference.

**Rationale:** A variable is manifest *because data is connected to it*, not
because it has been labeled as such. This keeps the graph structure
self-consistent: adding or removing a data connection automatically changes the
variable's role without requiring any node property update. It also supports
composability — a latent factor can substitute for any manifest variable (or
vice versa) purely by changing connections. Do not "fix" schemas by adding
explicit `manifestLatent` properties where they are absent; their absence is
intentional.

### Constant Nodes

- Constant nodes represent the unit vector (means/intercepts).
- In the schema, the constant node label is `"1"`.
- That schema label is translated to `"one"` only when building OpenMx
  `mxPath` entries (OpenMx RAM convention).
- Multiple constant nodes are allowed (e.g., for layout); all contribute to the
  means model.

### Node Positions

- Stored directly in the schema at `models[[k]]$nodes[[i]]$visual$x` and
  `$visual$y`.
- Not stored in a separate metadata structure.
- This makes positions part of the schema round-trip.
- Coordinates are **relative to the model's root**, not absolute canvas
  coordinates. This is important for multilevel and composed models, where
  sub-models may be positioned within a parent model's coordinate space.

### Data Connection (Current Implementation)

- Data column → variable mapping is done via **`type: "data"` paths** from a
  `dataset` node to a `variable` node.
- The path's `label` is the source column name in the dataset.
- Dataset nodes do **not** carry a separate `mappings` field in the schema.
- `type: "data"` paths do NOT generate `mxPath` entries; they are used only to
  identify observed variables and build `mxData`.
- For backward compatibility, the R layer may still recognize legacy
  `parameterType: "dataMapping"` when importing older schemas, but that is no
  longer part of the current schema contract.

### Path Semantics

| `numberOfArrows` | Meaning | OpenMx `mxPath` arrows |
|-----------------|---------|------------------------|
| 1 | Directed path (regression, factor loading, or mean from constant) | 1 |
| 2 | Covariance or variance (self-loop or cross) | 2 |

**Note on `numberOfArrows: 0`:** OpenMx uses 0-arrow paths as a convention for
the Pearson selection operator. This schema does not currently use that
convention, and JSON schema validation rejects it. The R layer may still accept
0-arrow paths when importing OpenMx-derived structures so they can be preserved
as unsupported features in `@metadata$unsupported` instead of failing
immediately.

### Schema Boundary vs. Runtime State

- The schema does **not** store node or path `id` fields.
- Runtime/editor code may maintain internal ids for React rendering, selection,
  and drag interactions.
- Serialization boundaries must translate runtime ids back to schema references
  (`from`, `to`, and node `label` values) so saved schemas remain portable and
  backend-agnostic.

### Path Parameter Semantics

- `freeParameter` is the schema field that controls whether a path parameter is
  fixed or free.
- If `freeParameter` is absent, the parameter is fixed.
- If `freeParameter` is `true`, the parameter is free with no explicit name.
- If `freeParameter` is a non-empty string, the parameter is free and that
  string becomes the backend parameter label, which also implies an equality
  constraint when reused.
- `freeParameter: false` is not part of the current schema contract; omission is
  used for fixed parameters.

### Unsupported Features

Features the core schema cannot yet represent are not silently dropped, but the
mechanism differs by why they're unsupported:

- **Structurally non-core** (`linkFunction` / `operator` nodes, 0-headed paths):
  on import, `extractPendingCore()` relocates them out of the model's core
  `nodes`/`paths` into `model$extensions$pendingCore`, verbatim, so the cleaned
  core validates strictly and the rest of the model still loads and renders.
  Any path incident to a relocated node is relocated with it, so the cleaned
  core never has a dangling `from`/`to`. Each entry carries `kind`, the verbatim
  `object`, and an `origin` (e.g. `nativeForm: "zeroHeadedPath"`).
  `stampExporter()` additionally stamps `origin$exporter` (tool + version) on
  every entry each time the schema is written — last-writer-wins, since the
  serializing tool may differ from the one that originally created the entry.
  A single warning listing every entry is emitted on both import and export
  (`warnPendingCore()`), because pendingCore content is pure passthrough — it
  is never re-validated against the rest of the model, so an edit elsewhere may
  silently invalidate it.
- **Core-but-inert** (priors): schema-valid content the OpenMx converter simply
  does not apply, since OpenMx is frequentist-only. These stay in core
  (`optimization.prior` / per-path `optimization.prior`) rather than being
  relocated, with a warning at import. See Open Question 9.

At conversion time, `schemaToOpenMx(onUnsupported=)` decides what happens to a
model's `extensions$pendingCore`: `"stop"` (default) refuses, listing every
entry; `"ignore"` builds a reduced model that omits them (with a warning),
leaving them in the schema untouched. No backend reconstructor exists yet for
any pendingCore kind, so an entry is never rebuilt back into the fitted model —
only ignored or refused.

This is distinct from `@metadata$unsupported`, a boolean flag set recomputed
on every import (`collectUnsupportedFeatures()`) purely to drive an import-time
warning; it is explicitly **not persisted** and plays no part in round-tripping.

### Parameter bounds, priors, and starting values

- Bounds, priors, and starting values follow a **CSS-like cascade**: defaults
  are set at the `parameterType` level (in `optimization.parameterTypes`) and
  can be overridden per-path in the path's own `optimization` field. Per-path
  values always win.
- Path starting values are stored directly on the path as `value`.
- **`start` is an advisory computational hint, not portable statistical
  meaning.** It influences the optimization path, not the estimand; a backend
  may ignore or recompute it. Bounds, priors, and starting values are each
  optional layers — any may be absent, and a given backend may decline to apply
  a layer it does not support (e.g. OpenMx ignores priors). See
  `SCHEMA-DESIGN.md` §10 (analysis-config vs. computational settings). The v1
  split of `optimization` into analysis-config vs. computational slots — and
  where `bounds` belongs — is deferred.
- The OpenMx converter **does not apply priors** (OpenMx is frequentist);
  they are stored for future use by blavaan and other Bayesian backends. This is
  safe only while priors are weakly informative; see Open Question 9.
- Bounds are stored but not currently passed to `mxPath` in v0.1.

### Node Metadata in Schema

- Nodes may include a human-readable `description`.
- Nodes may include `bindingMappings` for non-structural binding metadata.
- `customTags` is no longer part of the current schema contract.

### Fit Results

- Stored fit results use `fitResults.parameterEstimates`, not
  `fitResults.parameters`.
- Persisted `fitResults.isDirty` is not part of the schema.
- Staleness is derived transiently from `structureHash`; accessors expose this
  as `isStale` rather than storing mutable dirty-state in the schema.

### OpenMx Expectation

- v0.1 supports RAM expectation only (`type = "RAM"` in `mxModel`).
- LISREL, state-space, and other expectations are deferred.

### Fit Functions

- Supported in v0.1: ML (default), WLS, DWLS, ULS, GLS.
- All others produce a warning and fall back to ML.

### Data: v0.1 Constraints

- One dataset node per model only.
- `datasetSource` on the dataset node specifies `type: "embedded"` (data in
  schema) or `type: "file"` with a `location` path.

### Web Frontend Architecture

- The same React `App` component is used for both the standalone web tool and
  the R htmlwidget. The deployment context is set by injecting a different
  adapter via React Context at the entry point.
- Standalone (`localExporter`): JSON file load/save in the browser; no R code
  generation.
- Widget (`widgetAdapter`): bidirectional messaging with R via `window.Shiny`;
  works in any R/htmlwidgets context.
- Built widget assets are committed to `inst/htmlwidgets/lib/app/` so R users
  need no Node.js.

### Repository layout

- `Noise files/` is gitignored. AI-generated notes, task specs, and summaries
  should go there, not in the tracked repo. Do not create summary or task
  files in the main repo directories.
- `docs/` is the authoritative reference for architecture and design.
- `ai-workflow/` (gitignored) is for active session notes and task tracking.

---

## Open Questions

These are unresolved design decisions. Do not implement solutions to these
without explicit direction from the developer.

### 1. Data connection model (high impact)

**Target direction (`schemaVersion: 1`):** a separate relational data layer
(option 5) — see `SCHEMA-DESIGN.md` §3–4. Governs the current schema until then.

**The question:** Should data links be represented as **paths in the graph**, as
**properties of variable nodes**, or as a **separate data model**?

**Current state:** The schema currently uses `type: "data"` paths from a
`dataset` node to a `variable` node. This may change.

**Options under consideration:**

| Model | Description | Key tradeoff |
|-------|-------------|--------------|
| 1 | Data connections are paths (current) | Consistent with path semantics; but paths mean different things depending on source |
| 2 | Data connection is a property of the variable node | Cleaner separation; but harder to compose/cascade |
| 3 | Connections are paths; link functions are node properties | Hybrid |
| 4 | Connections are paths; link functions are operator nodes | Fully graph-based |
| 5 | Data model is a totally separate layer | Most flexible; needs a simpler entry path for beginners |

**Affected areas:** Schema structure, visual representation of data links,
cascade/composition semantics, the `buildMxData` converter.

---

### 2. Visual representation of data links

**The question:** If data links are paths, how should they be drawn distinctly
from structural paths? Options include: claw/dot arrowhead, inset database icon
as path endpoint, database node that expands to a column list, or pulling
columns from a data popup to create manifest nodes.

**Depends on:** Resolution of Open Question 1.

---

### 3. Visual representation of model cascades / multilevel structure

**Target direction (`schemaVersion: 1`):** the cascade/dimension *model* is designed
in `SCHEMA-DESIGN.md` §5 (repeat-along-a-dimension); the visual/UI representation
remains open.

**The question:** How should the UI represent models that expand over dimensions
(time, person, classroom, etc.)?

**Options under consideration:** Model boxes with badges, individual badges on
paths and nodes, stacked representations.

**Note:** The coordinate-based tensor indexing approach in
`Noise files/UNIFIED-SCHEMA-DESIGN.md` is one possible schema-level approach
to this — exploratory, not settled.

---

### 4. Composition and cascade semantics

**Target direction (`schemaVersion: 1`):** designed in `SCHEMA-DESIGN.md` §3–7
(dimensions, units, unit relationships, composition, the data layer).

**The question:** When a model cascades over a dimension (e.g., a growth curve
cascades a measurement model over time), how is the unit of measurement for the
higher level specified? For example, in a multilevel growth curve, where does
the person ID come from?

**Related:** Cross-level paths, wide vs. tall format handling, template rules
for column names (e.g., `x_{time}`).

---

### 5. Ordinal node visual representation

**The question:** Should ordinal/categorical variable nodes be visually distinct
(e.g., drawn as tombstone or bread shapes)?

**Depends on:** Link function node implementation (v0.2+).

---

### 6. Package and tool naming

- The overall tool and R package name is `drawSEM`.
- The frontend source directory is `drawsem-web/`.
- The schema filename remains `graph.schema.json`, but the schema `$id` uses the
  `drawSEM` identity.

---

### 7. Unify the two SVG emitters (interactive canvas vs. export generator)

**The question:** Should the interactive canvas and the static export share a
single SVG rendering implementation, instead of the two independent emitters
that exist today?

**Current state:** There are two SVG renderers:

- **Interactive** — JSX in `CanvasTool.tsx` emits `<g>/<rect>/<circle>/<text>`
  directly into the live canvas `<svg>` (nodes and edges are both SVG).
- **Export** — `modelToSVG()` in `svgRenderer.ts`/`nodeRender.ts` builds an SVG
  string from `schema.nodes[].visual` positions. This is what the "Export Image"
  button and the headless `exportImage()` both use.

They already share the geometry constants (`constants.ts`) and the
manifest/latent decision (`getVariableRenderType`), so node shapes, sizes, and
colors stay consistent. What can drift is the hand-written emission detail —
text baseline offsets, path curvature, label placement — because those are
coded twice.

**Options under consideration:**

| Option | Description | Key tradeoff |
| ------ | ----------- | ------------ |
| A | Keep two emitters (status quo) | No refactor; risk of cosmetic drift between what's on screen and what's exported |
| B | Extract per-element SVG emission into shared pure functions used by both the JSX canvas and `modelToSVG` | Single source of truth for geometry; interactive layer keeps its own event wiring |
| C | Make the interactive canvas consume `modelToSVG` output plus a thin interaction overlay | Strongest WYSIWYG guarantee; largest rewrite of the canvas |

**Note:** The export feature does not require resolving this — headless export
is byte-identical to the existing "Export Image" button because both call the
same `modelToSVG`. The consistency target for export is that button, not the
live canvas. This question is about long-term maintainability.

**Affected areas:** `CanvasTool.tsx`, `svgRenderer.ts`, `nodeRender.ts`,
`useSvgExport.ts`.

---

### 8. Intuitive rapid layout of graphModels from R

**The question:** How do we best allow intuitive, rapid layout of `GraphModel`s
from R?

**Context:** `plotGraphModel()` in the RStudio Viewer auto-detects
`editable = TRUE`, so nodes are draggable — but a non-Shiny htmlwidget has no
back-channel to the R session, and the Save/Export toolbar is hidden in
`viewMode: 'widget'`. So preview drags are ephemeral: they cannot be recovered,
saved, or exported. `exportImage()` renders from the schema's positions
(auto-layout), not from any preview drags, so a user who rearranges the preview
and then exports gets the original layout, not what they see.

**Decision so far:** Any function or RStudio tool that prints to the screen and
cannot save back should default to `editable = TRUE`. Allowing ephemeral,
exploratory edits is preferable to a locked, lifeless preview. The consistency
gap is understood and accepted for now.

**Direction (out of scope for the export work):** A Shiny **gadget**
(`runGadget`) that edits in the RStudio window and persists layout changes back
to the R object is the intended way to make rapid layout edits stick. The
existing Shiny editor `drawSEM()` already round-trips (edit → *Done* → returns
the edited `GraphModel`), but it opens a separate app rather than editing the
object in place.

**Options under consideration:** Shiny gadget for in-window editing that writes
back; R-side layout parameters/seed on `plotGraphModel()`; save-JSON-and-reload;
`crosstalk`-based sync.

**Affected areas:** `R/drawSEM.R` (`plotGraphModel` editability), `R/shiny-app.R`,
the widget adapters, `exportImage()`.

---

### 9. Bayesian estimation: which settings are model content

**Target direction (`schemaVersion: 1`):** sampler settings are computational
hints recorded in the fit result, not spec content; see `SCHEMA-DESIGN.md` §10.
The task breakdown is in `ai-workflow/TASKS.md`.

**The question:** Priors are already storable (`optimization.parameterTypes.*.prior`,
per-path `optimization.prior`). What *else* does a Bayesian fit need in the
schema, and which layer of the `SCHEMA-DESIGN.md` §10 split does each part land
in — intrinsic model content, pinnable analysis configuration, or advisory
computational hint?

**Settled (2026-08-07).** MCMC settings are **computational hints**, recorded in
the fit result as what actually ran rather than pinned in the spec. The **seed is
kept** as recorded provenance. **Posterior draws are referenced externally**
(`datasetSource`-style: location + format + md5), never embedded.

**Why, given the reporting literature.** The earlier argument for pinning chains
and iterations in the spec was that a pinned seed only reproduces anything if
what it seeds is also exact. That holds for bit-exact re-execution, which is not
what the field asks for:

- **BARG** (Kruschke 2021, *Nature Human Behaviour*) Step 2 requires the software
  *and version*, a convergence statistic (PSRF) **for every parameter**, and ESS
  **for every parameter**. Step 6.H requires only that "the pseudo-random number
  generators should be explicitly seeded." Iterations, warmup, and thinning are
  narrative best practice, **not** checklist items.
- **WAMBS** / WAMBS-v2 (Depaoli & van de Schoot 2017) point 3 is "Does convergence
  remain after doubling the number of iterations?" — iterations are a knob you
  deliberately *vary* as a diagnostic, so pinning them in the spec fights the
  workflow.

So the field's reproducibility unit is **seed + software version + per-parameter
diagnostics**, not full sampler configuration. The weight belongs in `fitResults`,
not in `optimization`. The seed stays because it is the one mandated computational
item and costs ~8 bytes; it is not what makes stored fits grow (draws are, by
roughly five orders of magnitude).

**Consequences, unresolved:**

- `fitResults` is point-estimate-shaped and `additionalProperties: false`, so the
  posterior summaries and diagnostics BARG requires are not incrementally addable.
- `backend` carries no version field, failing BARG 2.A for **all** backends today.
- "OpenMx silently ignores priors" is safe only for weakly informative priors; an
  identifying prior dropped silently yields a different or non-identified model.
  Wants an `inference` pin plus the `SCHEMA-DESIGN.md` §8 capability profile.
- `prior` is an untyped bag, so it is not portable across backends that
  parameterize the same family differently (precision vs sd).

**Sources:** [BARG](https://www.nature.com/articles/s41562-021-01177-7)
([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8526359/));
[WAMBS](https://pubmed.ncbi.nlm.nih.gov/26690773/);
[blavaan](https://arxiv.org/pdf/1511.05604).

**Affected areas:** `graph.schema.json` (`optimization`, `provenance.fitResults`),
`core/types.ts` (`Prior`, `ExportOptions.mcmcOptions`), `R/fitting.R`,
`R/GraphModel-methods.R` (`coef`/`vcov`/`confint` assume point estimates).
