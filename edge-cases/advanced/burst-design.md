# Complex Model: Measurement Burst Design

## Overview

A measurement burst design combines intensive longitudinal data — many closely-spaced measurements within a "burst" (e.g., a week of daily diary or EMA sampling) — with a broader longitudinal design in which those bursts recur over months or years. This produces a *nested two-dimensional* repeating structure: timepoints within bursts within persons. Short-term dynamics are modeled within each burst, and a separate question is whether and how the process carries over between bursts.

This model tests **nested repeating dimensions** (an inner time dimension inside an outer burst dimension), the **accumulation of multiple coordinates** on each resolved instance, and **boundary-to-boundary paths** that connect the last instance of one burst to the first instance of the next.

## Prerequisites

The ML-VAR model (`hierarchical/mlvar-measurement.md`) for within-series autoregressive/cross-regressive structure. Familiarity with ecological momentary assessment (EMA) or daily-diary designs.

## Conceptual Model

```
Person p; bursts b = 1..B (e.g., week-long bursts at months 0, 6, 12);
within each burst, timepoints t = 1..T:

  Burst 1                  Burst 2                  Burst 3
  η(1,1)→η(2,1)→…          η(1,2)→η(2,2)→…          η(1,3)→η(2,3)→…
    ↓       ↓                ↓       ↓                ↓       ↓
  y(1,1)  y(2,1)           y(1,2)  y(2,2)           y(1,3)  y(2,3)

  Within-burst:  η(t,b) → η(t+1,b)          (short-term autoregression)
  Between-burst: η(T,b) → η(1,b+1)          (carryover; optional)
```

Key structural features:
- An inner repeating dimension (time within burst) and an outer repeating dimension (burst), the inner nested in the outer.
- Within-burst autoregressive (and possibly cross-regressive) paths capture short-term dynamics.
- Optional between-burst paths connect the *last* timepoint of one burst to the *first* of the next — boundary-to-boundary across the inner dimension.
- Bursts may instead be treated as independent (no carryover), or the burst level may itself carry slow-changing structure (growth across bursts).
- Each resolved instance carries two coordinates (burst index and within-burst index).

## Specification Requirements

A specification must be able to represent:

1. **Two nested repeating dimensions** — an inner dimension (time within burst) defined inside an outer dimension (burst) — with the inner index meaningful only within an outer instance.

2. **Coordinate accumulation.** Each resolved node carries both coordinates (e.g., the within-burst index *and* the burst index), without collision.

3. **Within-inner-dimension inter-instance paths** (within-burst autoregression).

4. **Boundary-targeted between-outer-instance paths.** A path from the *last* inner instance of burst b to the *first* inner instance of burst b+1, addressing inner-dimension boundaries ("last" / "first") rather than fixed indices.

5. **Optional between-burst structure.** The ability to omit between-burst paths entirely (independent bursts) or include carryover.

6. **A grouping/independence unit** (person) at the outer level.

7. **Distinct visual/axis treatment per dimension** so within-burst continuation reads differently from between-burst continuation.

8. **Ragged extents.** Variable numbers of bursts per person and timepoints per burst.

## Data Formats

### Tall format with two index columns (required)

One row per (person, burst, within-burst time).

```
person  burst  t   y
p001    1      1   0.4
p001    1      2   0.6
p001    1      3   0.5
p001    2      1   0.3     ← new burst (months later)
p001    2      2   0.5
p002    1      1  -0.1
```

- **UI perspective**: Two index columns drive the nested expansion; the person column groups independence.
- **Data specification challenges**: Bursts and within-burst times must be distinguishable columns (or derivable from timestamps). The model must know which index is inner and which is outer.

A single time column is insufficient — the design is intrinsically two-dimensional; collapsing it loses the within/between distinction.

## Canonical Layouts

### Template view (fully collapsed)

```
┌─ burst (B bursts) ──────────────────────────────────────────────┐
│   ┌─ time within burst (T timepoints) ─────────────────────────┐ │
│   │     η ←ψ                                                    │ │
│   │     ↓                                                       │ │
│   │     y ←θ                                                    │ │
│   │   ←(φ)· [continues: η]      [continues: η] ·(φ)→  (within)  │ │
│   └─────────────────────────────────────────────────────────────┘ │
│   ←(ρ)· [continues: inner cascade]   [·] ·(ρ)→   (between, optional)│
└──────────────────────────────────────────────────────────────────┘
```

Stubs appear at two levels: inner (within-burst, horizontal) and outer (between-burst, distinct axis/colour).

### Expanded view (2 bursts × 2 timepoints)

```
        Burst 1                         Burst 2
   t=1        t=2                   t=1        t=2
  η(1,1) ──φ──→ η(2,1)            η(1,2) ──φ──→ η(2,2)
   ↓            ↓                  ↓            ↓
  y(1,1)      y(2,1)             y(1,2)      y(2,2)

         η(2,1) ───────── ρ ─────────→ η(1,2)
              (between-burst carryover: last of B1 → first of B2)
```

Bursts sit side by side; within each, the inner cascade is a horizontal strip; the between-burst path links inner-dimension boundaries.

## Expansion Map

