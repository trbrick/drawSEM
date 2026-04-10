# Design Decisions

This document has two sections:

- **Settled decisions:** Choices that have been made and are reflected in the
  current code. AI tools must not re-litigate these unless explicitly asked.
- **Open questions:** Genuinely undecided design questions. AI tools must not
  resolve these unilaterally — raise them with the developer before proceeding.

---

## Settled Decisions

### Schema

- The JSON schema is the source of truth. Backend objects (mxModel, etc.) are
  derived on demand and are never themselves the canonical representation.
- The schema is intended to be a **portable, backend-agnostic model spec** —
  not just an internal format. The goal is for SEM packages (starting with
  OpenMx) to implement schema importers and exporters directly.
- Current schema version: `schemaVersion: 1`.
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

Features not yet implemented are not silently dropped. They are stored in
`@metadata$unsupported` so that round-tripping is possible when support is
added. This applies to: link functions, operator nodes, 0-arrow paths, priors
(stored but not applied by the frequentist OpenMx converter), algebras,
constraints, definition variables, etc.

### Parameter bounds, priors, and starting values

- Bounds, priors, and starting values follow a **CSS-like cascade**: defaults
  are set at the `parameterType` level (in `optimization.parameterTypes`) and
  can be overridden per-path in the path's own `optimization` field. Per-path
  values always win.
- Path starting values are stored directly on the path as `value`.
- The OpenMx converter **does not apply priors** (OpenMx is frequentist);
  they are stored for future use by blavaan and other Bayesian backends.
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

**The question:** How should the UI represent models that expand over dimensions
(time, person, classroom, etc.)?

**Options under consideration:** Model boxes with badges, individual badges on
paths and nodes, stacked representations.

**Note:** The coordinate-based tensor indexing approach in
`Noise files/UNIFIED-SCHEMA-DESIGN.md` is one possible schema-level approach
to this — exploratory, not settled.

---

### 4. Composition and cascade semantics

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

**The question:** The R package (`OpenMxWebUI`) and the web frontend
(`visual-web-tool`) will be renamed to a single consistent name. The name has
not been decided.

**Impact:** All user-facing strings, the GitHub repo URL, CRAN package name,
and potentially the schema's identifying strings. Refer to components by role
until this is resolved.
