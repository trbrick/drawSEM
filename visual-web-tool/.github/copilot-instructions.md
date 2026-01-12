# Copilot Instructions for Visual Web Tool

## Project Overview

Visual Web Tool is a **Vite + React + TypeScript web application** for building visual structural equation models (SEMs) and multilevel models. Users draw nodes (variables, constants, datasets) and paths (relationships) on an SVG canvas, which are then serialized to JSON following the `graph.schema.json` specification.

**Key Purpose:** Bridge visual model specification and statistical modeling backends (OpenMx).

## Architecture

### Multi-Model Structure

The schema now supports **multiple models within a single project**, organized as a named dictionary:

```json
{
  "schemaVersion": 1,
  "models": {
    "model1": { "nodes": [...], "paths": [...], "optimization": {...} },
    "model2": { "nodes": [...], "paths": [...], "optimization": {...} }
  }
}
```

**Key benefits:**
- Users can work with related models in one file
- Each model has its own nodes, paths, and parameter type definitions
- Model IDs are used as keys, enabling natural organization
- Schema version remains at 1 (currently unreleased)

### Core Data Model

Three main entity types flow through the system:

1. **Schema Format** (`schema/graph.schema.json`): Persistent JSON representation with:
   - `models`: named dictionary where each key is a model ID
   - Each model contains `nodes[]`, `paths[]`, optional `optimization.parameterTypes`
   - `nodes[]` with `label`, `type` (variable|constant|dataset), optional `levelOfMeasurement`, `visual` coords
   - `paths[]` with `fromLabel`/`toLabel`, `numberOfArrows`, `value`, `free` (free|fixed), optional `parameterType`
   - `optimization.parameterTypes`: semantic categories for path parameters with priors, bounds, start values
   - `meta`: arbitrary metadata (title, description, approach) at global and model levels

2. **Runtime Format** (`CanvasTool` component state): In-memory representation for editing:
   - `models[]` array of `{id, label, nodes, paths, parameterTypes}`
   - `currentModelId`: tracks which model is currently being edited
   - Within each model: `Node[]` with `id`, `x`, `y`, `label`, `type` (variable|constant|dataset), optional `width`/`height`
   - Within each model: `Path[]` with `id`, `from`, `to`, `twoSided`, optional `side` (for self-loops), `parameterType`, `optimization` overrides
   - Nodes use **Unicode-converted labels** (e.g., `\epsilon_{x1}` → `ε_{x₁}`)

3. **Conversion Pipeline**:
   - **Load**: `convertDocToRuntime()` transforms schema (models dict) → runtime (models array), applying Unicode conversion, auto-generating IDs from labels
   - **Save**: reverse mapping from runtime IDs back to labels for schema persistence
   - **Per-model conversion**: `convertModelToRuntime()` processes a single model object

### Component Hierarchy

- **CanvasTool.tsx** (2400+ lines): The main component managing all state (models array, currentModelId, nodes, paths, mode, selection). Handles:
  - Multi-model state with convenience accessors for current model
  - SVG canvas rendering with layering (toggle 'all'|'sem'|'data' layers, `activeLayer` state)
  - User interactions (drag-to-create paths, node dragging, keyboard shortcuts)
  - CSV/dataset integration via Papa Parse
  - Schema validation via AJV
  - JSON import/export with automatic model selection

- **App.tsx**: Minimal wrapper with header and layout

### Data Validation & Import

- `validateGraph.ts`: Uses AJV with `graph.schema.json` to validate before loading
- `scripts/import-graph.js`: CLI tool to convert persisted JSON (models dict) → runtime format (models array)
- CSV handling: Papa Parse for parsing; column metadata tracked in `datasetFile` objects

### Styling & Rendering

- **Tailwind CSS** for UI (configured in `tailwind.config.cjs`)
- **SVG canvas** with hardcoded display constants in CanvasTool:
  - Circle nodes (latent): `LATENT_RADIUS = 36`
  - Rectangle nodes (manifest/dataset): `MANIFEST_DEFAULT_W/H = 60`, `DATASET_DEFAULT_W/H = 60`
  - Stroke colors: `#000` (default), `#ff0000` (selected); opacity states for layer transparency
- No external charting library; all drawing is custom SVG path/circle/rect elements

## Development Workflow

### Quick Start

```bash
npm install
npm run dev          # Start Vite dev server on :5173
npm run build        # Production build
npm run preview      # Preview prod build locally
npm run lint         # ESLint check
```

### Common Tasks

