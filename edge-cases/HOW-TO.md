# How to Write Edge Case Documents

This guide explains how to create edge case documents for evaluating JSON specifications and UI approaches.

## Purpose Recap

Edge case documents describe **concrete models that must be representable**, making it possible to compare how different specs and UI approaches handle them. These are not validation test cases (specs can't validate against them yet). Instead, they define a set of requirements and constraints that a spec/UI must satisfy.

The primary consumer is an LLM evaluating candidate specifications and UI approaches.

## General Principles

1. **Outcome-Focused**: Describe what the final result should contain and look like, not how to build it
2. **Specification-Agnostic**: Don't assume a particular JSON structure or naming convention
3. **Data-Aware**: Distinguish what's driven by data vs. what's specified in the model
4. **Error-Centered**: Highlight gotchas specific to *this* model that specs and algorithms are likely to trip up on
5. **Complete for LLM Evaluation**: Include enough detail that an LLM can generate spec candidates without additional context

### Implicit Assumptions About Nodes and Parameters

When a document specifies that a model has certain nodes (latent factors, observed variables), the following are assumed unless otherwise specified:

- **Variances**: All nodes have variances included in the model's covariance structure (whether estimated or fixed to constants).
- **Covariances**: Any two nodes of the same type (both latent, or both observed) may have covariances unless explicitly constrained to zero or omitted.
- **When to be explicit**: If a covariance should *not* appear (e.g., zero between certain variables), state this in the Specification Requirements section.

This aligns with standard SEM practice but should be made explicit in edge case documents so LLMs understand what parameters the expanded model contains.

## Document Structure

### 1. Overview

**Purpose**: Establish what the model represents conceptually.

**Content**:
- 2-3 sentence plain-English description of the model
- High-level intent (what question does it answer?)
- Key conceptual components

**Example**:
```
A linear growth curve model represents change over time for a set of individuals. 
Each person has two latent factors: Intercept (initial level) and Slope (rate of change). 
These are estimated from repeated measurements of the same variable across timepoints, 
forming a foundational structure for longitudinal data analysis.
```

**Length**: 3-5 sentences. This is not a detailed explanation, just context.

---

### 2. Prerequisites

**Purpose**: Help readers navigate the document set and understand what prior knowledge is assumed.

**Content**:
- List related edge cases that should be understood first
- For foundational models: state "None" or omit this section
- For composite models: reference specific documents and explain briefly what concepts from them apply

**Example**:
```
Understanding of the simple growth curve model (see simple/growth-curve.md) is helpful. 
This example builds on that structure by:
1. Instantiating the growth model once per student (replicating nodes and paths)
2. Adding a teacher effectiveness component (separate model, instantiated per teacher)
3. Specifying cross-level paths that connect student growth and teacher factors to outcomes
```

**Length**: 2-4 sentences + bullet list if prerequisites exist.

---

### 3. Specification Requirements

**Purpose**: List *what* must be representable in a JSON spec. Don't say *how*.

**Content**:
- Numbered list of structural elements the spec must handle
- Each item should be a capability (verb: "must be able to represent," "must support")
- Be concrete but not implementation-specific
- Don't mention JSON field names or structure

**Example** (good):
```
1. Latent factors: Intercept and Slope as latent variables
2. Factor loadings: Fixed loadings (I loadings all = 1) and time-indexed loadings (S loadings = 0, 1, 2, 3, ...)
3. Observed variables: Measurements Y₁, Y₂, Y₃, Y₄
4. Parametrization: One Intercept and one Slope per person
5. Time structure: A way to specify that loadings depend on time values from data
```

**Example** (weak):
```
1. Define latent factors in the "factors" section
2. Use "loadings" array with "fixed": true or false
3. [Too prescriptive; assumes JSON structure]
```

**Length**: 5-10 items. Aim for completeness without overwhelming.

---

### 4. Data Formats (if applicable)

**Purpose**: Show how the same conceptual model might be specified differently depending on data organization.

**Include one section per format. Each section should contain**:

#### Format Name

**Subsections**:

a) **Example Data** (small concrete table)
   - 3-5 rows
   - All relevant columns
   - Shows the structure clearly

b) **UI Perspective** (what's intuitive from a UI standpoint)
   - 2-3 bullet points about how this format affects visualization
   - What the user does when building the model

c) **Data Specification Challenges** (where errors can creep in)
   - 2-3 bullets about gotchas specific to this format
   - What information must be made explicit

#### Trade-Off Discussion

**Purpose**: Explain which format is easier/harder for spec and UI, and why.

