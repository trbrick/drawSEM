# Simple Model: Linear Growth Curve

## Overview

A linear latent growth curve model represents change over time for a set of individuals. This foundational structure is used to estimate trajectories and individual differences in longitudinal data.

## Conceptual Model

In a linear latent growth curve, each person's time series is parameterized by two latent factors: **Intercept (I)** and **Slope (S)**. These represent the between-person level of variation. The Intercept is characterized by a fixed unit loading (1.0) on all measurement occasions, and the Slope is characterized by a fixed loading of value *t* (the time index) for measurement occasion *t*. The model is estimated from repeated measurements of the same variable across timepoints.

Key structural features:
- Intercept and Slope vary at the between-person level (heterogeneity in initial levels and rates of change)
- Loadings on I are fixed to 1.0
- Loadings on S are fixed to time values (0, 1, 2, ... or any time indexing scheme)
- Observed variables have residual variances (measurement error)

## Canonical Layouts

### Wide-Format Path Diagram (Canonical)

```
           I
          /|\
         1 1 1 1
        /  |  |  \
       Y₀  Y₁  Y₂  Y₃  (measurements at times 0, 1, 2, 3)
       
           S
          /|\
        0 1 2 3
        /  |  |  \
       Y₀  Y₁  Y₂  Y₃
       
     I ↔ S (covariance)

Var(I), Var(S), Var(Y₀), Var(Y₁), Var(Y₂), Var(Y₃) [not shown]
```

This canonical layout emphasizes the temporal structure: factors at the top, measurements across time from left to right.

### Tall-Format Path Diagram (Alternative)

```
           I
          /|
         1 |  
        /  |
       Y   |
       |   |
    time S
       
I → Y (loading = 1.0)
S → Y (loading = time value, from data)
I ↔ S (covariance)

Var(I), Var(S), Var(Y) [not shown]
```

This alternative is more compact and emphasizes that Y is a single measured variable whose relationship to I and S varies with time.

## Prerequisites

None. This is a foundational model.

## Specification Requirements

A JSON specification must be able to represent:

1. **Latent factors**: Intercept and Slope as latent variables
2. **Factor loadings**: 
   - Fixed loadings (I loadings all = 1)
   - Time-indexed loadings (S loadings = 0, 1, 2, 3, ...)
3. **Observed variables**: Measurements Y₁, Y₂, Y₃, Y₄
4. **Variances and covariances**:
   - Variance of I (free)
   - Variance of S (free)
   - Covariance between I and S (free)
   - Measurement error variances for Y₁, Y₂, Y₃, Y₄
5. **Time structure**: A way to specify that loadings depend on time values

## Data Formats

### Wide Format

One row per person. Columns: person_id, outcome_t0, outcome_t1, outcome_t2, outcome_t3

```
person_id  outcome_t0  outcome_t1  outcome_t2  outcome_t3
p001       2.5         3.1         4.2         5.0
p002       1.8         2.7         3.5         4.6
p003       3.2         3.9         5.1         6.3
```

**UI Perspective (Wide Format)**:
- Straightforward layout: outcome variables appear left-to-right in time order
- Compact visualization: all a person's data in one row
- User creates one observed variable per column (outcome_t0, outcome_t1, etc.)

**Data Specification Challenges**:
- Requires knowing upfront how many timepoints exist
- Column naming must communicate time consistently
- When creating the model, user must specify which columns map to which timepoints

### Tall Format

One row per timepoint within a person. Columns: person_id, time, outcome

```
person_id  time  outcome
p001       0     2.5
p001       1     3.1
p001       2     4.2
p001       3     5.0
p002       0     1.8
p002       1     2.7
p002       2     3.5
p002       3     4.6
```

**UI Perspective (Tall Format)**:
- More compact path diagram: one outcome variable labeled Y (the measurement)
- Can show time as a separate axis or as a parameter
- User specifies: "This model repeats for each unique (person_id, time) combination"

**Data Specification Challenges**:
- Requires a time column that is separate from the outcome variable
- The relationship "outcome varies by time" must be made explicit
- Cleaner for unequal spacing or missing timepoints

