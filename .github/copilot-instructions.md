# Copilot Instructions

## What this project is

A schema-first visual editor for designing, editing, and visualizing structural
equation models (SEMs). The tool is a **designer and visualizer, not a fitter**
— it connects to statistical backends (currently OpenMx; lavaan and blavaan
planned) to run models, but fitting is delegated to those tools.

A primary goal is the **schema**: a standardized, backend-agnostic JSON
representation intended to be portable and usable by other tools, not just this
one. The JSON schema is always the source of truth; backend objects are derived
from it on demand.

Full details: `docs/ARCHITECTURE.md`

---

## Two-layer architecture

- **R package** (repo root): S4 `GraphModel` class, schema validation,
  schema→OpenMx converter, plotting, I/O. Standard R package installable via
  `devtools::install_github()`.
- **TypeScript frontend** (`visual-web-tool/`): React + Vite. Two build
  targets — standalone SPA and an htmlwidgets widget. Built widget assets are
  committed to `inst/htmlwidgets/lib/app/`; R users need no Node.js.

---

## Key commands

**R** (from repo root):
```r
devtools::load_all()   # load for interactive testing
devtools::test()       # run testthat suite
devtools::check()      # full CRAN-style check
```

**TypeScript** (from `visual-web-tool/`):
```bash
npm run dev             # standalone dev server, localhost:5173
npm run build:widget    # rebuild widget → inst/htmlwidgets/lib/app/
npm test                # vitest suite
```

---

## Where to find things

| Topic | Location |
|-------|----------|
| Architecture, class slots, key functions | `docs/ARCHITECTURE.md` |
| Settled design decisions and open questions | `docs/DESIGN-DECISIONS.md` |
| OpenMx-specific guidance | `docs/OPENMX-PRIMER.md` |
| Working notes, task lists, session state | `ai-workflow/` (gitignored) |

`Noise files/` is a gitignored directory where AI-generated working notes
accumulate. It is **not authoritative** — treat as informal reference only.
`docs/` is the source of truth.

---

## Before writing OpenMx code

Read `docs/OPENMX-PRIMER.md` first. OpenMx uses S4 classes, has specific RAM
model conventions, and has several non-obvious behaviours that differ from what
most AI training data would suggest.

---

## Design decisions — read before touching schema or node/path code

Check `docs/DESIGN-DECISIONS.md` before modifying anything related to schema
structure, node types, path semantics, or data representation.

---

## Open questions — do not resolve unilaterally

These design questions are intentionally unresolved. Raise them with the
developer rather than picking an approach:

- **Data connection model:** should data links be paths, node properties, or a
  separate layer? (Current implementation uses paths; may change.)
- **Visual representation of cascades and multilevel structure:** how should
  the UI represent models that expand over dimensions (time, person, etc.)?
- **Composition semantics:** how are units of measurement specified when
  cascading over dimensions?
- **Package/tool name:** currently `OpenMxWebUI` (R) and `visual-web-tool`
  (TS). A consistent name is TBD. Refer to components by role.

---

## Working preferences

- **Stop and ask** if requirements are unclear or ambiguous before implementing.
- **Do not commit or push** without explicit instruction from the developer.
- **Do not create new documentation or summary files** in the main repo tree.
  If notes are needed, put them in `Noise files/` (gitignored).
- **Prefer editing existing files** over creating new ones.
- Keep commit messages **concise**. No emojis.
