# Loading data in the Shiny app: dataset node creation and label defaults.

schemaWith <- function(nodes) list(schemaVersion = 0, models = list(m1 = list(nodes = nodes, paths = list())))

test_that(".attachDatasetNode adds a new dataset node (regression: Position() returns NA)", {
  s <- schemaWith(list(list(label = "x", type = "variable")))
  out <- .attachDatasetNode(s, "mydata", data.frame(x = 1:3))
  nodes <- out$models$m1$nodes
  expect_length(nodes, 2)
  expect_equal(nodes[[2]]$label, "mydata")
  expect_equal(nodes[[2]]$type, "dataset")
  expect_equal(nodes[[2]]$datasetSource$rowCount, 3)
})

test_that(".attachDatasetNode refreshes an existing dataset node in place", {
  s <- .attachDatasetNode(schemaWith(list()), "d", data.frame(x = 1:3))
  out <- .attachDatasetNode(s, "d", data.frame(x = 1:5))
  expect_length(out$models$m1$nodes, 1)
  expect_equal(out$models$m1$nodes[[1]]$datasetSource$rowCount, 5)
})

test_that(".attachDatasetNode stacks new dataset nodes below existing ones", {
  s <- .attachDatasetNode(schemaWith(list()), "a", data.frame(x = 1))
  s <- .attachDatasetNode(s, "b", data.frame(x = 1))
  ys <- vapply(s$models$m1$nodes, function(n) n$visual$y, numeric(1))
  expect_equal(ys, c(450, 550))
})

test_that("the dataset label defaults to the file name without its extension", {
  expect_equal(.datasetLabelFromFile("mydata.csv"), "mydata")
  expect_equal(.datasetLabelFromFile("/a/b/Survey 2024.CSV"), "Survey 2024")
  expect_equal(.datasetLabelFromFile("noext"), "noext")
})
