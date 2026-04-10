# OpenMx Primer for AI Tools

This document covers OpenMx concepts that AI tools commonly get wrong. Read
this before writing or modifying any OpenMx-related code in this project.

For working examples, OpenMx ships a set of canonical demos accessible in R:

```r
library(OpenMx)
demo("OneFactorModel_PathRaw", ask = FALSE)   # Basic CFA, RAM path style
demo("BivariateCorrelation", ask = FALSE)     # Two correlated variables
# Full list: library(help="OpenMx") or browseVignettes("OpenMx")
```

Use these as ground truth when testing or when unsure about correct structure.

---

## 1. S4 Classes and Dispatch

OpenMx is built on R's S4 system. Common AI mistakes:

- Using `inherits(x, "MxModel")` or `class(x) == "MxRAMModel"` instead of
  `is(x, "MxRAMModel")`.
- Reverting to S3 patterns (`UseMethod`, `NextMethod`) for methods that should
  be `setMethod`.
- Accessing slots with `x$slot` instead of `x@slot` (for S4 objects where `$`
  is not defined as an accessor).
- Conversely: **do not use `@` to access OpenMx model components like matrices
  and paths** — use `$` (e.g. `model$A$values[1,1] <- 5`). OpenMx S4 objects
  expose their components via `$` accessors, not raw slot access.

---

## 2. Two Ways to Specify a RAM Model

There are two distinct approaches. Do not conflate them.

### Approach A: Path ("pathic") specification — `mxModel(type = "RAM", ...)`

```r
model <- mxModel(
  name         = "MyModel",
  type         = "RAM",
  manifestVars = c("x1", "x2"),
  latentVars   = c("F1"),
  mxData(mydata, type = "raw"),
  # Factor loadings: fix first to 1 to set scale; free the second
  mxPath(from = "F1", to = "x1", arrows = 1, values = 1.0, free = FALSE, labels = "lambda_1"),
  mxPath(from = "F1", to = "x2", arrows = 1, values = 0.8, free = TRUE,  labels = "lambda_2"),
  # Factor variance: fixed to 1 (scale already set by lambda_1)
  mxPath(from = "F1", arrows = 2, values = 1, free = FALSE, labels = "var_F1"),
  # Residual variances: must be non-zero at starting values
  mxPath(from = c("x1", "x2"), arrows = 2, values = 0.5, free = TRUE,
         labels = c("res_x1", "res_x2"))
)
```

- Creates an object of class `MxRAMModel` (a subclass of `MxModel`).
- **Requires explicit `manifestVars` and `latentVars`.** These cannot be
  inferred from paths alone. Use the `manifestVars` and `latentVars` accessors
  to read them; do not attempt to set `model$manifestVars` or
  `model$latentVars` directly.
- Allows `mxPath()` statements; OpenMx translates them into A, S, F matrices
  internally.
- Automatically generates a default `mxExpectationRAM()`, which can be
  replaced if needed.

### Approach B: Matrix ("mathic") specification — `mxExpectationRAM()` directly

Any `MxModel` can use RAM expectation by adding `mxExpectationRAM()` and the
required A, S, and F matrices explicitly. This produces an `MxModel`, not an
`MxRAMModel`. It does **not** have `manifestVars`/`latentVars` slots, and
`mxPath()` is not available — matrices are populated directly.

Manifest variables are determined from the **F matrix**: any row with a single
`1` (equivalently, any column with a single `1`) identifies a manifest
variable. This should match the intersection of the matrix column names and
the observed data column names. The name of the F matrix is stored at
model$expectation$F.  Note: the same F-matrix rule applies to
Approach A models unless their expectation has been manually replaced with a
non-RAM expectation.

**In this project, the converter always uses Approach A** (`type = "RAM"`).
Do not switch to Approach B unless explicitly directed.

---

## 3. `mxPath()` Arguments

```r
mxPath(
  from    = "F1",                    # Source node; use "one" for means (NOT "1")
  to      = c("x1", "x2"),          # Target node(s)
  arrows  = 1,                       # 1 = directed, 2 = covariance/variance
  free    = TRUE,                    # Logical: TRUE = free parameter, FALSE = fixed
  values  = c(1.0, 0.8),            # Per-path starting values (vectors OK)
  labels  = c("lambda_1","lambda_2"),# Per-path labels — MUST differ if parameters
                                     # should be independent (see section 4)
  connect = "single"                 # Default; see note on connect= below
)
```

Key mistakes to avoid:

- **`from = "one"`** is the OpenMx convention for the unit constant (means and
  intercepts). `"1"`, `"constant"`, or `"intercept"` will not work.
