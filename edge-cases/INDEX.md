# Edge Cases for Specification & UI Design

This directory contains model examples designed to evaluate JSON specification approaches and UI design strategies. Each example describes a concrete model that must be representable, specifying what the final result should look like and highlighting issues likely to trip up specs and algorithms.

## Purpose

These documents are intended for LLMs evaluating candidate JSON specifications and UI approaches. By analyzing how well a proposed spec/UI design can represent these models, we can compare approaches on clarity, concision, likelihood of errors, algorithmic simplicity, explicitness vs. inferrability, and runnability.

## Structure

- **`simple/`**: Basic model types that serve as building blocks
  - `cfa.md`: Confirmatory factor analysis — the foundational measurement model (multi-factor; longitudinal CFA as a special case)
  - `growth-curve.md`: Linear growth model with measurement across timepoints (incl. tall-format coordinate expansion, unbalanced T, and growth factors as nodes)
  - `bivariate-growth.md`: Two parallel growth processes sharing a time dimension, joined by cross-construct factor covariances
  - `second-order-growth.md`: Curve-of-factors growth — growth on a latent construct measured by indicators at each timepoint (requires longitudinal invariance)

- **`cross-classified/`**: Models combining multiple random effects that don't nest
  - `growth-curve.md`: Cross-classified structure where students and teachers are crossed at the outcome level
  - `twin-ace.md`: Behavior-genetics ACE model — a single role self-crossed into pairs within families, with data-supplied (zygosity-dependent) genetic covariance

- **`hierarchical/`**: Nested (one unit inside another) structures
  - `multilevel-cfa.md`: Two-level CFA decomposing indicator covariance into between- and within-cluster factors
  - `mlvar-measurement.md`: Multilevel VAR on latent measures with single-indicator measurement and stationarity constraints

- **`multigroup/`**: Models fit to multiple observed groups with cross-group constraints
  - `measurement-invariance.md`: Multigroup CFA and the configural→metric→scalar→strict invariance ladder

- **`advanced/`**: Combinations and harder patterns
  - `state-space.md`: Continuous-time state-space model with computed (interval-dependent) autoregressive coefficients
  - `burst-design.md`: Nested time-within-burst dimensions with optional between-burst carryover
  - `mixture.md`: Finite mixture / latent-class model — one template, several latent-class parameterizations, estimated membership

## Navigation

**Suggested approach for LLM evaluation:**

1. Start with `simple/growth-curve.md` to understand:
   - How a single-level repeated-measures model is specified
   - Different data formats (wide vs. tall) and trade-offs
   - Canonical path diagram layouts
   - What the expanded model should contain

2. Move to `cross-classified/growth-curve.md` to understand:
   - How component models compose
   - Coordinate-based parametrization (instances per factor level)
   - Cross-component path specification
   - How composition affects visualization

3. Then sample by theme:
   - **Replication & shared parameters**: `cross-classified/twin-ace.md` (self-crossing, data-supplied path values, identification needing both groups)
   - **Parallel processes**: `simple/bivariate-growth.md` (replication scope per node; factor- vs. indicator-level covariance)
   - **Nesting & levels**: `hierarchical/multilevel-cfa.md`, `hierarchical/mlvar-measurement.md` (between/within decomposition; data-determined dimensions; autoregressive vs. cross-regressive paths)
   - **Observed vs. latent grouping**: `multigroup/measurement-invariance.md` (observed groups, equality ladder) contrasted with `advanced/mixture.md` (estimated membership)
   - **Computed values & dynamics**: `advanced/state-space.md` (computed interval-dependent coefficients), `advanced/burst-design.md` (nested dimensions, boundary-targeted paths)

> **Terminology note.** Keep model families distinct: ML-VAR (`mlvar-measurement`) involves latent *measures* linked by *autoregressive / cross-regressive* paths; state-space (`state-space`) involves a latent *state* that *evolves* in time. Do not describe ML-VAR links as state transitions.

## Document Structure

Each model document contains:

- **Overview**: What the model represents conceptually
- **Prerequisites**: Related models to understand first (if any)
- **Specification Requirements**: What must be representable
- **Data Formats**: How data might be organized; trade-offs
- **Canonical Layouts**: ASCII diagrams showing how this should appear
- **Expansion Map**: What the final instantiated model contains (nodes, paths, counts)
- **Specification & UI Requirements**: What a JSON spec and UI must support
- **Error Cases**: Spec/algorithm gotchas specific to this model
- **Watch-Out Points**: Common tripping hazards when evaluating candidate specs

## Using These for Spec/UI Evaluation

When evaluating a candidate specification or UI approach:

1. Read the model document entirely to understand the requirements
2. Ask: "Can this spec represent all required structural elements?"
3. Ask: "How would a user create this model in the UI?"
4. Ask: "How would the UI visualize this model at various zoom/expansion levels?"
5. Ask: "Are there ambiguous or error-prone aspects of how this spec represents this model?"
6. Check the "Watch-Out Points" section for known pitfalls
7. Compare the approach to other candidates using the same criteria

## Future Additions

As the specification evolves, this directory will continue to grow. Candidate
additions not yet written:

- `simple/`: Standalone factor/measurement models and regressions (beyond growth)
- `hierarchical/`: Three-level nesting; random-slope / cross-level structural models
- `multigroup/`: Many-group and longitudinal invariance; approximate/Bayesian invariance
- `advanced/`: Multivariate continuous-time VAR; mixtures with covariate-predicted membership; combinations of the above
