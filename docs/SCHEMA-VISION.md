# drawSEM Schema — Vision

*What the schema should be, independent of how it is built. This is the
authoritative "what, not how" statement: it benchmarks design decisions and orients
planning. Mechanisms are deliberately out of scope — see `SCHEMA-DESIGN.md` for the
*how*.*

**Status.** Authoritative. This vision targets the next schema generation,
`schemaVersion: 1`. The currently implemented schema is the flat `schemaVersion: 0`
documented in `DESIGN-DECISIONS.md`; nothing requiring the design in
`SCHEMA-DESIGN.md` is built yet.

**Related documents.**

- `SCHEMA-DESIGN.md` — the design (the *how*): relational core, composition,
  the data layer, the expression language, and scope/tiers for the target schema.
- `DESIGN-DECISIONS.md` — settled decisions for the current (`schemaVersion: 0`)
  implementation, plus open questions.
- `APPLICATION-MODEL-CATALOG.md` — the benchmark inventory of application models the
  schema and converter must be able to express.

---

## Purpose

The schema is the **portable, authoritative record of a structural equation model
and its extensions ("xSEM")** — a format any SEM tool, human, or AI can read and
write natively, so that models move between software, between people, and between
data sets without being rewritten and without loss of meaning. The schema
*describes* the model; backends *fit* it.

---

## Principles

### 1. It describes statistical meaning, not software.

The schema encodes what a researcher means — variables, relations, constraints,
estimation intent — never the commands, naming conventions, or matrix layouts of
any particular tool. Backend-specific details that have no cross-tool equivalent
are accommodated but clearly segregated, never embedded in the core.

### 2. The model is primary; data attaches through hooks.

A specification is about the model. It is abstract-but-conformant by default: data
can be swapped for any conformant data set, or omitted entirely (so any spec doubles
as a simulation target). Data connects through a small, explicit **model↔data
contract** — which variables are forced manifest or latent, and what shape the data
must have (wide/tall, ID columns, grouping). Rebinding new data is lightweight and
modular.

### 3. It is a complete life record.

A single schema file holds a model's whole life — specification, the data binding
used, fit results, convergence and provenance, and a lineage pointer to prior
revisions — as a self-contained, archivable artifact. Fit-result provenance and
reproducibility are central to the *representation* (less so to the user interface):
a reader can reproduce an analysis exactly and detect whether the current
specification has drifted from what was last fit.

### 4. It spans the full range with equal naturalness.

The same core, scaled up — never a format switch as models grow. From a single
regression or CFA, through latent growth and longitudinal models, multilevel and
hierarchical structures, ordinal/categorical/censored variables, Bayesian models
with explicit priors, multi-group and invariance designs, up to cross-classified
and multiply-nested specifications like an RI-CLPM. The range extends further still
— continuous-time and discrete dynamical systems, behavior-genetic and kinship
models with algebraically-defined expected covariances, link-function /
generalized-linear families, and item-response / marginal-ML models — enabled by
three capabilities brought into scope: **matrix algebra**, **parameters not attached
to a path**, and **link functions**.

### 5. It is composable.

Conformant specifications behave like Lego blocks. A composable unit (a **module**)
is a *conceptually complete* model fragment (need not be fittable; may be as small
as `Error → Manifest`) that **declares its connection points** — where, and on what
terms, other models or data may attach. This contract is first-class schema content,
because a model must represent *where and how it can be composed*.

Composition is **closed and recursive**: the result of composing modules is itself a
module with its own connection points. It covers:

- **Augmenting** — snap a random-intercept structure onto a CFA or growth model.
- **Lifting across a dimension** — cascade a single-timepoint or measurement model
  over every wave of a state-space / CLPM / VAR structure.
- **Data-parameterized composition** — the dimension's extent and spacing (number of
  timepoints, spacing between times, grouping of rows into units) is delegated to the
  bound data rather than fixed in the spec.

**Composition is retained as semantic structure.** To the extent the assembly
reflects real semantic divisions of the model, the schema keeps the assembly, and
the flat fittable model is a *derived product* of it — so a component can be swapped
and everything downstream re-derives. (Worked target: two CFAs → connect to a CLPM
in tall format where timepoints and person-grouping come from the data → connect
that to a random-intercept model ⇒ an RI-CLPM, each step a legal input to the next.)

### 6. Bindings are declared, never silently inferred.