### Trade-Off Discussion

- **Wide**: Easier to visualize as a traditional path diagram; matches the visual structure. Harder to specify when timepoints vary by person.
- **Tall**: Easier to handle irregular timing; cleaner data format for most analysis tools. Requires user to think about time as a separate dimension.

A good spec/UI should ideally support both, but they may require different visualization strategies.

## Expansion Map

Assume: N persons, T timepoints per person (equally spaced, t = 0, 1, ..., T-1)

### Wide-Format Expansion

**Latent factors** (N instances):
- I₁, I₂, ..., Iₙ (one intercept per person)
- S₁, S₂, ..., Sₙ (one slope per person)

**Observed variables** (N × T instances):
- Y₁₀, Y₁₁, ..., Y₁ₜ₋₁ (outcomes for person 1, times 0 to T-1)
- Y₂₀, Y₂₁, ..., Y₂ₜ₋₁ (outcomes for person 2, times 0 to T-1)
- ...
- Yₙ₀, Yₙ₁, ..., Yₙₜ₋₁ (outcomes for person N, times 0 to T-1)

**Paths**:
- Fixed loadings I → Y: (N × T) paths, all with loading = 1
- Free loadings S → Y: (N × T) paths, with loadings = 0, 1, 2, ..., T-1 (repeated N times)
- Variances: Var(Iₙ), Var(Sₙ), Var(Yₙₜ) = N + N + (N × T) = N(T+2) paths
- Covariances: I ↔ S for each person = N paths

**Total node count**: 2N + NT
**Total path count**: (N × T) + (N × T) + N(T+2) + N = 2NT + 3N + N = 2NT + 4N

**Concrete example** (N=3 people, T=4 timepoints):
- Nodes: 6 latent + 12 observed = 18 total
- Paths: 12 (I→Y) + 12 (S→Y) + 18 (variances) + 3 (I↔S covariances) = 45 total

### Tall-Format Expansion

**Latent factors** (N instances):
- I₁, I₂, ..., Iₙ (one intercept per person)
- S₁, S₂, ..., Sₙ (one slope per person)

**Observed variables** (N × T instances):
- Y₁₀, Y₁₁, ..., Y₁ₜ₋₁ (one outcome per person-timepoint)
- Y₂₀, Y₂₁, ..., Y₂ₜ₋₁
- ...
- Yₙ₀, Yₙ₁, ..., Yₙₜ₋₁

(Same node expansion as wide format, but conceptually different specification)

**Paths**:
- Fixed loadings I → Y: (N × T) paths, all with loading = 1
- Time-dependent loadings S → Y: (N × T) paths, where each path's loading = time value of that observation
- Variances and covariances: same as wide format

**Total counts**: Same as wide format

**Key difference in specification**: Rather than explicitly listing T different S→Y loadings in the spec, the spec must express "S→Y loading = time value for this (person, time) pair" as a rule.

## Specification & UI Requirements

### Must-Support Elements

1. **Parametrization**: Model must be expressible with:
   - Factors (person_id at minimum; optionally time)
   - One Intercept and one Slope per person
   - Either: multiple measured Y variables (wide) OR one Y variable with time as data-dependent parameter (tall)

2. **Fixed vs. Free**:
   - I → Y loadings: FIXED to 1
   - S → Y loadings: FIXED to time values (either 0,1,2,3 or data-dependent)
   - Variances of I and S: FREE
   - Measurement error variances: FREE
   - I ↔ S covariance: FREE

3. **Visualization**:
   - Wide format should show temporal flow
   - Tall format should be compact, indicating time as a parameter
   - UI should clearly distinguish fixed vs. free parameters
   - Both formats should be visually intuitive

4. **Data Mapping**:
   - Wide: User specifies which columns are outcome variables and their time values
   - Tall: User specifies which column is outcome, which is person_id, which is time

### Likely UI Workflows

