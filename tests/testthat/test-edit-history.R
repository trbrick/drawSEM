# The editor's undo history across Done and reopening: R keeps it, opaque, in
# GraphModel@metadata$editHistory and never writes it into the schema.

histBase <- function() {
  GraphModel() |> addVariable("A") |> addVariable("B") |>
    addPath("A", "B", 1, freeParameter = TRUE, value = 1)
}

# A history string as the editor sends it (contents are opaque to R).
fakeHistory <- function(savedAt = "2026-01-01T00:00:00.000Z") {
  sprintf('{"format":"drawSEM-editHistory","version":1,"savedAt":"%s","present":{"models":{},"current":null},"past":[{"models":{},"current":null}],"future":[]}',
          savedAt)
}

histCtx <- function(line) {
  list(id = "doc1", contents = line,
       selection = list(list(range = list(start = c(1, 1), end = c(1, 1)), text = "")))
}

histModule <- function(id, initialGM) {
  shiny::moduleServer(id, function(input, output, session) {
    .drawSEM_server(input, output, session, initialGM = initialGM)
  })
}

doneWith <- function(gm, payload, echo = NULL) {
  got <- NULL
  app <- shiny::shinyApp(
    ui = .drawSEM_ui(),
    server = function(input, output, session) {
      .drawSEM_server(input, output, session, initialGM = gm, onDone = function(m) got <<- m)
    })
  shiny::testServer(app, {
    session$setInputs(graph_tool_ready = TRUE)
    if (!is.null(echo)) session$setInputs(graph_model = echo)
    session$setInputs(done_request = payload)
    session$flushReact()
  })
  got
}

test_that("Done keeps the editor's history in @metadata$editHistory, also after edits synced from the editor", {
  skip_if_not_installed("shiny")
  h <- fakeHistory()
  got <- doneWith(histBase(), list(timestamp = 1, editHistory = h))
  expect_identical(got@metadata$editHistory, h)

  # graph_model syncs rebuild the GraphModel; the history still arrives on Done
  moved <- setLocation(histBase(), "A", 10, 20)
  echo <- jsonlite::fromJSON(jsonlite::toJSON(moved@schema, auto_unbox = TRUE, null = "null"),
                             simplifyVector = FALSE)
  got <- doneWith(histBase(), list(timestamp = 1, editHistory = h), echo = echo)
  expect_identical(got@metadata$editHistory, h)
  expect_equal(got@schema$models[[1]]$nodes[[1]]$visual$x, 10)
})

test_that("Done without a history clears an old one (the editor sends none when there is nothing to undo)", {
  skip_if_not_installed("shiny")
  gm <- histBase()
  gm@metadata$editHistory <- fakeHistory()
  got <- doneWith(gm, list(timestamp = 1))
  expect_null(got@metadata$editHistory)
})

test_that("reopening hands the history back to the widget, outside the schema", {
  skip_if_not_installed("shiny")
  gm <- histBase()
  gm@metadata$editHistory <- fakeHistory()

  # drawSEM(initialModel = gm) keeps the GraphModel's metadata
  expect_identical(.resolveInitialModel(gm, NULL)@metadata$editHistory, gm@metadata$editHistory)

  w <- .withEditHistory(semWidget(initialModel = gm@schema), gm@metadata$editHistory)
  expect_identical(w$x$editHistory, gm@metadata$editHistory)
  expect_null(w$x$initialModel$editHistory)
  expect_null(.withEditHistory(semWidget(initialModel = gm@schema), NULL)$x$editHistory)

  # the server's widget carries it
  html <- NULL
  app <- shiny::shinyApp(
    ui = .drawSEM_ui(),
    server = function(input, output, session) .drawSEM_server(input, output, session, initialGM = gm))
  shiny::testServer(app, { html <<- output$sem_widget_ui$html })
  expect_match(as.character(html), "drawSEM-editHistory", fixed = TRUE)
})

test_that("a Done -> reopen -> Done round trip keeps the latest history", {
  skip_if_not_installed("shiny")
  first <- doneWith(histBase(), list(timestamp = 1, editHistory = fakeHistory("2026-01-01T00:00:00.000Z")))
  second <- doneWith(first, list(timestamp = 2, editHistory = fakeHistory("2026-01-02T00:00:00.000Z")))
  expect_match(second@metadata$editHistory, "2026-01-02", fixed = TRUE)
})

