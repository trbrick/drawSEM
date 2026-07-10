test_that("buildPathList constructs correct mxPath specifications", {
  paths <- list(
    list(from = "F1", to = "x1", numberOfArrows = 1, freeParameter = TRUE, value = 1.0),
    list(from = "x1", to = "x1", numberOfArrows = 2, value = 1.0)
  )

  result <- buildPathList(paths, constantNodeLabel = NULL)

  expect_length(result, 2)
  expect_equal(result[[1]]$from, "F1")
  expect_equal(result[[1]]$to, "x1")
  expect_equal(result[[1]]$arrows, 1)
  expect_true(result[[1]]$free)
  expect_equal(result[[1]]$values, 1.0)

  expect_equal(result[[2]]$arrows, 2)
  expect_false(result[[2]]$free)
  expect_equal(result[[2]]$values, 1.0)
})

test_that("buildPathList converts constant node label to 'one'", {
  paths <- list(
    list(from = "1", to = "x1", numberOfArrows = 1, freeParameter = TRUE)
  )

  result <- buildPathList(paths, constantNodeLabel = "1")

  expect_equal(result[[1]]$from, "one")
})

test_that("buildPathList applies 0.1 default for free null parameters", {
  paths <- list(
    list(from = "F1", to = "x1", numberOfArrows = 1, freeParameter = TRUE, value = NULL)
  )

  result <- buildPathList(paths, constantNodeLabel = NULL)

  expect_equal(result[[1]]$values, 0.1)
})

test_that("buildPathList preserves non-null values for free parameters", {
  paths <- list(
    list(from = "F1", to = "x1", numberOfArrows = 1, freeParameter = TRUE, value = 2.5)
  )

  result <- buildPathList(paths, constantNodeLabel = NULL)

  expect_equal(result[[1]]$values, 2.5)
})

test_that("buildPathList preserves labels when present", {
  paths <- list(
    list(from = "F1", to = "x1", numberOfArrows = 1, freeParameter = TRUE, label = "loading_1")
  )

  result <- buildPathList(paths, constantNodeLabel = NULL)

  expect_equal(result[[1]]$labels, "loading_1")
})

test_that("buildPathList uses freeParameter string as mxPath label for named free parameters", {
  paths <- list(
    list(from = "F1", to = "x1", numberOfArrows = 1, freeParameter = "lambda_x1", value = 0.8)
  )

  result <- buildPathList(paths, constantNodeLabel = NULL)

  expect_equal(result[[1]]$labels, "lambda_x1")
  expect_true(result[[1]]$free)
  expect_equal(result[[1]]$values, 0.8)
})

test_that("buildPathList enforces equality constraints via shared freeParameter name", {
  paths <- list(
    list(from = "F1", to = "x1", numberOfArrows = 1, freeParameter = "lambda", value = 1.0),
    list(from = "F1", to = "x2", numberOfArrows = 1, freeParameter = "lambda", value = 1.0)
  )

  result <- buildPathList(paths, constantNodeLabel = NULL)

  expect_equal(length(result), 2)
  expect_equal(result[[1]]$labels, "lambda")
  expect_equal(result[[2]]$labels, "lambda")
  expect_true(result[[1]]$free)
  expect_true(result[[2]]$free)
})

test_that("buildPathList: named freeParameter takes precedence over path$label", {
  paths <- list(
    list(from = "F1", to = "x1", numberOfArrows = 1,
         freeParameter = "param_name", label = "display_label", value = 1.0)
  )

  result <- buildPathList(paths, constantNodeLabel = NULL)

  # freeParameter string is the mxPath label (equality constraint name)
  expect_equal(result[[1]]$labels, "param_name")
})

test_that("getConstantNodeLabel identifies constant node correctly", {
  schema <- list(
    nodes = list(
      list(label = "F1", type = "variable"),
      list(label = "1", type = "constant"),
      list(label = "x1", type = "variable")
    )
  )

  result <- getConstantNodeLabel(schema$nodes)
  expect_equal(result, "1")
})

test_that("getConstantNodeLabel returns NULL when no constant node", {
  schema <- list(
    nodes = list(
      list(label = "F1", type = "variable"),
      list(label = "x1", type = "variable")
    )
  )

  result <- getConstantNodeLabel(schema$nodes)
  expect_null(result)
})

test_that("inferManifestVariables identifies variables with dataset paths", {
  nodes <- list(
    list(label = "F1", type = "variable"),
    list(label = "x1", type = "variable"),
    list(label = "x2", type = "variable"),
    list(label = "data", type = "dataset")
  )

  paths <- list(
    list(from = "data", to = "x1", type = "data"),
    list(from = "data", to = "x2", type = "data")
  )

  result <- inferManifestVariables(nodes, paths)
  expect_equal(sort(result), c("x1", "x2"))
  expect_false("F1" %in% result)
})

test_that("inferLatentVariables identifies non-manifest variables", {
  nodes <- list(
    list(label = "F1", type = "variable"),
    list(label = "x1", type = "variable"),
    list(label = "x2", type = "variable"),
    list(label = "data", type = "dataset")
  )

  paths <- list(
    list(from = "data", to = "x1", type = "data"),
    list(from = "data", to = "x2", type = "data")
  )

  manifest <- inferManifestVariables(nodes, paths)
  result <- inferLatentVariables(nodes, manifest)

  expect_equal(result, "F1")
  expect_false("x1" %in% result)
  expect_false("x2" %in% result)
})

