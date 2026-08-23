# Fixture: a schema with a custom-labeled dataset, one loading, and any number
# of constant nodes each feeding a mean path to a distinct variable -- mirrors
# constantNodeSchema() in test-integration.R but adds visual positions and a
# non-default dataset label, since drawSemHints is what is supposed to carry
# both of those through a round trip via OpenMx.
hintRoundTripSchema <- function(constant_labels = "1", dataset_label = "surveyData") {
  nodes <- list(
    list(label = dataset_label, type = "dataset"),
    list(label = "x", type = "variable", visual = list(x = 10, y = 20)),
    list(label = "y", type = "variable")
  )
  paths <- list(
    list(from = dataset_label, to = "x", type = "data", label = "x"),
    list(from = dataset_label, to = "y", type = "data", label = "y"),
    list(
      from = "x", to = "x", numberOfArrows = 2, freeParameter = TRUE, value = 1,
      visual = list(curvature = 0.5)
    ),
    list(from = "y", to = "y", numberOfArrows = 2, freeParameter = TRUE, value = 1)
  )

  # One mean path per constant node; the first constant feeds x, the rest feed y.
  for (i in seq_along(constant_labels)) {
    lbl <- constant_labels[[i]]
    nodes[[length(nodes) + 1]] <- list(label = lbl, type = "constant")
    paths[[length(paths) + 1]] <- list(
      # Nonzero: as.GraphModel(MxModel) treats an exactly-zero M entry as
      # absent (it cannot distinguish "fixed at zero" from "free but still at
      # its zero start"), so a zero start value here would never round-trip
      # back into a path regardless of drawSemHints.
      from = lbl, to = if (i == 1) "x" else "y",
      numberOfArrows = 1, freeParameter = TRUE, value = 0.5
    )
  }

  list(
    schemaVersion = 0,
    models = list(m1 = list(label = "m1", nodes = nodes, paths = paths))
  )
}

test_that("stripDatasetObjects removes embedded data but keeps other datasetSource fields", {
  model <- list(
    label = "m1",
    nodes = list(
      list(label = "x", type = "variable"),
      list(
        label = "data", type = "dataset",
        datasetSource = list(
          type = "embedded", columnTypes = list(x = "number"), rowCount = 5,
          md5 = "abc", object = list(list(x = 1))
        )
      )
    )
  )

  stripped <- stripDatasetObjects(model)
  ds <- stripped$nodes[[2]]$datasetSource

  expect_null(ds$object)
  expect_equal(ds$type, "embedded")
  expect_equal(ds$rowCount, 5)
  expect_equal(ds$md5, "abc")
})

test_that("buildDrawSemHints produces a valid drawSemHints object", {
  schema <- hintRoundTripSchema()
  hints <- buildDrawSemHints(schema, "m1")

  expect_s4_class(hints, "drawSemHints")
  expect_equal(hints@schemaVersion, 0)
  expect_equal(hints@model$label, "m1")
  expect_match(hints@origin, "^drawSEM ")
  expect_match(hints@exported, "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$")
})

test_that("show(drawSemHints) prints a one-line summary", {
  schema <- hintRoundTripSchema()
  hints <- buildDrawSemHints(schema, "m1")

  output <- capture.output(show(hints))

  expect_length(output, 1)
  expect_match(output, "^drawSemHints: model 'm1', origin 'drawSEM ")
})

test_that("setValidity rejects a malformed drawSemHints at construction", {
  valid_args <- list(schemaVersion = 0, model = list(), origin = "drawSEM 0.1.0", exported = "2026-01-01T00:00:00Z")

  expect_error(
    do.call(new, c("drawSemHints", modifyList(valid_args, list(schemaVersion = c(0, 1))))),
    "schemaVersion"
  )
  expect_error(
    do.call(new, c("drawSemHints", modifyList(valid_args, list(model = "not a list")))),
    "model"
  )
  expect_error(
    do.call(new, c("drawSemHints", modifyList(valid_args, list(origin = c("a", "b"))))),
    "origin"
  )
  expect_error(
    do.call(new, c("drawSemHints", modifyList(valid_args, list(exported = 12345)))),
    "exported"
  )
})

test_that("readDrawSemHints returns NULL for a non-drawSemHints option value", {
  m <- OpenMx::mxModel("plain", OpenMx::mxMatrix("Full", 1, 1, name = "M"))
  # Something other than a drawSemHints object ended up at this option key --
  # e.g. a naive direct assignment by code that doesn't know the contract.
  m@options$drawSemHints <- list(model = "m1")

  expect_null(readDrawSemHints(m))
})

