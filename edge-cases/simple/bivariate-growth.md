# Complex Model: Bivariate Latent Growth Curve

## Overview

A bivariate latent growth curve model represents the joint trajectories of two constructs (e.g., Reading and Math) measured repeatedly over the same timepoints. Each construct has its own Intercept and Slope factor, and the model estimates the full covariance structure among all four growth factors — including the cross-construct covariances that quantify how the two trajectories are related.

This is the simplest model that requires two *parallel* repeated-measures structures sharing one time dimension while keeping their measurement separate, and then bridging them with covariances that cross the construct boundary. It is a clean test of "two things that grow in parallel and covary," distinct from a single multivariate factor.

## Prerequisites

Understanding of the simple (univariate) growth curve (see `simple/growth-curve.md`): an Intercept factor with unit loadings, a Slope factor with time-coded loadings, and the I↔S covariance. This model places two such structures side by side and adds the four cross-construct factor covariances.

## Conceptual Model

```
Construct A (Reading)                     Construct B (Math)

  I_A       S_A                            I_B       S_B
   \        / \                             \        / \
   (1)   (0,1,2,...)                        (1)   (0,1,2,...)
    \      /                                 \      /
   Y_A(t)  ............ covary ............ Y_B(t)
   ↑θ_A                                      ↑θ_B

Within-construct: Var(I_A), Var(S_A), Cov(I_A,S_A)
                  Var(I_B), Var(S_B), Cov(I_B,S_B)
Cross-construct:  Cov(I_A,I_B), Cov(I_A,S_B), Cov(S_A,I_B), Cov(S_A,S_B)
```

