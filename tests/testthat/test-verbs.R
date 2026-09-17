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
  expect_error(removeVariable(gm, "nonexistent"), "No node found")
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

test_that("changePath() errors if neither freeParameter nor value is supplied", {
  gm <- as.GraphModel(verbFixtureSchema())
  expect_error(
    changePath(gm, from = "F1", to = "x1", numberOfArrows = 1),
    "requires at least one of freeParameter or value"
  )
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
