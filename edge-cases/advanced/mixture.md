# Complex Model: Finite Mixture (Latent Class) Model

## Overview

A finite mixture model posits that the observed sample is a blend of two or more unobserved subpopulations ("latent classes"), each described by the *same* structural model but with *different parameter values*. Every case belongs to some class with an estimated probability; no case is assigned to a class in the data. A common instance is the growth mixture model: one set of people follows a low, slow trajectory and another a high, fast one, but which person belongs to which class is inferred, not observed.

This model tests **parallel parameterizations of one template** (several classes sharing structure but not values), **mixing proportions** as estimated quantities, and the fact that **the same data feeds every class** with a probabilistic, not deterministic, assignment. It is the natural place where the "estimated rather than observed grouping" idea lives — contrast with multigroup models (`multigroup/measurement-invariance.md`), where the grouping *is* observed.

## Prerequisites

A base model to mix — most often a latent growth curve (`simple/growth-curve.md`) or a CFA. Understanding multigroup models (`multigroup/measurement-invariance.md`) is useful for the sharpest contrast: mixture = unobserved grouping; multigroup = observed grouping.

## Conceptual Model

```
One template (e.g., a linear growth curve):
   I → y₁,y₂,y₃ (loadings 1)
   S → y₁,y₂,y₃ (loadings 0,1,2)
   means α_I, α_S; variances; residuals

Replicated across K latent classes, each with its own values:

   Class 1 (π₁):  α_I=-1, α_S=0.2, V_I=0.5, V_S=0.1, …
   Class 2 (π₂):  α_I= 1, α_S=0.8, V_I=0.3, V_S=0.2, …
   …
   mixing proportions π₁,…,π_K  with  Σ π_k = 1

Every observation contributes to every class, weighted by posterior class
probability; the likelihood is a weighted sum over classes.
```

Key structural features:
- One structural template, instantiated once per class.
- Class-specific parameter *values*; which parameters differ across classes (means only? means + variances? loadings?) is a modeling choice.
- Mixing proportions (class probabilities) are free, sum to one, and are bounded in (0,1).
- The same dataset feeds all classes; assignment is probabilistic.
- The fitted likelihood is a mixture (weighted sum), not a single-class likelihood.

## Specification Requirements

A specification must be able to represent:

1. **A reusable base template** (the structural model) instantiated multiple times.

2. **Per-class parameter overrides.** Each class shares the template's structure but can set its own values for designated parameters, while other parameters may be held equal across classes.

3. **Selective equality across classes.** The ability to free a parameter per class *or* constrain it equal across all classes (e.g., class-invariant loadings but class-varying means).

4. **Mixing proportions** as free parameters that sum to one and are bounded in (0,1).

5. **Shared data across classes with probabilistic membership.** The same observations map into every class; there is no class column in the data.

6. **A mixture likelihood**: the model is fit as a weighted combination over classes, not as separate per-group fits.

7. **A way to set/identify the number of classes** K (and to compare different K).

8. **Starting-value control per class**, because the likelihood is multimodal.

## Data Formats

### Single dataset, no class column (required)

One row per case; the class is never in the data.

```
id    y1    y2    y3
1     1.0   1.2   1.3
2    -0.8  -0.6  -0.4
3     2.1   2.9   3.7
```

- **UI perspective**: One dataset is bound to *all* classes; the user does not split or filter it. Each class reads the same columns.
- **Data specification challenges**: Unlike multigroup, there is no grouping variable. The mapping is "this dataset → class k's indicators" for every k, which can look like duplication and must be understood as probabilistic sharing.

There is no wide/tall distinction specific to mixing; the base template's own data format applies. The defining feature is the *absence* of an observed grouping column.

## Canonical Layouts

### Template plus class plate

```
        ┌─ base template ─────────────────┐
        │   I ──→ y₁ y₂ y₃                │
        │   S ──→ y₁ y₂ y₃                │
        │   means/vars/residuals          │
        └─────────────────────────────────┘
              instantiated per class
   ┌ Class 1 (π₁) ┐  ┌ Class 2 (π₂) ┐  …  ┌ Class K (π_K) ┐
   │ own α,V,…    │  │ own α,V,…    │      │ own α,V,…     │
   └──────────────┘  └──────────────┘      └───────────────┘
   π₁ + π₂ + … + π_K = 1     (mixing proportions)
   one dataset feeds all classes (probabilistic membership)
```

### Class-contrast view

```
Class 1 trajectory          Class 2 trajectory
   level low, slope ~0          level high, slope steep
   (α_I=-1, α_S=0.2)            (α_I=1, α_S=0.8)
Same loadings (0,1,2); different growth-factor means/variances.
```

## Expansion Map

```
Assume: base template with p free parameters; K classes.

Per class: up to p class-specific parameters (fewer if some are held
           equal across classes).
Mixing proportions: K − 1 free (they sum to 1).

Free parameters ≈ K·p_varying + (p − p_varying) + (K − 1)
   where p_varying = parameters allowed to differ across classes.

Concrete example: linear growth template, K=2, class-varying = {α_I, α_S,
V_I, V_S} (4), class-invariant = {residuals, I↔S cov} (say 2):
   per-class varying: 2 × 4 = 8
   shared:            2
   mixing (π):        1
   Total free:        11
```