**Content**:
- 2-3 bullet points comparing the formats
- Tradeoffs in specificity, data structure, error-proneness
- Whether both should be supported or one is preferred

**Length per format**: ~15-20 lines.

---

### 5. Canonical Layouts

**Purpose**: Show what this model should look like when drawn as a path diagram.

**Content**:
- ASCII diagrams (not interactive mockups)
- One diagram per logical view (component, composition, expanded)
- Include legend if notation is non-obvious
- Note any variables/paths not shown (e.g., "error variances not shown for clarity")

**ASCII Style**:
- Use `→` for directed paths
- Use `↔` for bidirectional/covariance paths
- Use `|` and `/` for layout
- Indentation for nesting/grouping
- Keep simple; readability over prettiness

**Example** (good):
```
           I
          /|
         1 |
        /  |
       Y   |
            
           S
          /|
        0 1
        /  |
       Y   |

Var(I), Var(S), I ↔ S (covariance)
```

**Example** (weak):
```
[Actual VS Code screenshot with interactive handles and colors]
[Too specific to one UI implementation]
```

**Length**: 1-3 diagrams, ~10-15 lines each.

---

### 6. Expansion Map

**Purpose**: Show concretely what the final instantiated model contains.

**Content structure**:

a) **Generic Formula**
   - Variables: Define what S, T, M, K, etc. represent
   - Node count formula: Express total nodes in terms of variables
   - Path count formula: Express total paths in terms of variables
   - Example counts: Apply formulas to a specific scenario (e.g., S=3, T=2, K=4)

b) **Component-Level Breakdown** (if composite model)
   - Separate subsection per component type
   - How many instances per factor
   - How many nodes/paths per instance
   - Running total

c) **Cross-Component Additions** (if composite model)
   - Paths that connect components
   - Count of cross-component paths
   - Total nodes and paths

d) **Concrete Example**
   - Specific numbers (e.g., "3 students, 2 teachers, 4 timepoints")
   - Actual count of nodes and paths
   - Optional: list of which nodes/paths exist (for clarity)

**Example** (good formula):

```
Assume: N persons, T timepoints per person

Nodes: N (intercepts) + N (slopes) + N×T (observed outcomes) = N(T+2)
Paths: 
  - I → Y: N×T (all fixed to 1)
  - S → Y: N×T (fixed to time values 0, 1, ..., T-1)
  - Variances: N + N + N×T (Var(I), Var(S), Var(Y))
  - Covariances: N (I ↔ S for each person)
  - Total: 4N×T + 3N

Concrete example (N=3 people, T=4 timepoints):
  - Nodes: 3(4+2) = 18
  - Paths: 4(3)(4) + 3(3) = 48 + 9 = 57
```

**Example** (weak):

```
The model has 18 nodes and 57 paths.
[No formula, can't generalize, can't verify logic]
```

**Length**: 20-30 lines including formulas and concrete example.

---

### 7. Specification & UI Requirements

**Purpose**: Translate what must be representable into concrete design requirements.

**Subsections**:

a) **Must-Support Elements**
   - Numbered list (5-8 items)
   - Each describes a capability needed
   - Can reference spec requirements section (e.g., "From requirement #3: observed variables...")
   - Include data mapping aspects here if relevant

b) **Likely UI Workflows** (optional, but helpful)
   - Step-by-step user journey for creating this model
   - 5-10 steps showing interaction sequence
   - Mention UI affordances or design choices that become visible

c) **Visualization Challenges** (optional, relevant for complex models)
   - Specific hard problems for UI (scale, cross-references, repetition)
   - What strategies might help (collapse, grouping, abstraction)
   - Don't prescribe; flag the challenge

**Length**: 15-25 lines.

---

### 8. Error Cases & Spec/Algorithm Gotchas

**Purpose**: Identify scenarios where specs and algorithms are likely to fail silently or produce wrong results.

**Content structure per error case**:

- **Case Name**: Descriptive title
- **Scenario**: Concrete setup that triggers the error (2-3 sentences)
- **Problem**: What goes wrong or what's ambiguous (1-2 sentences)
- **Gotcha**: Why a naive spec or algorithm would fail (1-2 sentences)
- **Implication**: How the spec should handle this to avoid it (1 sentence)

**Selection criteria** (what counts as an error case):
- Likely to occur in real use (not contrived)
- Specific to this model (not generic JSON issues)
- Spec/algorithm will struggle without explicit handling
- Not caught by basic validation

**Example** (good):

