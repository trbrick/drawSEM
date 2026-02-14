# Complex Model: Cross-Classified Growth Curve

## Overview

A cross-classified growth curve model represents change over time for individuals who are nested under multiple non-hierarchical (crossed) factors. In this example, students grow over time under the influence of teachers, where students are not strictly nested within teachers (many-to-many relationship).

This model combines:
- **Student growth factors**: Each student has an intercept (I) and slope (S) for their developmental trajectory
- **Teacher effects**: Each teacher has a latent effectiveness construct measured by indicators
- **Outcomes**: Student-teacher-timepoint combinations produce outcomes influenced by both the student's growth and the teacher's effectiveness

## Prerequisites

Understanding of the simple growth curve model (see `simple/growth-curve.md`) is helpful. This example builds on that structure by:
1. Instantiating the growth model once per student (replicating nodes and paths)
2. Adding a teacher effectiveness component (separate model, instantiated per teacher)
3. Specifying cross-level paths that connect student growth and teacher factors to outcomes at the lowest level

## Conceptual Model

```
LEVEL 2a: Students (each student has I and S)
    I_s, S_s (for each of S students)

LEVEL 2b: Teachers (each teacher has latent effectiveness)
    T_t, and observed indicators Q1_t, Q2_t, Q3_t (for each of T teachers)

LEVEL 1: Outcomes (at student-teacher-time triplets)
    Y_{s,t,time} = outcome for student s, teacher t, at time point
    A_{s,t,time} = ability covariate

CROSS-LEVEL PATHS:
    I_s → Y_{s,t,time} (fixed loading = 1, contributes equally to all a student's outcomes)
    S_s → Y_{s,t,time} (fixed loading = time value, creates growth effect)
    T_t → Y_{s,t,time} (free loading, teacher effect on student's outcome)

WITHIN-LEVEL PATHS:
    T_t → Q1_t, Q2_t, Q3_t (factor loadings, measure teacher effectiveness)
    A_{s,t,time} → Y_{s,t,time} (regression)
    Variances and covariances within each level
```

## Specification Requirements

A JSON specification must be able to represent:

1. **Component Models**: Separate model definitions that can be reused
   - `student_growth`: Latent I and S per student
   - `teacher_effectiveness`: Latent T with observed indicators per teacher
   - `outcome_unit`: A minimal outcome model for a single student-teacher-time combination

2. **Composition Structure**: How components combine
   - Two random-effect factors (student, teacher) that cross at the outcome level
   - Clear specification that students and teachers are NOT nested

3. **Parametrization**: Which nodes get instantiated per factor
   - Student growth components instantiated per unique student_id
   - Teacher effectiveness components instantiated per unique teacher_id
   - Outcome components instantiated per (student_id, teacher_id, time) triplet

4. **Cross-Component Paths**: Paths that reference nodes across components
   - I_s → Y_{s,t,time} (student intercept affects all outcomes for that student)
   - S_s → Y_{s,t,time} (student slope affects all outcomes for that student)
   - T_t → Y_{s,t,time} (teacher effect affects all outcomes for that teacher)

5. **Time-Dependent Parameters**: Slopes that vary with time values
   - S_s → Y_{s,t,time} loading = time value (from data)

6. **Data Mapping**: Linking data structure to model structure
   - Data has rows per (student_id, teacher_id, time)
   - One outcome column (Y)
   - One covariate column (A)
   - One time column (t)
   - Implicit enrollment structure: which students have which teachers

## Data Formats

### Tall Format (Recommended)

One row per (student, teacher, time) triplet.

```
student_id  teacher_id  time  outcome  ability
s001        t001        0     12.5     11.2
s001        t001        1     13.1     12.5
s001        t002        0     12.3     11.0
s001        t002        1     13.5     12.8
s002        t001        0     11.2     10.1
s002        t001        1     12.0     11.3
s002        t002        0     10.8     9.8
s002        t002        1     11.9     11.1
```

**Why tall format works well here**:
- Naturally represents the cross-classified structure (each row is a unique combination)
- Handles students with different numbers of teachers seamlessly
- Handles different timepoints per student-teacher pair
- Time values are explicit and data-driven (no confusion about loading values)

