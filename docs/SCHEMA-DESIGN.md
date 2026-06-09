# drawSEM Schema — Design (Target Architecture)

*The **how** behind `SCHEMA-VISION.md`: the relational core, composition, the data
layer, the expression language, and the scope tiers for the next schema generation.*

> **Status — target architecture, not yet built.** This document describes the
> design for `schemaVersion: 1`. The currently implemented schema is the flat
> `schemaVersion: 0` documented in `DESIGN-DECISIONS.md`. Nothing here is
> implemented; this is the destination, decided but not coded. The open frontier
> (§12) and the deferred provenance model are genuinely unsettled.

**Related documents.** `SCHEMA-VISION.md` (the *what*); `DESIGN-DECISIONS.md`
(current `schemaVersion: 0`); `APPLICATION-MODEL-CATALOG.md` (the benchmark of
models this design must express).

---

## Glossary

Terms are chosen to resonate with behavioral scientists, not with computing. Use
these, not their computing synonyms.

| Term | Meaning |
|---|---|
| **unit of analysis** | what a single instance of a node *is* (a person, a teacher, a person-by-occasion). Replaces "grain". |
| **dimension** | something a model is repeated along; used only as "repeat X along dimension Y". |
| **unit relationship** | how two units relate — **nested** or **cross-classified** (used relationally: "students nested within schools"). The model *expects* it; the data *describes* it. |
| **group / class structure** | the model estimated across groups (multi-group) or classes (mixture). Carries **membership: known vs latent** and **independent vs dependent**. Distinct from a unit relationship. |
| **composition / module** | combining modules into a larger model; a module is a composable unit (template, partial, or complete model). |
| **connection point** | where a module may attach; for a repeated module, the single **shared construct** it exposes. |
| **cascade / repeat across** | repeating a model across a dimension, with links across the replicates. |
| **table / data** | a table has a *grain* (a tuple of dimensions) and *key* + *value* columns; collectively the tables are the **data**. |
| **link** | the row-unit of a table with ≥2 dimension keys (a dyad / pair / tie); a unit of analysis where relationship-level nodes and values live. |
| **linking table** | a table at *link* grain expressing a many-to-many relationship. |
| **role** | which endpoint a key fills; optional, defaults to the key's unit of analysis, given only for a self-link. |
| **definition variable / algebra / constraint / invariance** | as in OpenMx/SEM — kept verbatim. |

---

## 1. Scope and the noun/verb boundary

The schema specifies **xSEM models and their provenance** — a specification +
life-record format, **not a workflow/process engine**. The defining line is
**noun vs verb**: the schema records a process's *configuration, inputs, outputs,
and provenance* (nouns — enough to reproduce it), never its *implementation/logic*
(verbs). Backends *fit*; wrapper tools *search / iterate / aggregate*; the schema
is the shared document they read and write. Pinning a setting (fit function, seed,
penalty) is recording configuration — a noun — so it never crosses the line.

The top level is a **closed, recursive collection**: a node is either a model or a
set of models/collections carrying relationship and production metadata, mirroring
composition's closure. `schemaVersion: 1` uses the degenerate flat case (a set of
independent models); the format does not hardwire "exactly one flat dict of
unrelated models", so wrapper outputs (sets, and sets of sets) remain expressible.

---

## 2. The unifying frame: one contract at connection points

Model→data and model→model are the same mechanism: a *contract* attached at a
declared **connection point**. A binding or composition is a declared
**correspondence**, resolved at derivation time into the flat, fittable model.

- A module *declares its connection points* (principle 5).
- A data binding is a contract at a connection point; an *unbound* module is
  abstract-but-conformant (principle 2).
- A correspondence **is** an identity assertion; same-name never implies same-thing
  (principle 6).

Structural-shape contracts (unit of analysis, unit relationship, wide/tall) live on
the connection points; correspondences assert how points relate.

---

## 3. The relational core

Resolving a composed, data-parameterized model is relational algebra.

- **Dimensions** are first-class, declared once, referenced by modules. A
  dimension's extent comes from a data column (its distinct values) or is stated.
- **Unit of analysis** = the set of dimensions a node lives at.
- **Which combinations of units actually occur is data-defined and sparse** — never
  the full Cartesian product. Unbalanced panels, nesting, and crossing all follow
  for free; the model declares the unit relationship it expects, and the data
  describes it (model-first).
- **Links across a dimension** are correspondences, with an **offset on an ordered
  dimension** for lags (AR/VAR/CLPM) — not equality.
