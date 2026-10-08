verbFixtureSchema <- function() {
  list(
    schemaVersion = 0,
    models = list(
      m1 = list(
        label = "m1",
        nodes = list(
          list(label = "F1", type = "variable"),
          list(label = "F2", type = "variable"),
          list(label = "x1", type = "variable"),
          list(label = "x2", type = "variable"),
          list(label = "y2", type = "variable")
        ),
        paths = list(
          list(from = "F1", to = "x1", numberOfArrows = 1, freeParameter = TRUE, value = 1),
          list(from = "F1", to = "F2", numberOfArrows = 2, freeParameter = TRUE, value = 0.5)
        )
      )
    )
  )
}

nodeByLabel <- function(gm, label) {
  Find(function(n) identical(n$label, label), gm@schema$models[[1]]$nodes)
}

pathByEndpoints <- function(gm, from, to, numberOfArrows = NULL) {
  # Numeric equality, not identical(): numberOfArrows may be stored as
  # integer or double depending on how the path was created (see the same
  # note in R/verbs.R's .pathMatchesFilter()).
  Find(function(p) {
    identical(p$from, from) && identical(p$to, to) &&
      (is.null(numberOfArrows) || isTRUE(p$numberOfArrows == numberOfArrows))
  }, gm@schema$models[[1]]$paths)
}

# ---- nodes() -----------------------------------------------------------

test_that("nodes() returns every node when no filter is given", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_length(nodes(gm), 5)
})

test_that("nodes() filters by label and returns a length-1 list on a match", {
  gm <- as.GraphModel(verbFixtureSchema())
  result <- nodes(gm, label = "F1")
  expect_length(result, 1)
  expect_equal(result[[1]]$label, "F1")
})

test_that("nodes() returns an empty list, not an error, when nothing matches", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_equal(nodes(gm, label = "nonexistent"), list())
})

test_that("nodes() filters by type", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_length(nodes(gm, type = "variable"), 5)
  expect_length(nodes(gm, type = "constant"), 0)
})

test_that("nodes() errors on a non-GraphModel argument", {
  expect_error(nodes(list()), "graphModel must be a GraphModel object")
})

# ---- paths() -------------------------------------------------------------

test_that("paths() returns every path when no filter is given", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_length(paths(gm), 2)
})

test_that("paths() matches a directed path order-sensitively", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_length(paths(gm, from = "F1", to = "x1"), 1)
  expect_length(paths(gm, from = "x1", to = "F1"), 0)
})

test_that("paths() matches a covariance path regardless of from/to order", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_length(paths(gm, from = "F1", to = "F2", numberOfArrows = 2), 1)
  expect_length(paths(gm, from = "F2", to = "F1", numberOfArrows = 2), 1)
})

test_that("paths() filters by numberOfArrows", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_length(paths(gm, numberOfArrows = 1), 1)
  expect_length(paths(gm, numberOfArrows = 2), 1)
})

test_that("paths() errors on a non-GraphModel argument", {
  expect_error(paths(list()), "graphModel must be a GraphModel object")
})

# ---- addVariable() ---------------------------------------------------------

test_that("addVariable() adds a node and does not mutate the original object", {
  gm <- as.GraphModel(verbFixtureSchema())
  gm2 <- addVariable(gm, "F3", manifestLatent = "latent", description = "third factor")
  expect_null(nodeByLabel(gm, "F3"))
  added <- nodeByLabel(gm2, "F3")
  expect_equal(added$type, "variable")
  expect_equal(added$variableCharacteristics$manifestLatent, "latent")
  expect_equal(added$description, "third factor")
})

test_that("addVariable() errors on a duplicate label", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_error(addVariable(gm, "F1"), "already exists")
})

test_that("addVariable() errors on an invalid manifestLatent value", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_error(addVariable(gm, "F3", manifestLatent = "bogus"),
               'manifestLatent must be "manifest", "latent", or NULL')
})

test_that("addVariable() errors on a non-GraphModel argument", {
  expect_error(addVariable(list(), "F3"), "graphModel must be a GraphModel object")
})

# ---- removeVariable() ------------------------------------------------------

test_that("removeVariable() removes the node and cascades incident paths with a warning", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_warning(gm2 <- removeVariable(gm, "F1"), "2 incident path")
  expect_null(nodeByLabel(gm2, "F1"))
  expect_length(paths(gm2), 0)
  # original untouched
  expect_length(paths(gm), 2)
})

