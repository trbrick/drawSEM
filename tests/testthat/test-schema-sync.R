# The package ships a copy of the schema at inst/extdata/graph.schema.json
# (synced from drawsem-web/schema/ by `make`). It must match the source of
# truth, or R and the widget disagree about the contract.

test_that("the shipped schema copy matches drawsem-web/schema/graph.schema.json", {
  src <- testthat::test_path("..", "..", "drawsem-web", "schema", "graph.schema.json")
  dst <- testthat::test_path("..", "..", "inst", "extdata", "graph.schema.json")
  skip_if_not(file.exists(src), "source schema not available (not a source checkout)")
  expect_true(file.exists(dst), info = "inst/extdata/graph.schema.json is missing; run `make`")
  expect_identical(readLines(dst, warn = FALSE), readLines(src, warn = FALSE),
                   info = "inst/extdata/graph.schema.json is out of sync; run `make`")
})

test_that("getSchemaPath() finds the shipped schema", {
  expect_true(nzchar(getSchemaPath()) && file.exists(getSchemaPath()))
})
