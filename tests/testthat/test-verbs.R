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

# ---- vectorized removePath() / changePath() / convertPath() ----------------

# F -> x1/x2/x3 loadings, x1/x2/x3 residual variances, an x1 <-> x2
# covariance stored as x2 <-> x1, a y regression on x1..x3, and a data
# connection d1 -> x1.
pathVecFixture <- function() {
  gm <- pathFanFixture() |>
    addPath("F", c("x1", "x2", "x3"), 1, freeParameter = TRUE, value = 0.5) |>
    addPath(c("x1", "x2", "x3"), c("x1", "x2", "x3"), 2, freeParameter = TRUE, value = 1) |>
    addPath("x2", "x1", 2, freeParameter = TRUE, value = 0.1) |>
    addPath(c("x1", "x2", "x3"), "y", 1, freeParameter = TRUE)
  schema <- gm@schema
  schema$models[[1]]$nodes[[length(schema$models[[1]]$nodes) + 1]] <- list(label = "d1", type = "dataset")
  schema$models[[1]]$paths[[length(schema$models[[1]]$paths) + 1]] <- list(from = "d1", to = "x1", type = "data", label = "x1")
  as.GraphModel(schema)
}

errMessage <- function(expr) tryCatch({ expr; NA_character_ }, error = function(e) conditionMessage(e))

test_that("removePath() takes the four from/to shapes", {
  gm <- pathVecFixture()
  n0 <- length(paths(gm))
  # fan-out
  gm2 <- removePath(gm, "F", c("x1", "x2", "x3"), 1)
  expect_length(paths(gm2, from = "F"), 0)
  expect_length(paths(gm2), n0 - 3)
  # fan-in
  gm3 <- removePath(gm, c("x1", "x2", "x3"), "y")
  expect_length(paths(gm3, to = "y"), 0)
  expect_length(paths(gm3), n0 - 3)
  # pairwise
  gm4 <- removePath(gm, c("x1", "x2"), c("x1", "x2"), 2)
  expect_null(pathByEndpoints(gm4, "x1", "x1", 2))
  expect_null(pathByEndpoints(gm4, "x2", "x2", 2))
  expect_false(is.null(pathByEndpoints(gm4, "x3", "x3", 2)))
  expect_length(paths(gm4), n0 - 2)
  # one to one
  expect_length(paths(removePath(gm, "F", "x1", 1)), n0 - 1)
  # original untouched
  expect_length(paths(gm), n0)
})

test_that("the path verbs reject other from/to shapes with addPath()'s message", {
  gm <- pathVecFixture()
  msg <- "from (length 2) and to (length 3) must have the same length, or one of them must be length 1"
  expect_error(removePath(gm, c("x1", "x2"), c("x1", "x2", "x3"), 2), msg, fixed = TRUE)
  expect_error(changePath(gm, c("x1", "x2"), c("x1", "x2", "x3"), 2, value = 1), msg, fixed = TRUE)
  expect_error(convertPath(gm, c("x1", "x2"), c("x1", "x2", "x3"), 1), msg, fixed = TRUE)
  for (verb in list(removePath, convertPath)) {
    expect_error(verb(gm, character(0), "x1", 1), "non-empty character vector")
    expect_error(verb(gm, c("F", NA), "x1", 1), "no NAs")
  }
  expect_error(changePath(gm, "F", c("x1", NA), value = 1), "no NAs")
})

test_that("removePath() takes numberOfArrows per path", {
  gm <- pathVecFixture()
  gm2 <- removePath(gm, c("F", "x1"), c("x1", "x1"), c(1, 2))
  expect_null(pathByEndpoints(gm2, "F", "x1", 1))
  expect_null(pathByEndpoints(gm2, "x1", "x1", 2))
  expect_error(
    removePath(gm, "F", c("x1", "x2", "x3"), c(1, 1)),
    "numberOfArrows (length 2) must be length 1 or the number of paths (3)", fixed = TRUE
  )
  expect_error(removePath(gm, "F", "x1", 3), "numberOfArrows must be 1, 2, or NULL", fixed = TRUE)
})