test_that("readDrawSemHints returns NULL, without warning, for a structurally-invalid drawSemHints", {
  schema <- hintRoundTripSchema()
  hints <- buildDrawSemHints(schema, "m1")
  # Bypasses setValidity: direct slot mutation doesn't re-validate, unlike new().
  hints@schemaVersion <- c(0, 1)

  m <- OpenMx::mxModel("plain", OpenMx::mxMatrix("Full", 1, 1, name = "M"))
  m@options$drawSemHints <- hints

  expect_no_warning(result <- readDrawSemHints(m))
  expect_null(result)
})

test_that("as.MxModel attaches valid drawSemHints", {
  set.seed(1)
  df <- data.frame(x = rnorm(50), y = rnorm(50))
  schema <- hintRoundTripSchema()
  gm <- as.GraphModel(schema, data = list(surveyData = df))

  om <- as.MxModel(gm)

  hints <- om@options$drawSemHints
  expect_s4_class(hints, "drawSemHints")
  expect_equal(hints@model$label, "m1")
})

test_that("attaching drawSemHints preserves other mxOptions already on the model", {
  # as.MxModel() sets @options$drawSemHints via a direct named-element
  # assignment (`om@options$drawSemHints <- ...`), which by ordinary R list
  # semantics only ever touches that one key. Regression guard in case a
  # future change replaces `@options` wholesale instead of assigning into it.
  set.seed(1)
  df <- data.frame(x = rnorm(50), y = rnorm(50))
  schema <- hintRoundTripSchema()
  gm <- as.GraphModel(schema, data = list(surveyData = df))

  # Pre-populate a real OpenMx option before the hints are attached, by
  # building the om_model the same way as.MxModel() does and then re-running
  # just the hints-attachment step on top of an already-optioned model.
  om <- OpenMx::mxOption(as.MxModel(gm), key = "Number of Threads", value = 2)
  om@options$drawSemHints <- buildDrawSemHints(gm@schema, "m1")

  expect_equal(om@options[["Number of Threads"]], 2)
  expect_s4_class(om@options$drawSemHints, "drawSemHints")

  # And the reverse order: setting a real option after hints are attached
  # must not disturb the hints either.
  om2 <- OpenMx::mxOption(as.MxModel(gm), key = "Number of Threads", value = 2)
  expect_s4_class(om2@options$drawSemHints, "drawSemHints")
  expect_equal(om2@options[["Number of Threads"]], 2)
})

test_that("readDrawSemHints returns NULL for a model with no hints", {
  m <- OpenMx::mxModel("plain", OpenMx::mxMatrix("Full", 1, 1, name = "M"))
  expect_null(readDrawSemHints(m))
})

test_that("readDrawSemHints returns NULL and warns on an unrecognized schemaVersion", {
  schema <- hintRoundTripSchema()
  hints <- buildDrawSemHints(schema, "m1")
  hints@schemaVersion <- 99

  m <- OpenMx::mxModel("plain", OpenMx::mxMatrix("Full", 1, 1, name = "M"))
  m@options$drawSemHints <- hints

  expect_warning(result <- readDrawSemHints(m), "schemaVersion")
  expect_null(result)
})

test_that("mxOption(reset = TRUE) drops drawSemHints, as documented", {
  set.seed(1)
  df <- data.frame(x = rnorm(50), y = rnorm(50))
  schema <- hintRoundTripSchema()
  gm <- as.GraphModel(schema, data = list(surveyData = df))
  om <- as.MxModel(gm)

  reset_om <- OpenMx::mxOption(om, key = "Calculate Hessian", value = "No", reset = TRUE)

  expect_null(readDrawSemHints(reset_om))
})

test_that("round trip through OpenMx restores visual positions and the dataset label", {
  set.seed(1)
  df <- data.frame(x = rnorm(50), y = rnorm(50))
  schema <- hintRoundTripSchema(dataset_label = "surveyData")
  gm <- as.GraphModel(schema, data = list(surveyData = df))

  om <- as.MxModel(gm)
  gm2 <- as.GraphModel(om)

  nodes2 <- gm2$schema$models$m1$nodes
  x_node <- Find(function(n) identical(n$label, "x"), nodes2)
  expect_equal(x_node$visual, list(x = 10, y = 20))

  dataset_nodes <- Filter(function(n) n$type == "dataset", nodes2)
  expect_equal(length(dataset_nodes), 1)
  expect_equal(dataset_nodes[[1]]$label, "surveyData")

  data_paths <- Filter(function(p) isTRUE(p$type == "data"), gm2$schema$models$m1$paths)
  expect_true(all(vapply(data_paths, function(p) identical(p$from, "surveyData"), logical(1))))

  # The residual-variance path on x carried a visual hint too.
  var_path <- Find(function(p) {
    identical(p$from, "x") && identical(p$to, "x") && identical(p$numberOfArrows, 2)
  }, gm2$schema$models$m1$paths)
  expect_equal(var_path$visual, list(curvature = 0.5))
})

