# Complex Model: Classical Twin ACE Model

## Overview

The classical twin ACE model decomposes the variance of a phenotype into three components: Additive genetic (A), Common/shared environment (C), and unique Environment (E). The unit of analysis is the twin *pair*, not the individual. Identification comes from a structural fact supplied by the data rather than estimated: monozygotic (MZ) twins share their additive genetic component with correlation 1.0, while dizygotic (DZ) twins share it with correlation 0.5. Comparing within-pair similarity across the two zygosity groups separates A from C.

This model is the simplest example of a **self-crossed** structure: the two members of a pair are instances of the *same* role (both are "a twin"), connected to each other rather than nested one inside the other. It has no time dimension — the only repetition is the two twins within a family — which makes it a clean test of crossed structure in isolation from longitudinal structure.

## Prerequisites

None as a behavior-genetics model. However, the cross-classified growth curve (see `cross-classified/growth-curve.md`) is useful for understanding crossed (non-nested) structure generally. The key difference: there, two *different* roles (students, teachers) cross at a third level; here, a *single* role crosses with itself, and the two members are symmetric.

## Conceptual Model

```
For each twin pair (family f):

  Twin 1                              Twin 2
  ───────                             ───────
   A₁ ←── a² (additive genetic var)    A₂ ←── same a²
   C₁ ←── c² (shared env var)          C₂ ←── same c²
   E₁ ←── e² (unique env var)          E₂ ←── same e²
    ↓                                   ↓
   Y₁  (phenotype)                     Y₂  (phenotype)
   (A₁,C₁,E₁ → Y₁, loadings 1)        (A₂,C₂,E₂ → Y₂, loadings 1)

Cross-twin covariances (within family):
   A₁ ↔ A₂ : rA = 1.0 (MZ) or 0.5 (DZ)   — value supplied by data
   C₁ ↔ C₂ : rC = 1.0 (shared by definition)
   E₁ ↔ E₂ : none (unique by definition)
```

Key structural features:
- The two twins are symmetric: the same three variance parameters (a², c², e²) apply to both. Twin 1 and Twin 2 are interchangeable labels.
- The cross-twin A covariance takes a *different value per family depending on zygosity* (1.0 vs 0.5) — a fixed quantity that comes from the data, not a free parameter.
- The cross-twin C covariance is fixed at 1.0 by definition; there is no cross-twin E covariance.
- Only the three variance components are free. Standardized parameterizations may additionally impose a² + c² + e² = 1.

## Specification Requirements

A specification must be able to represent:

1. **A repeated role with exactly two symmetric instances per group.** Each family contains two twins drawn from the same template (A, C, E latents and a Y phenotype). Both instances share parameter values.

2. **Within-instance structure.** For each twin: three latent variance sources (A, C, E), one observed phenotype (Y), and unit-weighted paths from each variance source to Y.

3. **Shared (equated) parameters across instances.** The genetic, shared-environment, and unique-environment variances must be the *same* parameter for both twins, not two free parameters that happen to be equal.

4. **Within-group (cross-instance) covariance paths.** Paths that connect Twin 1's A to Twin 2's A, and Twin 1's C to Twin 2's C, *within the same family* — and crucially, not across families.

5. **A data-supplied path value that varies by group.** The A↔A covariance must be able to take the value 1.0 for some families and 0.5 for others, determined by a zygosity indicator in the data rather than estimated.

6. **A grouping variable that defines independence.** The family (or pair) identifier defines which two twins belong together and serves as the unit of independent observation.

7. **Selective absence of a path.** The model must be able to express that there is *no* E↔E covariance — absence is meaningful, not an omission to be auto-filled.

8. **Optional sum constraint.** A way to optionally constrain a² + c² + e² = 1 (standardized parameterization), or equivalently to fix total variance and free the path coefficients instead.

## Data Formats

### Pair-per-row (wide) format

One row per family, with both twins' phenotypes side by side and a zygosity indicator.

```
family_id  zygosity  pheno_twin1  pheno_twin2
f001       MZ        14.2         13.9
f002       MZ        11.0         11.4
f003       DZ        12.8         10.1
f004       DZ         9.7         11.6
```

- **UI perspective**: The two twins are naturally a left/right pair. Zygosity is a per-family attribute that the user maps to the cross-twin genetic covariance.
- **Data specification challenges**: The two phenotype columns are the *same* variable measured on two members, not two different variables — the spec must treat them as instances of one role, or the equality of parameters across twins is easily lost.