- **Manifest/latent follows from the unit of analysis:** a variable is manifest iff
  a data column exists at its node's unit of analysis; latent otherwise. Random
  effects are latent because they sit at a coarser unit than any column.
- **Expected units ⊇ observed; the gap is missingness** (handled by the likelihood,
  not dropped), tying missingness handling into the contract.

This is Open Question 1 resolved toward a separate data layer: the current "one
dataset node + `type:data` paths" mechanism is replaced by a relational contract.

---

## 4. The data layer

There is **one table abstraction**, not several. A **table** has a **grain** (the
tuple of dimensions its rows are about) and **columns**, each a **key** (a foreign
key into a dimension) or a **value** (an observation or definition variable). Fact,
dimension-attribute, membership, and linking tables differ only in which columns
they carry. Collectively the tables are the **data**.

- **Every table's rows are a unit of analysis** (row-as-identity, generalized). A
  plain table's row identity is implicit; a table with ≥2 dimension keys gives its
  row a composite identity — a **link**. Nodes and values can live at link grain;
  this is how dyadic / relationship effects exist (social-relations
  actor/partner/relationship effects; pedigree relatedness). Relationship-grain
  units are therefore not a new construct — row-as-identity with a composite key.
- **Roles are optional.** A key's role defaults to its dimension's unit of analysis;
  a role is given only for a **self-link** (a table referencing the same dimension
  twice — pedigree `p1/p2`, round-robin `rater/ratee`).
- **Cross-paths run along a linking table:** endpoints resolved by the role-labeled
  keys, one instance per row, coefficient an **expression at link grain** that may
  reference the table's value columns (pedigree `A[p1] ↔ A[p2]` with value
  `relatedness · σ²_A`). Directionality follows from path type (covariance
  symmetric; regression directed).
- **Sourcing and consistency:** a dimension's extent comes from key-column distinct
  values (one table authoritative per extent); a key's values must be a subset of
  its dimension's domain; a node at grain G binds to value columns of tables at G
  (or coarser, broadcast); membership tables supply which combinations exist.

### Wide and tall binding

Bind **both** shapes as **swappable per-dimension readers** (a binding-mode toggle),
normalizing both to the logical `(unit, coordinate) → value` form so the model is
shape-blind. Switching wide↔tall is replacing one dimension's reader; the model and
all other bindings are untouched.

- **Tall is canonical and richer** (ragged data + the support-vs-missing
  distinction). `tall → wide` is lossy on unbalanced data.
- The column-name template (`x{t}`) is optional authoring sugar that expands to the
  explicit per-coordinate map (the canonical stored form).
- Physical reshaping (pivoting a data file) stays an external adapter — rarely
  needed once binding reads both shapes.

---

## 5. Dimensions: how a model meets one; group/class structure

Two distinct ways a model relates to a dimension:

- **Repeat across with links (cascade):** the same construct recurs along a
  dimension and the replicates are connected by paths (growth basis,
  autoregression). Authored as a containment region ("repeat X along dimension Y").
- **Estimate across groups/classes:** the model is replicated as parallel copies
  whose substantive variables are not linked; only parameters are compared. Authored
  as "estimate across groups" plus invariance (equality constraints).

Multi-group, mixture, and regime models are **one construct** — the model estimated
across groups/classes — distinguished by two binary properties:

| | **independent** | **dependent** (membership has its own structure) |
|---|---|---|
| **known membership** (observed column → hard split, standard likelihood) | multi-group | known-regime (observed regime over time) |
| **latent membership** (every row soft/probabilistic → mixture likelihood) | mixture | Markov-switching / hidden-regime |

The **membership** property flips both the data binding (split-by-column vs
every-row-probabilistic) and the likelihood. The **independent/dependent** property
says whether the groups relate; a dependent group structure carries a dependence
model among its elements (a transition matrix over time, spatial adjacency over
geography). Multi-group is implemented as the *known-membership* case of this general
construct, so mixture and regime are flag changes plus backend capabilities, not
rewrites.

---

## 6. Unit relationships: nested vs cross-classified

Unit relationships reduce to one axis: **nested** (including the 1:1 "same units"
case) vs **cross-classified** (many-to-many). "time-within-teacher vs
time-by-teacher" is nested vs cross-classified applied to the `(time, teacher)` pair.

The hard cases need no new relationship type:

- **Wide or tall realization.** Multiple foreign-key columns (a student's `TID1`,
  `TID2`) is cross-classification realized wide; a linking table is the same realized
  tall.