test_that("round trip through OpenMx attributes each mean path to its own constant", {
  set.seed(1)
  df <- data.frame(x = rnorm(50), y = rnorm(50))
  schema <- hintRoundTripSchema(constant_labels = c("1", "1b"))
  gm <- as.GraphModel(schema, data = list(surveyData = df))

  om <- as.MxModel(gm)
  gm2 <- as.GraphModel(om)

  paths2 <- gm2$schema$models$m1$paths
  mean_to_x <- Find(function(p) identical(p$to, "x") && identical(p$numberOfArrows, 1) &&
    !isTRUE(p$type == "data"), paths2)
  mean_to_y <- Find(function(p) identical(p$to, "y") && identical(p$numberOfArrows, 1) &&
    !isTRUE(p$type == "data"), paths2)

  expect_equal(mean_to_x$from, "1")
  expect_equal(mean_to_y$from, "1b")

  const_nodes <- Filter(function(n) n$type == "constant", gm2$schema$models$m1$nodes)
  const_labels <- vapply(const_nodes, function(n) n$label, character(1))
  expect_setequal(const_labels, c("1", "1b"))
})

test_that("a hint-only constant with no live path still persists as a bare node", {
  set.seed(1)
  df <- data.frame(x = rnorm(50), y = rnorm(50))
  # "1c" is declared but never wired to a path -- fully inert, unlike "1"/"1b".
  schema <- hintRoundTripSchema(constant_labels = c("1", "1b"))
  schema$models$m1$nodes[[length(schema$models$m1$nodes) + 1]] <- list(label = "1c", type = "constant")
  gm <- as.GraphModel(schema, data = list(surveyData = df))

  om <- as.MxModel(gm)
  gm2 <- as.GraphModel(om)

  const_labels <- vapply(
    Filter(function(n) n$type == "constant", gm2$schema$models$m1$nodes),
    function(n) n$label, character(1)
  )
  expect_true("1c" %in% const_labels)
})

test_that("a hint-only dataset node persists when the live model has no mxData", {
  # Simulates a template/simulation model built by drawSEM (hints escrowed
  # with a dataset node) whose mxData was subsequently stripped on the R side.
  schema <- hintRoundTripSchema(dataset_label = "surveyData")
  hints <- buildDrawSemHints(schema, "m1")

  m <- OpenMx::mxModel(
    "m1", type = "RAM",
    manifestVars = c("x", "y"),
    OpenMx::mxPath(from = "x", to = "x", arrows = 2, free = TRUE, values = 1),
    OpenMx::mxPath(from = "y", to = "y", arrows = 2, free = TRUE, values = 1)
  )
  m@options$drawSemHints <- hints

  gm <- as.GraphModel(m)

  dataset_nodes <- Filter(function(n) n$type == "dataset", gm$schema$models$m1$nodes)
  expect_equal(length(dataset_nodes), 1)
  expect_equal(dataset_nodes[[1]]$label, "surveyData")
  expect_null(dataset_nodes[[1]]$datasetSource$object)
})

test_that("a plain OpenMx model with no hints falls back to defaults", {
  df <- data.frame(x = rnorm(20), y = rnorm(20))
  m <- OpenMx::mxModel(
    "plain", type = "RAM",
    manifestVars = c("x", "y"),
    OpenMx::mxData(df, type = "raw"),
    OpenMx::mxPath(from = "x", to = "x", arrows = 2, free = TRUE, values = 1),
    OpenMx::mxPath(from = "y", to = "y", arrows = 2, free = TRUE, values = 1),
    OpenMx::mxPath(
      from = "one", to = c("x", "y"), arrows = 1, free = TRUE, values = c(0.1, 0.1)
    )
  )

  gm <- as.GraphModel(m)

  const_nodes <- Filter(function(n) n$type == "constant", gm$schema$models$plain$nodes)
  expect_equal(length(const_nodes), 1)
  expect_equal(const_nodes[[1]]$label, "1")

  dataset_nodes <- Filter(function(n) n$type == "dataset", gm$schema$models$plain$nodes)
  expect_equal(dataset_nodes[[1]]$label, "data")
})

test_that("dropDrawSemHints removes only the drawSemHints option", {
  set.seed(1)
  df <- data.frame(x = rnorm(30), y = rnorm(30))
  schema <- hintRoundTripSchema()
  gm <- as.GraphModel(schema, data = list(surveyData = df))
  om <- as.MxModel(gm)
  om <- OpenMx::mxOption(om, key = "Number of Threads", value = 2)

  om2 <- dropDrawSemHints(om)

  expect_null(readDrawSemHints(om2))
  expect_equal(om2@options[["Number of Threads"]], 2)
  # The original object is untouched -- dropDrawSemHints() returns a copy.
  expect_s4_class(readDrawSemHints(om), "drawSemHints")
})

test_that("dropDrawSemHints errors on a non-MxModel", {
  expect_error(dropDrawSemHints(list()), "MxModel")
})