test_that("removePath() is atomic: one bad pair removes nothing, and every bad pair is named", {
  gm <- pathVecFixture()
  err <- errMessage(removePath(gm, "F", c("x1", "nope", "y", "x3"), 1))
  expect_match(err, "2 of 4 requested paths can't be removed, so none were:", fixed = TRUE)
  expect_match(err, "  * 'F' -> 'nope': no path found with numberOfArrows = 1.", fixed = TRUE)
  expect_match(err, "  * 'F' -> 'y': no path found with numberOfArrows = 1.", fixed = TRUE)
  expect_length(paths(gm, from = "F"), 3)
})

test_that("removePath() matches 2-arrow paths either way round, and catches duplicates", {
  gm <- pathVecFixture()  # covariance stored as x2 <-> x1
  gm2 <- removePath(gm, c("x1", "x3"), c("x2", "x3"), 2)
  expect_length(paths(gm2, from = "x1", to = "x2", numberOfArrows = 2), 0)
  expect_null(pathByEndpoints(gm2, "x3", "x3", 2))

  expect_error(
    removePath(gm, c("x1", "x2"), c("x2", "x1"), 2),
    "1 of 2 requested paths can't be removed, so none were:\n  * 'x2' <-> 'x1': requested more than once in this call.",
    fixed = TRUE
  )
  # with numberOfArrows omitted, too
  expect_error(
    removePath(gm, c("F", "F"), c("x1", "x1")),
    "'F' -> 'x1': requested more than once in this call.", fixed = TRUE
  )
  expect_length(paths(gm), length(paths(pathVecFixture())))
})

test_that("removePath() refuses data connections and ambiguity in a vector call", {
  gm <- pathVecFixture()
  err <- errMessage(removePath(gm, c("F", "d1", "x1"), c("x2", "x1", "x2")))
  # x1 -> x2 doesn't exist but x1 <-> x2 does, so with no numberOfArrows
  # that pair matches just the covariance
  expect_match(err, "1 of 3 requested paths can't be removed", fixed = TRUE)
  expect_match(err, "'d1' -> 'x1': a data connection, not a structural path -- use connectData()/disconnectData()/reconnectData() instead.", fixed = TRUE)
  expect_length(paths(gm, from = "d1"), 1)
  expect_length(paths(gm, from = "F", to = "x2"), 1)

  gm2 <- addPath(gm, "x1", "x2", 1)
  err2 <- errMessage(removePath(gm2, c("F", "x1"), c("x2", "x2")))
  expect_match(err2, "'x1' -> 'x2': ambiguous, 2 paths found. Specify numberOfArrows to disambiguate.", fixed = TRUE)
  expect_length(paths(gm2, from = "F", to = "x2"), 1)
})

test_that("removePath() single-path errors are unchanged", {
  gm <- pathVecFixture()
  expect_error(removePath(gm, "F", "y", 1), "^No path found between 'F' and 'y' with numberOfArrows = 1\\.$")
  expect_error(removePath(gm, "F", "y"), "^No path found between 'F' and 'y'\\.$")
  expect_error(
    removePath(gm, "d1", "x1"),
    "^'d1' to 'x1' is a data connection, not a structural path -- use connectData\\(\\)/disconnectData\\(\\)/reconnectData\\(\\) instead\\.$"
  )
  gm2 <- addPath(gm, "x1", "x2", 1)
  expect_error(
    removePath(gm2, "x1", "x2"),
    "^Ambiguous: 2 paths found between 'x1' and 'x2'\\. Specify numberOfArrows to disambiguate\\.$"
  )
})

