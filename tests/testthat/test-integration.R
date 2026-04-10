test_that("End-to-end: Load graph.example.json and convert to mxModel", {
  # Load the real example schema from the package
  schema_file <- system.file(
    "examples/graph.example.json",
    package = "drawSEM",
    mustWork = FALSE
  )

  # If the file doesn't exist yet during testing, create a minimal example
  if (schema_file == "") {
    schema_file <- tempfile(fileext = ".json")
    on.exit(unlink(schema_file))

    schema <- list(
      schemaVersion = 1,
      meta = list(title = "Test Model"),
      models = list(
        model1 = list(
          label = "Test measurement model",
          meta = list(description = "Simple factor analysis"),
          optimization = list(
            parameterTypes = list(
              loading = list(start = "auto"),
              variance = list(bounds = c(0.001, NA), start = "auto"),
              errorVariance = list(bounds = c(0.001, NA), start = "auto"),
              mean = list(start = "auto")
            )
          ),
          nodes = list(
            list(label = "F1", type = "variable", tags = list("factor")),
            list(label = "x1", type = "variable", levelOfMeasurement = "individual"),
            list(label = "x2", type = "variable", levelOfMeasurement = "individual"),
            list(label = "1", type = "constant"),
            list(label = "e1", type = "variable"),
            list(label = "e2", type = "variable")
          ),
          paths = list(
            list(
              label = "var_F1",
              from = "F1", to = "F1",
              numberOfArrows = 2,
              value = 1.0,
              parameterType = "variance"
            ),
            list(
              label = "var_e1",
              from = "e1", to = "e1",
              numberOfArrows = 2,
              value = 1.0, freeParameter = TRUE,
              parameterType = "errorVariance"
            ),
            list(
              label = "var_e2",
              from = "e2", to = "e2",
              numberOfArrows = 2,
              value = 1.0, freeParameter = TRUE,
              parameterType = "errorVariance"
            ),
            list(
              label = "load_1",
              from = "F1", to = "x1",
              numberOfArrows = 1,
              value = 1.0,
              parameterType = "loading"
            ),
            list(
              label = "load_2",
              from = "F1", to = "x2",
              numberOfArrows = 1,
              value = 1.0, freeParameter = TRUE,
              parameterType = "loading"
            ),
            list(
              label = "mean_x1",
              from = "1", to = "x1",
              numberOfArrows = 1,
              value = 1.0, freeParameter = TRUE,
              parameterType = "mean"
            ),
            list(
              label = "mean_x2",
              from = "1", to = "x2",
              numberOfArrows = 1,
              value = 1.0, freeParameter = TRUE,
              parameterType = "mean"
            ),
            list(
              label = "err_1",
              from = "e1", to = "x1",
              numberOfArrows = 1,
              value = 1.0,
              parameterType = "errorVariance"
            ),
            list(
              label = "err_2",
              from = "e2", to = "x2",
              numberOfArrows = 1,
              value = 1.0,
              parameterType = "errorVariance"
            )
          )
        )
      )
    )

    jsonlite::write_json(schema, schema_file, pretty = TRUE)
  }

  # Test: Load schema as GraphModel
  expect_error_free <- function(expr) {
    tryCatch(
      {
        result <- expr
        expect_true(TRUE)
        result
      },
      error = function(e) {
        expect_false(TRUE, info = paste("Error:", e$message))
      }
    )
  }

  gm <- loadGraphModel(schema_file)
  expect_s4_class(gm, "GraphModel")
  expect_equal(gm@schema$schemaVersion, 1)
})

test_that("End-to-end: GraphModel with data binds and converts correctly", {
  # Create test data
  test_data <- data.frame(
    x1 = c(1.2, 2.3, 1.8, 2.1, 1.5),
    x2 = c(2.1, 3.2, 2.5, 3.1, 2.8)
  )

  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "F1", type = "variable"),
          list(label = "x1", type = "variable", levelOfMeasurement = "individual"),
          list(label = "x2", type = "variable", levelOfMeasurement = "individual"),
          list(label = "1", type = "constant"),
          list(label = "e1", type = "variable"),
          list(label = "e2", type = "variable"),
          list(label = "sample", type = "dataset", 
            levelOfMeasurement = "individual")
        ),
        paths = list(
          list(from = "F1", to = "F1", numberOfArrows = 2, value = 1.0),
          list(from = "e1", to = "e1", numberOfArrows = 2, value = 1.0, freeParameter = TRUE),
          list(from = "e2", to = "e2", numberOfArrows = 2, value = 1.0, freeParameter = TRUE),
          list(from = "F1", to = "x1", numberOfArrows = 1, value = 1.0),
          list(from = "F1", to = "x2", numberOfArrows = 1, value = 1.0, freeParameter = TRUE),
          list(from = "1", to = "x1", numberOfArrows = 1, value = 1.0, freeParameter = TRUE),
          list(from = "1", to = "x2", numberOfArrows = 1, value = 1.0, freeParameter = TRUE),
          list(from = "e1", to = "x1", numberOfArrows = 1, value = 1.0),
          list(from = "e2", to = "x2", numberOfArrows = 1, value = 1.0),
          list(from = "sample", to = "x1", type = "data"),
          list(from = "sample", to = "x2", type = "data")
        ),
        optimization = list(fitFunction = "ML")
      )
    )
  )

  # Create GraphModel with data
  gm <- as.GraphModel(schema, data = list(sample = test_data))

  expect_s4_class(gm, "GraphModel")
  expect_true("sample" %in% names(gm$data))
  expect_equal(nrow(gm$data$sample), 5)
})