test_that("exportSchema() never writes the edit history", {
  gm <- histBase()
  gm@metadata$editHistory <- fakeHistory()
  f <- tempfile(fileext = ".json"); on.exit(unlink(f))
  exportSchema(gm, f)
  txt <- paste(readLines(f, warn = FALSE), collapse = "\n")
  expect_false(grepl("editHistory", txt, fixed = TRUE))
  expect_false(grepl("drawSEM-editHistory", txt, fixed = TRUE))
  expect_null(loadGraphModel(f, data = list())@metadata$editHistory)
})

# ---- addin ------------------------------------------------------------------
# The addin returns code, not the GraphModel, so the history is remembered per
# variable name for the session.

test_that("the addin remembers the history from Done and reopens the same variable with it", {
  rm(list = ls(.addinHistory), envir = .addinHistory)
  on.exit(rm(list = ls(.addinHistory), envir = .addinHistory), add = TRUE)
  env <- new.env(); env$mm <- histBase()
  h <- fakeHistory()
  seen <- list()
  launchWith <- function(history) function(gm, onDone) {
    seen <<- c(seen, list(gm@metadata$editHistory))
    out <- setLocation(gm, "A", 1, 2)
    out@metadata$editHistory <- history
    onDone(out)
    out
  }
  suppressMessages(.runEditAddin(histCtx("mm"), launch = launchWith(h),
                                 insert = function(...) NULL, env = env))
  suppressMessages(.runEditAddin(histCtx("mm"), launch = launchWith(NULL),
                                 insert = function(...) NULL, env = env))
  expect_null(seen[[1]])
  expect_identical(seen[[2]], h)
  # the second Done sent no history, so none is remembered any more
  expect_false(exists("mm", envir = .addinHistory, inherits = FALSE))
})

test_that("the addin offers the more recently saved of the model's own and the remembered history", {
  old <- fakeHistory("2026-01-01T00:00:00.000Z")
  new <- fakeHistory("2026-02-01T00:00:00.000Z")
  expect_identical(.addinPickHistory(old, new), new)
  expect_identical(.addinPickHistory(new, old), new)
  expect_identical(.addinPickHistory(NULL, old), old)
  expect_identical(.addinPickHistory(old, NULL), old)
  expect_null(.addinPickHistory(NULL, NULL))
})

# ---- fit status across undo/redo ----------------------------------------------

test_that("a stale fit becomes current again when the structure returns to the fitted one", {
  skip_if_not_installed("shiny")
  skip_if_not_installed("OpenMx")
  d <- data.frame(x = rnorm(60)); d$y <- d$x * 0.5 + rnorm(60)
  gm <- GraphModel() |>
    addVariable("x") |> addVariable("y") |> addConstant() |>
    addData("data", d) |> connectData("data", c("x", "y")) |>
    addPath("x", "y", 1, freeParameter = TRUE, value = 0.3) |>
    addPath("x", "x", 2, freeParameter = TRUE, value = 1) |>
    addPath("y", "y", 2, freeParameter = TRUE, value = 1) |>
    addPath("1", "x", 1, freeParameter = TRUE, value = 0.1) |>
    addPath("1", "y", 1, freeParameter = TRUE, value = 0.1)
  fitted <- suppressMessages(runModel(gm, silent = TRUE))
  # an edit (the provenance travels with it, as the editor carries it forward)
  edited <- addPath(fitted, "y", "x", 1, freeParameter = TRUE, value = 0)
  toInput <- function(m) jsonlite::fromJSON(
    jsonlite::toJSON(m@schema, auto_unbox = TRUE, null = "null", na = "null", digits = NA),
    simplifyVector = FALSE)

  statuses <- character(0)
  shiny::testServer(histModule, args = list(initialGM = fitted), {
    st <- session$returned
    session$setInputs(graph_model = toInput(fitted))     # the echo of the opened model
    session$setInputs(graph_model = toInput(edited))     # the edit: stale
    statuses <<- c(statuses, st$fitStatus())
    session$setInputs(graph_model = toInput(fitted))     # undo: current again
    statuses <<- c(statuses, st$fitStatus())
  })
  expect_equal(statuses, c("stale", "converged"))
})