test_that("removeVariable() errors if the node does not exist", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_error(removeVariable(gm, "nonexistent"), "No variable node found")
})

test_that("removeVariable() will not remove a non-variable node sharing the label (E.2)", {
  schema <- verbFixtureSchema()
  schema$models$m1$nodes[[length(schema$models$m1$nodes) + 1]] <- list(label = "d1", type = "dataset")
  gm <- as.GraphModel(schema)
  expect_error(removeVariable(gm, "d1"), "No variable node found")
  expect_false(is.null(nodeByLabel(gm, "d1")))
})

test_that("addVariable() accepts tags", {
  gm <- as.GraphModel(verbFixtureSchema())
  gm2 <- addVariable(gm, "F3", tags = c("exogenous", "wave1"))
  expect_equal(nodeByLabel(gm2, "F3")$tags, c("exogenous", "wave1"))
})

# ---- changeVariable() -------------------------------------------------------

test_that("changeVariable() sets manifestLatent via setManifestLatent()'s existing validation", {
  gm <- as.GraphModel(verbFixtureSchema())
  gm2 <- changeVariable(gm, "F1", manifestLatent = "latent")
  expect_equal(nodeByLabel(gm2, "F1")$variableCharacteristics$manifestLatent, "latent")
})

test_that("changeVariable() FALSE clears manifestLatent (reverts to inference)", {
  gm <- as.GraphModel(verbFixtureSchema())
  gm2 <- changeVariable(gm, "F1", manifestLatent = "latent")
  gm3 <- changeVariable(gm2, "F1", manifestLatent = FALSE)
  expect_null(nodeByLabel(gm3, "F1")$variableCharacteristics$manifestLatent)
})

test_that("changeVariable() NA (default) leaves manifestLatent unchanged", {
  gm <- as.GraphModel(verbFixtureSchema())
  gm2 <- changeVariable(gm, "F1", manifestLatent = "latent")
  gm3 <- changeVariable(gm2, "F1", description = "a note")
  expect_equal(nodeByLabel(gm3, "F1")$variableCharacteristics$manifestLatent, "latent")
  expect_equal(nodeByLabel(gm3, "F1")$description, "a note")
})

test_that("changeVariable() FALSE clears description", {
  gm <- as.GraphModel(verbFixtureSchema())
  gm2 <- changeVariable(gm, "F1", description = "a note")
  gm3 <- changeVariable(gm2, "F1", description = FALSE)
  expect_null(nodeByLabel(gm3, "F1")$description)
})

test_that("changeVariable() errors if nothing to change is supplied", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_error(changeVariable(gm, "F1"), "requires at least one of")
})

test_that("changeVariable() errors if the variable does not exist", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_error(changeVariable(gm, "nonexistent", description = "x"), "No variable node found")
})

# ---- addPath() --------------------------------------------------------------

test_that("addPath() adds a path and does not mutate the original object", {
  gm <- as.GraphModel(verbFixtureSchema())
  gm2 <- addPath(gm, from = "x2", to = "y2", numberOfArrows = 2, freeParameter = TRUE)
  expect_null(pathByEndpoints(gm, "x2", "y2"))
  added <- pathByEndpoints(gm2, "x2", "y2")
  expect_equal(added$numberOfArrows, 2L)
  expect_true(added$freeParameter)
})

test_that("addPath() errors if a path already exists at that identity", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_error(
    addPath(gm, from = "F1", to = "x1", numberOfArrows = 1),
    "already exists"
  )
})

test_that("addPath() errors on an invalid numberOfArrows", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_error(addPath(gm, from = "x2", to = "y2", numberOfArrows = 3), "must be 1 or 2")
})

test_that("addPath() single-path behaviour is unchanged", {
  gm <- as.GraphModel(verbFixtureSchema())
  gm2 <- addPath(gm, "F2", "y2", 1, freeParameter = "b", value = 0.3, tags = "reg")
  expect_length(paths(gm2), 3)
  expect_equal(
    pathByEndpoints(gm2, "F2", "y2"),
    list(from = "F2", to = "y2", numberOfArrows = 1L, freeParameter = "b", value = 0.3, tags = "reg")
  )
  # fixed: freeParameter omitted entirely, as before
  gm3 <- addPath(gm, "F2", "y2", 1, freeParameter = FALSE)
  expect_null(pathByEndpoints(gm3, "F2", "y2")$freeParameter)
  expect_null(pathByEndpoints(gm3, "F2", "y2")$value)
  # the duplicate message is exactly the old one, with no list wrapper
  expect_error(
    addPath(gm, "F1", "x1", 1),
    "^A path already exists between 'F1' and 'x1' with numberOfArrows = 1\\. Use changePath\\(\\) to modify it or convertPath\\(\\) to change its arrow count\\.$"
  )
  expect_error(addPath(gm, "x2", "y2", 1, freeParameter = ""), "non-empty string")
})

