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
  gm2 <- addConstant(gm, description = "unit vector", tags = "layout")
  expect_null(nodeByLabel(gm, "1"))
  added <- nodeByLabel(gm2, "1")
  expect_equal(added$type, "constant")
  expect_equal(added$description, "unit vector")
  expect_equal(added$tags, "layout")
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

test_that("removeConstant() mergeInto = FALSE (default) cascades incident paths with a warning", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  gm2 <- addConstant(gm)
  gm3 <- addPath(gm2, from = "1", to = "x", numberOfArrows = 1, freeParameter = TRUE)
  expect_warning(gm4 <- removeConstant(gm3, "1"), "1 incident path")
  expect_null(nodeByLabel(gm4, "1"))
  expect_length(paths(gm4), 0)
})

test_that("removeConstant() mergeInto = <label> reassigns incident paths instead of deleting them", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  gm2 <- addConstant(gm) |>
    addConstant(label = "1b") |>
    addPath(from = "1", to = "x", numberOfArrows = 1, freeParameter = TRUE) |>
    addPath(from = "1", to = "y", numberOfArrows = 1, freeParameter = TRUE)

  gm3 <- removeConstant(gm2, "1", mergeInto = "1b")
  expect_null(nodeByLabel(gm3, "1"))
  expect_false(is.null(nodeByLabel(gm3, "1b")))
  remaining <- paths(gm3)
  expect_length(remaining, 2)
  expect_true(all(vapply(remaining, function(p) identical(p$from, "1b"), logical(1))))
})

test_that("removeConstant() mergeInto errors on a non-existent target", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  gm2 <- addConstant(gm)
  expect_error(removeConstant(gm2, "1", mergeInto = "nonexistent"), "No constant node found")
})

test_that("removeConstant() mergeInto errors if the target is the constant being removed", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  gm2 <- addConstant(gm)
  expect_error(removeConstant(gm2, "1", mergeInto = "1"), "cannot be the same constant")
})

test_that("removeConstant() errors if the constant does not exist", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  expect_error(removeConstant(gm, "1"), "No constant node found")
})

test_that("removeConstant() will not remove a variable node sharing the same label", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  expect_error(removeConstant(gm, "x"), "No constant node found")
})

# ---- addData() / removeData() -----------------------------------------------

test_that("addData() embeds a data.frame, updates @data, and does not mutate the original", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = c(1, 2, 3), y = c(4, 5, 6))
  gm2 <- addData(gm, "surveyData", df, tags = "wave1")

  expect_null(nodeByLabel(gm, "surveyData"))
  ds_node <- nodeByLabel(gm2, "surveyData")
  expect_equal(ds_node$type, "dataset")
  expect_equal(ds_node$datasetSource$type, "embedded")
  expect_setequal(names(ds_node$datasetSource$columnTypes), c("x", "y"))
  expect_equal(ds_node$datasetSource$rowCount, 3)
  expect_equal(ds_node$tags, "wave1")

  expect_equal(gm2@data[["surveyData"]], df)
  expect_equal(gm2@dataConnections[["surveyData"]]$status, "user_bound")
  expect_null(gm@data[["surveyData"]])
})

test_that("addData() with a file path string links without reading", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  gm2 <- addData(gm, "surveyData", "does/not/exist.csv")

  ds_node <- nodeByLabel(gm2, "surveyData")
  expect_equal(ds_node$datasetSource$type, "file")
  expect_equal(ds_node$datasetSource$location, "does/not/exist.csv")
  expect_equal(ds_node$datasetSource$format, "csv")
  expect_null(gm2@data[["surveyData"]])
})

test_that("addData() errors if the model already has a dataset node", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = 1, y = 2)
  gm2 <- addData(gm, "surveyData", df)
  expect_error(addData(gm2, "otherData", df), "only one dataset node per model")
})

test_that("addData() errors on input that is neither a data.frame nor a file path string", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  expect_error(addData(gm, "surveyData", list(x = 1)), "data.frame or a single file path string")
})

test_that("removeData() removes the node, its data connections, @data, and @dataConnections", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = c(1, 2), y = c(3, 4))
  gm2 <- addData(gm, "surveyData", df)
  gm3 <- connectData(gm2, data = "surveyData", variable = "x")

  expect_warning(gm4 <- removeData(gm3, "surveyData"), "1 data connection")
  expect_null(nodeByLabel(gm4, "surveyData"))
  expect_null(gm4@data[["surveyData"]])
  expect_null(gm4@dataConnections[["surveyData"]])
  expect_length(paths(gm4), 0)
})

