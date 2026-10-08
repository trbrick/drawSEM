# The saved editor view: models[k]$visualization viewport / activeLayer /
# offLayerVisibility. Set with setVisualization(), persisted by the addin's
# Done, and never stripped on the R paths a model travels.

visBase <- function() {
  GraphModel() |> addVariable("F") |> addVariable("x1") |> addVariable("x2") |>
    addPath("F", "x1", 1, freeParameter = TRUE, value = 1) |>
    addPath("F", "x2", 1, freeParameter = TRUE, value = 1) |>
    setLocation(c("F", "x1", "x2"), c(0, -100, 100), c(0, 150, 150))
}

VIEW <- list(
  viewport = list(x = -250, y = -120.5, width = 400, height = 300),
  activeLayer = "all",
  offLayerVisibility = "transparent"
)

withView <- function(gm = visBase()) {
  gm@schema$models[[1]]$visualization <- c(list(anchor = list(x = 1, y = 2)), VIEW)
  gm
}

visOf <- function(gm) gm@schema$models[[1]]$visualization

# ---- setVisualization() ------------------------------------------------------

test_that("setVisualization() stores the view in schema form", {
  gm <- setVisualization(visBase(), viewport = c(x = -250, y = -120.5, width = 400, height = 300),
                         activeLayer = "all", offLayerVisibility = "transparent")
  expect_identical(visOf(gm), VIEW)
  # unnamed c(x, y, width, height) and a list work too
  expect_identical(visOf(setVisualization(visBase(), viewport = c(-250, -120.5, 400, 300)))$viewport,
                   VIEW$viewport)
  expect_identical(visOf(setVisualization(visBase(), viewport = VIEW$viewport))$viewport,
                   VIEW$viewport)
  # named out of order is reordered
  expect_identical(
    visOf(setVisualization(visBase(), viewport = c(width = 400, height = 300, x = -250, y = -120.5)))$viewport,
    VIEW$viewport)
})

test_that("setVisualization(): NA leaves a value unchanged, FALSE removes it", {
  gm <- withView()
  same <- setVisualization(gm)
  expect_identical(visOf(same), visOf(gm))
  cleared <- setVisualization(gm, viewport = FALSE)
  expect_null(visOf(cleared)$viewport)
  expect_identical(visOf(cleared)$activeLayer, "all")
  expect_identical(visOf(cleared)$anchor, list(x = 1, y = 2)) # other keys untouched
  layer <- setVisualization(gm, activeLayer = "data")
  expect_identical(visOf(layer)$activeLayer, "data")
  expect_identical(visOf(layer)$viewport, VIEW$viewport)
  # clearing everything removes the visualization object
  none <- setVisualization(visBase(), activeLayer = "sem") |> setVisualization(activeLayer = FALSE)
  expect_null(visOf(none))
  expect_false("visualization" %in% names(none@schema$models[[1]]))
})

test_that("setVisualization() validates its arguments", {
  gm <- visBase()
  expect_error(setVisualization(gm, viewport = c(0, 0, 0, 10)), "viewport")
  expect_error(setVisualization(gm, viewport = c(0, 0, 10)), "viewport")
  expect_error(setVisualization(gm, viewport = c(0, NA, 10, 10)), "viewport")
  expect_error(setVisualization(gm, viewport = c(a = 0, b = 0, width = 1, height = 1)), "viewport")
  expect_error(setVisualization(gm, activeLayer = "both"), "activeLayer")
  expect_error(setVisualization(gm, offLayerVisibility = "hidden"), "offLayerVisibility")
  expect_error(setVisualization(gm, activeLayer = TRUE), "activeLayer")
  expect_error(setVisualization(list(), activeLayer = "all"), "GraphModel")
})

test_that("a model with a view is valid against the JSON schema", {
  skip_if_not_installed("jsonvalidate")
  schemaFile <- system.file("extdata", "graph.schema.json", package = "drawSEM")
  skip_if(!nzchar(schemaFile), "schema not installed")
  json <- jsonlite::toJSON(withView()@schema[c("schemaVersion", "models")], auto_unbox = TRUE,
                           null = "null", digits = NA)
  v <- jsonvalidate::json_validator(schemaFile, engine = "ajv")
  expect_true(v(json, error = FALSE))
})

# ---- survives the R paths ----------------------------------------------------

test_that("the verbs keep visualization", {
  gm <- withView() |>
    addVariable("x3") |>
    addPath("F", "x3", 1) |>
    changePath("F", "x3", value = 0.5) |>
    removePath("F", "x3") |>
    removeVariable("x3") |>
    addConstant("1") |>
    setLocation("F", 5, 5) |>
    setManifestLatent("x1", "latent")
  expect_identical(visOf(gm), visOf(withView()))
})