pathFanFixture <- function() {
  GraphModel() |>
    addConstant() |>
    addVariable("F") |>
    addVariable("x1") |>
    addVariable("x2") |>
    addVariable("x3") |>
    addVariable("y")
}

test_that("addPath() fans out from one node to many", {
  gm <- addPath(pathFanFixture(), "1", c("x1", "x2", "x3"), 1, freeParameter = TRUE, value = 0)
  added <- paths(gm, from = "1")
  expect_length(added, 3)
  expect_equal(vapply(added, `[[`, "", "to"), c("x1", "x2", "x3"))
  for (p in added) {
    expect_equal(p$numberOfArrows, 1L)
    expect_true(p$freeParameter)
    expect_equal(p$value, 0)
  }
})

test_that("addPath() fans in from many nodes to one", {
  gm <- addPath(pathFanFixture(), c("x1", "x2", "x3"), "y", 1, freeParameter = TRUE)
  added <- paths(gm, to = "y")
  expect_length(added, 3)
  expect_equal(vapply(added, `[[`, "", "from"), c("x1", "x2", "x3"))
})

test_that("addPath() adds pairwise paths, including self-loops", {
  gm <- addPath(pathFanFixture(), c("x1", "x2", "x1"), c("x1", "x2", "x2"), 2, freeParameter = TRUE)
  expect_length(paths(gm), 3)
  expect_false(is.null(pathByEndpoints(gm, "x1", "x1", 2)))
  expect_false(is.null(pathByEndpoints(gm, "x2", "x2", 2)))
  expect_false(is.null(pathByEndpoints(gm, "x1", "x2", 2)))
})

test_that("addPath() accepts per-path numberOfArrows", {
  gm <- addPath(pathFanFixture(), c("F", "x1"), c("x1", "x1"), c(1, 2))
  expect_equal(pathByEndpoints(gm, "F", "x1")$numberOfArrows, 1L)
  expect_equal(pathByEndpoints(gm, "x1", "x1")$numberOfArrows, 2L)
  expect_error(
    addPath(pathFanFixture(), "F", c("x1", "x2", "x3"), c(1, 1)),
    "numberOfArrows (length 2) must be length 1 or the number of paths (3)", fixed = TRUE
  )
})

test_that("addPath() errors on mismatched from/to lengths rather than recycling", {
  gm <- pathFanFixture()
  expect_error(
    addPath(gm, c("x1", "x2"), c("x1", "x2", "x3"), 2),
    "from (length 2) and to (length 3) must have the same length, or one of them must be length 1",
    fixed = TRUE
  )
  expect_error(addPath(gm, character(0), "x1", 1), "non-empty character vector")
  expect_error(addPath(gm, c("F", NA), "x1", 1), "no NAs")
})

test_that("addPath() takes freeParameter and value per path", {
  gm <- addPath(pathFanFixture(), "F", c("x1", "x2", "x3"), 1,
                freeParameter = list(FALSE, TRUE, "lam3"), value = c(1, 0.5, NA))
  p1 <- pathByEndpoints(gm, "F", "x1")
  p2 <- pathByEndpoints(gm, "F", "x2")
  p3 <- pathByEndpoints(gm, "F", "x3")
  expect_null(p1$freeParameter)
  expect_equal(p1$value, 1)
  expect_true(p2$freeParameter)
  expect_equal(p2$value, 0.5)
  expect_equal(p3$freeParameter, "lam3")
  expect_null(p3$value)

  # atomic character and logical vectors work too
  gm2 <- addPath(pathFanFixture(), "F", c("x1", "x2"), 1, freeParameter = c("a", "b"))
  expect_equal(pathByEndpoints(gm2, "F", "x2")$freeParameter, "b")
  gm3 <- addPath(pathFanFixture(), "F", c("x1", "x2"), 1, freeParameter = c(FALSE, TRUE))
  expect_null(pathByEndpoints(gm3, "F", "x1")$freeParameter)
  expect_true(pathByEndpoints(gm3, "F", "x2")$freeParameter)

  # a single name applies to every path (an equality constraint)
  gm4 <- addPath(pathFanFixture(), "F", c("x1", "x2"), 1, freeParameter = "lam")
  expect_equal(pathByEndpoints(gm4, "F", "x1")$freeParameter, "lam")
  expect_equal(pathByEndpoints(gm4, "F", "x2")$freeParameter, "lam")

  # tags apply to every path
  gm5 <- addPath(pathFanFixture(), "F", c("x1", "x2"), 1, tags = c("loading", "cfa"))
  expect_equal(pathByEndpoints(gm5, "F", "x2")$tags, c("loading", "cfa"))
})

