# Fixture: a small model with one variable bound to data (x, eligible for
# manifest) and one variable with no incoming data path at all (y, latent-only).
manifestLatentFixtureSchema <- function() {
  list(
    schemaVersion = 0,
    models = list(
      m1 = list(
        label = "m1",
        nodes = list(
          list(label = "surveyData", type = "dataset"),
          list(label = "x", type = "variable"),
          list(label = "y", type = "variable"),
          list(label = "f", type = "variable")
        ),
        paths = list(
          list(from = "surveyData", to = "x", type = "data", label = "x"),
          list(from = "f", to = "y", numberOfArrows = 1, freeParameter = TRUE, value = 1)
        )
      )
    )
  )
}

nodeByLabel <- function(gm, label) {
  nodes <- gm@schema$models[[1]]$nodes
  Find(function(n) identical(n$label, label), nodes)
}

test_that("setManifestLatent sets an explicit lock on a data-bound variable", {
  gm <- as.GraphModel(manifestLatentFixtureSchema())
  gm2 <- setManifestLatent(gm, "x", "manifest")

  expect_equal(nodeByLabel(gm2, "x")$variableCharacteristics$manifestLatent, "manifest")
  # Original object is untouched (copy-on-modify)
  expect_null(nodeByLabel(gm, "x")$variableCharacteristics$manifestLatent)
})

test_that("setManifestLatent sets an explicit latent lock regardless of data binding", {
  gm <- as.GraphModel(manifestLatentFixtureSchema())
  gm2 <- setManifestLatent(gm, "x", "latent")

  expect_equal(nodeByLabel(gm2, "x")$variableCharacteristics$manifestLatent, "latent")
})

test_that("setManifestLatent errors when promoting a variable with no data path to manifest", {
  gm <- as.GraphModel(manifestLatentFixtureSchema())

  expect_error(
    setManifestLatent(gm, "f", "manifest"),
    "no incoming data path"
  )
})

test_that("setManifestLatent(value = NULL) clears an existing lock", {
  gm <- as.GraphModel(manifestLatentFixtureSchema())
  gm <- setManifestLatent(gm, "x", "manifest")
  expect_equal(nodeByLabel(gm, "x")$variableCharacteristics$manifestLatent, "manifest")

  gm2 <- setManifestLatent(gm, "x", NULL)
  expect_null(nodeByLabel(gm2, "x")$variableCharacteristics$manifestLatent)
})

test_that("setManifestLatent defaults value to NULL (clearing)", {
  gm <- as.GraphModel(manifestLatentFixtureSchema())
  gm <- setManifestLatent(gm, "y", "latent")

  gm2 <- setManifestLatent(gm, "y")
  expect_null(nodeByLabel(gm2, "y")$variableCharacteristics$manifestLatent)
})

test_that("setManifestLatent errors on an unrecognized nodeId", {
  gm <- as.GraphModel(manifestLatentFixtureSchema())

  expect_error(
    setManifestLatent(gm, "nonexistent", "manifest"),
    "nodeId not found"
  )
})

test_that("setManifestLatent errors on a non-variable node", {
  gm <- as.GraphModel(manifestLatentFixtureSchema())

  expect_error(
    setManifestLatent(gm, "surveyData", "manifest"),
    "not a variable node"
  )
})

test_that("setManifestLatent errors on an invalid value", {
  gm <- as.GraphModel(manifestLatentFixtureSchema())

  expect_error(
    setManifestLatent(gm, "x", "observed"),
    'value must be "manifest", "latent", or NULL'
  )
})

test_that("setManifestLatent errors on a non-GraphModel input", {
  expect_error(
    setManifestLatent(list(), "x", "manifest"),
    "graphModel must be a GraphModel object"
  )
})