- **Self-cross.** Round-robin and pedigree are cross-classification where both keys
  reference the same dimension; the shared-entity identity follows from both keys
  pointing at the same dimension (no constraint workaround needed).
- **Relationship-level values** decompose into membership (the linking table) plus
  definition variables on the linking-table rows.

A 1:1/many:1 linking table is an inefficient nesting — allowed, not special-cased.
The one subtlety: the time-occasion case (is wave 1 the same occasion across
teachers?) is assertion-only — balanced data is silent — so a correspondence tags
which side is data-validatable.

---

## 7. Composition and decomposition

**Composition is external and needs no foresight.** A user cannot know at authoring
time whether or how their model will later be composed. Therefore:

- Standalone authoring uses an implicit ambient unit (row-as-identity), zero
  ceremony.
- Composition is an external, additive step: a later user marks "module A's ID column
  is here; module B's foreign key is there." Minimal rebinding — marking ID + key
  columns — with no foresight required of the original author.
- **Internal vs external binding:** a model binds its *own* cascade/cluster
  dimensions at authoring (a state-space model marks its time + ID columns because
  its structure needs them); *composition* keys are retrofitted from outside.

**Decomposition is the dual: semantic views, not rewiring.** A model can be read along
cross-cutting axes (a math/English CLPM as *Math vs English* and as *measurement vs
dynamics*). Three levels, with sharply rising cost:

- **L0** — one contained decomposition; no overlapping.
- **L1 (adopted)** — one *contained primary* assembly (a readable tree, the canonical
  build) plus stable element identity plus optional read-only overlay decompositions
  that *reference* elements, never re-own them. Overlays are **semantic annotation and
  views** — the purpose of the `tag` field.
