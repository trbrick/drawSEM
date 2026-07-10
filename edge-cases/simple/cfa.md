# Simple Model: Confirmatory Factor Analysis (Measurement Model)

## Overview

A confirmatory factor analysis (CFA) model posits that a set of observed variables (indicators) are imperfect measurements of one or more latent factors. Each indicator loads on the factor(s) it is meant to measure, carries its own measurement error, and the factors may covary. CFA is the foundational *measurement* model underlying most of structural equation modeling — growth curves, multigroup invariance, and second-order models all build a CFA and then add structure on top.

This document uses a two-factor CFA as the reference case (two correlated factors, three indicators each), with the single-factor model as its minimal sub-case. It tests the core measurement primitives: latent factors, loadings with a scaling convention, indicator residuals, factor variances and covariances, and the identification rules that make a measurement model estimable.

## Prerequisites

None. This is a foundational building block; other measurement-based edge cases reference it.

## Conceptual Model

```
Two correlated factors, three indicators each:

      F₁ ←Cov(F₁,F₂)→ F₂
     / | \           / | \
   λ₁ λ₂ λ₃        λ₄ λ₅ λ₆      (loadings; one per factor fixed for scaling)
   x₁ x₂ x₃        x₄ x₅ x₆      (observed indicators)
   ↑θ ↑θ ↑θ        ↑θ ↑θ ↑θ      (residual/error variances)

Var(F₁), Var(F₂), Cov(F₁,F₂)
Each indicator loads on ONE factor (simple structure); cross-loadings are
typically fixed to zero.
```

Key structural features:
- Each factor is measured by multiple indicators (three is the usual minimum for a standalone single factor to be identified).
- Each indicator loads on one factor (simple structure); residual variances capture measurement error.
- Factors covary; their variances and covariance are estimated.
- Scaling: each factor's metric is set either by fixing one loading to 1 (marker variable) or by fixing the factor variance to 1 (standardized).

## Specification Requirements

A specification must be able to represent:

1. **Latent factors** as variables that are not directly observed.

2. **Indicators loading on factors**, with each loading fixed or free.

3. **A scaling convention per factor** — a marker loading fixed to 1, or the factor variance fixed to 1 — chosen so the factor's metric is identified.

4. **Indicator residual (error) variances**, distinct from the factor variances.

5. **Factor variances and inter-factor covariances.**

6. **Simple structure with optional cross-loadings.** The default that an indicator loads on one factor, with the ability to add a cross-loading or correlated residuals when needed.

7. **Identification awareness** — enough indicators per factor and a scaling convention, so the model is not under-identified.

8. **Means/intercepts (optional)** when the model is fit to means as well as covariances.

## Data Formats

### Wide format (the natural CFA layout)

One row per case; one column per indicator.

```
id    x1    x2    x3    x4    x5    x6
1     4.2   3.9   4.1   2.0   2.3   1.8
2     5.0   4.8   5.1   3.1   2.9   3.0
3     3.1   3.0   3.3   1.2   1.5   1.1
```

- **UI perspective**: Each indicator column maps to one observed node; the user draws loadings from factors to indicators.
- **Data specification challenges**: Which indicator belongs to which factor is a *model* statement, not encoded in the data; the mapping must be specified.

A pure cross-sectional CFA has no repeated/tall structure; tall format becomes relevant only in the longitudinal extension below (where the same factor recurs over time).

## Canonical Layouts

### Two-factor CFA

```
        F₁ ←───── Cov ─────→ F₂
       /│\                  /│\
     1 λ₂ λ₃              1 λ₅ λ₆      (marker loading = 1 per factor)
     x₁ x₂ x₃            x₄ x₅ x₆
     │  │  │              │  │  │
    θ₁ θ₂ θ₃            θ₄ θ₅ θ₆       (residual variances)
```

### Single-factor (minimal sub-case)

```
        F
      / │ \
    1  λ₂  λ₃
    x₁  x₂  x₃     (≥3 indicators for standalone identification)
   θ₁  θ₂  θ₃
Var(F)
```

## Expansion Map

```
Assume: k factors, m indicators each (simple structure), marker scaling.

Nodes:
  - Factors:        k
  - Indicators:     k·m

Paths/parameters:
  - Loadings:       k·(m−1) free  (one marker per factor fixed)
  - Residuals:      k·m
  - Factor variances: k
  - Factor covariances: k(k−1)/2
  - (Means/intercepts: k·m intercepts + k factor means, if modeled)

Free parameters (covariance structure only):
  k(m−1) + k·m + k + k(k−1)/2

Concrete example (k=2 factors, m=3 indicators):
  - Nodes: 2 + 6 = 8
  - Loadings free: 2·2 = 4
  - Residuals: 6
  - Factor variances: 2
  - Factor covariance: 1
  - Free parameters: 13  (vs. 21 observed covariance elements → 8 df)
```

## Extensions & Expansion Points