- **`free` is logical**, not a string. `free = "free"` is wrong; `free = TRUE`
  is correct. (The schema uses `freeParameter`, where `TRUE` means free,
  a non-empty string means free with a named parameter label, and absence means
  fixed; the converter translates that into OpenMx's logical `free` argument.)
- **Multiple paths in one call:** `mxPath(from="F1", to=c("x1","x2"), ...)`
  generates one path per target. `values` and `labels` can be vectors of the
  same length, or scalars that are recycled. This is idiomatic OpenMx — prefer
  it over looping.
- **The `connect` argument** controls how `from` and `to` lists are paired.
  The default `connect = "single"` pairs elements one-to-one (or broadcast if
  one side is length 1). `connect = "unique.bivariate"` generates all unique
  off-diagonal pairs — useful for specifying all covariances. When `to` is
  omitted, it defaults to the `from` list, so
  `mxPath(from=allVars, connect="single", arrows=2)` specifies all variances
  and `mxPath(from=allVars, connect="unique.bivariate", arrows=2)` specifies
  all covariances. See `?mxPath` for the full set of `connect` options.

---

## 4. Parameter Labels: Display and Equality Constraints

Labels in `mxPath(labels = ...)` serve two purposes simultaneously:

1. **Name the parameter** for display in summaries and output.
2. **Constrain parameters to be equal**: any two paths sharing the same label
   are constrained to have the same value — like using the same variable name
   in an algebraic equation ($2x = x + 3$ requires both $x$s to be equal).

This means: **do not assign labels casually for documentation purposes without
understanding the constraint implications.** If two paths should be independent,
give them different labels or use `NA` (no label, no constraint).

Conversely, to impose an equality constraint between two parameters, just give
them the same label — no `mxConstraint()` is needed.

---

## 5. `mxRun()` Returns a New Object

`mxRun()` does not modify the model in place. Always capture the result:

```r
fit <- mxRun(model)          # correct
summary(fit)

mxRun(model)                 # wrong — result is discarded
summary(model)               # model is still unfitted
```

---

## 6. `mxData()`

```r
mxData(mydata, type = "raw")          # individual data; FIML handles missingness
mxData(covmat, type = "cov",
       numObs = 200, means = myvec)   # covariance matrix; numObs required
```

- For `type = "raw"`, FIML missingness is handled automatically by
  `mxFitFunctionML()`. Do not add `naAction` or similar arguments — they
  don't exist on `mxData`.
- Column names of the data must match `manifestVars` exactly if type="RAM"
- Data must be attached to the model — a model without `mxData` will fail at
  `mxRun()` for RAM models. Don't generate or modify models and forget to
  attach data.

---

## 7. Viable SEM Structure

OpenMx will accept structurally invalid models and fail at runtime with
cryptic errors. Before running any model, verify:

- **Model-implied manifest covariance must be positive definite.** The most
  common way to violate this is to omit variances. Every variable that
  contributes variance to the manifest layer needs a source of variance —
  either a direct variance path (`arrows = 2`, self-loop) or incoming directed
  paths from variables that themselves have variance. Latent variables with no
  incoming paths almost always need an explicit variance. Manifest variables
  with no residual and no structured variance source are the most common cause
  of non-positive-definite errors at runtime.
- **Starting values must be non-zero for variance parameters.** A variance
  path with `values = 0` produces a singular implied covariance matrix before
  the optimizer even starts.
- **Identification.** Latent factors typically need at least one fixed loading
  (e.g., `values = 1, free = FALSE`) or a fixed variance to set the scale.
- **Means model:** If `mxData` has `type = "raw"`, OpenMx fits a means model.
  Saturated means (one free mean path per manifest variable from `"one"`) are
  common but not required — means can also be modelled at the latent level or
  constrained to zero by omitting the mean paths entirely.

---

## 8. Modifying an Existing Model

To add or replace components in an existing `mxModel`, pass the existing model
as the first argument:

```r
model <- mxModel(model, newPath)          # add a path
model <- mxModel(model, mxData(...))      # replace data
```

It is also valid to directly modify matrix values via `$`:

```r
model$A$values[1, 1] <- 5
model$S$free["x1", "x1"] <- TRUE
```

Always use `$`, not `@`, when accessing named model components this way.

---

## 9. `mxAutoStart()`

`mxAutoStart()` computes data-based starting values and can help convergence.
However, it can fail with certain model structures or missing data patterns.
**This project's converter deliberately skips `mxAutoStart()`** — users can
call it manually if needed:

```r
model <- mxAutoStart(model)
fit   <- mxRun(model)
```

Do not add `mxAutoStart()` calls to the converter without being asked.

---

## 10. Package Namespace in Package Code

In R package code (files under `R/`), always qualify OpenMx calls:

```r
OpenMx::mxModel(...)
OpenMx::mxPath(...)
OpenMx::mxRun(...)
```

`OpenMx` must be listed in `Imports:` in `DESCRIPTION` (it already is). Do not
use `library(OpenMx)` or `require(OpenMx)` inside package functions.