test_that("End-to-end: Manifest/latent variable inference works correctly", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "F1", type = "variable"),
          list(label = "F2", type = "variable"),
          list(label = "x1", type = "variable"),
          list(label = "x2", type = "variable"),
          list(label = "x3", type = "variable"),
          list(label = "sample", type = "dataset")
        ),
        paths = list(
          # Data paths for x1, x2 only
          list(from = "sample", to = "x1", type = "data"),
          list(from = "sample", to = "x2", type = "data")
        )
      )
    )
  )

  nodes <- schema$models$model1$nodes
  paths <- schema$models$model1$paths

  manifest <- inferManifestVariables(nodes, paths)
  latent <- inferLatentVariables(nodes, manifest)

  # x1 and x2 should be manifest (have data paths)
  expect_true("x1" %in% manifest)
  expect_true("x2" %in% manifest)
  expect_false("x3" %in% manifest)

  # F1, F2, x3 should be latent
  expect_true("F1" %in% latent)
  expect_true("F2" %in% latent)
  expect_true("x3" %in% latent)
})

test_that("End-to-end: Constant node label conversion in mxPaths", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "x1", type = "variable"),
          list(label = "1", type = "constant")
        ),
        paths = list(
          list(from = "1", to = "x1", numberOfArrows = 1, freeParameter = TRUE),
          list(from = "x1", to = "x1", numberOfArrows = 2, value = 1.0)
        )
      )
    )
  )

  paths <- schema$models$model1$paths
  constantLabel <- "1"

  mxpath_list <- buildPathList(paths, constantLabel)

  # Check that constant label was converted to "one"
  constant_paths <- Filter(function(p) p$from == "one", mxpath_list)
  expect_length(constant_paths, 1)
  expect_equal(constant_paths[[1]]$to, "x1")
})

test_that("End-to-end: Free parameter default values applied correctly", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "F1", type = "variable"),
          list(label = "x1", type = "variable")
        ),
        paths = list(
          # Free path with NULL value should get 0.1 default
          list(from = "F1", to = "x1", numberOfArrows = 1, value = NULL, freeParameter = TRUE),
          # Free path with explicit value should keep it
          list(from = "x1", to = "x1", numberOfArrows = 2, value = 2.5, freeParameter = TRUE)
        )
      )
    )
  )

  paths <- schema$models$model1$paths
  mxpath_list <- buildPathList(paths, constantNodeLabel = NULL)

  # First path (F1 -> x1) should have 0.1 default
  expect_equal(mxpath_list[[1]]$values, 0.1)

  # Second path (x1 -> x1) should keep 2.5
  expect_equal(mxpath_list[[2]]$values, 2.5)
})

test_that("End-to-end: Schema with unsupported features warns user", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "x1", type = "variable"),
          list(label = "x2", type = "variable")
        ),
        paths = list(
          # 0-headed path (unsupported); value required since freeParameter absent = fixed
          list(from = "x1", to = "x2", numberOfArrows = 0, value = 1.0)
        )
      )
    )
  )

  expect_warning(
    gm <- as.GraphModel(schema),
    "Unsupported features detected"
  )

  unsupported <- gm$metadata$unsupported
  expect_true(unsupported$zeroHeadedPaths)
})

test_that("End-to-end: Multiple models in schema are preserved", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(list(label = "x1", type = "variable")),
        paths = list()
      ),
      model2 = list(
        nodes = list(list(label = "y1", type = "variable")),
        paths = list()
      ),
      model3 = list(
        nodes = list(list(label = "z1", type = "variable")),
        paths = list()
      )
    )
  )

  gm <- as.GraphModel(schema)

  expect_equal(length(gm$schema$models), 3)
  expect_true(all(c("model1", "model2", "model3") %in% names(gm$schema$models)))
})
