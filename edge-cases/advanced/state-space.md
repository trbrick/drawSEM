# Complex Model: Continuous-Time State-Space Model

## Overview

A continuous-time state-space model describes a latent process that evolves according to a differential equation and is observed, with measurement error, at discrete and possibly irregular times. Unlike a discrete-time autoregressive model, the dynamics are parameterized in continuous time: the effect of the previous observation on the current one depends on *how much time elapsed* between them. The discrete-time autoregressive coefficient is therefore not a free parameter — it is *computed* from the continuous-time drift parameter and the inter-observation interval.

This model tests **computed path values** (a path coefficient derived by a function of free parameters and data, here a matrix exponential of the drift times the interval) and a **measurement structure nested inside a process cascade**, producing a "process state plus its observation" column at each timepoint.

This is the one model family in this collection where *state* is the correct word: there is a genuine latent dynamical state that carries forward in time. That is distinct from the latent *measures* of an ML-VAR (see `hierarchical/mlvar-measurement.md`), whose across-time links are autoregressive/cross-regressive regressions rather than the time-parameterized evolution of a state.

## Prerequisites

The ML-VAR model (`hierarchical/mlvar-measurement.md`) for the idea of a latent process measured over time with inter-instance paths. Familiarity with continuous-time autoregressive / Ornstein–Uhlenbeck processes is helpful.

## Conceptual Model

For a univariate continuous-time AR(1) state with measurement error:

```
Continuous-time dynamics:   dη(t) = a·η(t)·dt + dW(t)

Discretized at observed times t₀, t₁, t₂, …:
   η(tₖ₊₁) = exp(a·Δtₖ)·η(tₖ) + ζ(tₖ)      Δtₖ = tₖ₊₁ − tₖ

Measurement:   y(tₖ) = η(tₖ) + ε(tₖ)

where:
   a          continuous-time drift (free; negative ⇒ stable process)
   σ²         diffusion / process-variance parameter (free)
   θ          measurement error variance (free)
   exp(a·Δt)  discrete-time AR coefficient — COMPUTED, not free
   Var(ζ|Δt)  process noise for this step — COMPUTED from a, σ², Δt
```

Key structural features:
- The free parameters are the *continuous-time* drift `a`, diffusion `σ²`, and measurement error `θ`.
- The across-time path coefficient is `exp(a·Δt)`, recomputed for each interval. Irregular spacing ⇒ different coefficients on different steps.
- The process-noise variance per step is also interval-dependent and computed from `a`, `σ²`, `Δt`.
- A measurement (with its own error) hangs off the state at each timepoint.
- This is univariate; a bivariate continuous-time VAR has a 2×2 drift matrix and a true matrix exponential.

## Specification Requirements

A specification must be able to represent:

1. **A latent state process measured over time**, with a measurement (and error) attached at each timepoint — a process cascade with a nested measurement structure.

2. **Free parameters that are not themselves path coefficients.** The drift `a` and diffusion `σ²` are model-level quantities; the visible across-time path coefficient is a *function* of them.

3. **Computed path values.** An across-time path whose value is `exp(a·Δt)` — derived from a free parameter and a data-supplied interval — rather than free or a single constant.

4. **Computed variances.** A process-noise variance per step computed from `a`, `σ²`, and `Δt` (not equal to `σ²`).

5. **Data-supplied, per-step intervals.** Δt from data — either an explicit interval column or derived from a time column per person.

6. **Interval-varying coefficients.** Different steps may have different computed coefficients when spacing is irregular; the same underlying parameters produce them all.