**Data dependencies**:
- Unique student_ids in data determine how many student_growth components are instantiated
- Unique teacher_ids in data determine how many teacher_effectiveness components are instantiated
- Unique (student_id, teacher_id, time) triplets determine how many outcome nodes are instantiated

## Canonical Layouts

### Component Models (Separate Diagrams)

#### Student Growth Component

```
       I_s
      /|
     1 |
    /  |
   Y   |
   |   |
   0,1,2,3 (time loadings)
      S_s

I_s ↔ S_s (covariance)
Var(I_s), Var(S_s), Var(Y)
```

**Note**: This is a generic template showing structure. When instantiated, there's one of these per student.

#### Teacher Effectiveness Component

```
           T_t
          /|\
        L1 L2 L3
       /  |  \
      Q1  Q2  Q3

Var(T_t), Var(Q1), Var(Q2), Var(Q3)
L1, L2, L3 are factor loadings (L1 fixed to 1, L2 and L3 free)
```

**Note**: One of these per teacher.

#### Outcome Unit (at crossing point)

```
Y = outcome at (student, teacher, time)
```

**Note**: This is the minimal unit; in the full model, it's connected to both student growth and teacher effectiveness.

### Full Composition (Condensed View)

```
LEVEL 2a: Student Growth (S students)
    [I_1, S_1], [I_2, S_2], ..., [I_S, S_S]
        |         |                    |
        +----+----+----+----+----------+
             |
         (many paths)
             |
LEVEL 1: Outcomes (S × T × Time observations)
    Y_{1,1,t}, Y_{1,2,t}, Y_{2,1,t}, Y_{2,2,t}, ...
             ^
             |
        (many paths)
             |
LEVEL 2b: Teacher Effectiveness (T teachers)
    [T_1, Q1_1, Q2_1, Q3_1], [T_2, Q1_2, Q2_2, Q3_2], ..., [T_T, Q1_T, Q2_T, Q3_T]
```

This view shows:
- Students at left
- Outcomes in the middle (the "crossing point")
- Teachers at right
- Many-to-many crossing (all students' growth affects all outcomes; all teachers' effects affect all outcomes based on enrollment)

## Expansion Map

