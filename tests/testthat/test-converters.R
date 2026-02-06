test_that("buildPathList constructs correct mxPath specifications", {
  paths <- list(
    list(fromLabel = "F1", toLabel = "x1", numberOfArrows = 1, free = "free", value = 1.0),
    list(fromLabel = "x1", toLabel = "x1", numberOfArrows = 2, free = "fixed", value = 1.0)
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
    list(fromLabel = "1", toLabel = "x1", numberOfArrows = 1, free = "free")
  )

  result <- buildPathList(paths, constantNodeLabel = "1")

  expect_equal(result[[1]]$from, "one")
})

test_that("buildPathList applies 0.1 default for free null parameters", {
  paths <- list(
    list(fromLabel = "F1", toLabel = "x1", numberOfArrows = 1, free = "free", value = NULL)
  )

  result <- buildPathList(paths, constantNodeLabel = NULL)

  expect_equal(result[[1]]$values, 0.1)
})

test_that("buildPathList preserves non-null values for free parameters", {
  paths <- list(
    list(fromLabel = "F1", toLabel = "x1", numberOfArrows = 1, free = "free", value = 2.5)
  )

  result <- buildPathList(paths, constantNodeLabel = NULL)

  expect_equal(result[[1]]$values, 2.5)
})

test_that("buildPathList preserves labels when present", {
  paths <- list(
    list(fromLabel = "F1", toLabel = "x1", numberOfArrows = 1, free = "free", label = "loading_1")
  )

  result <- buildPathList(paths, constantNodeLabel = NULL)

  expect_equal(result[[1]]$labels, "loading_1")
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
    list(fromLabel = "data", toLabel = "x1", numberOfArrows = 1, parameterType = "dataMapping"),
    list(fromLabel = "data", toLabel = "x2", numberOfArrows = 1, parameterType = "dataMapping")
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
    list(fromLabel = "data", toLabel = "x1", numberOfArrows = 1, parameterType = "dataMapping"),
    list(fromLabel = "data", toLabel = "x2", numberOfArrows = 1, parameterType = "dataMapping")
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
          list(fromLabel = "x1", toLabel = "x2", numberOfArrows = 0)
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
            fromLabel = "x1", toLabel = "x2", numberOfArrows = 1,
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
      fromLabel = "F1", toLabel = "x1", numberOfArrows = 1,
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
      fromLabel = "F1", toLabel = "x1", numberOfArrows = 1,
      optimization = list(prior = list(distribution = "normal", mean = 0, sd = 1))
    )
  )

  result <- storeOptimizationMetadata(paths)

  expect_true("priors" %in% names(result))
})
