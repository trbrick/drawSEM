# drawSEM — Claude Code Context

## Working norms

- Stop and ask if requirements are unclear before implementing.
- Do not commit or push without explicit instruction.
- Do not create new documentation or summary files in the main repo tree. Notes go in `Noise files/` (gitignored).
- Prefer editing existing files over creating new ones.
- Keep commit messages concise. No emojis.
- Propose a course of action and confirm before making large changes.
- On multi-step tasks, check in after each step rather than completing everything silently.

## Authoritative reference docs — read these before working on their topic

| Topic | File |
|-------|------|
| Project structure, build commands, implementation status | `docs/ARCHITECTURE.md` |
| Settled design decisions (do not re-litigate) + open questions (do not resolve unilaterally) | `docs/DESIGN-DECISIONS.md` |
| OpenMx concepts AI tools commonly get wrong | `docs/OPENMX-PRIMER.md` |
| Long-term vision — what the schema should be (target `schemaVersion: 1`) | `docs/SCHEMA-VISION.md` |
| Target schema design — relational core, composition, data layer, expressions | `docs/SCHEMA-DESIGN.md` |
| Application-model benchmark (what must be expressible) | `docs/APPLICATION-MODEL-CATALOG.md` |
| Active tasks | `ai-workflow/TASKS.md` |

**Schema versions.** The implemented schema is `schemaVersion: 1` today, being renumbered to **`0`**; **`schemaVersion: 1`** is reserved for the target architecture in `docs/SCHEMA-VISION.md` + `docs/SCHEMA-DESIGN.md` (designed, not yet built). Do not build target-design features against the current schema without explicit direction.

## Repository structure

```
drawSEM/                    ← R package root (DESCRIPTION, NAMESPACE here)
├── R/                      ← R source
├── tests/testthat/         ← R tests (testthat)
├── inst/
│   ├── htmlwidgets/        ← htmlwidgets binding; lib/app/ holds the built widget
│   └── extdata/            ← graph.schema.json (canonical copy, synced from drawsem-web/schema/)
├── drawsem-web/            ← TypeScript/React frontend source
│   ├── src/
│   │   ├── components/CanvasTool.tsx  ← main canvas component (all editing logic)
│   │   ├── core/types.ts             ← TypeScript types mirroring the JSON schema
│   │   ├── adapters/                 ← standalone and widget adapters
│   │   └── utils/                   ← layout, rendering, conversion helpers
│   ├── schema/graph.schema.json      ← authoritative JSON schema (source of truth)
│   ├── vite.config.ts
│   └── vite.widget.config.ts
└── docs/                   ← authoritative architecture and design docs
```

## Key architectural rules

**Schema is the source of truth.**
The JSON schema (`drawsem-web/schema/graph.schema.json`) is canonical. Backend objects (mxModel, etc.) are derived on demand and are never themselves the canonical representation. Do not store runtime state in the schema.

**Manifest/latent is inferred, not declared.**
A `variable` node is manifest if it has an incoming `type: "data"` path from a `dataset` node, or if `variableCharacteristics.manifestLatent` is explicitly set. Do not add explicit `manifestLatent` properties where they are absent — the absence is intentional.

**Schema does not store runtime ids.**
The schema uses node `label` and path `from`/`to` as references. Editor-internal ids (used for React rendering) are stripped at serialization boundaries.

**Constant node label.**
The schema uses `"1"` as the constant node label. It is translated to `"one"` only when building OpenMx `mxPath` entries. Do not translate it elsewhere.

**`freeParameter` semantics.**
Absent = fixed. `true` = free, anonymous. Non-empty string = free, named (implies equality constraint in OpenMx when reused). `false` is not part of the schema contract.

**Unsupported features are stored, not dropped.**
Features not yet implemented (link functions, operator nodes, 0-arrow paths, priors, etc.) go into `@metadata$unsupported` so round-tripping is possible when support is added.

**Open design questions.**
Read `docs/DESIGN-DECISIONS.md` for the current list. Do not resolve open questions unilaterally — raise them first.

## Build and test commands

### R (run from repo root)
```r
devtools::load_all()     # Load package for interactive testing
devtools::test()         # Run testthat suite
devtools::check()        # Full CRAN-style check
```

### TypeScript (run from `drawsem-web/`)
```bash
npm install              # First-time setup
npm run dev              # Dev server at localhost:5173 (standalone mode)
npm run build:widget     # Build widget and update inst/htmlwidgets/lib/app/
npm run build            # Build both standalone + widget
npm test -- --run        # Run vitest suite (non-interactive)
```

### Make (run from repo root)
```bash
make                     # Sync schema to inst/extdata/
make node-build          # Build frontend
make r-test              # Run R tests
make test-all            # Run both test suites
```

### Git hooks (set up once after cloning)
```bash
git config core.hooksPath .githooks
chmod +x .githooks/*
```
The pre-commit hook runs `npm run build:widget` automatically so committed widget assets stay in sync.

## Scope by session context

**TypeScript / frontend work (VS Code):**
Focus on `drawsem-web/src/`. The adapter pattern is the key abstraction — `CanvasTool` is context-agnostic; adapters in `src/adapters/` provide environment-specific behaviour. Changes to the schema types in `core/types.ts` must stay in sync with `schema/graph.schema.json`.

**R / Shiny work (Positron or RStudio):**
Focus on `R/`. Read `docs/OPENMX-PRIMER.md` before any OpenMx work. The six-phase conversion in `converters.R` (`schemaToOpenMx()`) is the critical path — changes there require careful attention to manifest/latent inference and the constant-node label translation.
