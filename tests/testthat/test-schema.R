test_that("validateSchema accepts valid schema list", {
  schema <- list(
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
  fixture_path <- system.file(
    "extdata/graph.example.json",
    package = "visualWebTool"
  )
  
  skip_if_not(file.exists(fixture_path), 
              message = "Example schema not found")
  
  schema <- loadSchema(fixture_path)
  
  expect_is(schema, "list")
  expect_true("models" %in% names(schema))
})

test_that("saveSchema writes valid JSON", {
  schema <- list(
    models = list(m1 = list()),
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
  expect_identical(loaded, schema)
})