test_that("changePath() takes the four from/to shapes", {
  gm <- pathVecFixture()
  gm2 <- changePath(gm, "F", c("x1", "x2", "x3"), 1, value = 0.7)
  for (t in c("x1", "x2", "x3")) expect_equal(pathByEndpoints(gm2, "F", t, 1)$value, 0.7)
  gm3 <- changePath(gm, c("x1", "x2", "x3"), "y", freeParameter = "b")
  for (f in c("x1", "x2", "x3")) expect_equal(pathByEndpoints(gm3, f, "y", 1)$freeParameter, "b")
  gm4 <- changePath(gm, c("x1", "x2"), c("x1", "x2"), 2, freeParameter = FALSE)
  expect_null(pathByEndpoints(gm4, "x1", "x1", 2)$freeParameter)
  expect_null(pathByEndpoints(gm4, "x2", "x2", 2)$freeParameter)
  expect_true(pathByEndpoints(gm4, "x3", "x3", 2)$freeParameter)
  gm5 <- changePath(gm, "F", "x1", 1, value = 2)
  expect_equal(pathByEndpoints(gm5, "F", "x1", 1)$value, 2)
  expect_equal(pathByEndpoints(gm5, "F", "x2", 1)$value, 0.5)
})

test_that("changePath() takes freeParameter, value and numberOfArrows per path, with NA/FALSE per path", {
  gm <- pathVecFixture()
  gm2 <- changePath(gm, "F", c("x1", "x2", "x3"), 1,
                    freeParameter = list(NA, FALSE, "lam3"), value = c(1, NA, 0.9))
  p1 <- pathByEndpoints(gm2, "F", "x1", 1)
  p2 <- pathByEndpoints(gm2, "F", "x2", 1)
  p3 <- pathByEndpoints(gm2, "F", "x3", 1)
  expect_true(p1$freeParameter)   # NA: unchanged
  expect_equal(p1$value, 1)
  expect_null(p2$freeParameter)   # FALSE: cleared
  expect_equal(p2$value, 0.5)     # NA: unchanged
  expect_equal(p3$freeParameter, "lam3")
  expect_equal(p3$value, 0.9)

  # atomic vectors with NA elements work too
  gm3 <- changePath(gm, "F", c("x1", "x2"), 1, freeParameter = c(NA, "b"))
  expect_true(pathByEndpoints(gm3, "F", "x1", 1)$freeParameter)
  expect_equal(pathByEndpoints(gm3, "F", "x2", 1)$freeParameter, "b")
  gm4 <- changePath(gm, "F", c("x1", "x2"), 1, freeParameter = c(FALSE, NA))
  expect_null(pathByEndpoints(gm4, "F", "x1", 1)$freeParameter)
  expect_true(pathByEndpoints(gm4, "F", "x2", 1)$freeParameter)

  # per-path numberOfArrows
  gm5 <- changePath(gm, c("F", "x1"), c("x1", "x1"), c(1, 2), value = c(3, 4))
  expect_equal(pathByEndpoints(gm5, "F", "x1", 1)$value, 3)
  expect_equal(pathByEndpoints(gm5, "x1", "x1", 2)$value, 4)

  # all-NA is still "nothing to change"
  expect_error(changePath(gm, "F", c("x1", "x2"), 1, freeParameter = c(NA, NA)), "requires at least one of")
})

test_that("changePath() rejects per-path arguments of the wrong length or content", {
  gm <- pathVecFixture()
  expect_error(
    changePath(gm, "F", c("x1", "x2", "x3"), 1, freeParameter = c(TRUE, FALSE)),
    "freeParameter (length 2) must be length 1 or the number of paths (3)", fixed = TRUE
  )
  expect_error(
    changePath(gm, "F", c("x1", "x2", "x3"), 1, value = c(1, 2)),
    "value (length 2) must be length 1 or the number of paths (3)", fixed = TRUE
  )
  expect_error(
    changePath(gm, "F", c("x1", "x2", "x3"), c(1, 1), value = 1),
    "numberOfArrows (length 2) must be length 1 or the number of paths (3)", fixed = TRUE
  )
  expect_error(changePath(gm, "F", c("x1", "x2"), 1, freeParameter = list(NA, "")), "non-empty string")
  expect_error(changePath(gm, "F", c("x1", "x2"), 1, value = list(1, "a")), "value must be numeric or NA")
  expect_error(changePath(gm, "F", c("x1", "x2"), 1, value = c(TRUE, FALSE)), "value must be numeric or NA")
})

