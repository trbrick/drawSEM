# Complex Model: Multigroup Model & Measurement Invariance

## Overview

A multigroup model fits the *same* structural model to two or more **observed** groups (e.g., males and females, countries, treatment arms), allowing some parameters to differ across groups and constraining others to be equal. The central use is **measurement invariance testing**: a sequence of nested models that progressively equate loadings, then intercepts, then residuals across groups, to establish whether a construct is measured the same way in each group before comparing the groups on it.

This model tests **one template instantiated per observed group**, **per-parameter equality constraints across groups**, and **group-wise data partitioning by a grouping variable**. Its defining contrast is with mixture models (`advanced/mixture.md`): here the grouping is *observed* and the data is split by it; there the grouping is *latent* and estimated.

## Prerequisites

Single-group CFA (factor, indicators, loadings, intercepts, residuals, a scaling convention). The invariance sequence builds directly on understanding which parameters carry measurement meaning (loadings, intercepts) versus structural meaning (factor means, variances).

## Conceptual Model

```
One template: single-factor CFA
   F → x₁,x₂,x₃   (loadings λ₁,λ₂,λ₃)
   intercepts μ₁,μ₂,μ₃ ; residuals θ₁,θ₂,θ₃ ; factor mean/variance

Fit to G observed groups, each reading its own data subset:

   Group A (gender = M):  λᴬ, μᴬ, θᴬ, factor mean κᴬ, variance ψᴬ
   Group B (gender = F):  λᴮ, μᴮ, θᴮ, factor mean κᴮ, variance ψᴮ

Invariance sequence (nested constraints across groups):
   configural : same pattern; all parameters free per group
   metric     : loadings equal      (λᴬ = λᴮ)
   scalar     : + intercepts equal   (μᴬ = μᴮ)
   strict     : + residuals equal    (θᴬ = θᴮ)
   then compare factor means/variances across groups
```

Key structural features:
- One template; one instantiation per observed group.
- A grouping variable in the data partitions cases into groups.
- Parameters are equated across groups selectively, in a theory-driven sequence.
- Identification/scaling (e.g., a reference loading = 1, or a fixed factor mean in one group) must be set so cross-group comparisons are meaningful.

## Specification Requirements

A specification must be able to represent:

1. **A reusable template** instantiated once per group.

2. **An observed grouping variable** that partitions the data; each group reads the rows matching its value.

3. **Per-parameter cross-group equality constraints**, settable independently (equate loadings but not intercepts, etc.).

4. **Nested constraint configurations** (configural → metric → scalar → strict) that can be defined and compared.

5. **Group-specific free parameters** for whatever is not equated (factor means, variances, group-specific residuals).

6. **Scaling/identification conventions** chosen so cross-group comparisons are identified (e.g., marker variable, or fixing the factor mean to zero in a reference group at the scalar step).

7. **Partial invariance.** The ability to equate *some* indicators' loadings/intercepts while freeing others (a specific indicator is non-invariant).

8. **Group-wise fit** (each group contributes its own data likelihood; the total is their sum).

## Data Formats

### Single dataset with a grouping column (typical)

```
id   x1    x2    x3    gender
1    4.2   3.9   5.1   M
2    3.8   4.1   4.7   F
3    5.0   4.8   5.5   M
```

- **UI perspective**: One dataset; a grouping column (gender) defines the groups. Each group reads the rows matching its value via a filter.
- **Data specification challenges**: The grouping variable must be categorical and complete; each group must have enough cases to identify its parameters.

### Separate dataset per group (alternative)

Each group bound to its own file.

- **UI perspective**: Explicit per-group datasets.
- **Data specification challenges**: Keeping variables/coding consistent across files; the grouping is implicit in which file is which.

### Trade-off discussion

- A single file + grouping column matches how multigroup SEM is usually specified and keeps coding consistent.
- Separate files suit data that genuinely arrives per group but risk inconsistency and obscure the grouping variable.

## Canonical Layouts

### Template per group

```
        ┌─ template: 1-factor CFA ────────┐
        │   F → x₁ x₂ x₃ (λ); μ; θ; ψ,κ   │
        └─────────────────────────────────┘
              instantiated per group
   ┌ Group A (M) ┐        ┌ Group B (F) ┐
   │ λᴬ μᴬ θᴬ κᴬ │        │ λᴮ μᴮ θᴮ κᴮ │
   └─────────────┘        └─────────────┘
   equality links (per invariance step): λᴬ=λᴮ, μᴬ=μᴮ, …
   data split by gender
```

### Invariance ladder

```
configural ⊂ metric ⊂ scalar ⊂ strict
  free        +λ eq     +μ eq    +θ eq
Each step adds equality constraints; compare fit to test invariance.
```

## Expansion Map

```
Assume: template with p per-group parameters; G groups.

configural: G · p free (minus per-group identification constraints)
each invariance step removes (G − 1) · (#equated parameters) free parameters.

Concrete example: 1-factor, 3 indicators, 2 groups.
  Per group (free loadings λ₂,λ₃ with λ₁=1 marker; intercepts μ₁,μ₂,μ₃;
  residuals θ₁,θ₂,θ₃; factor mean κ, variance ψ): ~10 per group.
  configural: ~2 × 10 = 20 (minus scaling)
  metric (λ equal): −(λ₂,λ₃) across groups → −2
  scalar (+μ equal): −3
  strict (+θ equal): −3
Comparisons across steps test invariance; degrees of freedom change by the
number of newly-equated parameters.
```