Whether `time = 1` in one module is the same as `time = 1` in another, and whether
`t1 → t2` is the same timescale, must be recorded in the spec and supplied by a human
or AI. The schema's job is to *hold* identity assertions explicitly. Same-name never
implies same-thing.

### 7. What is shared versus what varies is expressible — and easily changed.

When structure is lifted across a dimension or group, the schema lets the author say
what is invariant and what varies (loadings equal across time? parameters
time-invariant or time-varying? measurement-invariant across groups?). This is often
the entire research question, so toggling it is cheap: the lifting defines groups of
corresponding parameters, and the combined spec decides freedom and equality within
those groups.

### 8. It is operable by software and AI.

Because connection points, bindings, and data contracts are explicit, tools can
reliably generate templates, combine modules, check compatibility before connecting,
and adapt to data changes — not just render what a human typed.

---

## What a reader should be able to do

Given a schema and its referenced data, any human, tool, or AI should be able to:

- understand the model without running any software;
- reproduce the analysis exactly;
- retarget it to a different backend and get equivalent results (when the analysis
  configuration is pinned — see "Working assumptions");
- detect whether the specification has changed since it was last fit;
- swap or detach the data (including for simulation);
- recombine or swap components and re-derive the model;
- archive the whole thing as a complete, self-contained artifact.

---

## The benchmark question

> Could a researcher unfamiliar with this tool — or an AI with no prior context —
> read this schema and fully understand **what model is specified, how it may be
> composed and bound to data, what was estimated, and what the results mean**? If a
> software idiom has leaked into the core, or a connection or binding can only be
> understood by knowing the tool that wrote it, the design has failed the vision.

---

## Working assumptions

- There is **one schema language** spanning abstract-composable down to
  concrete-flat; a plain single model is the no-composition base case.
- The flat, fittable single-model form is a **derived product** of the compositional
  spec, the same way an mxModel is derived from the schema today.
- Provenance and reproducibility span the **whole assembly + data binding + fit**,
  not just a flat model.
- The schema specifies **xSEM models and their provenance** — not a workflow or
  process engine. It records a process's configuration, inputs, outputs, and
  provenance (enough to reproduce it), never its implementation (the *noun/verb*
  boundary: the schema is the document; backends and wrapper tools are the programs).
  Pinning a setting is recording configuration, so it never crosses the line.
- **Model-portability is not result-portability.** Estimation configuration (fit
  function, missingness handling, estimator) is not derivable and backends
  legitimately differ; equivalent results across backends hold only when that
  configuration is pinned in the artifact. Anything unpinned is the backend's to
  choose, and provenance records what it chose.
- The top level is a **closed, recursive collection** — a model, or a set of
  models/collections carrying relationship and production metadata; a single model is
  the degenerate flat case.

---

## Scope edges

**In scope (roadmap, built incrementally).** Matrix algebra, non-path parameters,
and link functions — and with them continuous-time dynamics, algebraic-covariance
behavior-genetic models, generalized-linear families, and fuller item-response
models. Binding to **both wide and tall data** (as swappable per-dimension readers;
tall is the richer, canonical form) is in scope.

**Deferred (a later generation).** Custom / user-defined objectives (which fall out
of matrix algebra), higher-moment operator nodes, and non-covariance Bayesian
optimization.

**Reserved, not designed (wrapper tooling).** Processes that run repeated model
iterations and aggregate / select / search among results — confidence intervals and
regularization (nearly free today), multiple-imputation pooling, model averaging, and
search/ensemble tools (SEM trees & forests, GIMME, multiVar). The schema records
their *outputs* (sets of models with relationship metadata) and *provenance*, never
their *logic*. Forward-compatibility is preserved by the recursive collection
container and collection-level provenance; the strategies themselves are not
specified here.

**Out of scope.** Process *implementation* (search algorithms, optimizer internals);
**physical data reshaping** (wide↔tall pivoting), a tool-side adapter rarely needed
once binding reads both shapes; and the **mechanisms** of connectors, parameter-group
equality, identity binding, and data contracts (the *how*, which lives in
`SCHEMA-DESIGN.md`).

**Resolved.** Overlapping semantic decompositions are handled at the **semantic-view**
level — read-only overlays over stably-identified elements, the original purpose of
the `tag` field; multiple *constructive/swappable* decompositions remain deferred
(potentially unsound). **Revision history** is delegated to version control (with a
self-contained in-file lineage pointer); the schema-*format* version is tracked
in-band with migration adapters.

**Open.** The provenance model — what is recorded, at the single-model and
collection levels — is the next design discussion.
