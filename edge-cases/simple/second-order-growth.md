# Complex Model: Second-Order (Curve-of-Factors) Growth

## Overview

A second-order growth model puts the growth structure on a *latent construct* rather than on an observed score. At each timepoint the construct is measured by several indicators (a one-factor measurement model), and the intercept/slope growth factors load on those per-timepoint *latent factors* — not on the raw measurements. The model therefore has two layers: a measurement layer (a CFA repeated at every occasion) and a structural growth layer (intercept and slope over the latent factors). It is also called a curve-of-factors model.

This model tests **composition of two repeated structures** — a measurement model cascaded over time, with person-level growth factors lifted across all timepoints — and, critically, it forces the question of **longitudinal measurement invariance**: growth in a latent construct is only interpretable if the construct is measured the same way at every occasion.

## Prerequisites

The first-order linear growth curve (`simple/growth-curve.md`) — growth on observed scores — and a single-occasion measurement model (`simple/cfa.md`: one factor, several indicators, loadings, residuals, a scaling convention). Measurement invariance (`multigroup/measurement-invariance.md`) is directly relevant: here invariance is across *time* rather than across groups.

## Conceptual Model

```
Growth layer (person-level, once):
   I (intercept)   S (slope)        Var(I),Var(S),Cov(I,S), means α_I,α_S

At each timepoint t, a latent construct Fₜ measured by indicators:
   Fₜ → y1ₜ, y2ₜ, y3ₜ      (loadings λ₁=1 marker, λ₂, λ₃; residuals θ)

Growth loads on the latent factors (NOT on the observed y):
   I → Fₜ  loading 1
   S → Fₜ  loading = time value

So:  yₖ(t) = λₖ · Fₜ + εₖ(t)
     Fₜ    = (1)·I + (t)·S + ζₜ
```

Key structural features:
- The "thing that grows" is a latent factor Fₜ, re-measured at each occasion by the same indicators.
- The measurement model repeats across time (cascaded); the growth factors I and S exist once per person and lift across all timepoints.
- The growth factors load on the latent Fₜ, not on the observed indicators.
- For the growth to be interpretable, the measurement model must be invariant across time (equal loadings, and equal indicator intercepts when means are modeled).
- A disturbance ζₜ on each Fₜ captures occasion-specific latent deviation from the trajectory.

## Specification Requirements

A specification must be able to represent:

1. **A measurement model repeated across time.** One latent factor with its indicators, instantiated at each timepoint.

2. **Person-level growth factors lifted across timepoints.** Intercept and slope exist once and connect to every timepoint's latent factor.

3. **Growth loadings onto latent factors, not observed scores.** I → Fₜ (fixed 1) and S → Fₜ (time-valued), with Fₜ latent.

4. **Longitudinal measurement-invariance constraints.** The ability to equate loadings (and indicator intercepts) across time, and to relax them (partial invariance) for specific indicators.

5. **A single coherent scaling convention.** The latent factors must be scaled (e.g., a marker indicator) in a way that is consistent across time and compatible with estimating growth-factor means/variances — without double-fixing the scale.

6. **Occasion-specific latent disturbances** (ζₜ) distinct from indicator residuals (εₖₜ).

7. **A clear distinction between first-order and second-order growth** — growth on observed vs. latent variables.

## Data Formats

### Wide format

One row per person; one column per (indicator, timepoint).

```
id    y1_t0 y2_t0 y3_t0  y1_t1 y2_t1 y3_t1  y1_t2 y2_t2 y3_t2
p001  4.1   3.8   3.9    4.6   4.3   4.4    5.2   4.9   5.0
```

- **UI perspective**: A block of indicators per timepoint; the factor at each timepoint is built from its block.
- **Data specification challenges**: Indicator-to-factor-to-time mapping is three-dimensional (indicator × time); column naming must encode both.

### Tall format

One row per (person, timepoint), with the indicators as columns and a time column.

```
id    time  measure_1 measure_2 measure_3
p001  0     4.1       3.8       3.9
p001  1     4.6       4.3       4.4
p001  2     5.2       4.9       5.0
```