## Extensions & Expansion Points

- **More groups.** G > 2 (e.g., many countries); equality constraints span all groups, and partial invariance becomes more intricate.
- **Multigroup of any model.** Not just CFA — multigroup growth curves, SEMs, multigroup path models.
- **Longitudinal invariance.** Treat occasions like groups: invariance of measurement across time within person (a different "grouping" axis).
- **Approximate / Bayesian invariance.** Small differences allowed rather than exact equality (alignment, priors on differences).
- **Partial invariance search.** Algorithms that locate which indicators are non-invariant.
- **Toward latent grouping.** When the grouping is unknown, the observed-group multigroup model becomes a mixture (`advanced/mixture.md`) — the two are endpoints of one axis (observed ↔ latent grouping).

The two-group, exact-equality CFA form should be a special case of a general "one template per observed group with selective cross-group equality" mechanism.

## Specification & UI Requirements

### Must-Support Elements

1. **Template instantiated per observed group**, data partitioned by a grouping variable (requirements #1, #2).
2. **Per-parameter cross-group equality**, including partial invariance (requirements #3, #7).
3. **Nested constraint configurations** that can be named and compared (requirement #4).
4. **Group-specific free parameters and scaling conventions** ensuring identified comparisons (requirements #5, #6).
5. **Group-wise summed likelihood** (requirement #8).

### Likely UI Workflows

1. Build the template (1-factor CFA).
2. Choose the grouping variable; the data splits into groups.
3. Start configural (all free per group, scaling set).
4. Step through metric/scalar/strict by equating loadings, then intercepts, then residuals; compare fit at each step.
5. If a step fails, free specific non-invariant indicators (partial invariance) and re-test.

### Visualization Challenges

- Showing one template with per-group parameter sets and visible equality links, without drawing G full diagrams.
- Conveying which parameters are currently equated vs. free (the invariance state).
- Representing partial invariance (most indicators equated, one freed).

## Error Cases & Spec/Algorithm Gotchas

### Case 1: Confused With a Mixture

**Scenario**: Groups are treated as latent/estimated rather than read from the grouping column.

**Problem**: Either the observed grouping is ignored (wrongly estimating membership) or, conversely, a mixture is implemented by splitting on a column.

**Gotcha**: Multigroup = observed grouping, data split; mixture = latent grouping, data shared. They are structurally similar but fit differently.

**Implication**: The spec must bind groups to an observed partition, distinct from mixture's probabilistic membership.

### Case 2: Scaling Inconsistent Across Groups

**Scenario**: Different reference indicators or scaling choices per group.

**Problem**: Loadings/means are on different scales; cross-group equality and mean comparison are meaningless.

**Gotcha**: Invariance testing presupposes a common scale; the identification convention must be coordinated across groups.

**Implication**: The spec must apply consistent scaling and handle the scalar-step identification (e.g., reference-group factor mean fixed) explicitly.

### Case 3: Equality Constraint as Many Constraints vs. Shared Label

**Scenario**: "Loadings equal across groups" is implemented as explicit constraint equations binding separate parameters.

**Problem**: Slower and more fragile than giving the equated parameters one shared label.

**Gotcha**: Cross-group equality is a shared parameter, not a constraint to be added.

**Implication**: The spec should express equated parameters as one shared parameter across groups (see `OPENMX-PRIMER.md`).

### Case 4: Partial Invariance Not Expressible

**Scenario**: The spec can only equate *all* loadings or *none*.

**Problem**: A single non-invariant indicator forces rejecting invariance entirely, when partial invariance is the correct, standard remedy.

**Gotcha**: Invariance is per-parameter, not all-or-nothing.

**Implication**: The spec must allow equating a subset of indicators' parameters.

### Case 5: Small or Empty Groups

**Scenario**: A grouping level has very few cases (or none after filtering).

**Problem**: That group's parameters are weakly identified or unidentified; the multigroup fit fails or is unstable.

**Gotcha**: Identification is per group; a fully-specified template can still be under-identified in a small group.

**Implication**: The spec/UI should report per-group sample sizes and warn on thin/empty groups; automated subsetting must preserve adequate group sizes.

### Case 6: Comparing Non-Nested Steps

**Scenario**: Fit indices are compared across configurations that aren't actually nested.

**Problem**: Likelihood-ratio comparisons are invalid; conclusions about invariance are wrong.

**Gotcha**: The invariance ladder is meaningful only as a nested sequence.

**Implication**: The spec should track the nesting relationship between configurations so comparisons are valid.

## Watch-Out Points

When evaluating a candidate spec/UI for this model:

1. Is the grouping *observed* (data partitioned by a column), clearly distinct from a mixture's latent grouping?
2. Can parameters be equated across groups per-parameter, including partial invariance?
3. Are nested constraint configurations (configural→metric→scalar→strict) definable and comparable?
4. Is cross-group equality expressed as a shared parameter rather than added constraint equations?
5. Is scaling coordinated across groups so comparisons are identified (incl. the scalar-step convention)?
6. Are group-specific free parameters (means, variances) representable?
7. Does the tool report per-group sample sizes and warn on thin/empty groups?
8. Does it preserve the nesting relationship needed for valid invariance comparisons?
9. Does it extend by extension to >2 groups, multigroup of non-CFA models, and longitudinal invariance?
10. Does the realized model match how multigroup/invariance models are written in OpenMx/lavaan?