Assume:
- S students
- T teachers
- Each teacher has M indicator variables (quality measures)
- Each student has timepoints at t ∈ {0, 1, ..., K-1} (equally spaced for simplicity)
- Each student is taught by all T teachers (fully crossed; not all students teach all teachers in reality, but we're showing the maximal case)

### Component-Level Instantiation

**Student Growth Components**:
- S instances of the `student_growth` model
- Per instance: 2 nodes (I, S) + paths (var_I, var_S, cov_IS)
- Total: 2S nodes, 3S paths from within-component structure

**Teacher Effectiveness Components**:
- T instances of the `teacher_effectiveness` model
- Per instance: 1 latent (T) + M observed (Q1, ..., QM) = (1+M) nodes
- Paths per instance: M factor loadings + 1 variance of T + M error variances = (2M+1) paths
- Total: T(1+M) nodes, T(2M+1) paths from within-component structure

**Outcome Components**:
- S × T × K instances of the `outcome_unit` model
- Per instance: 2 nodes (Y, A) 
- Paths per instance: 1 regression (A → Y) + 2 variances (Y, A)
- Total: 2STK nodes, 3STK paths from within-component structure

### Cross-Component Paths

**Student Growth → Outcomes**:
- Per outcome node Y_{s,t,k}: paths from I_s and S_s
- Loading I_s → Y_{s,t,k} = 1 (fixed)
- Loading S_s → Y_{s,t,k} = k (time value, fixed)
- Total: 2STK paths (S growth paths per outcome)

**Teacher Effectiveness → Outcomes**:
- Per outcome node Y_{s,t,k}: path from T_t
- Loading T_t → Y_{s,t,k} = free (estimate teacher effect)
- Total: STK paths (T effectiveness paths per outcome)

### Grand Total

**Nodes**:
- Student: 2S
- Teacher: T(1+M)
- Outcomes: 2STK
- **Total**: 2S + T(1+M) + 2STK = 2S(1+TK) + T(1+M)

**Paths**:
- Within-student: 3S
- Within-teacher: T(2M+1)
- Within-outcome: 3STK
- Student → Outcomes: 2STK
- Teacher → Outcomes: STK
- **Total**: 3S + T(2M+1) + 3STK + 2STK + STK = 3S + T(2M+1) + 6STK

**Concrete Example**: S=3 students, T=2 teachers, M=3 quality indicators, K=4 timepoints

- Student nodes: 2 × 3 = 6
- Teacher nodes: 2 × (1+3) = 8
- Outcome nodes: 2 × 3 × 2 × 4 = 48
- **Total nodes**: 6 + 8 + 48 = 62

- Within-student paths: 3 × 3 = 9
- Within-teacher paths: 2 × (2×3+1) = 14
- Within-outcome paths: 3 × 3 × 2 × 4 = 72
- Student → outcomes: 2 × 3 × 2 × 4 = 48
- Teacher → outcomes: 3 × 2 × 4 = 24
- **Total paths**: 9 + 14 + 72 + 48 + 24 = 167

## Specification & UI Requirements

### Must-Support Elements

1. **Model Reuse and Composition**:
   - Define base models (student_growth, teacher_effectiveness, outcome_unit) once
   - Reference them in a composition structure
   - Specify how many times each is instantiated (per factor)

2. **Parametrization**:
   - Each student_growth instance must have its own I and S
   - Each teacher_effectiveness instance must have its own T and indicators
   - Each outcome must have its own Y, linked to specific student and teacher

3. **Cross-Component References**:
   - Paths can reference nodes in other components (e.g., I_s → Y_{s,t,k})
   - Must allow specifying which parameter instances connect (e.g., student s connects to outcome s,t,k for all t,k)

4. **Fixed vs. Free**:
   - I → Y: fixed to 1
   - S → Y: fixed to time value (data-dependent)
   - T → Y: free (estimated)
   - Within-component parameters: mix of fixed and free

5. **Data Mapping**:
   - Outcome column maps to Y nodes
   - Time column provides time values for S loadings
   - Student_id, teacher_id, time together define outcome nodes
   - Enrollment structure (which students have which teachers) inferred from data

### Likely UI Workflows

**Creating this model from scratch**:

1. Create or import base components:
   - `student_growth` model (I, S, covariance, variances)
   - `teacher_effectiveness` model (latent T, indicators Q1-Q3)
   - `outcome_unit` model (outcome Y, covariate A)

2. Create a composition layer:
   - Declare two random-effect factors: student_id, teacher_id
   - Assign components to factors:
     - student_growth instantiated per student_id
     - teacher_effectiveness instantiated per teacher_id
     - outcome_unit instantiated per (student_id, teacher_id, time)

3. Draw cross-component paths:
   - I_s → Y_{s,t,time} (interface must show which nodes are cross-component)
   - S_s → Y_{s,t,time}
   - T_t → Y_{s,t,time}

4. Configure data mapping:
   - Assign data columns to variables
   - Specify time-dependent loadings

### Visualization Challenges

1. **Scale**: 62 nodes and 167 paths is difficult to show at once. UI must support:
   - Component-level view (show each component separately, collapsed)
   - Composition view (show how components relate, with connections abstracted)
   - Expandable sections (user can expand/collapse student or teacher groupings)

2. **Cross-References**: Must show that the same S_1 node has 2T paths emanating from it (one to each teacher-outcome combination). This needs visual clarity.

3. **Repeated Structure**: Many identical patterns (e.g., each student's I and S connect the same way). UI should show this concisely without repeating the full structure.

## Error Cases & Spec/Algorithm Gotchas

### Case 1: Ambiguous Enrollment Structure

**Scenario**: Data has student_id and teacher_id columns, but the spec doesn't clarify: Does "crossed" mean every student has every teacher, or only those pairs present in the data?

**Problem**: If the user specifies components crossing at outcome level, is the crossing structure:
- Inferred from data (only pairs present)?
- Assumed complete (all pairs)?
- Specified explicitly in the model?

**Gotcha**: Different specs might interpret this differently. One might create outcome nodes only for pairs in the data; another might create nodes for all combinations and rely on data to populate them.

**Implication for spec**: Must be explicit about whether crossing is data-driven or model-driven.

### Case 2: Parametrization Ambiguity with Irregular Data

**Scenario**: Teacher T1 has students S1, S2, S3. Teacher T2 has students S1, S2 (missing S3). Does the student_growth model still instantiate I_S3 and S_S3?

**Problem**: If parametrization is "one I, S per unique student_id," then S3 appears even though S3 doesn't have T2. But the outcome node Y_{S3,T2,t} doesn't exist in the data.

**Gotcha**: Specs must clarify whether parametrization is driven by:
- Unique values in data (S3 appears only because it exists somewhere)
- Model structure (all level-1 units get all level-2 values)

**Implication**: Specs should define parametrization rules clearly to avoid silent failures.

### Case 3: Time-Indexed Loading Ambiguity

**Scenario**: S_s → Y_{s,t,k} loading should be k (the time value). But is k:
- The row number in the data? (1st timepoint = 1, 2nd = 2, ...)
- The time column value? (0, 1, 2, 3)
- Something else?

**Problem**: If the spec doesn't clarify, different algorithms might assign different loadings.

**Gotcha**: This was a problem in the simple growth curve but is worse here because time values now vary per (student, teacher) pair.

**Implication**: Specs must be precise about how data-dependent loadings are computed.

### Case 4: Reusability Without Ambiguity

**Scenario**: The outcome_unit component has nodes Y and A. When instantiated in the full model, are these:
- Renamed to Y_{s,t,k} and A_{s,t,k}? (If so, how does the spec specify naming?)
- Referred to as Y and A with implicit subscripting? (If so, how are references disambiguated?)

**Problem**: If the spec isn't clear about node naming in reused components, serialization can become ambiguous.

**Gotcha**: Roundtrip test: Can you save the expanded model and reload it to get back the same structure?

**Implication**: Specs should define clear rules for how reused component nodes are named/referenced.

### Case 5: Cross-Component Path Scope

**Scenario**: A path says "I_s → Y at (s, *, *)". Does the * mean:
- All teachers? (Y_{s,t,k} for all t)
- All timepoints? (Y_{s,t,k} for all k)
- Both? (Y_{s,t,k} for all t and k)

**Problem**: Incomplete specification of scope could create wrong number of paths or invalid connections.

**Gotcha**: Specs need a clear syntax or rule for specifying which (component instance, outcome instance) pairs get a path.

**Implication**: Cross-component paths may need a more sophisticated specification mechanism than simple "from, to" references.

## Watch-Out Points

When evaluating a candidate spec/UI for this model:

1. **Component Reuse**: Can base models be defined once and reused in multiple places with proper instantiation?

2. **Parametrization Clarity**: Is it clear which nodes are instantiated per which factors? Can the spec express "one I and S per student" unambiguously?

3. **Cross-Component References**: Can you specify paths between components in a way that's concise and unambiguous? Can you avoid redundant specification?

4. **Data Coupling**: Is it clear which aspects are data-driven (unique students) vs. model-driven (student growth structure)? Does the spec support both?

5. **Time-Dependent Parameters**: Can time-indexed loadings be specified without ambiguity? Does the spec clarify where time values come from?

6. **Visualization at Scale**: Does the UI strategy handle 62+ nodes and 167+ paths without becoming incomprehensible? Are groupings/collapses intuitive?

7. **Serialization Roundtrip**: Can you save this model and reload it to get an equivalent structure? Are there ambiguities that could be resolved differently on reload?

8. **Error Prevention**: Does the spec/algorithm catch common errors (mismatched time values, incorrect enrollment, parametrization scope)?

9. **Comparison to Third-Party Tools**: Does the spec's approach match how tools like Mplus, OpenMx, or lavaan represent crossed models? Or require translation?

10. **Concision vs. Explicitness**: Is the spec concise (few lines) or explicit (clear but verbose)? Can it be both?