```
Assume: person p with Bₚ bursts, Tᵦ timepoints in burst b.

Per person:
  Nodes:
    - η instances:  Σᵦ Tᵦ
    - y instances:  Σᵦ Tᵦ
  Paths:
    - within-burst AR:      Σᵦ (Tᵦ − 1)
    - between-burst (opt.):  Bₚ − 1
    - process noise ψ:      Σᵦ Tᵦ
    - measurement error θ:  Σᵦ Tᵦ
    - measurement loadings: Σᵦ Tᵦ  (fixed 1)

Resolved naming carries both coordinates, e.g.
  η{t=3, burst=2, person=p001},  η{t=T, burst=B} (last-of-burst boundary).

Concrete example (B = 3 bursts, T = 5 each, one person):
  η nodes: 15;  within-burst AR: 3×4 = 12;  between-burst: 2;
  free parameters (stationary φ, ψ, θ, ρ): ~handful, independent of B,T.
```

## Extensions & Expansion Points

- **Growth across bursts.** Add burst-level latent factors (intercept/slope over bursts) so the burst dimension carries slow change while the inner dimension carries fast dynamics — a multi-timescale model.
- **Multivariate within-burst dynamics.** Replace the single η with a VAR over several latent measures, combining this design with `hierarchical/mlvar-measurement.md`.
- **Deeper nesting.** Days within weeks within persons within sites — repeated nesting, accumulating a coordinate per level.
- **Continuous time within burst.** Irregular within-burst spacing handled by computed interval-dependent coefficients (see `advanced/state-space.md`).
- **Different between-burst mechanisms.** Carryover only of the level, only of a trend, or a full latent-change link, versus full independence.

The two-level (time-in-burst) form should be a special case of a general nested-dimension mechanism with boundary-addressable inter-instance paths.

## Specification & UI Requirements

### Must-Support Elements

1. **Nested dimension declaration** with inner-index scoping (requirements #1, #2).
2. **Inter-instance paths on the inner dimension** and **boundary-targeted paths on the outer dimension** (requirements #3, #4).
3. **Optional outer-level structure** (independent vs. carryover) (requirement #5).
4. **Per-dimension axis/visual treatment** (requirement #7).
5. **Ragged extents and within-group scoping** (requirements #6, #8).

### Likely UI Workflows

1. Build the within-burst unit (state/measure + measurement + within-burst AR).
2. Wrap it in an outer burst dimension; mark the inner dimension nested within the burst.
3. Optionally add a between-burst path from the last inner instance to the first of the next burst.
4. Choose independent vs. carryover bursts.
5. Assign axis treatments so the two dimensions render distinctly.

### Visualization Challenges

- Two levels of "continues…" stubs that must be visually distinguishable.
- Drawing the between-burst boundary path without implying a within-burst step.
- Keeping a two-dimensional expansion legible as both B and T grow.

## Error Cases & Spec/Algorithm Gotchas

### Case 1: Coordinate Collision Across Levels

**Scenario**: Inner and outer dimensions both produce an index named, say, `i`, and resolved names collide.

**Problem**: η{i=2} is ambiguous between within-burst time 2 and burst 2.

**Gotcha**: Nested expansion must accumulate *distinct* coordinates.

**Implication**: Dimension names must be unique across levels and resolved names must carry both.

### Case 2: Between-Burst Path Targets the Wrong Instance

**Scenario**: The carryover path is specified as a generic "next instance" rather than last-of-burst → first-of-next-burst.

**Problem**: It connects the wrong timepoints (e.g., t=1 of burst 1 to t=1 of burst 2), or every inner instance to its outer successor.

**Gotcha**: The outer-dimension path must address inner-dimension *boundaries* ("last", "first").

**Implication**: The spec needs boundary keywords (first/last) for cross-instance paths over a nested dimension.

### Case 3: Within-Burst Dynamics Leak Across Bursts

**Scenario**: The within-burst autoregression is generated as "connect each η to the next" across the whole flattened series.

**Problem**: The last timepoint of burst 1 autoregresses onto the first of burst 2 *as if it were a within-burst step* — conflating short-term dynamics with between-burst carryover.

**Gotcha**: "Adjacent" must respect the inner-dimension boundary, not the flattened sequence.

**Implication**: Inner inter-instance paths must be scoped to the inner dimension within one outer instance.

### Case 4: Independent vs. Carryover Left Implicit

**Scenario**: The spec has no way to omit between-burst paths.

**Problem**: Forces a carryover assumption that may be unwanted (bursts often treated as independent occasions).

**Gotcha**: Whether bursts connect is a substantive modeling choice.

**Implication**: Outer-level inter-instance paths must be optional; omission means independent bursts and no between-burst stubs.

### Case 5: One-Dimensional Data Collapse

**Scenario**: Burst and within-burst indices are merged into a single running time index.

**Problem**: The within/between distinction — the entire point of a burst design — is lost.

**Gotcha**: A single time column cannot encode the two-level structure.

**Implication**: The spec must preserve both indices (or derive both from timestamps).

## Watch-Out Points

When evaluating a candidate spec/UI for this model:

1. Can two nested repeating dimensions be declared, with the inner scoped inside the outer?
2. Do resolved names accumulate distinct coordinates without collision?
3. Are within-inner-dimension inter-instance paths scoped so they don't leak across outer instances?
4. Can a between-outer-instance path target inner-dimension boundaries (last → first)?
5. Is between-burst structure optional (independent vs. carryover), with omission preserved on round-trip?
6. Are the two dimensions given distinct axis/visual treatment?
7. Does the tool handle ragged extents (variable bursts per person, timepoints per burst)?
8. Is the two-level structure preserved in data (not collapsed to one time index)?
9. Does it extend by extension to burst-level growth, multivariate within-burst dynamics, and deeper nesting?
10. Does the realized model match how multi-timescale / burst designs are written in dynamic SEM tools?
