# Edge Cases for Specification & UI Design

This directory contains model examples designed to evaluate JSON specification approaches and UI design strategies. Each example describes a concrete model that must be representable, specifying what the final result should look like and highlighting issues likely to trip up specs and algorithms.

## Purpose

These documents are intended for LLMs evaluating candidate JSON specifications and UI approaches. By analyzing how well a proposed spec/UI design can represent these models, we can compare approaches on clarity, concision, likelihood of errors, algorithmic simplicity, explicitness vs. inferrability, and runnability.

## Structure

- **`simple/`**: Basic model types that serve as building blocks
  - `growth-curve.md`: Linear growth model with measurement across timepoints
  
- **`cross-classified/`**: Models combining multiple random effects that don't nest
  - `growth-curve.md`: Cross-classified structure where students and teachers are crossed at the outcome level

## Navigation

**Suggested approach for LLM evaluation:**

1. Start with `simple/growth-curve.md` to understand:
   - How a single-level repeated-measures model is specified
   - Different data formats (wide vs. tall) and trade-offs
   - Canonical path diagram layouts
   - What the expanded model should contain

2. Move to `cross-classified/growth-curve.md` to understand:
   - How component models compose
   - Coordinate-based parametrization (instances per factor level)
   - Cross-component path specification
   - How composition affects visualization

## Document Structure

Each model document contains:

- **Overview**: What the model represents conceptually
- **Prerequisites**: Related models to understand first (if any)
- **Specification Requirements**: What must be representable
- **Data Formats**: How data might be organized; trade-offs
- **Canonical Layouts**: ASCII diagrams showing how this should appear
- **Expansion Map**: What the final instantiated model contains (nodes, paths, counts)
- **Specification & UI Requirements**: What a JSON spec and UI must support
- **Error Cases**: Spec/algorithm gotchas specific to this model
- **Watch-Out Points**: Common tripping hazards when evaluating candidate specs

## Using These for Spec/UI Evaluation

When evaluating a candidate specification or UI approach:

1. Read the model document entirely to understand the requirements
2. Ask: "Can this spec represent all required structural elements?"
3. Ask: "How would a user create this model in the UI?"
4. Ask: "How would the UI visualize this model at various zoom/expansion levels?"
5. Ask: "Are there ambiguous or error-prone aspects of how this spec represents this model?"
6. Check the "Watch-Out Points" section for known pitfalls
7. Compare the approach to other candidates using the same criteria

## Future Additions

As the specification evolves, this directory will grow to include:
- `simple/`: Factor models, measurement models, regressions
- `hierarchical/`: Nested structures (students within schools)
- `multigroup/`: Invariance constraints, multi-population models
- `advanced/`: Combinations of the above; rare/complex patterns