test_that("collectUnsupportedFeatures detects 0-headed paths", {
  schema <- list(
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

  result <- collectUnsupportedFeatures(schema)
  expect_true("zeroHeadedPaths" %in% names(result))
  expect_true(result$zeroHeadedPaths)
})

test_that("collectUnsupportedFeatures detects link functions", {
  schema <- list(
    models = list(
      model1 = list(
        nodes = list(
          list(label = "F1", type = "linkFunction")
        ),
        paths = list()
      )
    )
  )

  result <- collectUnsupportedFeatures(schema)
  expect_true(result$linkFunctions)
})

test_that("collectUnsupportedFeatures detects priors", {
  schema <- list(
    models = list(
      model1 = list(
        nodes = list(),
        paths = list(
          list(
            from = "x1", to = "x2", numberOfArrows = 1,
            optimization = list(prior = list(distribution = "normal"))
          )
        )
      )
    )
  )

  result <- collectUnsupportedFeatures(schema)
  expect_true(result$priors)
})

test_that("renameDataColumns maps column names correctly", {
  data <- data.frame(
    col1 = c(1, 2, 3),
    col2 = c(4, 5, 6)
  )

  mapping <- list(x1 = "col1", x2 = "col2")

  result <- renameDataColumns(data, mapping)

  expect_equal(colnames(result), c("x1", "x2"))
  expect_equal(result$x1, data$col1)
  expect_equal(result$x2, data$col2)
})

test_that("renameDataColumns handles partial mapping", {
  data <- data.frame(
    col1 = c(1, 2, 3),
    col2 = c(4, 5, 6),
    col3 = c(7, 8, 9)
  )

  mapping <- list(x1 = "col1", x2 = "col2")

  result <- renameDataColumns(data, mapping)

  expect_equal(colnames(result), c("x1", "x2"))
  expect_equal(nrow(result), 3)
})

test_that("storeOptimizationMetadata extracts bounds", {
  paths <- list(
    list(
      from = "F1", to = "x1", numberOfArrows = 1,
      optimization = list(bounds = c(0, 5))
    )
  )

  result <- storeOptimizationMetadata(paths)

  expect_true("bounds" %in% names(result))
  expect_equal(result$bounds[[1]], c(0, 5))
})

test_that("storeOptimizationMetadata extracts priors", {
  paths <- list(
    list(
      from = "F1", to = "x1", numberOfArrows = 1,
      optimization = list(prior = list(distribution = "normal", mean = 0, sd = 1))
    )
  )

  result <- storeOptimizationMetadata(paths)

  expect_true("priors" %in% names(result))
})

# --- Item 4b: pendingCore conversion policy (onUnsupported) --------------------

# Helper: a model whose only non-core element is a 0-headed path (relocated to
# extensions$pendingCore on import).
pendingCoreGraphModel <- function() {
  suppressWarnings(as.GraphModel(list(
    schemaVersion = 0,
    models = list(model1 = list(
      nodes = list(
        list(label = "x1", type = "variable"),
        list(label = "x2", type = "variable")
      ),
      paths = list(
        list(from = "x1", to = "x1", numberOfArrows = 2, value = 1.0),
        list(from = "x2", to = "x2", numberOfArrows = 2, value = 1.0),
        list(from = "x1", to = "x2", numberOfArrows = 0, value = 1.0)
      )
    ))
  )))
}

test_that("schemaToOpenMx refuses pendingCore by default, naming blocker and remedy", {
  gm <- pendingCoreGraphModel()

  err <- expect_error(schemaToOpenMx(gm@schema, list(), onUnsupported = "stop"))
  msg <- conditionMessage(err)
  expect_match(msg, "non-core feature")
  expect_match(msg, "selection")          # the blocker is listed
  expect_match(msg, "onUnsupported")      # remedy: ignore
  expect_match(msg, "dropUnsupported")    # remedy: drop
  expect_match(msg, "extensions\\$pendingCore")  # where to inspect
})

test_that("schemaToOpenMx onUnsupported='ignore' builds a reduced model and warns", {
  gm <- pendingCoreGraphModel()

  expect_warning(
    om <- schemaToOpenMx(gm@schema, list(), onUnsupported = "ignore"),
    "ignoring 1 non-core feature"
  )
  expect_s4_class(om, "MxModel")
})

test_that("only the model carrying pendingCore is refused", {
  gm <- suppressWarnings(as.GraphModel(list(
    schemaVersion = 0,
    models = list(
      clean = list(
        nodes = list(list(label = "x1", type = "variable")),
        paths = list(list(from = "x1", to = "x1", numberOfArrows = 2, value = 1.0))
      ),
      dirty = list(
        nodes = list(
          list(label = "y1", type = "variable"),
          list(label = "y2", type = "variable")
        ),
        paths = list(
          list(from = "y1", to = "y1", numberOfArrows = 2, value = 1.0),
          list(from = "y2", to = "y2", numberOfArrows = 2, value = 1.0),
          list(from = "y1", to = "y2", numberOfArrows = 0, value = 1.0)
        )
      )
    )
  )))

  expect_s4_class(
    schemaToOpenMx(gm@schema, list(), model_id = "clean"), "MxModel"
  )
  expect_error(
    schemaToOpenMx(gm@schema, list(), model_id = "dirty"),
    "non-core feature"
  )
})

test_that("runOpenMx threads onUnsupported through to the converter", {
  gm <- pendingCoreGraphModel()
  # Refuses at the build step before any optimization.
  expect_error(
    suppressMessages(runOpenMx(gm, silent = TRUE, onUnsupported = "stop")),
    "non-core feature"
  )
})
