# as.MxModel() returns the fitted MxModel from runModel() while the GraphModel
# still matches what was fitted, so the fit's output (estimates, fit
# statistics, summary()) is not lost by converting back to OpenMx.

fittableModel <- function() {
  skip_if_not_installed("OpenMx")
  set.seed(3)
  d <- data.frame(x = rnorm(60)); d$y <- 0.4 * d$x + rnorm(60)
  GraphModel() |>
    addVariable("x") |> addVariable("y") |> addConstant() |>
    addData("data", d) |> connectData("data", c("x", "y")) |>
    addPath("x", "y", 1, freeParameter = "b", value = 0.1) |>
    addPath("x", "x", 2, freeParameter = TRUE, value = 1) |>
    addPath("y", "y", 2, freeParameter = TRUE, value = 1) |>
    addPath("1", "x", 1, freeParameter = TRUE, value = 0) |>
    addPath("1", "y", 1, freeParameter = TRUE, value = 0)
}

fitQuietly <- function(gm) suppressMessages(runModel(gm))

test_that("as.MxModel() on a fitted GraphModel keeps the fit's output", {
  fitted <- fitQuietly(fittableModel())
  mx <- as.MxModel(fitted)
  expect_gt(length(mx@output), 0)
  expect_equal(mx$output$estimate, fitted@lastBuiltModel$output$estimate)
  expect_no_error(summary(mx))
})

test_that("moving nodes keeps the fit and refreshes the layout hints", {
  fitted <- fitQuietly(fittableModel())
  moved <- setLocation(fitted, "x", 123, 456)
  mx <- as.MxModel(moved)
  expect_gt(length(mx@output), 0)
  x_node <- Filter(function(n) identical(n$label, "x"), mx@options$drawSemHints@model$nodes)[[1]]
  expect_equal(c(x_node$visual$x, x_node$visual$y), c(123, 456))
})

test_that("a structural, value or data change gives a fresh, unfitted model", {
  fitted <- fitQuietly(fittableModel())
  expect_length(as.MxModel(changePath(fitted, "x", "y", 1, value = 0.3))@output, 0)
  expect_length(as.MxModel(addVariable(fitted, "z"))@output, 0)
  newData <- fitted
  newData@data$data$x[1] <- 99
  expect_length(as.MxModel(newData)@output, 0)
  expect_length(as.MxModel(fitted, data = list(data = fitted@data$data))@output, 0)
})

test_that("runModel() and generateData() always build fresh, ignoring a cached fit", {
  fitted <- fitQuietly(fittableModel())
  refit <- fitQuietly(fitted)
  expect_gt(length(refit@lastBuiltModel@output), 0)
  expect_length(refit@schema$models[[1]]$provenance$fitResults, 2)
})

test_that("as.GraphModel() on a fitted MxModel round-trips back with its output", {
  mx <- as.MxModel(fitQuietly(fittableModel()))
  back <- suppressWarnings(as.MxModel(as.GraphModel(mx)))
  expect_gt(length(back@output), 0)
  expect_equal(back$output$estimate, mx$output$estimate)
})

test_that("the Shiny server keeps the fit across widget echoes and drags", {
  skip_if_not_installed("shiny")
  fitted <- fitQuietly(fittableModel())
  viaShiny <- function(gm) jsonlite::fromJSON(
    jsonlite::toJSON(gm@schema, auto_unbox = TRUE, null = "null", na = "null", digits = NA),
    simplifyVector = FALSE)
  mod <- function(id, initialGM) shiny::moduleServer(id, function(input, output, session)
    .drawSEM_server(input, output, session, initialGM = initialGM))
  shiny::testServer(mod, args = list(initialGM = fitted), {
    st <- session$returned
    session$setInputs(graph_model = viaShiny(fitted))                       # post-fit echo
    session$setInputs(graph_model = viaShiny(setLocation(fitted, "y", 5, 5)))  # a drag
    expect_gt(length(as.MxModel(st$currentModel())@output), 0)
    session$setInputs(graph_model = viaShiny(changePath(fitted, "x", "y", 1, value = 0.3)))
    expect_length(as.MxModel(st$currentModel())@output, 0)
  })
})

test_that("a fresh fit is not stale, even with named free parameters", {
  # runModel() writes estimates into named free parameters' values; the fit
  # must record the model as returned, or it is stale the moment it is stored.
  fitted <- fitQuietly(fittableModel())          # has freeParameter = "b"
  expect_no_warning(res <- getFitResults(fitted))
  expect_false(identical(res, NA))
  expect_false(isTRUE(res$isStale))
  b <- Filter(function(p) identical(p$freeParameter, "b"), fitted@schema$models[[1]]$paths)[[1]]
  expect_equal(b$value, res$parameterEstimates$b)
  # an actual edit still makes it stale
  expect_warning(getFitResults(changePath(fitted, "x", "y", 1, value = 0.9)), "stale")
})