test_that("removeData() errors if the dataset does not exist", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  expect_error(removeData(gm, "surveyData"), "No dataset node found")
})

# ---- connectData() / disconnectData() / reconnectData() --------------------

test_that("connectData() column defaults to variable's own name", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = c(1, 2), y = c(3, 4))
  gm2 <- addData(gm, "surveyData", df)
  gm3 <- connectData(gm2, data = "surveyData", variable = "x")

  added <- Find(function(p) isTRUE(p$type == "data") && identical(p$to, "x"), paths(gm3))
  expect_equal(added$label, "x")
})

test_that("connectData() is vectorized over variable/column", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x_raw = c(1, 2), y_raw = c(3, 4))
  gm2 <- addData(gm, "surveyData", df)
  gm3 <- connectData(gm2, data = "surveyData", variable = c("x", "y"), column = c("x_raw", "y_raw"))

  expect_length(paths(gm3), 2)
  x_path <- Find(function(p) identical(p$to, "x"), paths(gm3))
  y_path <- Find(function(p) identical(p$to, "y"), paths(gm3))
  expect_equal(x_path$label, "x_raw")
  expect_equal(y_path$label, "y_raw")
})

test_that("connectData() errors on a variable/column length mismatch -- no recycling", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = c(1, 2), y = c(3, 4))
  gm2 <- addData(gm, "surveyData", df)
  expect_error(
    connectData(gm2, data = "surveyData", variable = c("x", "y"), column = "x"),
    "must have the same length"
  )
})

test_that("connectData() errors if the dataset node does not exist", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  expect_error(connectData(gm, data = "nonexistent", variable = "x"), "No dataset node found")
})

test_that("connectData() errors if a variable node does not exist", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = c(1, 2))
  gm2 <- addData(gm, "surveyData", df)
  expect_error(connectData(gm2, data = "surveyData", variable = "nonexistent"), "No variable node found")
})

test_that("connectData() errors if the column does not exist in the dataset", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = c(1, 2))
  gm2 <- addData(gm, "surveyData", df)
  expect_error(
    connectData(gm2, data = "surveyData", variable = "x", column = "nonexistentColumn"),
    "not found in dataset"
  )
})

test_that("connectData() does not validate columns against an empty columnTypes (linked-but-unembedded dataset)", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  gm2 <- addData(gm, "surveyData", "some/file.csv")
  gm3 <- connectData(gm2, data = "surveyData", variable = "x", column = "anything")
  expect_length(paths(gm3), 1)
})

test_that("connectData() errors on a duplicate connection", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = c(1, 2))
  gm2 <- addData(gm, "surveyData", df)
  gm3 <- connectData(gm2, data = "surveyData", variable = "x")
  expect_error(connectData(gm3, data = "surveyData", variable = "x"), "already exists")
})

test_that("disconnectData() removes an existing data connection, vectorized over variable", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = c(1, 2), y = c(3, 4))
  gm2 <- addData(gm, "surveyData", df)
  gm3 <- connectData(gm2, data = "surveyData", variable = c("x", "y"))
  gm4 <- disconnectData(gm3, data = "surveyData", variable = c("x", "y"))
  expect_length(paths(gm4), 0)
})

test_that("disconnectData() errors if no matching connection exists", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  expect_error(disconnectData(gm, data = "surveyData", variable = "x"), "No data connection found")
})

test_that("reconnectData() changes the column of an existing connection", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x_raw = c(1, 2), x_clean = c(3, 4))
  gm2 <- addData(gm, "surveyData", df)
  gm3 <- connectData(gm2, data = "surveyData", variable = "x", column = "x_raw")
  gm4 <- reconnectData(gm3, data = "surveyData", variable = "x", column = "x_clean")

  updated <- Find(function(p) identical(p$to, "x"), paths(gm4))
  expect_equal(updated$label, "x_clean")
  expect_length(paths(gm4), 1)
})

