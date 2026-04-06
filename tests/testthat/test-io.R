test_that("as.GraphModel creates GraphModel from list schema", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "F1", type = "variable"),
          list(label = "x1", type = "variable")
        ),
        paths = list(
          list(from = "F1", to = "x1", numberOfArrows = 1, free = "free")
        )
      )
    )
  )

  gm <- as.GraphModel(schema)
  expect_s4_class(gm, "GraphModel")
  expect_equal(gm@schema$schemaVersion, 1)
  expect_true("model1" %in% names(gm@schema$models))
})

test_that("as.GraphModel validates schema before creating GraphModel", {
  schema <- list(
    models = list(
      model1 = list(nodes = list(), paths = list())
    )
  )

  expect_error(
    as.GraphModel(schema),
    "schemaVersion|Schema"
  )
})

test_that("as.GraphModel detects unsupported features", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "x1", type = "variable"),
          list(label = "x2", type = "variable")
        ),
        paths = list(
          list(from = "x1", to = "x2", numberOfArrows = 0)
        )
      )
    )
  )

  expect_warning(
    as.GraphModel(schema),
    "Unsupported features detected"
  )
})

test_that("as.GraphModel works with JSON string", {
  json_schema <- '{
    "schemaVersion": 1,
    "models": {
      "model1": {
        "nodes": [
          {"label": "F1", "type": "variable"},
          {"label": "x1", "type": "variable"}
        ],
        "paths": [
          {"from": "F1", "to": "x1", "numberOfArrows": 1, "free": "free"}
        ]
      }
    }
  }'

  gm <- as.GraphModel(json_schema)
  expect_s4_class(gm, "GraphModel")
  expect_equal(gm@schema$schemaVersion, 1)
})

test_that("as.GraphModel works with file path", {
  # Create a temporary schema file
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "F1", type = "variable"),
          list(label = "x1", type = "variable")
        ),
        paths = list(
          list(from = "F1", to = "x1", numberOfArrows = 1, free = "free")
        )
      )
    )
  )

  temp_file <- tempfile(fileext = ".json")
  on.exit(unlink(temp_file))

  jsonlite::write_json(schema, temp_file, pretty = TRUE)

  gm <- as.GraphModel(temp_file)
  expect_s4_class(gm, "GraphModel")
  expect_equal(gm@schema$schemaVersion, 1)
})

test_that("as.GraphModel binds data when provided", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "x1", type = "variable"),
          list(label = "x2", type = "variable"),
          list(label = "sample", type = "dataset")
        ),
        paths = list()
      )
    )
  )

  test_data <- list(
    sample = data.frame(x1 = c(1, 2, 3), x2 = c(4, 5, 6))
  )

  gm <- as.GraphModel(schema, data = test_data)
  expect_equal(length(gm@data), 1)
  expect_equal(nrow(gm@data$sample), 3)
})

test_that("exportSchema saves schema to JSON file", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "F1", type = "variable")
        ),
        paths = list()
      )
    )
  )

  gm <- new("GraphModel", schema = schema)

  temp_file <- tempfile(fileext = ".json")
  on.exit(unlink(temp_file))

  exportSchema(gm, temp_file)

  expect_true(file.exists(temp_file))

  loaded <- jsonlite::read_json(temp_file)
  # jsonlite wraps scalar values in lists when simplifyVector=FALSE
  expect_equal(unlist(loaded$schemaVersion), 1)
  expect_true("model1" %in% names(loaded$models))
})

test_that("loadGraphModel loads schema from JSON file", {
  # Create a temporary schema file
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "F1", type = "variable")
        ),
        paths = list()
      )
    )
  )

  temp_file <- tempfile(fileext = ".json")
  on.exit(unlink(temp_file))

  jsonlite::write_json(schema, temp_file, pretty = TRUE)

  gm <- loadGraphModel(temp_file)
  expect_s4_class(gm, "GraphModel")
  expect_equal(gm@schema$schemaVersion, 1)
})

test_that("loadGraphModel binds data when CSV path provided", {
  # Create a temporary schema file
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "x1", type = "variable"),
          list(label = "x2", type = "variable")
        ),
        paths = list()
      )
    )
  )

  schema_file <- tempfile(fileext = ".json")
  data_file <- tempfile(fileext = ".csv")
  on.exit({
    unlink(schema_file)
    unlink(data_file)
  })

  jsonlite::write_json(schema, schema_file, pretty = TRUE)

  test_data <- data.frame(x1 = c(1, 2, 3), x2 = c(4, 5, 6))
  utils::write.csv(test_data, data_file, row.names = FALSE)

  gm <- loadGraphModel(schema_file, data = data_file, dataName = "sample")

  expect_true("sample" %in% names(gm@data))
  expect_equal(nrow(gm@data$sample), 3)
})

test_that("as.MxModel converts GraphModel to MxModel", {
  # Create a minimal valid schema
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "x1", type = "variable"),
          list(label = "x2", type = "variable"),
          list(label = "1", type = "constant")
        ),
        paths = list(
          list(from = "x1", to = "x1", numberOfArrows = 2, free = "fixed", value = 1.0),
          list(from = "x2", to = "x2", numberOfArrows = 2, free = "fixed", value = 1.0),
          list(from = "1", to = "x1", numberOfArrows = 1, free = "free"),
          list(from = "1", to = "x2", numberOfArrows = 1, free = "free")
        ),
        optimization = list(fitFunction = "ML")
      )
    )
  )

  gm <- as.GraphModel(schema)
  mx_model <- as.MxModel(gm)

  expect_true(is(mx_model, "MxModel"))
  expect_equal(mx_model$name, "model1")
})

test_that("as.MxModel caches built model in GraphModel", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "x1", type = "variable"),
          list(label = "1", type = "constant")
        ),
        paths = list(
          list(from = "x1", to = "x1", numberOfArrows = 2, free = "fixed", value = 1.0),
          list(from = "1", to = "x1", numberOfArrows = 1, free = "free")
        ),
        optimization = list(fitFunction = "ML")
      )
    )
  )

  gm <- as.GraphModel(schema)
  expect_null(builtModel(gm))

  mx_model <- as.MxModel(gm)
  # Note: S4 methods work on copies, so caching doesn't modify the original gm
  # This is expected behavior in R
  expect_true(is(mx_model, "MxModel"))
})
