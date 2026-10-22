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

test_that("runModel() records the standard errors OpenMx computed", {
  fitted <- fitQuietly(fittableModel())
  res <- getFitResults(fitted)
  se <- unlist(res$standardErrors)
  expect_setequal(names(se), names(res$parameterEstimates))
  expect_false(anyNA(se))
  expect_true(all(se > 0))
  osd <- fitted@lastBuiltModel$output$standardErrors
  expect_equal(se[["b"]], unname(osd["b", 1]))
})

test_that("summary() of a fitted GraphModel copes with missing standard errors", {
  fitted <- fitQuietly(fittableModel())
  # as after the widget's JSON round trip: NA SEs come back as NULL
  fr <- fitted@schema$models[[1]]$provenance$fitResults
  fr[[length(fr)]]$standardErrors <- lapply(fr[[length(fr)]]$standardErrors, function(x) NULL)
  fitted@schema$models[[1]]$provenance$fitResults <- fr
  out <- NULL
  expect_no_error(capture.output(out <- summary(fitted)))
  expect_length(out$standardErrors, length(out$parameterEstimates))
  expect_true(all(is.na(out$standardErrors)))
})

test_that("the fit record keeps OpenMx's own summary, tagged as from OpenMx", {
  fitted <- fitQuietly(fittableModel())
  rec <- getFitResults(fitted)
  bo <- rec$backendOutput
  expect_equal(bo$tool, "OpenMx")
  expect_equal(bo$version, as.character(utils::packageVersion("OpenMx")))
  s <- summary(fitted@lastBuiltModel)
  expect_equal(bo$summary$Minus2LogLikelihood, s$Minus2LogLikelihood)
  expect_equal(bo$summary$estimatedParameters, s$estimatedParameters)
  expect_equal(bo$summary$informationCriteria$AIC$par, unname(s$informationCriteria["AIC:", "par"]))
  expect_equal(bo$summary$informationCriteria$BIC$par, unname(s$informationCriteria["BIC:", "par"]))
  expect_null(bo$summary$dataSummary)
  expect_length(bo$summary$parameters, nrow(s$parameters))

  ic <- .fitInfoCriteria(rec)
  expect_equal(ic$AIC, unname(s$informationCriteria["AIC:", "par"]))
  expect_equal(ic$BIC, unname(s$informationCriteria["BIC:", "par"]))

  # JSON-safe, and survives a round trip through the schema
  json <- jsonlite::toJSON(fitted@schema, auto_unbox = TRUE, null = "null", na = "null", digits = NA)
  back <- as.GraphModel(jsonlite::fromJSON(json, simplifyVector = FALSE))
  bo2 <- back@schema$models[[1]]$provenance$fitResults[[1]]$backendOutput
  expect_equal(bo2$summary$informationCriteria$AIC$par, bo$summary$informationCriteria$AIC$par)
})

test_that("summary() of a GraphModel reports OpenMx's AIC and BIC", {
  fitted <- fitQuietly(fittableModel())
  out <- NULL
  txt <- capture.output(out <- summary(fitted))
  expect_true(any(grepl("^AIC: ", txt)))
  expect_equal(out$informationCriteria$AIC,
               unname(summary(fitted@lastBuiltModel)$informationCriteria["AIC:", "par"]))
})

test_that("as.GraphModel() on a fitted MxModel records the fit", {
  mx <- as.MxModel(fitQuietly(fittableModel()))
  gm <- suppressWarnings(as.GraphModel(mx))
  res <- getFitResults(gm)
  expect_true(is.list(res))
  expect_true(res$converged)
  expect_equal(unlist(res$parameterEstimates), mx$output$estimate)
  expect_equal(res$backendOutput$tool, "OpenMx")
  # recorded with OpenMx's fit time, not the conversion time
  expect_equal(res$timestamp, format(summary(mx)$timestamp, "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"))
})

test_that("an unfitted MxModel converts with no fit record", {
  gm <- suppressWarnings(as.GraphModel(as.MxModel(fittableModel())))
  expect_null(getFitResults(gm))
})

test_that("drawSEM's server starts with the model's fit status", {
  skip_if_not_installed("shiny")
  mod <- function(id, initialGM) shiny::moduleServer(id, function(input, output, session)
    .drawSEM_server(input, output, session, initialGM = initialGM))
  statusOf <- function(gm) {
    out <- NULL
    shiny::testServer(mod, args = list(initialGM = gm), out <<- session$returned$fitStatus())
    out
  }
  fitted <- fitQuietly(fittableModel())
  expect_equal(statusOf(fittableModel()), "unfitted")
  expect_equal(statusOf(fitted), "converged")
  expect_equal(statusOf(suppressWarnings(as.GraphModel(as.MxModel(fitted)))), "converged")
  expect_equal(statusOf(changePath(fitted, "x", "y", 1, value = 0.9)), "stale")
})