```
### Case: Unequal Timepoint Spacing

**Scenario**: Data has measurements at times 0, 1, 3, 5 (non-equally spaced).

**Problem**: Wide-format spec assumes regular columns (outcome_t0, outcome_t1, ...). 
Tall-format spec handles this naturally via a time column.

**Gotcha**: A spec that assumes equal spacing will fail or produce incorrect loadings.

**Implication**: Specs must either support irregular spacing natively or require explicit 
time values for each measurement.
```

**Example** (weak):

```
Unequal spacing might not work.
[Too vague, doesn't explain why, no concrete scenario]
```

**Length per case**: 5-8 lines. Aim for 4-6 cases.

---

### 9. Watch-Out Points

**Purpose**: Summary checklist for evaluating candidate specs/UIs.

**Content**:
- 8-12 yes/no or open-ended questions
- Should cover all major design decisions relevant to this model
- Phrased as things for an evaluator to check, not implementation details
- Roughly follow the flow of earlier sections (spec, visualization, data coupling, etc.)

**Example**:
```
1. Can it handle both wide and tall formats? Or does it bias toward one?
2. How does it specify time-indexed loadings? Is the mechanism clear and concise?
3. How does it handle irregular timepoints?
4. Can the UI show fixed vs. free loadings clearly?
5. How does it validate that time values match intended loadings?
6. Can it serialize and deserialize this model without ambiguity?
```

**Length**: 8-15 lines.

---

## Section Checklist

For a complete edge case document:

- [ ] **Overview**: 3-5 sentences establishing the model
- [ ] **Prerequisites**: Related models or "None"
- [ ] **Specification Requirements**: 5-10 must-support capabilities
- [ ] **Data Formats**: 1-2 formats with examples, UI perspective, challenges, tradeoffs
- [ ] **Canonical Layouts**: 1-3 ASCII diagrams with legend
- [ ] **Expansion Map**: Generic formulas + concrete example with counts
- [ ] **Specification & UI Requirements**: Must-support elements, UI workflows, visualization challenges
- [ ] **Error Cases**: 4-6 specific gotchas with scenario-problem-implication structure
- [ ] **Watch-Out Points**: 8-12 evaluation questions

---

## Writing Tips

1. **Use concrete examples sparingly but effectively**. One good concrete data table beats five generic descriptions.

2. **Distinguish "must" from "nice to have"**. Specification requirements are must-supports. Visualization strategies are suggestions.

3. **Think about scale**. A simple model expands modestly; a composite model might expand dramatically. Be honest about this in the expansion map.

4. **Be precise about data coupling**. Use phrases like:
   - "Determined by data" (inferred from unique values in the data)
   - "Specified in the model" (user declares in the spec)
   - "Inferred from data at runtime" (computed each time, not stored in JSON)

5. **Avoid prescribing solutions**. Say "The spec must be able to represent X" not "Add a field called X_list."

6. **Write for an LLM**. Be clear and structured. Use numbered lists. Avoid ambiguous pronouns.

7. **Review the canonical layouts**. If a diagram doesn't clarify the structure, remove or simplify it.

---

## Document Length

**Simple models** (1-2 component types, ~20-50 nodes):
- 3,000-4,000 words

**Composite models** (3+ component types, 50+ nodes):
- 4,500-6,000 words

If much longer, consider breaking into multiple documents.

---

## Common Pitfalls

1. **Confusing "how to build in the UI" with "what the spec must represent"**
   - Focus on the latter; UI workflows are secondary.

2. **Over-specifying JSON structure**
   - Don't say "use a 'parametrization' object with a 'factors' array."
   - Instead: "must be able to express which nodes are instantiated per factor."

3. **Missing the expansion map**
   - This is critical for evaluation. Specs and algorithms need to know scale.

4. **Vague error cases**
   - "Naming conflicts might occur" is weak.
   - "If student S001 has different timepoints under different teachers, node naming ambiguity arises" is better.

5. **Ignoring data format trade-offs**
   - Same model, different formats, different challenges. Don't skip this.

6. **Making error cases too generic**
   - "Missing data" is a generic problem. "Missing data at specific student-teacher-time combinations in a crossed structure" is specific to this model.

---

## Iterating on Edge Cases

When reviewing an edge case document:

1. **Check the expansion map first**. Are the formulas correct? Can you verify the concrete example?
2. **Read a data example**. Does it match the expansion map?
3. **Check the error cases**. Are they specific to this model? Would an algorithm actually trip up?
4. **Skim the specifications requirements**. Are they clear without being prescriptive?
5. **Review watch-out points**. Do they cover the major design decisions?

If any section feels unclear or incomplete, the document needs revision.