test_that("addPath() rejects freeParameter/value of the wrong length or content", {
  gm <- pathFanFixture()
  expect_error(
    addPath(gm, "F", c("x1", "x2", "x3"), 1, freeParameter = c(TRUE, FALSE)),
    "freeParameter (length 2) must be length 1 or the number of paths (3)", fixed = TRUE
  )
  expect_error(
    addPath(gm, "F", c("x1", "x2", "x3"), 1, value = c(1, 2)),
    "value (length 2) must be length 1 or the number of paths (3)", fixed = TRUE
  )
  expect_error(addPath(gm, "F", c("x1", "x2"), 1, freeParameter = c("a", "")), "non-empty string")
  expect_error(addPath(gm, "F", c("x1", "x2"), 1, freeParameter = c(TRUE, NA)), "non-empty string")
  expect_error(addPath(gm, "F", "x1", 1, value = "1"), "value must be numeric")
})

test_that("addPath() is atomic: one bad pair adds nothing, and every bad pair is named", {
  gm <- addPath(pathFanFixture(), "F", "x1", 1)
  err <- tryCatch(
    addPath(gm, "F", c("x1", "x2", "nope", "x3"), 1),
    error = function(e) conditionMessage(e)
  )
  expect_match(err, "2 of 4 requested paths can't be added, so none were", fixed = TRUE)
  expect_match(err, "A path already exists between 'F' and 'x1'", fixed = TRUE)
  expect_match(err, "'F' -> 'nope': no node labeled 'nope'.", fixed = TRUE)
  expect_length(paths(gm), 1)
  expect_null(pathByEndpoints(gm, "F", "x2"))
})

test_that("addPath() rejects duplicates within one call, symmetrically for 2-arrow paths", {
  gm <- pathFanFixture()
  expect_error(
    addPath(gm, c("x1", "x2"), c("x2", "x1"), 2),
    "'x2' <-> 'x1': requested more than once in this call.", fixed = TRUE
  )
  expect_error(
    addPath(gm, c("F", "F"), c("x1", "x1"), 1),
    "'F' -> 'x1': requested more than once in this call.", fixed = TRUE
  )
  # opposite directions are distinct 1-arrow paths
  gm2 <- addPath(gm, c("x1", "x2"), c("x2", "x1"), 1)
  expect_length(paths(gm2), 2)
  # same endpoints, different arrow counts, are distinct
  gm3 <- addPath(gm, c("x1", "x1"), c("x2", "x2"), c(1, 2))
  expect_length(paths(gm3), 2)
})

test_that("addPath() detects an existing 2-arrow path stored in the opposite order", {
  gm <- as.GraphModel(verbFixtureSchema())  # has F1 <-> F2
  expect_error(addPath(gm, "F2", "F1", 2), "already exists between 'F2' and 'F1'")
  err <- tryCatch(
    addPath(gm, c("x2", "F2"), c("y2", "F1"), 2),
    error = function(e) conditionMessage(e)
  )
  expect_match(err, "1 of 2 requested paths", fixed = TRUE)
  expect_null(pathByEndpoints(gm, "x2", "y2"))
})

test_that("addPath() enforces legal endpoints", {
  gm <- pathFanFixture()
  expect_error(addPath(gm, "F", "nope", 1), "'F' -> 'nope': no node labeled 'nope'.", fixed = TRUE)
  expect_error(addPath(gm, "a", "b", 2), "no node labeled 'a' or 'b'", fixed = TRUE)
  expect_error(addPath(gm, "x1", "1", 1), "constant node '1' can only be the source of a one-headed path", fixed = TRUE)
  expect_error(addPath(gm, "1", "x1", 2), "constant node '1' can only be the source", fixed = TRUE)
  expect_error(addPath(gm, "1", "1", 2), "constant node '1' can only be the source", fixed = TRUE)
  expect_error(addPath(gm, "x1", "x1", 1), "a self-loop must be two-headed", fixed = TRUE)
})