### Long (tall) format

One row per individual twin, with a within-pair index.

```
family_id  twin_index  zygosity  phenotype
f001       1           MZ        14.2
f001       2           MZ        13.9
f003       1           DZ        12.8
f003       2           DZ        10.1
```

- **UI perspective**: Each row is one twin; the pairing is reconstructed from `family_id`. Generalizes more cleanly to sibships larger than two.
- **Data specification challenges**: The within-pair index must exist and be consistent; the cross-twin path must be expressed as "connect the two members sharing a family_id" rather than referencing fixed columns.

### Trade-off discussion

- Wide format mirrors how classical twin software (e.g., OpenMx scripts) usually lays the data out, and makes the two-instance structure visually obvious.
- Long format is more honest about twins being instances of one role and extends to non-twin pedigrees, at the cost of needing an explicit pairing index.
- Either way, the *zygosity-dependent covariance value* is the hard part, and it is data-driven in both formats.

## Canonical Layouts

### Template view (one abstract twin)

```
        A ←── a²
        C ←── c²
        E ←── e²
        ↓ ↓ ↓   (all loadings fixed to 1)
        Y

   stub→ [A, C]    (correlates with co-twin; E does not)
```

The template is a single twin. The "stub" marks which latents reach across to the co-twin; E carries no stub.

### Expanded view (two twins in one family)

```
        Twin 1                         Twin 2
   ┌──────────────┐              ┌──────────────┐
   │ A₁ ←── a²    │              │ A₂ ←── a²    │
   │ C₁ ←── c²    │              │ C₂ ←── c²    │
   │ E₁ ←── e²    │              │ E₂ ←── e²    │
   │  ↓↓↓         │              │  ↓↓↓         │
   │ Y₁           │              │ Y₂           │
   └──────────────┘              └──────────────┘
        A₁ ←──────── rA ────────→ A₂   (1.0 MZ / 0.5 DZ)
        C₁ ←──────── 1.0 ───────→ C₂
        (no E₁ ↔ E₂)
```

The family grouping is shown by placing the two twins side by side. Because there are exactly two twins per family, the pair is always fully drawn — there is no "next twin" navigation as there would be for an open-ended time series. (Error variances on Y not shown for clarity.)

## Expansion Map

```
Assume: F families total, split F_MZ monozygotic + F_DZ dizygotic.
        2 twins per family.

Nodes:
  - Twin instances:        2F
  - A, C, E per twin:      3 × 2F = 6F
  - Y per twin:            2F
  - Total nodes:           8F

Paths:
  - A→Y, C→Y, E→Y:         3 × 2F = 6F   (all fixed to 1)
  - Var(A), Var(C), Var(E): 3 × 2F = 6F  (but only 3 distinct parameters,
                                          a²/c²/e², shared across all twins)
  - Var(Y) (residual = 0): 0  (phenotype variance is fully decomposed)
  - A₁↔A₂ genetic cov:     F   (value 1.0 or 0.5 per family by zygosity)
  - C₁↔C₂ shared-env cov:  F   (all fixed 1.0)
  - E₁↔E₂:                 0   (none by definition)
  - Total paths:           14F

Free parameters: 3 (a², c², e²) — or 2 if e² = 1 − a² − c² under a
standardized parameterization.

Concrete example (F = 4: 2 MZ + 2 DZ):
  - Nodes: 8 × 4 = 32
  - Paths: 14 × 4 = 56
  - Free parameters: 3
```

The striking property is the gap between path count (56) and free-parameter count (3): nearly every path is either fixed, shared, or data-supplied. A spec that conflates "number of paths" with "number of estimated quantities" will badly mis-size this model.

## Extensions & Expansion Points

The classical two-twin ACE model is the minimal case. A specification that handles it well should ideally generalize along several axes, and a UI should leave room for them:

- **Higher multiples (triplets, quadruplets, larger sibships).** With k members per family the within-family cross-instance paths grow as C(k, 2) — all distinct pairs, not just one. The self-cross condition is still "same family," but the path generator must enumerate every within-family pair rather than assuming exactly two. A spec hard-wired to two members cannot express triplets.

- **Broader pedigree / relatedness models.** Parents, full and half siblings, cousins, and other relatives replace the single MZ/DZ contrast with a per-pair *kinship coefficient*. The zygosity lookup generalizes to a relatedness matrix keyed on each pair's relationship; the genetic covariance value comes from that matrix. The shared-environment structure also becomes richer (e.g., siblings share a household but cousins may not).

