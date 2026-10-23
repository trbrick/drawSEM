test_that("validateSchema accepts valid schema list", {
  schema <- list(
    schemaVersion = 0,
    models = list(
      model1 = list(
        nodes = list(),
        paths = list()
      )
    ),
    expansions = list(),
    levelMap = list()
  )
  
  expect_invisible(validateSchema(schema, verbose = FALSE))
})

test_that("validateSchema rejects missing required fields", {
  invalid <- list(models = list(m1 = list()))
  
  expect_error(
    validateSchema(invalid, verbose = FALSE),
    "missing required fields"
  )
})

test_that("loadSchema reads JSON from file", {
  gm <- GraphModel() |> addVariable("x") |>
    addPath("x", "x", 2, freeParameter = TRUE, value = 1)
  fixture_path <- tempfile(fileext = ".json")
  on.exit(unlink(fixture_path))
  exportSchema(gm, fixture_path)

  schema <- loadSchema(fixture_path)

  expect_s4_class(schema, "GraphModel")
  expect_true("models" %in% names(schema@schema))
  expect_equal(nodes(schema)[[1]]$label, "x")
})

test_that("saveSchema writes valid JSON", {
  schema <- list(
    # Integer literal: loadSchema normalizes schemaVersion to integer, so the
    # fixture must match that for the round-trip identity check below.
    schemaVersion = 0L,
    models = list(
      m1 = list(
        nodes = list(),
        paths = list()
      )
    ),
    expansions = list(),
    levelMap = list()
  )
  
  temp_file <- tempfile(fileext = ".json")
  on.exit(unlink(temp_file), add = TRUE)
  
  result <- saveSchema(schema, temp_file)
  
  expect_equal(result, temp_file)
  expect_true(file.exists(temp_file))
  
  # Verify can be read back
  loaded <- loadSchema(temp_file)
  expect_s4_class(loaded, "GraphModel")
  expect_identical(loaded@schema, schema)
})