test_that("as.GraphModel() of a schema list and the JSON file round trip keep visualization", {
  gm <- withView()
  expect_identical(visOf(as.GraphModel(gm@schema)), visOf(gm))
  f <- tempfile(fileext = ".json")
  on.exit(unlink(f))
  exportSchema(gm, f)
  back <- loadGraphModel(f)
  expect_equal(visOf(back), visOf(gm))
  expect_type(visOf(back)$viewport, "list")
  # Shiny-style transport (the graph_model echo)
  echoed <- as.GraphModel(jsonlite::fromJSON(
    jsonlite::toJSON(gm@schema, auto_unbox = TRUE, null = "null", na = "null", digits = NA),
    simplifyVector = FALSE))
  expect_equal(visOf(echoed), visOf(gm))
})

test_that("as.MxModel() -> as.GraphModel() keeps visualization (via drawSemHints)", {
  skip_if_not_installed("OpenMx")
  gm <- withView()
  mx <- suppressWarnings(as.MxModel(gm))
  expect_identical(mx@options$drawSemHints@model$visualization, visOf(gm))
  back <- suppressWarnings(as.GraphModel(mx))
  expect_identical(visOf(back), visOf(gm))
  # setLocation() on the MxModel keeps it too
  moved <- suppressWarnings(setLocation(mx, "F", 1, 1))
  expect_identical(visOf(suppressWarnings(as.GraphModel(moved))), visOf(gm))
})

test_that("setVisualization() on an MxModel writes only its drawSemHints", {
  skip_if_not_installed("OpenMx")
  mx <- suppressWarnings(as.MxModel(visBase()))
  out <- suppressWarnings(setVisualization(mx, viewport = c(1, 2, 3, 4), activeLayer = "data"))
  expect_s4_class(out, "MxModel")
  expect_identical(out@options$drawSemHints@model$visualization,
                   list(viewport = list(x = 1, y = 2, width = 3, height = 4), activeLayer = "data"))
  out@options$drawSemHints <- NULL
  mx@options$drawSemHints <- NULL
  expect_identical(out, mx)
})

test_that("plotGraphModel() passes the stored view through", {
  gm <- withView()
  w <- plotGraphModel(gm, editable = FALSE, showDataPaths = FALSE)
  expect_identical(w$x$initialModel$models[[1]]$visualization, visOf(gm))
  # and to the JSON the widget receives
  json <- jsonlite::fromJSON(htmlwidgets:::toJSON(w$x), simplifyVector = FALSE)
  expect_equal(json$initialModel$models[[1]]$visualization$viewport, VIEW$viewport)
})

test_that("plotGraphModel(): showDataPaths wins over a contradicting stored layer (display copy only)", {
  layerShown <- function(stored, showDataPaths) {
    gm <- visBase()
    if (!is.null(stored)) gm <- setVisualization(gm, activeLayer = stored)
    w <- plotGraphModel(gm, editable = FALSE, showDataPaths = showDataPaths)
    w$x$initialModel$models[[1]]$visualization$activeLayer
  }
  # showDataPaths = FALSE: datasets removed, a Data layer becomes SEM
  expect_null(layerShown(NULL, FALSE))
  expect_identical(layerShown("sem", FALSE), "sem")
  expect_identical(layerShown("all", FALSE), "all")
  expect_identical(layerShown("data", FALSE), "sem")
  # showDataPaths = TRUE: the requested datasets must be visible
  expect_identical(layerShown(NULL, TRUE), "all")
  expect_identical(layerShown("sem", TRUE), "all")
  expect_identical(layerShown("all", TRUE), "all")
  expect_identical(layerShown("data", TRUE), "data")
  # the model itself is not changed
  gm <- setVisualization(visBase(), activeLayer = "data")
  invisible(plotGraphModel(gm, editable = FALSE))
  expect_identical(visOf(gm)$activeLayer, "data")
})

# ---- Done: the addin persists the view, drawSEM() does not ---------------------

doneWith <- function(gm, editMode, payload) {
  got <- NULL
  app <- shiny::shinyApp(
    ui = .drawSEM_ui(),
    server = function(input, output, session) {
      .drawSEM_server(input, output, session, initialGM = gm, editMode = editMode,
                      onDone = function(m) got <<- m)
    })
  shiny::testServer(app, {
    session$setInputs(graph_tool_ready = TRUE)
    session$setInputs(done_request = payload)
    session$flushReact()
  })
  got
}

SENT <- list(model1 = list(viewport = list(x = 10, y = 20, width = 300, height = 200),
                           activeLayer = "sem", offLayerVisibility = "invisible"))