7. **An initial-condition treatment** for the first timepoint, which has no predecessor (its variance is either the process's stationary variance or separately specified).

8. **Generalization to matrix-valued computations** for the multivariate case (matrix exponential of a drift matrix).

## Data Formats

### Tall format with time (required)

One row per (person, observation time).

```
person  time   y
p001    0.0    1.2
p001    0.5    1.0
p001    1.7    0.6     ← irregular spacing: Δt = 1.2
p002    0.0    0.4
p002    1.0    0.5
```

- **UI perspective**: The time column drives the per-step intervals and therefore the computed coefficients; the user does not enter AR coefficients at all.
- **Data specification challenges**: Either an explicit `delta_t` column is provided, or intervals are computed from consecutive `time` values within a person. Time must be on a meaningful continuous scale.

Wide format is unsuitable — irregular, person-specific timing has no fixed column structure.

## Canonical Layouts

### Template view (one abstract timepoint)

```
┌─ ct_process (time: data-determined intervals) ─────────────────┐
│   ┌ state ───────────────────────────────────────────────┐   │
│   │   η  ←ζ (process noise, variance computed from a,σ²,Δt)│   │
│   └────┬───────────────────────────────────────────────────┘  │
│        ↓ λ = 1 (fixed)                                         │
│   ┌ measurement ──────────────────────────────────────────┐   │
│   │   y  ↑θ                                                │   │
│   └────────────────────────────────────────────────────────┘  │
│   ←·exp(a·Δt)  [continues: η]    [continues: η]  exp(a·Δt)·→   │
└────────────────────────────────────────────────────────────────┘
Free: a (drift), σ² (diffusion), θ (measurement error)
Computed: exp(a·Δt), Var(ζ|Δt)
```

### Expanded view (two adjacent timepoints, irregular Δt)

```
       tₖ                              tₖ₊₁
  ┌ state ─────┐                  ┌ state ─────┐
  │  η  ←ζ     │                  │  η  ←ζ     │
  └──┬─────────┘                  └──┬─────────┘
     ↓λ=1                            ↓λ=1
  ┌ measurement┐                  ┌ measurement┐
  │  y  ↑θ     │                  │  y  ↑θ     │
  └────────────┘                  └────────────┘
   ···→ η ──── exp(a·Δtₖ) ──────────→ η →···
              (Δtₖ varies per step; label is the formula, not a parameter)
```

The across-time path is labeled with its computed formula. Its numeric value depends on the specific interval for that step.

## Expansion Map

```
Assume: one person, T observation times.

Nodes:
  - η (state) instances:  T
  - y (measurement):       T

Paths:
  - η → y loadings (fixed 1):       T
  - measurement error θ:             T
  - process-noise variance:          T   (computed per step from a, σ², Δt)
  - across-time AR paths:            T − 1  (each value = exp(a·Δtₖ), computed)

Free parameters: 3   (a, σ², θ)
Computed quantities: (T − 1) AR coefficients + T process-noise variances

Concrete example (T = 6, irregular spacing):
  Nodes: 12;  AR paths: 5 (five different computed coefficients);  free params: 3
```

The free-parameter count (3) is independent of T; almost everything visible on the diagram is computed. A tool that treats each across-time path as a free coefficient will badly over-parameterize the model.

## Extensions & Expansion Points

- **Multivariate continuous-time VAR.** A d-dimensional state has a d×d drift matrix F; the across-time coefficient becomes the matrix exponential exp(F·Δt), and the process-noise variance an integral involving F and the diffusion matrix. Computed *matrix* path values are required.
- **Higher-order / latent derivatives.** Model level and rate (a latent differential equation of order 2+), as in continuous-time latent change / damped-oscillator models.
- **Random effects across persons.** Person-specific drift/diffusion drawn from a population distribution — a multilevel continuous-time model.
- **Time-varying drift or inputs.** Exogenous covariates or regime changes that modulate the dynamics.
- **Non-stationary initial condition.** Free the t₀ variance instead of fixing it to the stationary value (the genuine "non-stationary initial condition" case, which requires a dynamic process to be meaningful).

The univariate, single-process form should be a special case of a general mechanism for computed (scalar or matrix) path values driven by free parameters and data-supplied intervals.

## Specification & UI Requirements

### Must-Support Elements

1. **Process cascade with nested measurement** that expand together as a unit (requirement #1).
2. **Model-level free parameters** (drift, diffusion) that are not attached to a single path (requirement #2).
3. **Computed path coefficients and variances** as a first-class category alongside free and fixed (requirements #3, #4).
4. **Data-supplied per-step intervals** feeding the computations (requirements #5, #6).
5. **A first-instance initial-condition treatment** (requirement #7).
6. **A path to matrix-valued computations** for the multivariate case (requirement #8).

### Likely UI Workflows

1. Build a state with a measurement and error.
2. Declare drift and diffusion as model-level free parameters.
3. Mark the across-time path's value as computed (matrix exponential of drift × interval) and the process-noise variance as computed.
4. Bind the interval to a data time/interval column.
5. Set the initial-condition variance (stationary or free).

### Visualization Challenges

- Labeling an across-time path with a *formula* whose value varies per step, rather than a parameter name.
- Showing that one free drift parameter governs many different computed coefficients.
- Expanding state + measurement together as a column unit.

## Error Cases & Spec/Algorithm Gotchas

### Case 1: AR Coefficient Treated as Free

**Scenario**: The expander makes each across-time path a free parameter.

**Problem**: Over-parameterized and inconsistent with continuous-time dynamics; T−1 free coefficients instead of one drift.

**Gotcha**: The coefficient is computed, not free; irregular spacing makes per-step free coefficients especially wrong.

**Implication**: Computed values must be a representable path-value category.

### Case 2: Process Noise Set Equal to the Diffusion Parameter

**Scenario**: The per-step process-noise variance is set to σ² directly.

**Problem**: The discrete-time process noise is an interval-dependent function of `a` and `σ²`, not σ² itself; the model is misspecified.

**Gotcha**: Diffusion (continuous) ≠ process-noise variance (discrete, per interval).

**Implication**: The spec needs a computed-variance category distinct from a free variance.

### Case 3: Identifiability of Drift vs. Diffusion

**Scenario**: Few timepoints, narrow range of intervals, or weak dynamics.

**Problem**: Drift `a` and diffusion `σ²` (and the initial variance) can be weakly identified or trade off; the optimizer may stall or hit boundaries (e.g., a → 0).

**Gotcha**: Identification leans on having a *spread* of intervals and enough series length; a near-constant Δt gives little continuous-time information beyond a discrete AR.

**Implication**: The spec/UI should surface interval variability and series length; automated identification checks must consider these, not just parameter counts.

### Case 4: Initial Condition Ignored

**Scenario**: The first timepoint is given the same incoming process-noise structure as interior ones, despite having no predecessor.

**Problem**: Mis-specifies Var(η(t₀)); biases the whole trajectory.

**Gotcha**: t₀ is a genuine boundary instance needing its own variance treatment.

**Implication**: The spec must allow a distinct initial-condition variance (stationary or free).

### Case 5: Intervals Mis-derived From Time

**Scenario**: Intervals are taken as 1 per row, ignoring the actual time column.

**Problem**: Collapses continuous time to discrete steps; the whole point of the model is lost.

**Gotcha**: Adjacent rows are not equally spaced in real time.

**Implication**: The spec must compute Δt from the time column (per person) or require an explicit interval column.

## Watch-Out Points

When evaluating a candidate spec/UI for this model:

1. Are computed path coefficients (and computed variances) a first-class category alongside free and fixed?
2. Can free parameters live at the model level rather than being pinned to a single path?
3. Are per-step intervals derived from data and allowed to vary across steps?
4. Is the discrete process-noise variance distinguished from the continuous diffusion parameter?
5. Is there a distinct initial-condition treatment for the first timepoint?
6. Does the state+measurement pair expand together as a unit?
7. Does identification reasoning account for interval spread and series length, not just parameter count?
8. Does the labeling convey a formula-valued path whose number changes per step?
9. Does it generalize by extension to multivariate (matrix-exponential) dynamics and random effects?
10. Is the *state* vocabulary kept distinct from the ML-VAR *measures* vocabulary, so the two model families are not conflated?
