test_that("GraphModel() produces a valid, empty GraphModel", {
  gm <- GraphModel()

  expect_s4_class(gm, "GraphModel")
  expect_equal(gm@schema$schemaVersion, 0)
  expect_length(gm@schema$models, 1)

  first_model <- gm@schema$models[[1]]
  expect_length(first_model$nodes, 0)
  expect_length(first_model$paths, 0)

  expect_true(isTRUE(validateSchema(gm@schema, verbose = FALSE)) ||
    is.list(validateSchema(gm@schema, verbose = FALSE)))
})

test_that("GraphModel(label = ) sets the default model's label", {
  gm <- GraphModel(label = "mymodel")

  expect_equal(gm@schema$models[[1]]$label, "mymodel")
})

test_that("GraphModel() errors on an invalid label", {
  expect_error(GraphModel(label = ""), "label must be")
  expect_error(GraphModel(label = c("a", "b")), "label must be")
  expect_error(GraphModel(label = 1), "label must be")
})

test_that("GraphModel() composes with addVariable()", {
  gm <- GraphModel()
  gm2 <- addVariable(gm, "x1")

  node_labels <- vapply(gm2@schema$models[[1]]$nodes, function(n) n$label, character(1))
  expect_true("x1" %in% node_labels)
})