- **Load a project:** Paste JSON with models dict or use import-graph script: `node scripts/import-graph.js examples/my-models.json`
- **Switch models:** Select model from dropdown (future UI feature); internally updates `currentModelId`
- **Add a node type:** Extend `type` enum in schema and CanvasTool (affects rendering + validation)
- **Add a path property:** Update schema `models.additionalProperties.paths.items.properties`, then CanvasTool to store/render
- **Update Unicode converter:** Modify `utils/converters.ts` Greek/subscript maps; test with `convertToUnicode()` examples
- **Change visual constants:** Update `utils/constants.ts`; affects all node sizing

### Testing Data Files

- `examples/graph.example.json`: Basic reference with one model
- All examples should validate against `schema/graph.schema.json`

## Key Patterns & Conventions

### Multi-Model State Management

**CanvasTool state structure:**
```typescript
const [models, setModels] = useState<Array<{id, label, nodes, paths, parameterTypes}>>([])
const [currentModelId, setCurrentModelId] = useState<string | null>(null)
const currentModel = models.find(m => m.id === currentModelId)
const nodes = currentModel?.nodes || []  // convenience accessor
```

**Setter convenience wrappers:**
- `setNodes(updater)` updates the current model's nodes
- `setPaths(updater)` updates the current model's paths
- `setParameterTypes(updater)` updates the current model's optimization.parameterTypes

### Node ID Generation

- **Input (schema):** labels only; no IDs required in schema
- **Runtime (CanvasTool):** IDs auto-generated per-model via `uniqueId(base)` where base = `n_` + slugified label
- **ID Slugification:** `normalize() → replace non-word → lowercase → replace spaces`
- **Conflict resolution:** appended `_1`, `_2` if collision within that model

### Parameter Types

Path properties can specify a `parameterType` (e.g., `"loading"`, `"intercept"`) that references `optimization.parameterTypes[parameterType]`, which provides:
- Default `prior` distribution (Bayesian specification)
- `bounds` for parameter constraints
- `start` value (numeric or `"auto"` for automatic initialization)

Paths can override via `optimization` object (path-level trumps parameter type defaults).

### Layer Visibility System

CanvasTool tracks `activeLayer` ('all'|'sem'|'data'|string) and `offLayerVisibility` ('transparent'|'invisible'). 
- Use node `tags[]` or `type` to classify nodes into layers
- Rendering applies opacity/z-index based on layer membership

### Multilevel Model Support

Nodes support `levelOfMeasurement` field (e.g., `'within'`, `'between'`, `'between-person'`) for organizing multilevel structures. Schema supports this; rendering currently ignores it (future enhancement).

## Common Issues & Patterns

- **Label-to-ID mismatch:** IDs auto-derive from labels per-model; ensure slugification logic matches between `runtimeConverter.ts` and `import-graph.js`
- **Unicode conversion timing:** Applied on load (`convertDocToRuntime()`), not on save; labels are stored in original form in schema
- **Dataset paths:** Always originate from dataset nodes; checked via `isDatasetPath()` helper
- **Self-loops:** Use `side` property ('top'|'right'|'bottom'|'left') to avoid overlapping with node
- **Schema drift:** Changes to node/path structure require schema update + CanvasTool adjustments + test examples
- **Model switching:** When loading a file, the first model (by object key order) is selected automatically via `setCurrentModelId(modelsOut[0].id)`

## Integration Points

- **OpenMx backend:** Expects per-model nodes/paths (can iterate over `models` in schema JSON)
- **External data:** CSV files referenced via `datasetFile` metadata; path resolution relative to `examples/` or `data/`
- **Export targets:** Currently serialize to schema format with models dict; tools outside may expect runtime format or different encoding

## Tools & Dependencies

- **Build:** Vite 5, React 18, TypeScript 5
- **Styling:** Tailwind CSS 3, PostCSS, Autoprefixer
- **Validation:** AJV (JSON schema validation)
- **Data:** PapaParse (CSV), csv-parse
- **Linting:** ESLint 8 with React plugin
- Notably: **no state management library** (Redux, Zustand); all state in CanvasTool component

## References

- Schema source: [schema/graph.schema.json](../schema/graph.schema.json)
- Canvas component: [src/components/CanvasTool.tsx](../src/components/CanvasTool.tsx)
- Import script: [scripts/import-graph.js](../scripts/import-graph.js)
- Converters: [src/utils/converters.ts](../src/utils/converters.ts) (Unicode), [src/utils/runtimeConverter.ts](../src/utils/runtimeConverter.ts) (schema↔runtime)