test_that("changePath() tags apply to every path", {
  gm <- pathVecFixture()
  gm2 <- changePath(gm, "F", c("x1", "x2"), 1, addTags = c("loading", "cfa"))
  expect_equal(pathByEndpoints(gm2, "F", "x1", 1)$tags, c("loading", "cfa"))
  expect_equal(pathByEndpoints(gm2, "F", "x2", 1)$tags, c("loading", "cfa"))
  gm3 <- changePath(gm2, "F", c("x1", "x2", "x3"), 1, removeTags = "cfa")
  expect_equal(pathByEndpoints(gm3, "F", "x2", 1)$tags, "loading")
  expect_null(pathByEndpoints(gm3, "F", "x3", 1)$tags)

  # strict: every path whose tag change would be a no-op is named, and nothing changes
  err <- errMessage(changePath(gm2, "F", c("x1", "x2", "x3"), 1, addTags = "loading", value = 9, strict = TRUE))
  expect_match(err, "2 of 3 requested paths can't be changed, so none were:", fixed = TRUE)
  expect_match(err, "Path 'F' -> 'x1' already tagged: loading.", fixed = TRUE)
  expect_match(err, "Path 'F' -> 'x2' already tagged: loading.", fixed = TRUE)
  expect_null(pathByEndpoints(gm2, "F", "x3", 1)$tags)
  expect_equal(pathByEndpoints(gm2, "F", "x3", 1)$value, 0.5)
})

test_that("changePath() is atomic, matches 2-arrow paths either way round, and catches duplicates", {
  gm <- pathVecFixture()
  err <- errMessage(changePath(gm, c("F", "F", "d1"), c("x1", "y", "x1"), value = 5))
  expect_match(err, "2 of 3 requested paths can't be changed, so none were:", fixed = TRUE)
  expect_match(err, "'F' -> 'y': no path found.", fixed = TRUE)
  expect_match(err, "'d1' -> 'x1': a data connection, not a structural path", fixed = TRUE)
  expect_equal(pathByEndpoints(gm, "F", "x1", 1)$value, 0.5)

  # x1 <-> x2 is stored as x2 <-> x1
  gm2 <- changePath(gm, c("x1", "x3"), c("x2", "x3"), 2, value = 0.3)
  expect_equal(pathByEndpoints(gm2, "x2", "x1", 2)$value, 0.3)
  expect_equal(pathByEndpoints(gm2, "x3", "x3", 2)$value, 0.3)

  expect_error(
    changePath(gm, c("x2", "x1"), c("x1", "x2"), 2, value = 0),
    "'x1' <-> 'x2': requested more than once in this call.", fixed = TRUE
  )
})

test_that("changePath() single-path errors are unchanged", {
  gm <- pathVecFixture()
  expect_error(changePath(gm, "F", "y", value = 1), "^No path found between 'F' and 'y'\\.$")
  expect_error(
    changePath(gm, "d1", "x1", value = 1),
    "^'d1' to 'x1' is a data connection, not a structural path -- use connectData\\(\\)/disconnectData\\(\\)/reconnectData\\(\\) instead\\.$"
  )
  gm2 <- changePath(gm, "F", "x1", 1, addTags = "a")
  expect_error(
    changePath(gm2, "F", "x1", 1, addTags = "a", strict = TRUE),
    "^Path 'F' -> 'x1' already tagged: a\\. Use strict = FALSE to ignore\\.$"
  )
})

