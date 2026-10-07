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

test_that("the widget bundle was built from the current schema", {
  # The widget validates models against the schema bundled into widget.js; a
  # bundle built before a schema change rejects the new fields. Every property
  # name the schema declares must appear in the bundle.
  bundle <- testthat::test_path("..", "..", "inst", "htmlwidgets", "lib", "app", "widget.js")
  skip_if_not(file.exists(bundle), "widget bundle not available")
  schema <- jsonlite::fromJSON(getSchemaPath(), simplifyVector = FALSE)
  props <- character(0)
  walk <- function(x) {
    if (!is.list(x)) return()
    if (is.list(x$properties)) props <<- c(props, names(x$properties))
    for (v in x) walk(v)
  }
  walk(schema)
  js <- paste(readLines(bundle, warn = FALSE), collapse = "\n")
  props <- unique(props)
  missing <- props[!vapply(props, function(p) grepl(p, js, fixed = TRUE), logical(1))]
  expect_equal(missing, character(0), info = "rebuild the widget: cd drawsem-web && npm run build:widget")
})