test_that("reconnectData() errors if the connection does not already exist", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = c(1, 2))
  gm2 <- addData(gm, "surveyData", df)
  expect_error(
    reconnectData(gm2, data = "surveyData", variable = "x", column = "x"),
    "Use connectData\\(\\) to create one"
  )
})

test_that("reconnectData() errors on a variable/column length mismatch", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = c(1, 2), y = c(3, 4))
  gm2 <- addData(gm, "surveyData", df)
  gm3 <- connectData(gm2, data = "surveyData", variable = c("x", "y"))
  expect_error(
    reconnectData(gm3, data = "surveyData", variable = c("x", "y"), column = "onlyone"),
    "must have the same length"
  )
})

# ---- changeData() -----------------------------------------------------------

test_that("changeData() converts embedded to file, writing the data and updating datasetSource", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = c(1, 2, 3), y = c(4, 5, 6))
  gm2 <- addData(gm, "surveyData", df)

  tmp <- tempfile(fileext = ".csv")
  gm3 <- changeData(gm2, "surveyData", connectionType = "file", location = tmp)

  ds_node <- nodeByLabel(gm3, "surveyData")
  expect_equal(ds_node$datasetSource$type, "file")
  expect_equal(ds_node$datasetSource$location, tmp)
  expect_true(file.exists(tmp))
  expect_null(gm3@data[["surveyData"]])
})

test_that("changeData() converts file to embedded, reading from the existing location", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = c(1, 2, 3), y = c(4, 5, 6))
  gm2 <- addData(gm, "surveyData", df)

  tmp <- tempfile(fileext = ".csv")
  gm3 <- changeData(gm2, "surveyData", connectionType = "file", location = tmp)
  gm4 <- changeData(gm3, "surveyData", connectionType = "embedded")

  ds_node <- nodeByLabel(gm4, "surveyData")
  expect_equal(ds_node$datasetSource$type, "embedded")
  expect_equal(gm4@data[["surveyData"]]$x, df$x)
})

test_that("changeData() errors if location is supplied with connectionType = 'embedded'", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = 1, y = 2)
  gm2 <- addData(gm, "surveyData", df)
  tmp <- tempfile(fileext = ".csv")
  gm3 <- changeData(gm2, "surveyData", connectionType = "file", location = tmp)
  expect_error(
    changeData(gm3, "surveyData", connectionType = "embedded", location = tmp),
    "must not be supplied"
  )
})

test_that("changeData() errors if location is missing with connectionType = 'file'", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = 1, y = 2)
  gm2 <- addData(gm, "surveyData", df)
  expect_error(changeData(gm2, "surveyData", connectionType = "file"), "location is required")
})

test_that("changeData() errors converting to the type the dataset is already in", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = 1, y = 2)
  gm2 <- addData(gm, "surveyData", df)
  expect_error(changeData(gm2, "surveyData", connectionType = "embedded"), "already embedded")
})

test_that("changeData() errors overwriting an existing file unless overwrite = TRUE", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = 1, y = 2)
  gm2 <- addData(gm, "surveyData", df)
  tmp <- tempfile(fileext = ".csv")
  write.csv(data.frame(z = 1), tmp, row.names = FALSE)

  expect_error(
    changeData(gm2, "surveyData", connectionType = "file", location = tmp),
    "already exists"
  )
  gm3 <- changeData(gm2, "surveyData", connectionType = "file", location = tmp, overwrite = TRUE)
  expect_equal(nodeByLabel(gm3, "surveyData")$datasetSource$location, tmp)
})

test_that("changeData() errors on an invalid connectionType", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = 1, y = 2)
  gm2 <- addData(gm, "surveyData", df)
  expect_error(changeData(gm2, "surveyData", connectionType = "bogus"), "must be")
})

test_that("changeData() errors if the dataset does not exist", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  expect_error(changeData(gm, "surveyData", connectionType = "embedded"), "No dataset node found")
})

test_that("changeData() addTags/removeTags work the same as changePath()/changeVariable()", {
  gm <- as.GraphModel(dataVerbFixtureSchema())
  df <- data.frame(x = 1, y = 2)
  gm2 <- addData(gm, "surveyData", df)
  tmp <- tempfile(fileext = ".csv")
  gm3 <- changeData(gm2, "surveyData", connectionType = "file", location = tmp, addTags = "archived")
  expect_equal(nodeByLabel(gm3, "surveyData")$tags, "archived")
})
