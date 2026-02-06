# Test operators for GraphModel S4 objects

test_that("$ operator accesses schema slot", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(list(label = "x1", type = "variable")),
        paths = list()
      )
    )
  )
  gm <- as.GraphModel(schema)

  result <- gm$schema
  expect_equal(result$schemaVersion, 1)
  expect_equal(length(result$models), 1)
})

test_that("$ operator accesses data slot", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(list(label = "x", type = "variable")),
        paths = list()
      )
    )
  )
  test_data <- list(mydata = data.frame(x = 1:5))
  gm <- as.GraphModel(schema, data = test_data)

  result <- gm$data
  expect_equal(length(result), 1)
  expect_equal(names(result), "mydata")
  expect_equal(nrow(result$mydata), 5)
})

test_that("$ operator accesses metadata slot", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(list(label = "x", type = "variable")),
        paths = list()
      )
    )
  )
  gm <- as.GraphModel(schema, metadata = list(version = "1.0", author = "test"))

  result <- gm$metadata
  expect_equal(result$version, "1.0")
  expect_equal(result$author, "test")
})

test_that("$ operator accesses lastBuiltModel slot", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(list(label = "x", type = "variable")),
        paths = list()
      )
    )
  )
  gm <- as.GraphModel(schema)

  # Initially NULL
  expect_null(gm$lastBuiltModel)
})

test_that("$<- operator modifies metadata slot", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(list(label = "x", type = "variable")),
        paths = list()
      )
    )
  )
  gm <- as.GraphModel(schema)

  # Modify metadata
  gm$metadata <- list(note = "Updated", version = "2.0")
  expect_equal(gm$metadata$note, "Updated")
  expect_equal(gm$metadata$version, "2.0")
})

test_that("$<- operator modifies data slot", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(list(label = "x", type = "variable")),
        paths = list()
      )
    )
  )
  gm <- as.GraphModel(schema, data = list(old = data.frame(x = 1:3)))

  # Replace entire data slot
  new_data <- list(new = data.frame(a = 1:5, b = 6:10))
  gm$data <- new_data
  expect_equal(names(gm$data), "new")
  expect_equal(nrow(gm$data$new), 5)
})

test_that("$<- operator modifies schema slot", {
  schema1 <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(list(label = "x", type = "variable")),
        paths = list()
      )
    )
  )
  schema2 <- list(
    schemaVersion = 2,
    models = list(
      model2 = list(
        nodes = list(list(label = "y", type = "variable")),
        paths = list()
      )
    )
  )

  gm <- as.GraphModel(schema1)
  expect_equal(gm$schema$schemaVersion, 1)

  # Replace schema
  gm$schema <- schema2
  expect_equal(gm$schema$schemaVersion, 2)
  expect_equal(names(gm$schema$models), "model2")
})

test_that("$ operator with nested list access", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(list(label = "x1", type = "variable")),
        paths = list()
      )
    )
  )
  gm <- as.GraphModel(schema, data = list(mydata = data.frame(x = 1:3)))

  # Nested access should work
  expect_equal(gm$data$mydata$x, c(1, 2, 3))
  expect_equal(gm$schema$schemaVersion, 1)
  expect_equal(gm$schema$models$model1$nodes[[1]]$label, "x1")
})

test_that("$<- operator with nested list modification", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(list(label = "x", type = "variable")),
        paths = list()
      )
    )
  )
  gm <- as.GraphModel(schema, metadata = list())

  # Nested modification should work
  gm$metadata$tag <- "test_tag"
  expect_equal(gm$metadata$tag, "test_tag")

  gm$metadata$nested <- list(value = 42)
  expect_equal(gm$metadata$nested$value, 42)
})

test_that("$ operator fails gracefully with invalid slot name", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(list(label = "x", type = "variable")),
        paths = list()
      )
    )
  )
  gm <- as.GraphModel(schema)

  # Should error on invalid slot
  expect_error(gm$invalid_slot, "no slot of name")
})