- **UI perspective**: One measurement template repeated per (person, time) coordinate; the time column drives the slope loading.
- **Data specification challenges**: The repeated measurement model is one template expanded over time (coordinate expansion); invariance constraints must apply across the expansion.

### Trade-off discussion

- Wide format mirrors how second-order growth is often laid out in SEM software and makes the per-timepoint blocks explicit, but bakes time into columns and grows wide fast (indicators × timepoints).
- Tall format expresses the repeated measurement model as a single cascaded template and handles ragged timing, at the cost of needing invariance constraints stated over the expansion.

## Canonical Layouts

### Two-layer view

```
          I  ←Cov→  S            (growth factors, person-level, once)
          │ \       │ \
        1 │  \1   t │  \t   …    (I loads 1 on every Fₜ; S loads = time)
          ↓   ↓     ↓   ↓
          F₀        F₁        F₂        (latent construct at each timepoint)
        / | \     / | \     / | \
      λ₁ λ₂ λ₃   λ₁ λ₂ λ₃   λ₁ λ₂ λ₃   (loadings equal across time: invariance)
      y₁ y₂ y₃   y₁ y₂ y₃   y₁ y₂ y₃   (+ residuals εₖₜ)
```

The top layer is the growth curve; the bottom layer is the repeated CFA. Growth loadings land on Fₜ, not on yₖ.

### Template view (tall / cascaded)

```
┌ growth (person-level) ┐      ┌ measurement (per timepoint, cascaded) ┐
│  I ←Cov→ S            │──1──→│  F ←ζ                                  │
│                       │──t──→│   ↓λ₁ ↓λ₂ ↓λ₃                          │
└───────────────────────┘      │  y₁ y₂ y₃   ↑ε   [repeats over time →] │
                               └────────────────────────────────────────┘
   (loadings λ held equal across the time expansion: invariance)
```

## Expansion Map

```
Assume: T timepoints, m indicators per timepoint.

Nodes:
  - Growth factors I, S:        2 (person-level, once)
  - Latent factors Fₜ:          T
  - Indicators yₖ(t):           m·T

Paths:
  - Growth loadings I→Fₜ (fixed 1):   T
  - Growth loadings S→Fₜ (= time):    T
  - Factor loadings λ on indicators:  m·T  (but only m distinct values
                                            under metric invariance: λ₁ marker + (m−1) free)
  - Indicator residuals εₖₜ:          m·T  (equal across time → m params under strict invariance)
  - Latent disturbances ζₜ:           T
  - Var(I),Var(S),Cov(I,S):           3
  - Means α_I, α_S:                   2  (if modeled)

Free parameters (metric+scalar invariance, m=3, marker scaling):
  (m−1) loadings + m residuals + T disturbances + 3 growth (var/cov)
  + 2 growth means  ≈ 2 + 3 + T + 3 + 2 = T + 10

Concrete example (T=3, m=3):
  Nodes: 2 + 3 + 9 = 14
  Free parameters ≈ 13 (vs. a first-order growth on 3 scores, which is far smaller)
```

Note the free-parameter count is dominated by the *measurement* layer; the growth layer adds only a handful.

## Extensions & Expansion Points

- **Multiple constructs (parallel second-order growth).** Several latent constructs each with their own measurement model and growth factors, with cross-construct covariances — second-order analogue of `simple/bivariate-growth.md`.
- **Factor-of-curves vs. curve-of-factors.** The dual parameterization: fit a growth curve to each *indicator* and let a higher-order factor capture common growth, instead of growth on a common factor.
- **Partial invariance.** When strict invariance fails, free specific indicators' loadings/intercepts across time while keeping the rest equal.
- **Categorical indicators.** Threshold measurement at each occasion, changing the estimator and invariance definition.
- **Second-order multilevel.** Nest persons in clusters and add a second clustering level to the growth factors.

The single-construct, linear, fully-invariant form should be one point in a space spanning multiple constructs, partial invariance, alternative parameterizations, and categorical measurement.

## Specification & UI Requirements

### Must-Support Elements