- **L2 (deferred, possibly indefinitely)** — multiple constructive/swappable
  decompositions, deferred because cross-cutting swaps are potentially *unsound* (a
  swap valid in one decomposition can break another's module contracts).

**Structural invariant:** elements have stable identity; the primary assembly is
contained (a tree); additional decompositions are tag-based overlays that reference —
never re-own — elements. Stable element identity is the shared substrate on which both
composition (merge + assert identity) and decomposition (overlay views) rest.

---

## 8. Values and the expression language

A path value, constraint, derived parameter, or operator node is an **expression**
over `{literal, free parameter, data column, function(...)}`. One grammar unifies:

- `data_column` → **definition variable** (data → value);
- a parameter referenced twice → **equality constraint** (the named-parameter idiom
  is the degenerate case);
- `sqrt(1 - (a² + c²))` → **derived parameter** (ACE-style);
- `data_column² · beta` → the combination.

**Attachment site decides the result kind:** an expression on a **node** produces a
*variable* (operator node); on a **path value**, a *coefficient*; as a **standalone
named definition**, a *derived parameter*; in a **constraint**, a *relation*.

**Evaluation rule.** An expression evaluates at its attachment site's unit of
analysis, and each term resolves to its value at that unit: a same-unit term is
local; a global parameter is constant; a data column is the row; a coarser-/other-unit
term resolves by traversing the unit relationship — via nesting (a functional lookup,
global-like) or via cross-classification (a join lookup, definition-variable-like).
Nesting and cross-classification are therefore one lookup that follows the declared
unit relationship.

**Scope.** Scalar arithmetic + a small function whitelist (`sqrt, log, exp, abs`) +
relational operators (`==, ≥, ≤, >, <`) cover the named use-cases (definition
variables, growth bases, ACE-derived parameters, equality/inequality constraints,
interactions). There is **no collapsing across a dimension** in the scalar core: the
one forced sum — membership-simplex normalization (`Σπ = 1`) — is intrinsic to the
membership construct; general aggregation (contextual effects) is a deferred
extension. Formative constructs (latent = sum of indicators) are not aggregation —
they are sum-of-incoming-paths, native to RAM. **Matrix algebra** is brought into
scope (see §11), enabling computed matrix-valued values; the AST is structured so
matrix and dimension-reducing operators can be added without precluding them.

**Non-path (off-path) parameters.** A free parameter may be declared independently of
any path and referenced by expressions/algebra (a state-space drift parameter feeding
a computed transition; GREML variance components). In scope (§11) — the assumption
that "parameters live on paths or are derived" is lifted to include standalone
parameter declarations.

**Representation.** Expressions are stored as a structured tree (unambiguous,
checkable, portable, translatable to each backend's syntax); the user types a formula
string that the editor parses into it — canonical-form-plus-authoring-sugar.

**No universal capability floor.** Backends are not assumed to support all features
(lavaan supports only certain definition-variable subtypes; blavaan has no frequentist
inference). A declared capability set is the target, each backend has a **capability
profile**, and a spec is fittable by a backend iff the backend covers the features the
spec uses — a checkable match, not a guarantee.

**Operator nodes** are a constrained, deferred subset: they reuse the grammar but
compute *variables*, carry their own identification and path-structure requirements,
and are backend-limited.

---

## 9. Authoring principles

The relational contract is the derived/stored form; authoring is gestures that
generate it. The user never types unit-of-analysis sets or correspondences.

- **The canvas is the ambient unit of analysis.** Top-level nodes belong to it;
  "repeat X along dimension Y" adds a dimension by containment.
- **One mandatory connection point (the shared construct) per repeated module.** The
  process binds to it, never the module's internals. This is the substitution seam:
  swapping a single variable for a CFA edits what is behind the connection point;
  everything attached is untouched.
- **Per-coordinate overrides on a lifted parameter family** are one mechanism: a
  parameter repeated along a dimension has a default freedom/value plus exceptions at
  named coordinates. This single control covers measurement invariance (default:
  shared), latent-basis loadings (default free, fixed at {0,1}), the odds/mixture
  reference category (fix one), and boundary/initial conditions (override at
  coordinate 0). It lives at the repeat/group boundary and generalizes to a grid of
  *parameter × dimension*.
- **Naming the ambient unit is optional and is a connection-point declaration.** Two
  opt-in triggers make a dimension explicit: internal repetition, or intended
  composability. Neither fires for a standalone simple model. Naming is fit-inert
  standalone (it serves composition and readability, not the math).
- **Progressive disclosure:** a simple CFA needs zero dimensional apparatus; a growth
  curve needs exactly one dimension because it has one repeated axis. Ceremony is
  proportional, never imposed on the base case.
- **Repeat ≠ reuse-a-shape.** Repeating one construct along a dimension (exchangeable,
  linked) differs from reusing a structural shape for distinct constructs (the five
  personality factors — correlated, not exchangeable, not dimensional). Shape reuse is
  sugar that expands to a flat graph and must not create a dimension.

---

## 10. Analysis configuration and defaults

The spec describes model meaning; estimation is configured separately.

- **Computational** (start values, optimizer choice, threads): an optional **hint**
  layer — recordable and pinnable but **advisory**; a backend may ignore or override it,
  and provenance records what actually ran. A hint never changes the estimand, only the
  path taken to it, so recording one is configuration (a noun, §1), not implementation.
  Pinning is sometimes practically necessary for *convergence* — e.g. IRT / marginal-ML
  models that need an E/M-style optimizer to converge at all — so the spec must be able
  to carry the hint even though a competent backend is free to disregard it.
- **Analysis configuration** (fit function ML/WLS/DWLS/FIML, missingness handling,
  Bayesian vs frequentist): **not derivable** — competent backends legitimately differ
  (Mplus defaults to DWLS for speed; OpenMx to joint ordinal/continuous FIML for
  completeness). An optional, **pinnable** layer; absence delegates to backend policy,
  which is not canonical.
- **Model content**: structure and variable types are **intrinsic** — always in the
  spec (a model without them is not a model). **Priors** are *optional* model content,
  present only when the author adds them; they make Bayesian available but do not force
  it, and their absence is not a backend default to be filled in.

Anything not pinned is changeable at fit time, consistent with practice (trying
optimizers/fit functions until satisfied); provenance records what actually ran.
Consequence: **model-portability is not result-portability** — equivalent results
across backends hold only when the analysis configuration is pinned.

---

## 11. Tiers and forward-compatibility

- **`schemaVersion: 0` (current, implemented):** the flat single/multi-model schema in
  `DESIGN-DECISIONS.md`.
- **`schemaVersion: 1` (this design — build):** relational data binding (wide & tall);
  composition (modules / dimensions / units / unit-relationships); scalar expressions;
  group/class structure; per-coordinate overrides; analysis configuration;
  single-model provenance (collection-ready); L1 semantic-view overlays. Covers the
  vision's stated range plus twin / mixture / discrete-dynamics structurally.
- **In scope, built incrementally:** **matrix algebra**, **non-path parameters**,
  **link functions** — unlocking continuous-time dynamics, algebraic-covariance
  behavior-genetic models, generalized-linear families, and fuller item-response
  models.
- **Deferred (a later generation, reserve — do not design):** custom objectives (which
  fall out of matrix algebra), higher-moment operator nodes, non-covariance Bayesian,
  the general aggregation operator, latent-membership likelihood (mixture/HMM fitting).
- **Reserved, not designed — wrapper tooling.** Every wrapper is
  *procedure(template, data, strategy) → family of models + aggregate*; outputs are
  sets (recursively, sets of sets) of models with relationship metadata. Keeping them
  available costs a note, not a feature, given five invariants: (1) allow relationships
  among models; (2) allow **collection-level** provenance/results; (3) let search tools
  write discovered structure back as ordinary models; (4) stable element identity, so
  families are template + deltas; (5) reserve a procedure-spec slot. Tier 1 (confidence
  intervals, regularization, multiple-imputation pooling) is nearly free on the
  analysis-config + provenance layers; Tier 2 (model averaging, SEM trees/forests,
  GIMME, multiVar) is reserved/deferred. *Reserve, never design the strategies.*
- **Out (verbs / tools):** process logic; physical wide↔tall reshaping; software
  internals.

### Catalog coverage (from `APPLICATION-MODEL-CATALOG.md`)

The catalog is broader than the vision's stated ceiling (RI-CLPM). This design covers
that range plus twin / mixture / regime / discrete-dynamics. Ruled out of the scalar
base but representable once the in-scope extensions land: matrix-algebra / matrix-valued
models (continuous-time state-space, nuclear-twin-family, LDE, Pearson selection),
link-function / marginal models (GEE, fuller IRT), non-path parameters. Representable
but fit-gated (not ruled out): mixtures / HMM / regime, IRT trait structure, GREML
(dense relatedness = a linking table; FIML-equivalent), Kalman filtering (discrete
state-space as a lifted lag model), WLS, confidence intervals. Custom objectives are
deferred, not excluded.

---

## 12. Open frontier

| Item | Status |
|---|---|
| **Provenance model** (what is recorded; single-model & collection level; process-provenance; lineage) | the next design discussion; deferred |
| **Aggregation across a dimension** (contextual effects; a general sum-across) | first deferred extension beyond the intrinsic membership-simplex normalization |
| **Operator nodes** (constrained, deferred subset) | reuse the grammar but compute variables; own identification/path requirements; backend-limited |
| **Role-swap / reciprocal correspondence** (SRM dyadic reciprocity, `rel_ij ↔ rel_ji`) | a transform on a link grain, analogous to a lag-offset |
| **Correspondence epistemics** | unit relationships are data-validatable except the time-occasion case (assertion-only); the artifact tags which |
| **Latent-membership likelihood switch** (mixture/HMM expectation) | needs a backend-capability flag |
| **Continuous vs discrete representation of an axis** (e.g. time) | a modeling choice with large downstream consequences |
| **Connection-point identity & re-exposure on composition** | the "closed and recursive" requirement made concrete |
| **Multiple constructive decompositions (L2)** | deferred, possibly indefinitely (potentially unsound); the L1 semantic-view form is adopted |
| **Wrapper / process tooling** | reserved, not designed — schema records outputs + provenance, not logic |

---

## 13. Relationship to the current (`schemaVersion: 0`) implementation

- Consistent with "schema is source of truth; the flat model is a derived product" —
  here the flat RAM model is the *resolution* of the relational spec.
- Implies a structural break to the current data-connection mechanism (one dataset
  node + `type:data` paths) → a relational data layer. This bears on Open Questions 1,
  3, and 4 in `DESIGN-DECISIONS.md`.
- The current per-node `levelOfMeasurement` is superseded by the **unit of analysis**;
  its provisional removal in the current schema is consistent with reintroducing the
  concept properly here.

---

## Appendix — design rationale (in brief)

- **Graph vs expression is not the load-bearing axis.** The assembly backbone is a
  graph (modules + connections); mixin-style operators are authoring sugar that expand
  into it. The decisive axis is *how a model is repeated along a dimension*, answered
  by coordinate/tensor lifting rather than unrolling or name-templating.
- **Validation at both ends.** The construct-port substitution (single variable ↔ CFA)
  was checked against RI-CLPM, multigroup growth, and regime-switching state space at
  the ceiling, and against a simple CFA, a wide growth curve, and a Big Five model at
  the floor. The ceiling cases surfaced the additions now in the design (ambient unit,
  boundary conditions, the group/class 2×2, latent membership); the floor cases
  confirmed progressive disclosure and the simulation↔analysis duality (fixed values +
  extents + N vs free parameters + data).