- **Single factor** (minimal case) and **many correlated factors** (the general case).
- **The same factor measured at multiple timepoints (longitudinal CFA).** Repeat a factor's measurement model across two or more occasions and let the occasion-factors covary. This is a *special case of CFA*, not a growth model: there is no intercept/slope, just the same construct re-measured.
  - **Two ways to specify it.** Manually duplicate the factor block per timepoint (concrete and obvious for two occasions), or express one measurement template expanded over a time coordinate (scales to many occasions and ragged timing).
  - **It raises longitudinal invariance.** Comparing or relating the factor across time presupposes invariant measurement (equal loadings, and equal indicator intercepts when means are modeled) — the across-*time* analogue of multigroup invariance (`multigroup/measurement-invariance.md`).
  - **It is the measurement layer of second-order growth.** Add intercept/slope factors on top of these per-timepoint latent factors and it becomes the curve-of-factors model (`simple/second-order-growth.md`). The bare repeated-factor case is that model with the growth layer removed — the right place to establish invariance before modeling change.
- **Higher-order / bifactor** structure (a general factor plus specifics, or factors of factors).
- **Correlated residuals** between indicators sharing method or wording.
- **Categorical indicators** (threshold measurement), changing the estimator.
- **MIMIC / covariate effects** on factors.

The single-occasion, simple-structure, continuous-indicator CFA should be one point in a space spanning multi-factor, longitudinal, hierarchical (see `hierarchical/multilevel-cfa.md`), and categorical measurement.

## Specification & UI Requirements

### Must-Support Elements

1. **Factors, indicators, and loadings** with fixed/free status (requirements #1, #2).
2. **Per-factor scaling** (marker or fixed-variance), chosen to identify the metric (requirement #3).
3. **Residual variances and factor variances/covariances** as distinct quantities (requirements #4, #5).
4. **Simple structure by default with optional cross-loadings / correlated residuals** (requirement #6).
5. **Identification feedback** (indicators per factor, scaling present) (requirement #7).

### Likely UI Workflows

1. Create the factors and the observed indicators.
2. Draw loadings (factor → indicators); fix one loading per factor (or fix factor variance) for scaling.
3. Add residual variances on indicators and variances/covariance on factors.
4. Optionally add a cross-loading or correlated residual.
5. Map indicator columns to data; fit and inspect.

### Visualization Challenges

- Keeping simple structure readable as the number of factors and indicators grows.
- Distinguishing the marker (fixed) loading from free loadings.
- Showing factor covariances without visual collision with loadings.

## Error Cases & Spec/Algorithm Gotchas

### Case 1: Under-Identified Factor (Too Few Indicators)

**Scenario**: A standalone factor has only one or two indicators with no other constraints.

**Problem**: The factor is not identified; loadings/variance trade off.

**Gotcha**: A single factor generally needs three indicators (or two with equality/cross-factor constraints).

**Implication**: The spec/UI should check per-factor indicator counts and warn, not just count total parameters.

### Case 2: Missing Scaling Convention

**Scenario**: No loading is fixed and the factor variance is also free.

**Problem**: The factor has no metric; the model is unidentified.

**Gotcha**: Exactly one scaling choice per factor is required — marker or fixed variance, not neither and not both.

**Implication**: The spec must enforce a scaling convention per factor and prevent double-scaling.

### Case 3: Residual Variance Omitted or Merged With Factor Variance

**Scenario**: Indicators are given no residual variance, or error and factor variance are conflated.

**Problem**: Forces indicators to be perfect measures; mis-specifies the covariance structure.

**Gotcha**: Each indicator needs its own residual distinct from the factor variance.

**Implication**: The spec must represent indicator residuals separately.

### Case 4: Accidental Cross-Loadings / Wrong Indicator-Factor Mapping

**Scenario**: An indicator is loaded on the wrong factor, or on both, unintentionally.

**Problem**: Distorts the measurement structure and factor meaning.

**Gotcha**: The indicator-to-factor mapping is a model statement easy to get wrong; the data doesn't encode it.

**Implication**: The UI should make each indicator's factor assignment explicit and default to simple structure.

### Case 5: Empirical Under-Identification

**Scenario**: The model is formally identified but a factor covariance is near zero or a loading near zero.

**Problem**: The optimizer hits a flat region or boundary; estimates are unstable.

**Gotcha**: Formal identification doesn't guarantee a well-conditioned fit.

**Implication**: The spec/UI should surface boundary/near-zero estimates rather than report convergence uncritically.

## Watch-Out Points

When evaluating a candidate spec/UI for this model:

1. Can multiple factors, each with multiple indicators, be expressed with simple structure?
2. Is a scaling convention required and enforced per factor (marker or fixed variance), preventing none/double scaling?
3. Are indicator residuals represented distinctly from factor variances?
4. Does identification feedback consider per-factor indicator counts, not just total parameter count?
5. Can cross-loadings and correlated residuals be added deliberately (and are they off by default)?
6. Is the indicator-to-factor mapping explicit and hard to get wrong?
7. Can the same factor be repeated across timepoints (longitudinal CFA) with invariance constraints?
8. Does the layout stay readable as factors/indicators grow, with the marker loading distinguishable?
9. Does it extend by extension to higher-order/bifactor, categorical indicators, and the multilevel/second-order cases?
10. Does the realized model match how CFA is written in OpenMx/lavaan?