# ---- removePath() -----------------------------------------------------------

test_that("removePath() removes an existing path", {
  gm <- as.GraphModel(verbFixtureSchema())
  gm2 <- removePath(gm, from = "F1", to = "x1", numberOfArrows = 1)
  expect_null(pathByEndpoints(gm2, "F1", "x1"))
  expect_length(paths(gm2), 1)
})

test_that("removePath() errors if no matching path exists", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_error(removePath(gm, from = "x2", to = "y2"), "No path found")
})

test_that("removePath() errors on an ambiguous from/to without numberOfArrows", {
  schema <- verbFixtureSchema()
  schema$models$m1$paths[[3]] <- list(from = "F1", to = "x1", numberOfArrows = 2, freeParameter = TRUE)
  gm <- as.GraphModel(schema)
  expect_error(removePath(gm, from = "F1", to = "x1"), "Ambiguous")
})

# ---- changePath() -----------------------------------------------------------

test_that("changePath() changes freeParameter and value without touching identity", {
  gm <- as.GraphModel(verbFixtureSchema())
  gm2 <- changePath(gm, from = "F1", to = "F2", numberOfArrows = 2, freeParameter = "cov12", value = 0.9)
  changed <- pathByEndpoints(gm2, "F1", "F2", 2L)
  expect_equal(changed$freeParameter, "cov12")
  expect_equal(changed$value, 0.9)
  # original untouched
  original <- pathByEndpoints(gm, "F1", "F2", 2L)
  expect_true(original$freeParameter)
})

test_that("changePath() errors if the path does not exist", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_error(
    changePath(gm, from = "x2", to = "y2", freeParameter = TRUE),
    "No path found"
  )
})

test_that("changePath() errors if nothing to change is supplied", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_error(
    changePath(gm, from = "F1", to = "x1", numberOfArrows = 1),
    "requires at least one of"
  )
})

test_that("changePath() FALSE clears freeParameter (fixes the path)", {
  gm <- as.GraphModel(verbFixtureSchema())
  gm2 <- changePath(gm, from = "F1", to = "x1", numberOfArrows = 1, freeParameter = FALSE)
  changed <- pathByEndpoints(gm2, "F1", "x1", 1L)
  expect_null(changed$freeParameter)
})

test_that("changePath() errors on freeParameter = ''", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_error(
    changePath(gm, from = "F1", to = "x1", numberOfArrows = 1, freeParameter = ""),
    "non-empty string"
  )
})

test_that("changePath() NA (default) leaves freeParameter/value unchanged", {
  gm <- as.GraphModel(verbFixtureSchema())
  gm2 <- changePath(gm, from = "F1", to = "x1", numberOfArrows = 1, value = 2)
  changed <- pathByEndpoints(gm2, "F1", "x1", 1L)
  expect_true(changed$freeParameter)
  expect_equal(changed$value, 2)
})

test_that("changePath() value must be numeric or NA", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_error(
    changePath(gm, from = "F1", to = "x1", numberOfArrows = 1, value = "oops"),
    "value must be numeric or NA"
  )
})

test_that("changePath() addTags/removeTags are idempotent by default (strict = FALSE)", {
  gm <- as.GraphModel(verbFixtureSchema())
  gm2 <- changePath(gm, from = "F1", to = "x1", numberOfArrows = 1, addTags = "invariant")
  gm3 <- changePath(gm2, from = "F1", to = "x1", numberOfArrows = 1, addTags = "invariant")
  expect_equal(pathByEndpoints(gm3, "F1", "x1", 1L)$tags, "invariant")

  gm4 <- changePath(gm3, from = "F1", to = "x1", numberOfArrows = 1, removeTags = "nonexistent")
  expect_equal(pathByEndpoints(gm4, "F1", "x1", 1L)$tags, "invariant")
})

test_that("changePath() addTags/removeTags error under strict = TRUE when a no-op would occur", {
  gm <- as.GraphModel(verbFixtureSchema())
  gm2 <- changePath(gm, from = "F1", to = "x1", numberOfArrows = 1, addTags = "invariant")
  expect_error(
    changePath(gm2, from = "F1", to = "x1", numberOfArrows = 1, addTags = "invariant", strict = TRUE),
    "already tagged"
  )
  expect_error(
    changePath(gm, from = "F1", to = "x1", numberOfArrows = 1, removeTags = "nonexistent", strict = TRUE),
    "not tagged"
  )
})