**Wide Format**:
1. Create model with 4 outcome variables (outcome_t0, outcome_t1, outcome_t2, outcome_t3)
2. Create two latent factors (Intercept, Slope)
3. Add loadings: Intercept → all outcomes (fixed to 1)
4. Add loadings: Slope → all outcomes (fixed to 0, 1, 2, 3)
5. Configure data mapping: map outcome_t0, ..., t3 to columns in data

**Tall Format**:
1. Create model with one outcome variable (Y) and one time parameter
2. Create two latent factors (Intercept, Slope)
3. Add loadings: Intercept → Y (fixed to 1)
4. Add loadings: Slope → Y (fixed to time parameter)
5. Configure data mapping: outcome column is Y, time column is time, person_id column is person_id

## Error Cases & Spec/Algorithm Gotchas

### Case 1: Time Values Not Matching Loadings

**Scenario**: User specifies wide-format data with columns outcome_t0, outcome_t1, outcome_t2, outcome_t3, but loads data in tall format where time values are 1, 2, 3, 4 (starting from 1, not 0).

**Problem**: Slope loadings in the spec (0, 1, 2, 3) don't match the actual time values in the data (1, 2, 3, 4).

**Gotcha**: A spec that hard-codes "S→Y loading = [0, 1, 2, 3]" will fail silently or give incorrect results. The spec should either:
- Reference time values from data explicitly
- Require user confirmation that time values match specification
- Or be flexible enough to infer time values from the data structure

### Case 2: Unequal Spacing

**Scenario**: Data has measurements at times 0, 1, 3, 5 (non-equally spaced).

**Problem**: Wide-format spec assumes regular columns; tall-format spec handles this naturally.

**Gotcha**: A spec that assumes equal spacing will fail. The spec must:
- Support irregular timepoints natively
- If supporting wide format, require explicit time values per variable
- Tall format handles this automatically if time column exists

### Case 3: Missing Data at Random

**Scenario**: Person p001 has measurements at t=0,1,2 but is missing t=3. Person p002 has all four measurements.

**Problem**: Wide format assumes everyone has the same number of observations; tall format handles this naturally.

**Gotcha**: A wide-format spec may require every person to have every timepoint, or require creating "missing" placeholders. Tall format avoids this.

**Implication for spec**: Wide-format specs must be explicit about how missing timepoints are handled (required vs. optional).

### Case 4: Specification Ambiguity in Tall Format

**Scenario**: Tall-format spec says "S → Y loading = time value" but doesn't specify: Is time an integer column? Is it continuous? How are missing timepoints handled?

**Problem**: If the time column is continuous (e.g., measured in days), should loadings reflect that? If time is irregular, does the interpretation change?

**Gotcha**: A spec that just says "loading = time" without specifying data type or handling of irregular timing is ambiguous.

**Implication**: Tall-format specs must be precise about how time parameters are extracted and used.

### Case 5: Confusion Between Specification Time and Data Time

**Scenario**: Spec says loadings are 0, 1, 2, 3. Data has a time column with values 0.5, 1.5, 2.5, 3.5.

**Problem**: Which time values are used for loadings?

**Gotcha**: If the spec hard-codes loadings but the data time column exists, there's ambiguity about which takes precedence.

**Implication**: Specs should be clear: Are loadings determined by the order in the data (position 1, 2, 3, 4) or by values in the data (0.5, 1.5, 2.5, 3.5)?

## Watch-Out Points

When evaluating a candidate spec/UI for this model:

1. **Can it handle both wide and tall formats?** Or does it bias toward one?
2. **How does it specify time-indexed loadings?** Is the mechanism clear and concise?
3. **How does it handle irregular timepoints?** Can a user specify non-equally-spaced times?
4. **Is the relationship between "timepoint order" and "time value" clear?** (These can differ.)
5. **Can the UI show fixed vs. free loadings clearly?** Can users understand why S→Y loadings vary?
6. **How does it validate that time values match intended loadings?** Does it prevent errors?
7. **Can it serialize and deserialize this model without ambiguity?** Round-trip test.
8. **How concise is the spec?** Does it avoid redundancy while remaining readable?
