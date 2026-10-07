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

# ---- server-side CSV browser ---------------------------------------------------

makeBrowseTree <- function() {
  root <- file.path(tempfile("browse"), "proj")
  dir.create(file.path(root, "Data"), recursive = TRUE)
  dir.create(file.path(root, ".hidden"))
  writeLines("x\n1", file.path(root, "b.csv"))
  writeLines("x\n1", file.path(root, "A.CSV"))
  writeLines("not data", file.path(root, "notes.txt"))
  writeLines("y\n2\n3", file.path(root, "Data", "inner.csv"))
  normalizePath(root, winslash = "/")
}

test_that(".listCsvDir lists folders and CSV files only, sorted, hidden skipped", {
  root <- makeBrowseTree()
  l <- .listCsvDir(root)
  expect_equal(basename(l$dirs), "Data")
  expect_equal(basename(l$files), c("A.CSV", "b.csv"))
  expect_equal(.listCsvDir(file.path(root, "missing")), list(dirs = character(0), files = character(0)))
})

test_that(".pathCrumbs walks from the root down to the folder", {
  root <- makeBrowseTree()
  cr <- .pathCrumbs(file.path(root, "Data"))
  expect_equal(cr[[length(cr)]]$name, "Data")
  expect_equal(cr[[length(cr)]]$path, file.path(root, "Data"))
  expect_equal(cr[[length(cr) - 1]]$name, "proj")
  expect_identical(dirname(cr[[1]]$path), cr[[1]]$path)   # first crumb is the root
})

test_that(".browseRoots starts with the launch directory and home", {
  r <- .browseRoots("/some/launch")
  expect_equal(unname(r[1:2]), c("/some/launch", path.expand("~")))
  expect_equal(names(r)[1:2], c("Working directory", "Home"))
})

test_that("the Load Data browser starts in the launch directory and navigates and picks", {
  skip_if_not_installed("shiny")
  root <- makeBrowseTree()
  old <- setwd(root); on.exit(setwd(old), add = TRUE)
  gm <- GraphModel() |> addVariable("x")
  shiny::testServer(function(input, output, session) .drawSEM_server(input, output, session, initialGM = gm), {
    html <- output$csv_browser$html
    expect_match(html, "b.csv", fixed = TRUE)
    expect_match(html, "Data", fixed = TRUE)
    expect_false(grepl("notes.txt", html, fixed = TRUE))
    expect_match(html, "No file selected.", fixed = TRUE)

    session$setInputs(csv_browser_nav = file.path(root, "Data"))
    expect_match(output$csv_browser$html, "inner.csv", fixed = TRUE)

    session$setInputs(csv_browser_pick = file.path(root, "Data", "inner.csv"))
    expect_match(output$csv_browser$html, "Selected: inner.csv", fixed = TRUE)

    session$setInputs(csv_browser_nav = file.path(root, "does-not-exist"))
    expect_match(output$csv_browser$html, "inner.csv", fixed = TRUE)   # stays put
  })
})