1. **Composition of a cascaded measurement model with lifted person-level growth factors** (requirements #1, #2).
2. **Growth loadings onto latent factors** with fixed and time-valued coefficients (requirement #3).
3. **Cross-time invariance constraints**, full and partial (requirement #4).
4. **Coherent scaling** that doesn't conflict with growth-mean/variance identification (requirement #5).
5. **Separate latent disturbances and indicator residuals** (requirement #6).

### Likely UI Workflows

1. Build the one-factor measurement model (factor, indicators, loadings, residuals, scaling).
2. Mark it to repeat across time (cascade / per-timepoint).
3. Add person-level intercept and slope factors and connect them to the latent factor at each timepoint (fixed 1 and time-valued).
4. Impose loading (and intercept) invariance across time; relax for non-invariant indicators if needed.
5. Add growth-factor variances/covariance/means; fit and check invariance and growth.

### Visualization Challenges

- Showing two stacked layers (growth above, repeated CFA below) without clutter as T and m grow.
- Making clear that growth lands on the latent factors, not the observed indicators.
- Conveying that loadings are *shared* across timepoints (invariance), not repeated free parameters.

## Error Cases & Spec/Algorithm Gotchas

### Case 1: Growth Applied to Observed Scores (First-Order in Disguise)

**Scenario**: The intercept/slope are connected to the observed indicators (or to a single composite) rather than to the latent factors.

**Problem**: It becomes a first-order growth model on manifest scores; the latent-construct interpretation and the separation of measurement error from growth are lost.

**Gotcha**: "Growth of the factor" must route through Fₜ, not yₖ.

**Implication**: The spec must let growth factors target latent variables, and the UI should make the growth-target level explicit.

### Case 2: Non-Invariant Measurement Across Time

**Scenario**: Loadings (or intercepts) are left free to differ at each timepoint.

**Problem**: Apparent "growth" can be an artifact of the construct being measured differently over time; the slope is uninterpretable.

**Gotcha**: Second-order growth presupposes longitudinal invariance; without it the latent metric drifts.

**Implication**: The spec must support across-time invariance constraints, and tooling should warn when growth is estimated without them.

### Case 3: Double-Scaling / Under-Identification

**Scenario**: Each Fₜ is scaled independently (e.g., its variance fixed to 1 at every occasion) *and* growth-factor means/variances are estimated.

**Problem**: The factor scale and the growth structure compete to set the metric; the model is unidentified or the growth parameters are not meaningful.

**Gotcha**: Scaling must be set once (e.g., marker loading held equal across time) so the latent metric is shared, not re-fixed per occasion.

**Implication**: The spec must coordinate scaling with growth identification — a single, time-consistent convention.

### Case 4: Disturbance vs. Residual Conflated

**Scenario**: The occasion-level latent disturbance ζₜ and the indicator residuals εₖₜ are treated as one.

**Problem**: Misattributes latent occasion deviation to measurement error (or vice versa); biases both layers.

**Gotcha**: These live at different layers (latent factor vs. indicator).

**Implication**: The spec must represent latent disturbances separately from indicator residuals.

### Case 5: Loadings Counted as Many Free Parameters

**Scenario**: A validator counts m·T free loadings instead of the m−1 distinct ones under invariance.

**Problem**: Mis-sizes the model and its degrees of freedom.

**Gotcha**: Invariant loadings are shared parameters, not per-occasion copies.

**Implication**: Counting must treat cross-time-equated loadings as one parameter each.

## Watch-Out Points

When evaluating a candidate spec/UI for this model:

1. Can growth factors load on *latent* per-timepoint factors rather than observed scores?
2. Is the measurement model expressible as one template repeated across time?
3. Are across-time invariance constraints (full and partial) representable, and is growth flagged as uninterpretable without them?
4. Is factor scaling coordinated with growth identification (set once, time-consistent), avoiding double-scaling?
5. Are latent disturbances kept distinct from indicator residuals?
6. Does the free-parameter count treat invariant loadings as shared, not per-occasion?
7. Does the layout distinguish the growth layer from the repeated measurement layer clearly?
8. Does it handle both wide (blocks per timepoint) and tall (cascaded template) data layouts?
9. Does it extend by extension to multiple constructs, partial invariance, and the factor-of-curves dual?
10. Does the realized model match how second-order/curve-of-factors growth is written in OpenMx/lavaan?