- **Additional variance components.** Dominance genetic (D), epistasis, or a sibling-specific shared environment distinct from the parental one add more variance sources per individual, each with its own expected cross-relative correlation. The model shape (variance sources → phenotype, cross-relative covariances) is unchanged; only the inventory of components grows.

- **Estimated rather than specified zygosity.** When zygosity is unknown or uncertain (e.g., same-sex pairs not genotyped), it can be treated as *latent*: each pair belongs to an MZ or DZ class with some probability, and the genetic covariance takes 1.0 or 0.5 accordingly. This turns the model into a mixture over zygosity (see the mixture edge case) rather than a model with a data-supplied covariance — the value is no longer read from a column but inferred jointly with the variance components.

- **Multivariate phenotypes.** Several phenotypes per twin with a joint ACE decomposition (e.g., Cholesky parameterization) of their covariance, testing whether the genetic and environmental structures generalize from one outcome to many.

A useful test of a candidate spec is how much of this list it can reach by *extension* versus how much requires a different representation. The two-member, single-zygosity-column form should be a special case of the general mechanism, not a separate hard-coded model.

## Specification & UI Requirements

### Must-Support Elements

1. **Self-crossing of a single role.** The spec must express "two instances of the same twin template, paired within a family" without inventing two distinct roles.

