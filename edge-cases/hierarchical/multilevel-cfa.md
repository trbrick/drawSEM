# Complex Model: Multilevel Confirmatory Factor Analysis

## Overview

A multilevel CFA decomposes the covariance structure of observed indicators into a within-cluster part (e.g., variation among students) and a between-cluster part (e.g., variation among schools). Each level carries its own factor structure: a within-school factor explains how students deviate from their school's mean, and a between-school factor explains how school means differ from each other. The same observed variables carry information at both levels simultaneously.

This model tests *nested* (hierarchical) grouping — students within schools, where a student identifier only has meaning inside its school — together with the idea that one observed variable participates in two factor structures at once (a "doubly-latent" decomposition).

## Prerequisites

Single-level CFA: a latent factor with several indicators, factor loadings, residual variances, and a marker/scaling convention. Here that structure is instantiated twice (between and within), with shared or separate loadings, over a nested grouping.

## Conceptual Model

```
Between level (J schools):
  F_B ←Ψ_B
   ↓ λ_B
  [school-mean components of] Y₁, Y₂, Y₃   ↑θ_B

Within level (n_j students in school j):
  F_W ←Ψ_W
   ↓ λ_W
  [student-deviation components of] Y₁, Y₂, Y₃   ↑θ_W

Observed:  Yₖ(i,j) = (school-mean part) + (student-deviation part)
                     └ loads on F_B ┘     └ loads on F_W ┘
```

Key structural features:
- The student dimension is nested within school; student IDs are unique only within a school.
- A between factor explains variation across school means; a within factor explains student deviations within schools.
- Each observed variable splits into a between component and a within component — the same indicator informs both factors.
- Loadings may be constrained equal across levels (cross-level invariance) or estimated separately.

## Specification Requirements

A specification must be able to represent:

1. **A nested grouping relationship** between two dimensions (student nested within school), where the inner identifier is meaningful only within an outer group.

2. **A grouping/independence unit** at the higher level (the school is the unit of independent observation).

3. **Two factor structures over the same indicators** — one at the between level, one at the within level — with their own variances and residuals.

4. **A variance decomposition of each observed variable** into between-cluster and within-cluster components, with each component loading on the corresponding factor.

5. **Cross-level loading constraints** as an option: the ability to set within-level loadings equal to between-level loadings (or leave them free).

6. **Unbalanced cluster sizes**: the number of students per school varies.

7. **Marker/scaling conventions per level** (e.g., a fixed reference loading or a fixed factor variance) chosen independently at each level.

## Data Formats

### Raw, student-level (tall) format

One row per student, carrying a school identifier.

```
school  student  y1     y2     y3
s01     1        4.2    3.9    5.1
s01     2        3.8    4.1    4.7
s02     1        5.0    4.8    5.5
s02     2        4.6    5.0    5.2
```

- **UI perspective**: A single dataset; the between/within split is a *model* operation, not a data operation. The school column drives clustering.
- **Data specification challenges**: The between structure refers to school-level quantities (means) that are not separate columns — they are implied by the clustering. The spec must express "decompose these columns by this cluster," not require a pre-aggregated school file.

### Pre-aggregated (two-file) alternative

A student-level file plus a school-level means file.

- **UI perspective**: Between and within models each bind to their own dataset.
- **Data specification challenges**: Keeping the two files consistent (same schools, same variables); risks double-specifying what clustering already implies. Generally the single-file decomposition is preferred.

### Trade-off discussion

- Single-file decomposition matches how multilevel SEM engines actually fit the model (via sufficient statistics / FIML by cluster) and avoids a brittle aggregation step.
- Two-file aggregation can be conceptually clearer for the between model but invites inconsistency and loses information about cluster sizes.

## Canonical Layouts

### Between level (collapsed over schools)

```
┌─ between (school: J) ───────────────┐
│   F_B ←Ψ_B                          │
│    ↓λ_B1 ↓λ_B2 ↓λ_B3                │
│   Y₁ᴮ   Y₂ᴮ   Y₃ᴮ   ↑θ_B           │
│   (no inter-school paths)           │
└─────────────────────────────────────┘
```

### Within level (template, one student in a school)

```
┌─ within (student nested in school) ─┐
│   F_W ←Ψ_W                          │
│    ↓λ_W1 ↓λ_W2 ↓λ_W3                │
│   Y₁ᵂ   Y₂ᵂ   Y₃ᵂ   ↑θ_W           │
│   (students independent within school)│
└─────────────────────────────────────┘
```

### Combined hierarchical view

```
School j
┌─────────────────────────────────────────────────────┐
│  F_Bⱼ ←Ψ_B  →  [Y₁,Y₂,Y₃ school-mean parts]         │
│  ┌─────────────────────────────────────────────────┐│
│  │ Student i in school j                            ││
│  │  F_Wᵢⱼ ←Ψ_W → [Y₁,Y₂,Y₃ deviation parts]        ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

The same Y₁…Y₃ appear at both levels; the nesting is shown by the within block sitting inside the school block.

## Expansion Map

```
Assume: J schools, n_j students in school j, N = Σ n_j, 3 indicators.

Nodes:
  - Between factor F_B:          J
  - Between indicator parts:     3J
  - Within factor F_W:           N
  - Within indicator parts:      3N