test_that("addin Done (layout-only) applies the view sent with done_request", {
  skip_if_not_installed("shiny")
  gm <- withView()
  got <- doneWith(gm, "layout", list(timestamp = 1, visualization = SENT))
  expect_identical(visOf(got)[c("viewport", "activeLayer", "offLayerVisibility")], SENT$model1)
  expect_identical(visOf(got)$anchor, list(x = 1, y = 2))
  # no view sent: unchanged
  expect_identical(visOf(doneWith(gm, "layout", list(timestamp = 1))), visOf(gm))
})

test_that("drawSEM() Done (full editing) never writes the view", {
  skip_if_not_installed("shiny")
  gm <- withView()
  got <- doneWith(gm, "full", list(timestamp = 1, visualization = SENT))
  expect_identical(visOf(got), visOf(gm))
})

test_that(".applyDoneVisualization() ignores unknown models and malformed views", {
  gm <- withView()
  expect_identical(.applyDoneVisualization(gm, NULL), gm)
  expect_identical(.applyDoneVisualization(gm, list(other = SENT$model1)), gm)
  bad <- list(model1 = list(viewport = list(x = 0, y = 0, width = -1, height = 1)))
  expect_message(out <- .applyDoneVisualization(gm, bad), "ignoring")
  expect_identical(out, gm)
})

# ---- addin code generation -----------------------------------------------------

test_that("a changed view is inserted as a setVisualization() call that reproduces it", {
  before <- withView()
  after <- .applyDoneVisualization(before, SENT)
  res <- .visualEditCode(before, after, varName = "mm")
  expect_equal(res$tier, "patch")
  expect_length(res$calls, 1)
  expect_match(res$code, "mm <- mm |>\n  drawSEM::setVisualization(", fixed = TRUE)
  expect_match(res$code, "viewport = c(x = 10, y = 20, width = 300, height = 200)", fixed = TRUE)
  expect_match(res$code, 'activeLayer = "sem"', fixed = TRUE)
  expect_match(res$code, 'offLayerVisibility = "invisible"', fixed = TRUE)
  expect_identical(visOf(.applyCalls(before, res$calls)), visOf(after))
  # the inserted code itself evaluates to the same view
  mm <- before
  out <- eval(parse(text = res$code))
  expect_identical(visOf(out), visOf(after))
})

test_that("only the changed view keys are set; positions and view combine", {
  before <- withView()
  after <- setVisualization(before, activeLayer = "data") |> setLocation("F", 7, 8)
  res <- .visualEditCode(before, after, varName = "mm")
  expect_equal(vapply(res$calls, `[[`, "", "fn"), c("setLocation", "setVisualization"))
  expect_identical(res$calls[[2]]$args, list(activeLayer = "data"))
  expect_identical(visOf(.applyCalls(before, res$calls)), visOf(after))
})

test_that("an unchanged view inserts nothing", {
  gm <- withView()
  # through JSON (number types may change) the view is still equal
  echoed <- as.GraphModel(jsonlite::fromJSON(
    jsonlite::toJSON(gm@schema, auto_unbox = TRUE, null = "null", digits = NA),
    simplifyVector = FALSE))
  expect_equal(.visualEditCode(gm, echoed)$tier, "none")
})

test_that("addin flow: a view-only edit inserts setVisualization() (MxModel origin too)", {
  env <- new.env(); env$mm <- visBase()
  ctx <- list(id = "doc1", contents = c("mm"),
              selection = list(list(range = list(start = c(1, 1), end = c(1, 1)), text = "")))
  got <- NULL
  tier <- .runEditAddin(ctx,
    launch = function(gm, ...) .applyDoneVisualization(gm, SENT),
    insert = function(text, ...) got <<- text, env = env)
  expect_equal(tier, "patch")
  expect_match(got, "mm <- mm |>", fixed = TRUE)
  expect_match(got, "drawSEM::setVisualization(", fixed = TRUE)

  skip_if_not_installed("OpenMx")
  env$mx <- suppressWarnings(as.MxModel(visBase()))
  ctx$contents <- "mx"
  got <- NULL
  tier <- suppressWarnings(.runEditAddin(ctx,
    launch = function(gm, ...) .applyDoneVisualization(gm, list(m = SENT$model1) |>
                                                         stats::setNames(names(gm@schema$models)[1])),
    insert = function(text, ...) got <<- text, env = env))
  expect_equal(tier, "patch")
  mx <- env$mx
  out <- suppressWarnings(eval(parse(text = sub("^# Edited with drawSEM \\(layout\\)\n", "", got))))
  expect_s4_class(out, "MxModel")
  expect_identical(
    suppressWarnings(as.GraphModel(out))@schema$models[[1]]$visualization[c("viewport", "activeLayer", "offLayerVisibility")],
    SENT$model1)
})
