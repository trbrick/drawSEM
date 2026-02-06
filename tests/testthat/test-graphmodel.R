test_that("GraphModel class instantiation with valid schema", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(),
        paths = list()
      )
    )
  )

  gm <- new("GraphModel", schema = schema)
  expect_s4_class(gm, "GraphModel")
  expect_equal(gm@schema$schemaVersion, 1)
  expect_true("model1" %in% names(gm@schema$models))
})

test_that("GraphModel fails with missing schemaVersion", {
  schema <- list(
    models = list(model1 = list(nodes = list(), paths = list()))
  )

  expect_error(
    new("GraphModel", schema = schema),
    "schemaVersion"
  )
})

test_that("GraphModel fails with missing models", {
  schema <- list(schemaVersion = 1)

  expect_error(
    new("GraphModel", schema = schema),
    "models"
  )
})

test_that("GraphModel initializes with empty data and metadata", {
  schema <- list(
    schemaVersion = 1,
    models = list(model1 = list(nodes = list(), paths = list()))
  )

  gm <- new("GraphModel", schema = schema)
  expect_length(gm@data, 0)
  expect_length(gm@metadata, 0)
  expect_equal(gm@lastBuiltModel, NULL)
})

test_that("GraphModel schema getter/setter works", {
  schema <- list(
    schemaVersion = 1,
    models = list(model1 = list(nodes = list(), paths = list()))
  )
  gm <- new("GraphModel", schema = schema)

  expect_equal(gm$schema, schema)

  new_schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(nodes = list(), paths = list()),
      model2 = list(nodes = list(), paths = list())
    )
  )

  gm$schema <- new_schema
  expect_equal(length(gm$schema$models), 2)
})

test_that("GraphModel data getter/setter works", {
  schema <- list(
    schemaVersion = 1,
    models = list(model1 = list(nodes = list(), paths = list()))
  )
  gm <- new("GraphModel", schema = schema)

  test_data <- list(sample = data.frame(x = c(1, 2, 3), y = c(4, 5, 6)))
  gm$data <- test_data

  expect_equal(length(gm$data), 1)
  expect_equal(nrow(gm$data$sample), 3)
})

test_that("GraphModel metadata getter/setter works", {
  schema <- list(
    schemaVersion = 1,
    models = list(model1 = list(nodes = list(), paths = list()))
  )
  gm <- new("GraphModel", schema = schema)

  test_metadata <- list(unsupported = list(), fitInfo = NULL)
  gm$metadata <- test_metadata

  expect_equal(gm$metadata$unsupported, list())
})

test_that("GraphModel show method displays information", {
  schema <- list(
    schemaVersion = 1,
    models = list(model1 = list(nodes = list(), paths = list()))
  )
  gm <- new("GraphModel", schema = schema)

  expect_output(show(gm), "GraphModel object")
  expect_output(show(gm), "model1")
})

test_that("GraphModel with multiple models", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(nodes = list(), paths = list()),
      model2 = list(nodes = list(), paths = list()),
      model3 = list(nodes = list(), paths = list())
    )
  )

  gm <- new("GraphModel", schema = schema)
  expect_length(gm$schema$models, 3)
  expect_output(show(gm), "3 model")
})

test_that("GraphModel lastBuiltModel tracking", {
  schema <- list(
    schemaVersion = 1,
    models = list(model1 = list(nodes = list(), paths = list()))
  )
  gm <- new("GraphModel", schema = schema)

  expect_null(builtModel(gm))

  # Mock a built model
  mock_model <- structure(list(name = "model1"), class = "mxModel")
  builtModel(gm) <- mock_model

  expect_equal(builtModel(gm)$name, "model1")
})
