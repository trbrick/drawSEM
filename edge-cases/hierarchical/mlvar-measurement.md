# Complex Model: Multilevel VAR with Measurement Error

## Overview

A multilevel vector-autoregressive model with latent variables (ML-VAR-M) represents how an individual's repeatedly-measured constructs relate to their own and each other's recent past. Each person contributes their own time series; a VAR(1) process is fit across all persons under an assumption of population-level parameter homogeneity (stationarity). The constructs are not observed directly — each latent measure is observed through a manifest indicator at every timepoint, with measurement error.

This is the simplest model that simultaneously forces: a *data-determined* time dimension (each person has a different number of timepoints), autoregressive and cross-regressive paths linking the latent measures across adjacent timepoints, a measurement structure that repeats inside the time structure, and equality (stationarity) constraints across time.

The latent variables here are *measures* of a construct at each occasion, not hidden states of a dynamical system. The across-time paths are autoregressive (a measure on its own past) and cross-regressive / cross-lagged (a measure on another measure's past) — they are regressions, not state transitions. Keeping this language distinct avoids conflating ML-VAR with state-space models or hidden Markov models.

## Prerequisites

Familiarity with single-level VAR/autoregression and with simple measurement (a latent variable observed through a manifest indicator with error). The simple growth curve (`simple/growth-curve.md`) is a useful contrast: there the latent factors sit *outside* time and indicators repeat; here the latent measures themselves repeat and are regressed on one another across time.

## Conceptual Model

```
For each person p, at each timepoint t:

  η₁(t) ←ζ₁      η₂(t) ←ζ₂        (two latent measures + innovation/disturbance)
    ↓1.0           ↓1.0
  y₁(t) ↑ε₁      y₂(t) ↑ε₂        (one indicator each, fixed unit loading)

Across adjacent timepoints (same person):
  η₁(t-1) ──φ₁₁──→ η₁(t)          (autoregressive)
  η₂(t-1) ──φ₂₂──→ η₂(t)          (autoregressive)
  η₁(t-1) ──φ₂₁──→ η₂(t)          (cross-regressive / cross-lagged)
  η₂(t-1) ──φ₁₂──→ η₁(t)          (cross-regressive / cross-lagged)
```

Parameters, all equal across time (stationarity):
- φ₁₁, φ₂₂ (autoregressive), φ₁₂, φ₂₁ (cross-regressive): 4
- Innovation (disturbance) covariance Ψ (two variances + one covariance): 3
- Measurement error variances θ₁, θ₂: 2
- Loadings fixed to 1.0 (not estimated)

Total free parameters: 9.

## Specification Requirements

A specification must be able to represent:

1. **A repeated unit that contains both a latent measure and its observation.** Each timepoint is a small structure (latent measures η, indicators y, error) that repeats over time.

2. **A data-determined time dimension.** The number of timepoints is not declared in the model — it comes from each person's data and varies across persons (unbalanced panel).

3. **Autoregressive and cross-regressive paths between adjacent instances** of the repeated unit (η at t−1 → η at t), including cross-regressive paths between *different* latent measures across the lag.

4. **A grouping variable defining independence** (person): the regression chain runs within a person and never across persons.

5. **Equality constraints across time** (stationarity): every realized autoregressive / cross-regressive / innovation parameter shares one value across all timepoints.

6. **A measurement structure nested inside the repeating unit**, replicating together with the latent measure rather than independently.

7. **Selective constraint relaxation.** The ability to let some parameters vary across time (e.g., heteroscedastic measurement error) while others stay constrained.

## Data Formats

### Tall format (required in practice)

One row per (person, timepoint).

```
person  time  y1     y2
p001    0     0.4    1.2
p001    1     0.6    1.0
p001    2     0.3    0.9
p002    0    -0.2    0.5
p002    1     0.1    0.7
```

- **UI perspective**: The person column groups independent series; the time column orders the autoregressive/cross-regressive chain.
- **Data specification challenges**: Timepoints per person vary; the model cannot assume a fixed T. Gaps/irregular spacing raise the question of whether "adjacent rows" or actual time values define the lag (the base model assumes evenly-spaced, adjacent-row lags).

Wide format is awkward here because the number of timepoint-columns differs per person; tall format is the natural representation for unbalanced intensive longitudinal data.

## Canonical Layouts

### Template view (one abstract timepoint)

```
┌─ timepoint (time: data-determined, per person) ───────────────┐
│   ┌ latent measures ─────────────────────────────────────┐   │
│   │   η₁  ←ψ₁₁     ↔ψ₁₂ ↔     η₂  ←ψ₂₂                  │   │
│   └──┬───────────────────────────┬─────────────────────────┘  │
│      ↓1.0                         ↓1.0                         │
│   ┌ measurement ──────────────────────────────────────────┐  │
│   │   y₁ ↑θ₁                      y₂ ↑θ₂                  │  │
│   └────────────────────────────────────────────────────────┘  │
│   ←(φ)· [continues: η₁,η₂]      [continues: η₁,η₂] ·(φ)→      │
└────────────────────────────────────────────────────────────────┘
```

Stubs on η₁, η₂ indicate the autoregressive/cross-regressive connections continuing in both directions. A stationary VAR has no structurally distinct first or last timepoint.

### Expanded view (two adjacent timepoints)

```
        Tₙ                          Tₙ₊₁
  η₁  η₂   (↔ψ₁₂)            η₁  η₂   (↔ψ₁₂)
   ↓1  ↓1                     ↓1  ↓1
  y₁  y₂                     y₁  y₂

  η₁ ─── φ₁₁ ──────────────→ η₁   (autoregressive)
  η₂ ─── φ₂₂ ──────────────→ η₂   (autoregressive)
  η₁ ─── φ₂₁ ───────╲──────→ η₂   (cross-regressive; the two cross-lags cross)
  η₂ ─── φ₁₂ ───────╱──────→ η₁
```

The four φ paths are the complete VAR(1) set of autoregressive and cross-regressive paths; the two cross-lags cross visually and need distinct routing/colour.

## Expansion Map

```
Assume: P persons, person p has Tₚ timepoints (unbalanced).

Per person p:
  Nodes:  η₁,η₂,y₁,y₂ × Tₚ  = 4Tₚ
  Paths:
    - measurement loadings (fixed 1):     2Tₚ
    - innovation covariance (ψ₁₁,ψ₂₂,ψ₁₂): 3Tₚ
    - measurement error (θ₁,θ₂):           2Tₚ
    - VAR inter-instance (4 φ):            4(Tₚ − 1)

Free parameters (after stationarity constraints): 9
    φ (4) + Ψ (3) + θ (2);  loadings fixed (2, not free)

Concrete example (one person, Tₚ = 5):
  Nodes:  4 × 5 = 20
  VAR paths: 4 × 4 = 16
  Free parameters: still 9 (shared across all timepoints and persons)
```

As with most cascade models, drawn-path count grows with T while free-parameter count stays fixed — counting logic must not equate the two.

## Extensions & Expansion Points

- **More latent measures / higher dimension.** A d-variable VAR(1) has d² autoregressive+cross-regressive paths (25 for d=5); the expanded two-instance window becomes dense but stays topologically regular.
- **Higher-order lags.** VAR(2)+ adds paths from t−2, t−3; the "adjacent instance" mechanism must reference instances at arbitrary offsets.
- **Random effects across persons.** Letting φ/Ψ vary by person (with a population distribution) turns the fixed-parameter VAR into a genuine multilevel/random-effects VAR — the natural next step and the reason this lives under `hierarchical/`.
- **Multiple indicators per latent measure.** Replace the single-indicator measurement with a 3+ indicator factor, introducing free loadings and measurement-invariance constraints across time.
- **Non-stationary initial condition.** A separate initial structure outside the cascade (see `advanced/lgcm-nonstationary.md`) to free the t=0 variance.
- **Continuous time.** Irregular spacing handled via a continuous-time formulation where the autoregressive coefficient is computed from the time interval (see `advanced/state-space.md`).

## Specification & UI Requirements

### Must-Support Elements

1. **Repeating composite unit** (latent measure + observation) that replicates as a whole over time (requirements #1, #6).
2. **Data-determined dimension length** — model valid and renderable before data is attached, with T resolved per person at expansion (requirement #2).
3. **Inter-instance directed paths** with cross-variable targets (cross-regressive) (requirement #3).
4. **Within-group scoping** so chains never cross persons (requirement #4).
5. **Across-time equality constraints**, selectively relaxable (requirements #5, #7).

### Likely UI Workflows

1. Build one timepoint unit: two latent measures with an innovation covariance, each observed by a unit-loaded indicator and error.
2. Mark the unit as repeating over a (data-determined) time dimension, grouped by person.
3. Add the four inter-instance paths (two autoregressive, two cross-regressive).
4. Apply a stationarity constraint (all VAR/innovation parameters equal across time).
5. Optionally relax a constraint (e.g., let θ vary across time).

### Visualization Challenges

- Showing a sensible template before T is known (no data yet).
- Rendering cross-regressive paths without ambiguity when they cross between columns.
- Expanding the measurement submodule together with its latent measure as one column unit, not as independent nodes.

## Error Cases & Spec/Algorithm Gotchas

### Case 1: Equality Constraint Implemented as a Hard Constraint

**Scenario**: Stationarity is enforced with an explicit equality *constraint* across every realized path rather than by giving them a shared parameter label.

**Problem**: The model becomes far slower and can be unidentifiable or numerically fragile.

**Gotcha**: "All equal across time" should be one shared parameter, not many parameters plus constraints binding them.

**Implication**: The spec must express shared parameters directly; the backend should realize them as label equality (see `OPENMX-PRIMER.md`), not as constraint equations.

### Case 2: Time Dimension Enumerated From the Model

**Scenario**: An algorithm tries to expand the cascade using a timepoint count from the model definition.

**Problem**: There is none — T is per person and lives in the data. Expansion fails or invents a wrong T.

**Gotcha**: This dimension is generative; the resolver cannot run until data is attached, yet template-mode rendering must still work.

**Implication**: The spec must mark dimensions whose extent is data-determined, and tooling must handle "length unknown until data."

### Case 3: Regression Chain Leaks Across Persons

**Scenario**: Inter-instance paths are generated by "connect each instance to the next" without a person scope.

**Problem**: The last timepoint of person A is regressed on by the first of person B — a meaningless cross-person lag.

**Gotcha**: Adjacency must be within the grouping unit.

**Implication**: Inter-instance paths must respect the grouping/independence variable.

### Case 4: Single-Timepoint Persons

**Scenario**: Some person has Tₚ = 1.

**Problem**: That person contributes no inter-instance paths, and the innovation covariance is not identified from them alone; naive expansion may crash producing a one-instance chain.

**Gotcha**: A valid panel can still contain degenerate-length series.

**Implication**: Expansion and rendering must tolerate length-1 cascades; identification is a population-level property, not a per-person one.

### Case 5: Adjacent-Row vs. True-Time Lag

**Scenario**: Rows are unevenly spaced in real time, but the lag is taken between adjacent rows.

**Problem**: A "one-step" lag conflates a 1-day and a 1-week gap.

**Gotcha**: The base model assumes regular spacing; real intensive data often isn't.

**Implication**: The spec should make the lag definition explicit (row adjacency vs. time interval), pointing toward the continuous-time extension when spacing is irregular.

## Watch-Out Points

When evaluating a candidate spec/UI for this model:

1. Can a stationarity constraint be expressed as one shared parameter rather than many constrained copies?
2. Are data-determined dimensions representable, with template rendering before data is attached?
3. Do inter-instance (autoregressive/cross-regressive) paths respect the person grouping, never crossing persons?
4. Are cross-regressive paths between different latent measures across a lag expressible and clearly drawn?
5. Does the measurement submodule replicate *with* its latent measure as a unit?
6. Can constraints be selectively relaxed (e.g., heteroscedastic error) while others hold?
7. Does the tool tolerate unbalanced T, including length-1 series, without crashing?
8. Is the lag definition (adjacency vs. time interval) explicit?
9. Does it generalize by extension to higher dimension, higher lag order, random effects, and multiple indicators?
10. Does the realized model match how multilevel/dynamic SEMs are written in OpenMx, or require a different mental model — and does its vocabulary stay distinct from state-space/HMM transitions?