The number of *nodes* drawn need not multiply by K if the UI shows one template with per-class parameter sets; the parameter count does scale with K.

## Extensions & Expansion Points

- **Mixtures of any base model.** CFA mixtures (latent profile/class analysis), regression mixtures, SEM mixtures — the template can be anything.
- **Covariates of class membership.** Let person-level predictors influence the mixing proportions (a multinomial logit on class), making π case-specific.
- **Known/partial membership.** Some cases have observed class labels (semi-supervised), blending mixture with multigroup.
- **Class-specific structure, not just values.** Different numbers of factors or different paths per class (a more radical mixture).
- **Non-parametric / growing K.** Methods that estimate K rather than fixing it.
- **Estimated grouping elsewhere.** The same "latent grouping" machinery underlies estimated zygosity in the twin model (`cross-classified/twin-ace.md`).

The fixed-K, shared-template, value-only mixture should be a special case of a general "one template, several latent-class parameterizations, with mixing weights" mechanism.

## Specification & UI Requirements

### Must-Support Elements

1. **One template instantiated per class** with per-class value overrides (requirements #1, #2).
2. **Selective cross-class equality** of parameters (requirement #3).
3. **Mixing proportions** that sum to one and are bounded (requirement #4).
4. **One dataset shared across all classes**, no grouping column (requirement #5).
5. **A mixture (weighted-sum) likelihood** and per-class starting values (requirements #6, #8).

### Likely UI Workflows

1. Build the base template once.
2. Declare K classes referencing the template.
3. For each class, choose which parameters are class-specific and set/seed their values; mark the rest class-invariant.
4. Add mixing proportions (sum-to-one).
5. Bind the single dataset to all classes; set per-class starting values; fit and inspect class sizes/separation.

### Visualization Challenges

- Showing one template with K parameter sets without drawing K full diagrams.
- Conveying that one dataset feeds all classes probabilistically (not K filtered subsets).
- Representing mixing proportions and class separation meaningfully.

## Error Cases & Spec/Algorithm Gotchas

### Case 1: Treated as Multigroup (Data Split by a Column)

**Scenario**: A tool implements "classes" by filtering the data into K subsets via a column.

**Problem**: That is a multigroup model with observed groups — not a mixture. Class membership must be *estimated*.

**Gotcha**: The two look structurally similar (one template, group-specific values) but differ fundamentally in whether grouping is observed.

**Implication**: The spec must support a shared dataset with probabilistic membership and a mixture likelihood, distinct from filtered multigroup.

### Case 2: Local Optima and Starting Values

**Scenario**: The model is fit from a single, default start.

**Problem**: Mixture likelihoods are multimodal; a single start often lands on a local optimum or a degenerate solution.

**Gotcha**: Results depend heavily on starting values; "it converged" is not "it found the global optimum."

**Implication**: The spec/UI must support multiple/per-class starting values and random restarts, and report the need for them.  Common example: the membership probability of one class goes to nearly 0 or nearly 1.

### Case 3: Label Switching

**Scenario**: Across restarts (or in Bayesian sampling), the class labels permute — "Class 1" and "Class 2" swap.

**Problem**: Naive comparison/aggregation across runs mixes up classes.

**Gotcha**: Class identities are only defined up to relabeling; nothing in the likelihood fixes which class is "1."

**Implication**: The spec should not assume stable class indices; tooling needs an ordering/relabeling convention for reporting.

### Case 4: Boundary and Degenerate Solutions

**Scenario**: A class shrinks toward zero proportion, or a class variance collapses toward zero (a single point absorbing a few cases).

**Problem**: Infinite-likelihood spikes / empty classes; estimates become meaningless.

**Gotcha**: Mixtures are prone to boundary pathologies, especially with free class variances.

**Implication**: The spec should support bounds/constraints on proportions and variances and flag near-empty or collapsing classes.

### Case 5: Over-Extraction of Classes

**Scenario**: K is set too high.

**Problem**: Extra classes capture noise; the solution is unstable and non-replicable.

**Gotcha**: More classes always fit better in-sample; fit alone doesn't justify K.

**Implication**: The spec should make K explicit and support comparison across K (information criteria, replication), not silently prefer larger K.

## Watch-Out Points

When evaluating a candidate spec/UI for this model:

1. Is class membership *estimated* (shared data, probabilistic) rather than read from a column?
2. Can one template be instantiated per class with selective per-class vs. class-invariant parameters?
3. Are mixing proportions representable as bounded, sum-to-one free parameters?
4. Is the model fit with a mixture (weighted-sum) likelihood, not K separate fits?
5. Are multiple/per-class starting values and restarts supported (multimodality)?
6. Is the tool robust to label switching when comparing runs?
7. Does it guard against boundary/degenerate solutions (empty classes, collapsing variances)?
8. Is K explicit and comparable across values, rather than implicitly rewarded for being larger?
9. Does it extend by extension to covariate-influenced membership, partial labels, and class-specific structure?
10. Does the realized model match how mixtures are written in OpenMx (weighted likelihood over class models)?