Key structural features:
- Two parallel growth structures (A and B), each with one Intercept and one Slope.
- The growth factors exist *once per person* — they do not replicate across time. Only the manifest indicators Y_A(t), Y_B(t) repeat over timepoints.
- The two structures share a single time dimension (the same timepoints drive both Slopes' loadings).
- Four cross-construct covariances connect the single growth factors of A to those of B (not the repeated indicators).
- Measurement error variances on each Y_A(t), Y_B(t).

## Specification Requirements

A specification must be able to represent:

1. **Two parallel repeated-measures structures** that are semantically distinct (Construct A's indicators are not Construct B's) yet share one time dimension.

2. **Per-person (non-replicated) latent factors.** I_A, S_A, I_B, S_B each exist once per person; only the indicators replicate across time. The spec must distinguish "replicates with time" (indicators) from "exists once" (growth factors).

3. **Time-coded Slope loadings** within each construct (loading = time value), driven by the shared timepoints.

4. **Within-construct covariances** (I↔S for each construct).

5. **Cross-construct covariances** between the single growth factors of A and B — four of them — that connect one factor to another factor, not factor-to-indicator and not replicated.

6. **Per-indicator measurement error**, optionally constrained equal across time or left heteroscedastic.

7. **Optional factor means** for I_A, S_A, I_B, S_B if the model is fit to means as well as covariances.

## Data Formats

### Wide format

One row per person, with both constructs' measurements across timepoints.

```
id    rA_t0  rA_t1  rA_t2   mB_t0  mB_t1  mB_t2
p001   12.1   13.0   14.2     8.0    9.1   10.0
p002   10.4   10.9   11.5     7.2    7.9    8.8
```

- **UI perspective**: Two blocks of columns (Reading, Math); time is implied by column order, identical across constructs.
- **Data specification challenges**: The two constructs must use the *same* timepoint set for the shared time dimension; column ordering must encode matching time values for both, or loadings diverge.

### Tall format

One row per (person, time), with one column per construct.

```
id    time  reading  math
p001  0     12.1     8.0
p001  1     13.0     9.1
p001  2     14.2    10.0
```

- **UI perspective**: One time column drives both Slopes; constructs are columns.
- **Data specification challenges**: Both constructs must be observed at the same times for the parallel structure to hold; missing one construct at a timepoint is a per-construct missingness question.

### Trade-off discussion

- Wide format makes the two parallel blocks visually obvious and matches how growth software often expects data, but bakes the timepoints into column structure.
- Tall format makes the shared time dimension explicit and handles irregular spacing, at the cost of needing both constructs present per row.

## Canonical Layouts

### Template view (both constructs, collapsed over time)

```
┌── Construct A ──────────┐      ┌── Construct B ──────────┐
│  I_A ──1──→ Y_A(t)      │      │  I_B ──1──→ Y_B(t)      │
│  S_A ──t──→ Y_A(t)      │      │  S_B ──t──→ Y_B(t)      │
│       ↕ Cov(I_A,S_A)    │      │       ↕ Cov(I_B,S_B)    │
│  [Y_A(t) repeats →]     │      │  [Y_B(t) repeats →]     │
└─────────────────────────┘      └─────────────────────────┘
        ↕ Cov(I_A,I_B), Cov(I_A,S_B), Cov(S_A,I_B), Cov(S_A,S_B) ↕
```

Only the Y indicators carry a "repeats across time" marker; the growth factors do not.

### Expanded view (2 timepoints)

```
Construct A                          Construct B
  I_A ──1──→ Y_A(0)                    I_B ──1──→ Y_B(0)
  S_A ──0──→ ↑θ_A                      S_B ──0──→ ↑θ_B
  I_A ──1──→ Y_A(1)                    I_B ──1──→ Y_B(1)
  S_A ──1──→ ↑θ_A                      S_B ──1──→ ↑θ_B
```

Each growth factor appears once and fans out to all visible timepoints; the factors do not multiply with time.

## Expansion Map

```
Assume: T timepoints, both constructs measured at all T.

Nodes:
  - Growth factors (I_A, S_A, I_B, S_B): 4 (not replicated)
  - Indicators Y_A(t), Y_B(t):           2T
  - Total:                                2T + 4

Paths:
  - I→Y loadings (fixed = 1):  2T   (T per construct)
  - S→Y loadings (= time):     2T   (T per construct)
  - Measurement error vars:    2T   (or 2 if constrained equal across time)
  - Growth factor variances:   4
  - Within-construct I↔S cov:  2
  - Cross-construct covs:      4

Free parameters (typical, error constrained across time):
  - 4 factor variances + 2 within-construct covs + 4 cross-construct covs
    + 2 error variances (+ 4 factor means if estimated) = 12 (or 16 with means)

Concrete example (T = 4):
  - Nodes: 2(4) + 4 = 12
  - Loading paths: 2(4) + 2(4) = 16 (all fixed)
  - Free parameters: ~12
```

## Extensions & Expansion Points

- **More than two constructs.** k parallel growth processes generalize the four cross-construct covariances to C(2k, 2) − k cross-factor covariances; the layout becomes a panel of parallel blocks with a dense covariance band.
- **Nonlinear / freed-loading growth.** Replace fixed time codes with a latent basis (some Slope loadings freed) per construct; this introduces metric-invariance-style questions across time within each construct.
- **Cross-lagged coupling.** Add directed paths between constructs over time (e.g., Reading slope predicting later Math), moving toward a latent change-score or cross-lagged panel model.
- **A second level.** Let the growth factors themselves vary across a higher grouping (children within classrooms), turning this into a multilevel parallel-process model.
- **Mediated growth.** A third construct whose intercept/slope mediates the A–B relationship.

The two-construct, fixed-loading form should be a special case of a general "parallel processes sharing a dimension, joined by cross-process covariances" mechanism.

## Specification & UI Requirements

### Must-Support Elements

1. **Parallel structures sharing one dimension** without merging their measurement (requirement #1).
2. **Replication scope per node**: indicators replicate over time; growth factors do not (requirement #2). The UI must make this visible so users don't accidentally replicate factors.
3. **Cross-construct factor covariances** drawn between single factors across blocks (requirement #5), visually distinct from within-construct covariances.
4. **Shared time codes** feeding both Slopes (requirement #3).
5. **Error-variance constraint choice** (equal vs. free across time).

### Likely UI Workflows

1. Build one growth structure (Construct A): I, S, time-coded loadings, I↔S covariance.
2. Duplicate it as Construct B with its own indicators.
3. Bind both constructs to the same time dimension.
4. Draw the four cross-construct factor covariances.
5. Choose error-variance and factor-mean options.

### Visualization Challenges

- Keeping the two parallel blocks aligned by timepoint so the shared dimension reads clearly.
- Distinguishing the four cross-construct covariances (factor-to-factor, single) from the many within-construct loadings (factor-to-replicated-indicator).
- Conveying that one growth factor fans out to many indicators without drawing a visually overwhelming bundle.

## Error Cases & Spec/Algorithm Gotchas

### Case 1: Growth Factors Accidentally Replicated

**Scenario**: A spec/algorithm replicates *everything* in the time cascade, including I and S.

**Problem**: Each timepoint gets its own intercept and slope, which is not a growth model at all.

**Gotcha**: The replication scope differs by node type within the same structure — indicators replicate, factors don't.

**Implication**: The spec must let replication be scoped to specific nodes, not applied uniformly to a structure.

### Case 2: Cross-Construct Covariance Attached to Indicators

**Scenario**: The cross-construct relationship is drawn between Y_A(t) and Y_B(t) instead of between the growth factors.

**Problem**: This models time-specific residual correlation, not trajectory covariance — a different, often unintended, model.

**Gotcha**: "Reading and Math are related" is ambiguous between factor-level and indicator-level covariance.

**Implication**: The spec must make the level of a cross-construct covariance explicit, and the UI should default to the factor level for trajectory questions.

### Case 3: Mismatched Timepoints Across Constructs

**Scenario**: Construct A is measured at times 0,1,2,3; Construct B at 0,2,4.

**Problem**: The shared time dimension assumption breaks; Slope loadings differ between constructs and the "parallel" framing is false.

**Gotcha**: Wide-format data hides this — the columns just look like two blocks.

**Implication**: The spec must either enforce a shared timepoint set or support per-construct time codes explicitly.

### Case 4: Loading Time Codes vs. Row Index

**Scenario**: Slope loadings are taken as 0,1,2,… by position when true spacing is 0,1,3.

**Problem**: Misspecified growth rate.

**Gotcha**: Same hazard as univariate growth, doubled because two constructs must agree.

**Implication**: Time values must come from data/explicit codes, applied consistently to both constructs.

## Watch-Out Points

When evaluating a candidate spec/UI for this model:

1. Can replication be scoped per node so indicators replicate but growth factors stay single?
2. Are cross-construct covariances expressed at the factor level, distinctly from indicator-level residual correlations?
3. Do both constructs genuinely share one time dimension, and does the spec catch mismatched timepoints?
4. Are Slope loadings driven by data/explicit time codes consistently across constructs?
5. Can measurement error be constrained equal across time, per construct?
6. Does the layout keep the two parallel blocks aligned and readable as T grows?
7. Does the model generalize by extension to >2 constructs and to cross-lagged coupling?
8. Can it round-trip without conflating the four cross-construct covariances with within-construct ones?
9. Does the free-parameter count reflect that loadings are fixed (few estimated quantities relative to drawn paths)?
10. Does the representation translate cleanly to how growth models are written in OpenMx/lavaan?