test_that("convertPath() takes the four from/to shapes and per-path numberOfArrows", {
  gm <- pathVecFixture()
  # fan-out: loadings become covariances
  gm2 <- convertPath(gm, "F", c("x1", "x2", "x3"), 2)
  expect_length(paths(gm2, from = "F", numberOfArrows = 2), 3)
  expect_length(paths(gm2, from = "F", numberOfArrows = 1), 0)
  # fan-in
  gm3 <- convertPath(gm, c("x1", "x3"), "y", 2)
  expect_length(paths(gm3, to = "y", numberOfArrows = 2), 2)
  expect_equal(pathByEndpoints(gm3, "x2", "y")$numberOfArrows, 1L)
  # pairwise, choosing each resulting direction
  gm4 <- convertPath(gm2, c("x1", "F"), c("F", "x2"), 1)
  expect_false(is.null(pathByEndpoints(gm4, "x1", "F", 1)))
  expect_false(is.null(pathByEndpoints(gm4, "F", "x2", 1)))
  # one to one
  expect_equal(pathByEndpoints(convertPath(gm, "F", "x1", 2), "F", "x1")$numberOfArrows, 2L)
  # per-path new arrow counts
  gm5 <- convertPath(gm, c("x1", "F"), c("x2", "x3"), c(1, 2))
  expect_equal(pathByEndpoints(gm5, "x1", "x2")$numberOfArrows, 1L)
  expect_equal(pathByEndpoints(gm5, "F", "x3")$numberOfArrows, 2L)

  expect_error(
    convertPath(gm, "F", c("x1", "x2", "x3"), c(2, 2)),
    "numberOfArrows (length 2) must be length 1 or the number of paths (3)", fixed = TRUE
  )
  expect_error(convertPath(gm, "F", c("x1", "x2"), c(2, 3)), "must be 1 or 2")
})

test_that("convertPath() is atomic and names every bad pair", {
  gm <- pathVecFixture()
  err <- errMessage(convertPath(gm, "F", c("x1", "y", "x2"), 2))
  expect_match(err, "1 of 3 requested paths can't be converted, so none were:\n  * 'F' -> 'y': no numberOfArrows = 1 path to convert.", fixed = TRUE)
  expect_length(paths(gm, from = "F", numberOfArrows = 1), 3)

  err2 <- errMessage(convertPath(gm, c("F", "d1"), c("x1", "x1"), 2))
  expect_match(err2, "'d1' -> 'x1': a data connection, not a structural path -- convertPath() does not apply.", fixed = TRUE)
  expect_equal(pathByEndpoints(gm, "F", "x1")$numberOfArrows, 1L)
})

test_that("convertPath() matches 2-arrow paths either way round, and catches duplicates and collisions", {
  gm <- pathVecFixture()  # x1 <-> x2 stored as x2 <-> x1
  gm2 <- convertPath(gm, c("x1", "x3"), c("x2", "y"), c(1, 2))
  directed <- pathByEndpoints(gm2, "x1", "x2", 1)
  expect_equal(directed$from, "x1")
  expect_equal(directed$value, 0.1)

  expect_error(
    convertPath(gm, c("x1", "x2"), c("x2", "x1"), 1),
    "'x2' <-> 'x1': requested more than once in this call.", fixed = TRUE
  )

  # a reciprocal pair can't both become the same covariance
  gm3 <- addPath(pathFanFixture(), c("x1", "x2"), c("x2", "x1"), 1)
  expect_error(
    convertPath(gm3, c("x1", "x2"), c("x2", "x1"), 2),
    "'x2' <-> 'x1': would become the same path as another conversion in this call.", fixed = TRUE
  )
  expect_length(paths(gm3, numberOfArrows = 1), 2)
})

test_that("convertPath() single-path errors are unchanged", {
  gm <- pathVecFixture()
  expect_error(convertPath(gm, "F", "y", 2), "^No numberOfArrows = 1 path found between 'F' and 'y' to convert\\.$")
  expect_error(
    convertPath(gm, "d1", "x1", 2),
    "^'d1' to 'x1' is a data connection, not a structural path -- convertPath\\(\\) does not apply\\.$"
  )
  expect_error(convertPath(gm, "F", "x1", 3), "^numberOfArrows must be 1 or 2$")
})
