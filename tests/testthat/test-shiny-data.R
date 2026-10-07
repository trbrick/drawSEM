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

test_that(".attachDatasetNode adds new dataset nodes without a position (the editor places them)", {
  s <- .attachDatasetNode(schemaWith(list()), "a", data.frame(x = 1))
  s <- .attachDatasetNode(s, "b", data.frame(x = 1))
  expect_length(s$models$m1$nodes, 2)
  for (n in s$models$m1$nodes) expect_null(n$visual)
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

test_that("embedded data with missing values survives the widget round trip", {
  df <- data.frame(x = c(1, NA, 3), y = c(2L, 4L, NA), g = c("a", NA, "c"),
                   `my var` = c(TRUE, FALSE, NA), check.names = FALSE)
  j <- dataFrameToJSON(df)
  # R -> widget uses Shiny's encoder (NA -> null); widget -> R is decoded
  # with simplifyVector = FALSE, so nulls come back as NULL.
  echoed <- shiny:::safeFromJSON(shiny:::toJSON(j$object), simplifyVector = FALSE)
  out <- jsonToDataFrame(echoed, as.list(j$columnTypes))
  expect_equal(names(out), names(df))
  expect_equal(out$x, c(1, NA, 3))
  expect_equal(out$y, c(2, 4, NA))
  expect_equal(out$g, c("a", NA, "c"))
  expect_equal(out$`my var`, c(TRUE, FALSE, NA))
})

test_that("jsonToDataFrame treats the string \"NA\" in a number column as missing", {
  out <- jsonToDataFrame(list(list(x = 1), list(x = "NA"), list(x = 3)), list(x = "number"))
  expect_equal(out$x, c(1, NA, 3))
})

test_that("Load Data for a given dataset pre-fills its label so Attach connects to that node", {
  skip_if_not_installed("shiny")
  gm <- GraphModel() |> addVariable("x")
  gm@schema <- .attachDatasetNode(gm@schema, "sample", data.frame(x = 1))
  dir <- tempfile("conn"); dir.create(dir)
  write.csv(data.frame(x = 1:4), file.path(dir, "found.csv"), row.names = FALSE)
  mod <- function(id, initialGM) shiny::moduleServer(id, function(input, output, session)
    .drawSEM_server(input, output, session, initialGM = initialGM))
  shiny::testServer(mod, args = list(initialGM = gm), {
    session$setInputs(load_data_request = list(timestamp = 1, datasetLabel = "sample"))
    session$setInputs(csv_browser_pick = file.path(dir, "found.csv"))
    session$setInputs(csv_dataset_name = "sample")   # as pre-filled by the modal
    session$setInputs(attach_csv_btn = 1)
    nodes <- session$returned$currentModel()@schema$models[[1]]$nodes
    datasets <- Filter(function(n) identical(n$type, "dataset"), nodes)
    expect_length(datasets, 1)                          # connected, not added
    expect_equal(datasets[[1]]$datasetSource$rowCount, 4)
  })
})

test_that(".datasetSummaries describes file datasets R holds data for, and only those", {
  f <- testthat::test_path("..", "..", "drawsem-web", "examples", "graph.example.json")
  skip_if_not(file.exists(f), "example not available")
  gm <- loadGraphModel(f)
  s <- .datasetSummaries(gm)
  expect_named(s, "sample")
  expect_equal(s$sample$fileName, "sample.csv")
  expect_equal(s$sample$headers, c("x_1", "x_2", "x_3"))
  col <- s$sample$columns[[1]]
  expect_equal(col$name, "x_1")
  expect_equal(col$count, 10)
  expect_equal(col$mean, mean(gm@data$sample$x_1))
  expect_equal(col$std, sd(gm@data$sample$x_1))

  # embedded datasets (the editor summarizes those) and missing data are left out
  gm2 <- GraphModel() |> addVariable("x")
  gm2@schema <- .attachDatasetNode(gm2@schema, "emb", data.frame(x = 1:3))
  gm2@data$emb <- data.frame(x = 1:3)
  expect_length(.datasetSummaries(gm2), 0)
  gm3 <- gm
  gm3@data$sample <- NULL
  expect_length(.datasetSummaries(gm3), 0)
})

test_that(".columnSummary handles missing values and text columns", {
  s <- .columnSummary(c(1, NA, 3), "a")
  expect_equal(s$count, 2); expect_equal(s$mean, 2); expect_equal(s$min, 1); expect_equal(s$max, 3)
  t <- .columnSummary(c("u", "v", "", NA, "u"), "b")
  expect_equal(t$count, 3); expect_equal(t$distinct, 2); expect_null(t$mean)
})

# ---- data sources: file connection, embedded, R session ------------------------

test_that(".attachDatasetNode records a file connection, embedded data, or a session-only dataset", {
  dir <- tempfile("src"); dir.create(dir)
  f <- file.path(dir, "d.csv"); write.csv(data.frame(a = 1:3, b = c("x", "y", "z")), f, row.names = FALSE)
  df <- read.csv(f)
  s <- .attachDatasetNode(schemaWith(list()), "d", df, "file", file = f, location = "d.csv")
  ds <- s$models$m1$nodes[[1]]$datasetSource
  expect_equal(ds$type, "file"); expect_equal(ds$location, "d.csv")
  expect_equal(ds$md5, unname(tools::md5sum(f))); expect_equal(ds$rowCount, 3)
  expect_equal(ds$columnTypes, list(a = "number", b = "string"))
  expect_null(ds$object)

  s2 <- .attachDatasetNode(s, "d", df, "session")     # existing node -> session only
  expect_null(s2$models$m1$nodes[[1]]$datasetSource)
  expect_length(s2$models$m1$nodes, 1)
  expect_equal(.attachDatasetNode(s2, "d", df)$models$m1$nodes[[1]]$datasetSource$type, "embedded")
})

test_that(".locationFor is relative inside the launch folder and absolute outside it", {
  base <- normalizePath(tempfile("base"), mustWork = FALSE); dir.create(file.path(base, "sub"), recursive = TRUE)
  inside <- file.path(base, "sub", "x.csv"); writeLines("a", inside)
  expect_equal(.locationFor(inside, base), "sub/x.csv")
  outside <- tempfile("out", fileext = ".csv"); writeLines("a", outside)
  expect_equal(.locationFor(outside, base), normalizePath(outside, winslash = "/"))
})

test_that(".sessionDataFrames lists data frames with their dimensions", {
  env <- new.env()
  env$df1 <- data.frame(a = 1:4, b = 1)
  env$notdf <- 1:3
  expect_equal(.sessionDataFrames(env), list(df1 = c(4L, 2L)))
})

test_that("Load Data from the R session: held in the session by default, embedded on request", {
  skip_if_not_installed("shiny")
  assign("dsem_test_frame_tmp", data.frame(u = 1:5, v = rnorm(5)), envir = globalenv())
  on.exit(rm("dsem_test_frame_tmp", envir = globalenv()), add = TRUE)
  mod <- function(id, initialGM) shiny::moduleServer(id, function(input, output, session)
    .drawSEM_server(input, output, session, initialGM = initialGM))
  run <- function(embed) {
    out <- NULL
    shiny::testServer(mod, args = list(initialGM = GraphModel() |> addVariable("u")), {
      session$setInputs(load_data_request = list(timestamp = 1))
      session$setInputs(data_tab = "r")
      session$setInputs(data_r_pick = "dsem_test_frame_tmp")
      session$setInputs(csv_dataset_name = "frame", data_embed = embed)
      session$setInputs(attach_csv_btn = 1)
      out <<- session$returned$currentModel()
    })
    out
  }
  gm <- run(FALSE)
  node <- Filter(function(n) identical(n$label, "frame"), gm@schema$models[[1]]$nodes)[[1]]
  expect_null(node$datasetSource)                       # session only
  expect_equal(nrow(gm@data$frame), 5)                   # R holds the data
  expect_named(.datasetSummaries(gm), "frame")           # and the editor gets its columns
  gm2 <- run(TRUE)
  node2 <- Filter(function(n) identical(n$label, "frame"), gm2@schema$models[[1]]$nodes)[[1]]
  expect_equal(node2$datasetSource$type, "embedded")
})

# ---- exporting session-only data ---------------------------------------------

sessionModel <- function() {
  gm <- GraphModel() |> addVariable("u")
  df <- data.frame(u = c(1.5, 2.5, NA))
  gm@schema <- .attachDatasetNode(gm@schema, "frame", df, "session")
  gm@data$frame <- df
  gm
}

test_that("exportSchema embeds data held only in the R session by default", {
  gm <- sessionModel()
  expect_equal(.sessionOnlyDatasets(gm), "frame")
  f <- tempfile(fileext = ".json")
  exportSchema(gm, f)
  back <- loadGraphModel(f)
  node <- Filter(function(n) identical(n$label, "frame"), back@schema$models[[1]]$nodes)[[1]]
  expect_equal(node$datasetSource$type, "embedded")
  expect_equal(back@data$frame$u, c(1.5, 2.5, NA))      # reopens with its data
  expect_null(gm@schema$models[[1]]$nodes[[2]]$datasetSource)   # the model itself is unchanged

  f2 <- tempfile(fileext = ".json")
  exportSchema(gm, f2, embedData = FALSE)
  node2 <- Filter(function(n) identical(n$label, "frame"), jsonlite::read_json(f2)$models[[1]]$nodes)[[1]]
  expect_null(node2$datasetSource)
})

test_that("exportSchema leaves file connections as connections", {
  f <- testthat::test_path("..", "..", "drawsem-web", "examples", "graph.example.json")
  skip_if_not(file.exists(f), "example not available")
  gm <- loadGraphModel(f)
  out <- tempfile(fileext = ".json")
  exportSchema(gm, out)
  ds <- Filter(function(n) identical(n$type, "dataset"), jsonlite::read_json(out)$models[[1]]$nodes)[[1]]
  expect_equal(ds$datasetSource$type, "file")
  expect_null(ds$datasetSource$object)
})

test_that("Shiny's Save JSON download embeds session-only data unless unticked", {
  skip_if_not_installed("shiny")
  mod <- function(id, initialGM) shiny::moduleServer(id, function(input, output, session)
    .drawSEM_server(input, output, session, initialGM = initialGM))
  shiny::testServer(mod, args = list(initialGM = sessionModel()), {
    session$setInputs(save_json_request = list(timestamp = 1))
    path <- output$download_json
    node <- Filter(function(n) identical(n$label, "frame"), jsonlite::read_json(path)$models[[1]]$nodes)[[1]]
    expect_equal(node$datasetSource$type, "embedded")
    session$setInputs(json_embed = FALSE)
    path2 <- output$download_json
    node2 <- Filter(function(n) identical(n$label, "frame"), jsonlite::read_json(path2)$models[[1]]$nodes)[[1]]
    expect_null(node2$datasetSource)
  })
})