# ---- E.1: structural path verbs must not touch type: "data" paths ---------

dataPathFixtureSchema <- function() {
  schema <- verbFixtureSchema()
  schema$models$m1$nodes[[length(schema$models$m1$nodes) + 1]] <- list(label = "d1", type = "dataset")
  schema$models$m1$paths[[length(schema$models$m1$paths) + 1]] <- list(from = "d1", to = "x1", type = "data", label = "x1_col")
  schema
}

test_that("removePath() refuses to remove a data connection, with a redirecting error", {
  gm <- as.GraphModel(dataPathFixtureSchema())
  expect_error(removePath(gm, from = "d1", to = "x1"), "data connection")
  expect_length(paths(gm, from = "d1", to = "x1"), 1)
})

test_that("changePath() refuses to change a data connection", {
  gm <- as.GraphModel(dataPathFixtureSchema())
  expect_error(
    changePath(gm, from = "d1", to = "x1", freeParameter = TRUE),
    "data connection"
  )
})

test_that("convertPath() refuses to convert a data connection", {
  gm <- as.GraphModel(dataPathFixtureSchema())
  expect_error(
    convertPath(gm, from = "d1", to = "x1", numberOfArrows = 1),
    "data connection"
  )
})

test_that("addPath() refuses a dataset endpoint and redirects to connectData()", {
  # A structural path from a dataset node is never legal (the web editor
  # draws dataset -> variable as a data connection), so addPath() redirects
  # rather than adding a structural path alongside the data connection.
  gm <- as.GraphModel(dataPathFixtureSchema())
  expect_error(
    addPath(gm, from = "d1", to = "x1", numberOfArrows = 1, freeParameter = TRUE),
    "'d1' is a dataset node. Use connectData()", fixed = TRUE
  )
  expect_length(paths(gm, from = "d1", to = "x1"), 1)
})

# ---- convertPath() ----------------------------------------------------------

test_that("convertPath() converts a covariance into a directed path with the requested direction", {
  gm <- as.GraphModel(verbFixtureSchema())
  gm2 <- convertPath(gm, from = "F1", to = "F2", numberOfArrows = 1)
  expect_null(pathByEndpoints(gm2, "F1", "F2", 2L))
  directed <- pathByEndpoints(gm2, "F1", "F2", 1L)
  expect_equal(directed$from, "F1")
  expect_equal(directed$to, "F2")
  # original untouched
  expect_equal(pathByEndpoints(gm, "F1", "F2", 2L)$numberOfArrows, 2L)
})

test_that("convertPath() assigns the requested direction even if the covariance was stored in the opposite order", {
  schema <- verbFixtureSchema()
  # Store the F1<->F2 covariance as (from=F2, to=F1) instead of (from=F1, to=F2)
  schema$models$m1$paths[[2]] <- list(from = "F2", to = "F1", numberOfArrows = 2, freeParameter = TRUE)
  gm <- as.GraphModel(schema)

  gm2 <- convertPath(gm, from = "F1", to = "F2", numberOfArrows = 1)
  directed <- pathByEndpoints(gm2, "F1", "F2", 1L)
  expect_equal(directed$from, "F1")
  expect_equal(directed$to, "F2")
})

test_that("convertPath() distinguishes a reciprocal pair -- converting one direction leaves the other untouched", {
  schema <- verbFixtureSchema()
  schema$models$m1$paths <- list(
    list(from = "F1", to = "F2", numberOfArrows = 1, freeParameter = TRUE),
    list(from = "F2", to = "F1", numberOfArrows = 1, freeParameter = TRUE)
  )
  gm <- as.GraphModel(schema)

  gm2 <- convertPath(gm, from = "F1", to = "F2", numberOfArrows = 2)
  expect_null(pathByEndpoints(gm2, "F1", "F2", 1L))
  expect_length(paths(gm2, from = "F1", to = "F2", numberOfArrows = 2), 1)
  # the reciprocal edge is untouched
  untouched <- pathByEndpoints(gm2, "F2", "F1", 1L)
  expect_false(is.null(untouched))
})

test_that("convertPath() errors if there is nothing to convert", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_error(
    convertPath(gm, from = "x2", to = "y2", numberOfArrows = 1),
    "No numberOfArrows = 2 path found"
  )
})

test_that("convertPath() errors on an invalid numberOfArrows", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_error(convertPath(gm, from = "F1", to = "F2", numberOfArrows = 3), "must be 1 or 2")
})
