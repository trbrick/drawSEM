dataVerbFixtureSchema <- function() {
  list(
    schemaVersion = 0,
    models = list(
      m1 = list(
        label = "m1",
        nodes = list(
          list(label = "x", type = "variable"),
          list(label = "y", type = "variable")
        ),
        paths = list()
      )
    )
  )
}

nodeByLabel <- function(gm, label) {
  Find(function(n) identical(n$label, label), gm@schema$models[[1]]$nodes)
}

# ---- addConstant() / removeConstant() --------------------------------------

test_that("addConstant() adds a constant node and does not mutate the original object", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  gm2 <- addConstant(gm, description = "unit vector")
  expect_null(nodeByLabel(gm, "1"))
  added <- nodeByLabel(gm2, "1")
  expect_equal(added$type, "constant")
  expect_equal(added$description, "unit vector")
})

test_that("addConstant() supports a non-default label for a second constant", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  gm2 <- addConstant(gm)
  gm3 <- addConstant(gm2, label = "1b")
  expect_length(nodes(gm3, type = "constant"), 2)
})

test_that("addConstant() errors on a duplicate label", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  gm2 <- addConstant(gm)
  expect_error(addConstant(gm2), "already exists")
})

test_that("removeConstant() removes the node and cascades incident paths with a warning", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  gm2 <- addConstant(gm)
  gm3 <- addPath(gm2, from = "1", to = "x", numberOfArrows = 1, freeParameter = TRUE)
  expect_warning(gm4 <- removeConstant(gm3, "1"), "1 incident path")
  expect_null(nodeByLabel(gm4, "1"))
  expect_length(paths(gm4), 0)
})

test_that("removeConstant() errors if the constant does not exist", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  expect_error(removeConstant(gm, "1"), "No constant node found")
})

test_that("removeConstant() will not remove a variable node sharing the same label", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  expect_error(removeConstant(gm, "x"), "No constant node found")
})

# ---- addDataset() / removeDataset() -----------------------------------------

test_that("addDataset() embeds the data.frame, updates @data, and does not mutate the original", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = c(1, 2, 3), y = c(4, 5, 6))
  gm2 <- addDataset(gm, "surveyData", df)

  expect_null(nodeByLabel(gm, "surveyData"))
  ds_node <- nodeByLabel(gm2, "surveyData")
  expect_equal(ds_node$type, "dataset")
  expect_equal(ds_node$datasetSource$type, "embedded")
  expect_setequal(names(ds_node$datasetSource$columnTypes), c("x", "y"))
  expect_equal(ds_node$datasetSource$rowCount, 3)

  expect_equal(gm2@data[["surveyData"]], df)
  expect_equal(gm2@dataConnections[["surveyData"]]$status, "user_bound")
  expect_null(gm@data[["surveyData"]])
})

test_that("addDataset() errors if the model already has a dataset node", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = 1, y = 2)
  gm2 <- addDataset(gm, "surveyData", df)
  expect_error(addDataset(gm2, "otherData", df), "only one dataset node per model")
})

test_that("addDataset() errors on non-data.frame input", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  expect_error(addDataset(gm, "surveyData", list(x = 1)), "must be a data.frame")
})

test_that("removeDataset() removes the node, its data paths, @data, and @dataConnections", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = c(1, 2), y = c(3, 4))
  gm2 <- addDataset(gm, "surveyData", df)
  gm3 <- addDataPath(gm2, from = "surveyData", to = "x", column = "x")

  expect_warning(gm4 <- removeDataset(gm3, "surveyData"), "1 data path")
  expect_null(nodeByLabel(gm4, "surveyData"))
  expect_null(gm4@data[["surveyData"]])
  expect_null(gm4@dataConnections[["surveyData"]])
  expect_length(paths(gm4), 0)
})

test_that("removeDataset() errors if the dataset does not exist", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  expect_error(removeDataset(gm, "surveyData"), "No dataset node found")
})

# ---- addDataPath() / removeDataPath() ---------------------------------------

test_that("addDataPath() connects a column to a variable", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = c(1, 2), y = c(3, 4))
  gm2 <- addDataset(gm, "surveyData", df)
  gm3 <- addDataPath(gm2, from = "surveyData", to = "x", column = "x")

  added <- Find(function(p) isTRUE(p$type == "data") && identical(p$to, "x"), paths(gm3))
  expect_false(is.null(added))
  expect_equal(added$label, "x")
})

test_that("addDataPath() errors if the dataset node does not exist", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  expect_error(
    addDataPath(gm, from = "nonexistent", to = "x", column = "x"),
    "No dataset node found"
  )
})

test_that("addDataPath() errors if the variable node does not exist", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = c(1, 2))
  gm2 <- addDataset(gm, "surveyData", df)
  expect_error(
    addDataPath(gm2, from = "surveyData", to = "nonexistent", column = "x"),
    "No variable node found"
  )
})

test_that("addDataPath() errors if the column does not exist in the dataset", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = c(1, 2))
  gm2 <- addDataset(gm, "surveyData", df)
  expect_error(
    addDataPath(gm2, from = "surveyData", to = "x", column = "nonexistentColumn"),
    "not found in dataset"
  )
})

test_that("addDataPath() errors on a duplicate connection", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = c(1, 2))
  gm2 <- addDataset(gm, "surveyData", df)
  gm3 <- addDataPath(gm2, from = "surveyData", to = "x", column = "x")
  expect_error(
    addDataPath(gm3, from = "surveyData", to = "x", column = "x"),
    "already exists"
  )
})

test_that("removeDataPath() removes an existing data path", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = c(1, 2))
  gm2 <- addDataset(gm, "surveyData", df)
  gm3 <- addDataPath(gm2, from = "surveyData", to = "x", column = "x")
  gm4 <- removeDataPath(gm3, from = "surveyData", to = "x")
  expect_length(paths(gm4), 0)
})

test_that("removeDataPath() errors if no matching data path exists", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  expect_error(removeDataPath(gm, from = "surveyData", to = "x"), "No data path found")
})