2. **Parameter sharing across instances.** a², c², e² must be one parameter each, reused by both twins (from requirement #3 above). The UI must make it visible that editing the genetic variance changes it for both twins at once.

3. **Within-group cross-instance paths.** The A↔A and C↔C connections must be scoped to "same family," and the UI must convey that these connect co-twins, not arbitrary individuals.

4. **Data-supplied, group-varying path values.** The genetic covariance must draw its value (1.0/0.5) from the zygosity column. The UI must show that this path's value is data-determined and differs by group, not a single number.

5. **Meaningful path absence.** The lack of an E↔E path must be representable and preserved on round-trip — it must not be auto-completed into existence.

6. **Optional standardization constraint.** Support a constraint a² + c² + e² = 1, or the alternative path-coefficient parameterization with total variance fixed.

### Likely UI Workflows

1. Define a single twin template: A, C, E variance sources feeding a phenotype Y with unit loadings.
2. Declare that the template repeats twice within a family grouping (self-crossed).
3. Mark a², c², e² as shared across the two instances.
4. Add cross-twin covariances on A and C; bind the A covariance value to the zygosity column; leave E uncorrelated.
5. Choose raw vs. standardized parameterization.

### Visualization Challenges

- The two twins are symmetric, so naive auto-layout may make them look like two unrelated subgraphs; the family grouping and the cross-twin links need to be visually primary.
- The data-dependent genetic covariance is a single drawn path that represents two different numeric values; communicating "1.0 here, 0.5 there" without drawing two paths is a real challenge.

## Error Cases & Spec/Algorithm Gotchas

### Case 1: Twins Treated as Two Free Parameter Sets

**Scenario**: A spec instantiates Twin 1 and Twin 2 independently and gives each its own a², c², e².

**Problem**: The model becomes unidentified or wrong — the whole point is that both twins share the same variance components.

**Gotcha**: An algorithm that "expands" a repeated role by deep-copying parameters, rather than sharing them, silently breaks identification.

**Implication**: The spec must distinguish "two instances" (structure repeats) from "two parameters" (values repeat). Instance replication must default to shared parameters here.

### Case 2: Cross-Twin Path Leaks Across Families

**Scenario**: The A↔A covariance is specified as "connect A of one twin to A of another twin" without scoping to family.

**Problem**: The expansion connects twins across different families, producing a dense, meaningless covariance structure.

**Gotcha**: Self-crossing needs a *within-group* condition. Without it, every pair of A instances is connected.

**Implication**: Cross-instance paths in a self-crossed role must carry an explicit same-group scope.

### Case 3: Zygosity Value Hard-Coded

**Scenario**: The genetic covariance is entered as a single constant (say 0.75, an average), or as a free parameter to be estimated.

**Problem**: Fixing it to one constant destroys the MZ/DZ contrast that identifies A; freeing it discards the known biology that makes the model work.

**Gotcha**: This value is neither free nor a single constant — it is a per-family fixed value looked up from data. Many specs have no third category for "fixed, but data-determined and group-varying."

**Implication**: The spec needs a way to mark a path value as data-supplied and group-dependent.

### Case 4: E Covariance Auto-Completed

**Scenario**: A spec auto-adds covariances between all same-type latents, or a UI defaults to connecting symmetric instances.

**Problem**: An E₁↔E₂ covariance appears, contradicting the model's definition of unique environment.

**Gotcha**: Here, the *absence* of a path is a modeling statement. Auto-completion erases it.

**Implication**: Absence must be representable and must survive serialization round-trips.

### Case 5: Path Count Mistaken for Model Complexity

**Scenario**: A UI or validator estimates degrees of freedom or "model size" from the number of drawn paths (56 in the concrete example).

**Problem**: It reports a vastly overparameterized model when only 3 quantities are estimated.

**Gotcha**: Fixed, shared, and data-supplied paths all look like paths but cost no degrees of freedom.

**Implication**: Counting logic must classify paths by free/fixed/shared/data-supplied, not by presence.

### Case 6: Identification Requires Both Zygosity Groups

**Scenario**: The data — or a subset of it produced by filtering, a cross-validation fold, or a per-group fit — contains only MZ pairs, or only DZ pairs.

**Problem**: A and C are not separately identified from a single zygosity group. One zygosity level yields essentially one within-pair similarity, but A and C are two unknowns; they trade off and the model becomes unidentified (or only A+C jointly is recoverable). The contrast *between* MZ and DZ similarity is what pulls them apart.

**Gotcha**: The rank deficiency lives in the *combination* of groups, so it is invisible when either group is inspected alone. Automated identification checkers that examine a single group, and data-handling steps that subset the sample (folds, train/test splits, dropping one zygosity, listwise deletion that happens to remove a group), can silently destroy identification while leaving a model that looks fully specified.

**Implication**: Identification checking must reason about the multi-group structure jointly, not group-by-group. The spec/UI should warn when only one zygosity level is present, and any automated data-subsetting must preserve representation of both MZ and DZ pairs.

### Case 7: Unconstrained Variances and Convergence

**Scenario**: The model is emitted with three free, unbounded variances (a², c², e²) and no standardization constraint (raw, unstandardized parameterization).

**Problem**: This form is prone to convergence failure — the likelihood can be poorly conditioned near the boundary (components approaching zero), C and E partially trade off, and optimizers stall or return boundary/negative-variance solutions, especially with modest samples or a small true shared-environment component.

**Gotcha**: The "obvious" three-free-variance translation is exactly the convergence-prone one. A spec that produces it without bounds, a sum constraint, or a reparameterization will often fail to fit even though the model is correctly specified.

**Implication**: Prefer the path-coefficient parameterization (free loadings a, c, e with latent variances fixed to 1, guaranteeing non-negative contributions) or impose non-negativity / a standardizing a²+c²+e²=1 constraint. The spec should surface this choice rather than silently emit the unconstrained form.

## Watch-Out Points

When evaluating a candidate spec/UI for this model:

1. Can it express two instances of one role that *share* parameters, rather than two roles or two independent copies?
2. Is the cross-twin (within-family) covariance scoped so it never leaks across families?
3. Can a path value be fixed *and* data-supplied *and* group-varying at once (the MZ/DZ genetic correlation)?
4. Is the deliberate absence of the E↔E covariance representable and preserved on round-trip?
5. Does the model distinguish the small number of free parameters (3) from the larger number of paths (≈14 per family)?
6. Can it represent both the raw-variance and standardized (sum-to-one) parameterizations — and does it default to a form that actually converges?
7. Does identification checking reason about MZ and DZ jointly, and warn when only one zygosity group is present?
8. Do data-subsetting operations (folds, filters, splits) preserve both zygosity groups, or can they silently break identification?
9. Can zygosity be treated as latent/estimated (a mixture over MZ/DZ), not only as a data-supplied value?
10. Does the UI make parameter sharing across the two twins visible and editable in one place?
11. Does it handle both wide (pair-per-row) and long (twin-per-row) data layouts?
12. Could the same machinery extend by *extension* to triplets, larger sibships, and broader pedigrees with kinship-based covariances, or is it hard-wired to exactly two members and a single zygosity column?
13. Does the spec's representation translate cleanly to how OpenMx/Mx classical twin scripts are written, or require a separate mental model?