Free parameters (typical marker scaling, loadings free within each level):
  - Between loadings (λ_B2, λ_B3; λ_B1 = 1 marker): 2
  - Within loadings (λ_W2, λ_W3; λ_W1 = 1 marker):  2
  - Factor variances Ψ_B, Ψ_W:                       2
  - Residual variances θ_B (×3), θ_W (×3):           6
  - Total:                                           12
  (8 if loadings constrained equal across levels.)

Derived (not parameters): ICC per indicator = Ψ_B / (Ψ_B + Ψ_W) at the
factor level, or analogous per-indicator ratios.
```

## Extensions & Expansion Points

- **Random slopes / cross-level structural paths.** Beyond decomposition, allow a between-level predictor to affect within-level relationships (a structural multilevel SEM), not just shared indicators.
- **More than two levels.** Students in classrooms in schools — repeated nesting, accumulating coordinates at each level.
- **Different factor structure per level.** A two-factor within model but a one-factor between model (the levels need not mirror each other).
- **Measurement invariance testing across levels.** Systematically constraining/relaxing loadings, intercepts, residuals between levels.
- **Categorical indicators.** Threshold models at each level, changing the estimator and the meaning of residual variance.
- **Cross-classified rather than nested** higher units (students crossed by school and neighborhood) — see `cross-classified/`.

The nested two-level, shared-indicator form should be one point in a space that also covers more levels, cross-level structure, and non-mirrored level structures.

## Specification & UI Requirements

### Must-Support Elements

1. **Nested-dimension declaration** with inner IDs scoped to outer groups (requirement #1).
2. **A between/within decomposition** expressed as a model operation over clustered data, not a required pre-aggregation (requirement #4).
3. **Two co-existing factor structures over one indicator set** (requirement #3), visually separable.
4. **Per-level scaling conventions and optional cross-level loading equality** (requirements #5, #7).
5. **Tolerance of unbalanced clusters** (requirement #6).

### Likely UI Workflows

1. Load clustered student data; identify the school (cluster) column.
2. Build the within factor over the indicators (deviation components).
3. Build the between factor over the same indicators (school-mean components).
4. Choose scaling at each level; optionally tie loadings across levels.
5. Inspect the implied decomposition (and, post-fit, ICCs).

### Visualization Challenges

- Showing one observed variable participating in two factors without drawing it twice in a confusing way.
- Conveying nesting (within block inside school block) versus crossing.
- Communicating that the between structure operates on cluster-level information that has no separate columns.

## Error Cases & Spec/Algorithm Gotchas

### Case 1: Nested IDs Treated as Global

**Scenario**: Student IDs 1,2,3 recur across schools and are treated as the same students globally.

**Problem**: Students from different schools are merged; the within structure and cluster sizes are wrong.

**Gotcha**: Inner identifiers are unique only within their outer group.

**Implication**: The spec must scope inner IDs to the outer group; resolved names must carry both coordinates.

### Case 2: Between Model Demands a Separate File

**Scenario**: A spec can only attach the between factor to a pre-aggregated school-means dataset.

**Problem**: Forces a brittle external aggregation, loses cluster-size information, and risks inconsistency with the within data.

**Gotcha**: The decomposition is intrinsic to the clustered data; engines compute it without a separate file.

**Implication**: The spec should express decomposition over clustered raw data directly.

### Case 3: Between-Level Variance Near Zero / Unidentified

**Scenario**: An indicator has almost no between-cluster variance (ICC ≈ 0), or there are very few clusters.

**Problem**: The between factor variance, loadings, or residuals are weakly identified or hit boundaries; the optimizer may fail or return a near-singular between covariance.

**Gotcha**: Identification of the between level depends on having *enough clusters* and real between-variance — a small number of schools can leave the between model effectively unidentified even though it looks fully specified.

**Implication**: The spec/UI should surface the number of clusters and warn when the between level is under-identified; automated identification checks must account for cluster count, not just parameter counting.

### Case 4: Cross-Level Loading Equality Assumed Silently

**Scenario**: A tool ties within and between loadings by default (or never allows it).

**Problem**: Either imposes an untested invariance or prevents a standard, often-desired constraint.

**Gotcha**: Cross-level invariance is a modeling choice with substantive meaning.

**Implication**: The spec must make cross-level constraints explicit and optional.

### Case 5: Unbalanced Clusters Mishandled

**Scenario**: Cluster sizes n_j vary widely (some schools have 2 students, others 200).

**Problem**: Methods that assume balanced clusters mis-weight the between/within split.

**Gotcha**: Real multilevel data is almost always unbalanced.

**Implication**: The spec must carry cluster membership so the estimator handles variable n_j (FIML by cluster), not assume balance.

## Watch-Out Points

When evaluating a candidate spec/UI for this model:

1. Are nested identifiers scoped to their outer group, with both coordinates in resolved names?
2. Can the between/within decomposition be expressed over clustered raw data without forced pre-aggregation?
3. Can one observed variable load on both a between and a within factor cleanly?
4. Are cross-level loading constraints explicit and optional?
5. Does identification checking account for the number of clusters and real between-variance, not just parameter counts?
6. Does the tool tolerate unbalanced cluster sizes?
7. Can per-level scaling/marker conventions be set independently?
8. Does the layout distinguish nesting from crossing?
9. Does it extend by extension to >2 levels, cross-level structural paths, and non-mirrored level structures?
10. Does the realized model match how multilevel CFA is written in OpenMx/Mplus/lavaan?
