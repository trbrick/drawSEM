test_that("buildPathList constructs correct mxPath specifications", {
  paths <- list(
    list(from = "F1", to = "x1", numberOfArrows = 1, freeParameter = TRUE, value = 1.0),
    list(from = "x1", to = "x1", numberOfArrows = 2, value = 1.0)
  )

  result <- buildPathList(paths, constantNodeLabels = NULL)

  expect_length(result, 2)
  expect_equal(result[[1]]$from, "F1")
  expect_equal(result[[1]]$to, "x1")
  expect_equal(result[[1]]$arrows, 1)
  expect_true(result[[1]]$free)
  expect_equal(result[[1]]$values, 1.0)

  expect_equal(result[[2]]$arrows, 2)
  expect_false(result[[2]]$free)
  expect_equal(result[[2]]$values, 1.0)
})

test_that("buildPathList converts constant node label to 'one'", {
  paths <- list(
    list(from = "1", to = "x1", numberOfArrows = 1, freeParameter = TRUE)
  )

  result <- buildPathList(paths, constantNodeLabels = "1")

  expect_equal(result[[1]]$from, "one")
})

test_that("buildPathList applies 0.1 default for free null parameters", {
  paths <- list(
    list(from = "F1", to = "x1", numberOfArrows = 1, freeParameter = TRUE, value = NULL)
  )

  result <- buildPathList(paths, constantNodeLabels = NULL)

  expect_equal(result[[1]]$values, 0.1)
})

test_that("buildPathList preserves non-null values for free parameters", {
  paths <- list(
    list(from = "F1", to = "x1", numberOfArrows = 1, freeParameter = TRUE, value = 2.5)
  )

  result <- buildPathList(paths, constantNodeLabels = NULL)

  expect_equal(result[[1]]$values, 2.5)
})

test_that("buildPathList preserves labels when present", {
  paths <- list(
    list(from = "F1", to = "x1", numberOfArrows = 1, freeParameter = TRUE, label = "loading_1")
  )

  result <- buildPathList(paths, constantNodeLabels = NULL)

  expect_equal(result[[1]]$labels, "loading_1")
})

test_that("buildPathList uses freeParameter string as mxPath label for named free parameters", {
  paths <- list(
    list(from = "F1", to = "x1", numberOfArrows = 1, freeParameter = "lambda_x1", value = 0.8)
  )

  result <- buildPathList(paths, constantNodeLabels = NULL)

  expect_equal(result[[1]]$labels, "lambda_x1")
  expect_true(result[[1]]$free)
  expect_equal(result[[1]]$values, 0.8)
})

test_that("buildPathList enforces equality constraints via shared freeParameter name", {
  paths <- list(
    list(from = "F1", to = "x1", numberOfArrows = 1, freeParameter = "lambda", value = 1.0),
    list(from = "F1", to = "x2", numberOfArrows = 1, freeParameter = "lambda", value = 1.0)
  )

  result <- buildPathList(paths, constantNodeLabels = NULL)

  expect_equal(length(result), 2)
  expect_equal(result[[1]]$labels, "lambda")
  expect_equal(result[[2]]$labels, "lambda")
  expect_true(result[[1]]$free)
  expect_true(result[[2]]$free)
})

test_that("buildPathList: named freeParameter takes precedence over path$label", {
  paths <- list(
    list(from = "F1", to = "x1", numberOfArrows = 1,
         freeParameter = "param_name", label = "display_label", value = 1.0)
  )

  result <- buildPathList(paths, constantNodeLabels = NULL)

  # freeParameter string is the mxPath label (equality constraint name)
  expect_equal(result[[1]]$labels, "param_name")
})

test_that("getConstantNodeLabels identifies constant node correctly", {
  schema <- list(
    nodes = list(
      list(label = "F1", type = "variable"),
      list(label = "1", type = "constant"),
      list(label = "x1", type = "variable")
    )
  )

  result <- getConstantNodeLabels(schema$nodes)
  expect_equal(result, "1")
})

test_that("getConstantNodeLabels returns every constant node label", {
  schema <- list(
    nodes = list(
      list(label = "F1", type = "variable"),
      list(label = "1", type = "constant"),
      list(label = "x1", type = "variable"),
      list(label = "1b", type = "constant"),
      list(label = "d", type = "dataset")
    )
  )

  result <- getConstantNodeLabels(schema$nodes)
  expect_equal(result, c("1", "1b"))
})

test_that("getConstantNodeLabels returns character(0) when no constant node", {
  schema <- list(
    nodes = list(
      list(label = "F1", type = "variable"),
      list(label = "x1", type = "variable")
    )
  )

  result <- getConstantNodeLabels(schema$nodes)
  expect_identical(result, character(0))
})

test_that("buildPathList converts every constant node label to 'one'", {
  paths <- list(
    list(from = "1", to = "x1", numberOfArrows = 1, freeParameter = TRUE, type = "constant"),
    list(from = "1b", to = "x2", numberOfArrows = 1, freeParameter = TRUE, type = "constant"),
    list(from = "F1", to = "x1", numberOfArrows = 1, freeParameter = TRUE)
  )

  result <- buildPathList(paths, constantNodeLabels = c("1", "1b"))

  expect_equal(result[[1]]$from, "one")
  expect_equal(result[[2]]$from, "one")
  # Non-constant sources are untouched
  expect_equal(result[[3]]$from, "F1")
  # The `to` side is never translated (constants are sources only)
  expect_equal(result[[1]]$to, "x1")
  expect_equal(result[[2]]$to, "x2")
})

test_that("inferManifestVariables identifies variables with dataset paths", {
  nodes <- list(
    list(label = "F1", type = "variable"),
    list(label = "x1", type = "variable"),
    list(label = "x2", type = "variable"),
    list(label = "data", type = "dataset")
  )

  paths <- list(
    list(from = "data", to = "x1", type = "data"),
    list(from = "data", to = "x2", type = "data")
  )

  result <- inferManifestVariables(nodes, paths)
  expect_equal(sort(result), c("x1", "x2"))
  expect_false("F1" %in% result)
})

test_that("inferLatentVariables identifies non-manifest variables", {
  nodes <- list(
    list(label = "F1", type = "variable"),
    list(label = "x1", type = "variable"),
    list(label = "x2", type = "variable"),
    list(label = "data", type = "dataset")
  )

  paths <- list(
    list(from = "data", to = "x1", type = "data"),
    list(from = "data", to = "x2", type = "data")
  )

  manifest <- inferManifestVariables(nodes, paths)
  result <- inferLatentVariables(nodes, manifest)

  expect_equal(result, "F1")
  expect_false("x1" %in% result)
  expect_false("x2" %in% result)
})

test_that("collectUnsupportedFeatures detects 0-headed paths", {
  schema <- list(
    models = list(
      model1 = list(
        nodes = list(
          list(label = "x1", type = "variable"),
          list(label = "x2", type = "variable")
        ),
        paths = list(
          list(from = "x1", to = "x2", numberOfArrows = 0)
        )
      )
    )
  )

  result <- collectUnsupportedFeatures(schema)
  expect_true("zeroHeadedPaths" %in% names(result))
  expect_true(result$zeroHeadedPaths)
})

test_that("collectUnsupportedFeatures detects link functions", {
  schema <- list(
    models = list(
      model1 = list(
        nodes = list(
          list(label = "F1", type = "linkFunction")
        ),
        paths = list()
      )
    )
  )

  result <- collectUnsupportedFeatures(schema)
  expect_true(result$linkFunctions)
})

test_that("collectUnsupportedFeatures detects priors", {
  schema <- list(
    models = list(
      model1 = list(
        nodes = list(),
        paths = list(
          list(
            from = "x1", to = "x2", numberOfArrows = 1,
            optimization = list(prior = list(distribution = "normal"))
          )
        )
      )
    )
  )

  result <- collectUnsupportedFeatures(schema)
  expect_true(result$priors)
})

test_that("renameDataColumns maps column names correctly", {
  data <- data.frame(
    col1 = c(1, 2, 3),
    col2 = c(4, 5, 6)
  )

  mapping <- list(x1 = "col1", x2 = "col2")

  result <- renameDataColumns(data, mapping)

  expect_equal(colnames(result), c("x1", "x2"))
  expect_equal(result$x1, data$col1)
  expect_equal(result$x2, data$col2)
})

test_that("renameDataColumns handles partial mapping", {
  data <- data.frame(
    col1 = c(1, 2, 3),
    col2 = c(4, 5, 6),
    col3 = c(7, 8, 9)
  )

  mapping <- list(x1 = "col1", x2 = "col2")

  result <- renameDataColumns(data, mapping)

  expect_equal(colnames(result), c("x1", "x2"))
  expect_equal(nrow(result), 3)
})

test_that("storeOptimizationMetadata extracts bounds", {
  paths <- list(
    list(
      from = "F1", to = "x1", numberOfArrows = 1,
      optimization = list(bounds = c(0, 5))
    )
  )

  result <- storeOptimizationMetadata(paths)

  expect_true("bounds" %in% names(result))
  expect_equal(result$bounds[[1]], c(0, 5))
})

test_that("storeOptimizationMetadata extracts priors", {
  paths <- list(
    list(
      from = "F1", to = "x1", numberOfArrows = 1,
      optimization = list(prior = list(distribution = "normal", mean = 0, sd = 1))
    )
  )

  result <- storeOptimizationMetadata(paths)

  expect_true("priors" %in% names(result))
})

# --- Item 4b: pendingCore conversion policy (onUnsupported) --------------------

# Helper: a model whose only non-core element is a 0-headed path (relocated to
# extensions$pendingCore on import).
pendingCoreGraphModel <- function() {
  suppressWarnings(as.GraphModel(list(
    schemaVersion = 0,
    models = list(model1 = list(
      nodes = list(
        list(label = "x1", type = "variable"),
        list(label = "x2", type = "variable")
      ),
      paths = list(
        list(from = "x1", to = "x1", numberOfArrows = 2, value = 1.0),
        list(from = "x2", to = "x2", numberOfArrows = 2, value = 1.0),
        list(from = "x1", to = "x2", numberOfArrows = 0, value = 1.0)
      )
    ))
  )))
}

test_that("schemaToOpenMx refuses pendingCore by default, naming blocker and remedy", {
  gm <- pendingCoreGraphModel()

  err <- expect_error(schemaToOpenMx(gm@schema, list(), onUnsupported = "stop"))
  msg <- conditionMessage(err)
  expect_match(msg, "non-core feature")
  expect_match(msg, "selection")          # the blocker is listed
  expect_match(msg, "onUnsupported")      # remedy: ignore
  expect_match(msg, "dropUnsupported")    # remedy: drop
  expect_match(msg, "extensions\\$pendingCore")  # where to inspect
})

test_that("schemaToOpenMx onUnsupported='ignore' builds a reduced model and warns", {
  gm <- pendingCoreGraphModel()

  expect_warning(
    om <- schemaToOpenMx(gm@schema, list(), onUnsupported = "ignore"),
    "ignoring 1 non-core feature"
  )
  expect_s4_class(om, "MxModel")
})

test_that("only the model carrying pendingCore is refused", {
  gm <- suppressWarnings(as.GraphModel(list(
    schemaVersion = 0,
    models = list(
      clean = list(
        nodes = list(list(label = "x1", type = "variable")),
        paths = list(list(from = "x1", to = "x1", numberOfArrows = 2, value = 1.0))
      ),
      dirty = list(
        nodes = list(
          list(label = "y1", type = "variable"),
          list(label = "y2", type = "variable")
        ),
        paths = list(
          list(from = "y1", to = "y1", numberOfArrows = 2, value = 1.0),
          list(from = "y2", to = "y2", numberOfArrows = 2, value = 1.0),
          list(from = "y1", to = "y2", numberOfArrows = 0, value = 1.0)
        )
      )
    )
  )))

  expect_s4_class(
    schemaToOpenMx(gm@schema, list(), model_id = "clean"), "MxModel"
  )
  expect_error(
    schemaToOpenMx(gm@schema, list(), model_id = "dirty"),
    "non-core feature"
  )
})

test_that("runModel threads onUnsupported through to the converter", {
  gm <- pendingCoreGraphModel()
  # Refuses at the build step before any optimization.
  expect_error(
    suppressMessages(runModel(gm, silent = TRUE, onUnsupported = "stop")),
    "non-core feature"
  )
})

# ---- OpenMx parameter labels ------------------------------------------------
# OpenMx equates parameters that share a label; only a shared named free
# parameter may do that.

test_that(".mxParamLabels keeps named free parameters and makes display labels unique", {
  paths <- list(
    list(from = "F", to = "x1", numberOfArrows = 1, freeParameter = "lam"),
    list(from = "F", to = "x2", numberOfArrows = 1, freeParameter = "lam"),   # shared: equal
    list(from = "x1", to = "x1", numberOfArrows = 2, freeParameter = TRUE, label = "e"),
    list(from = "x2", to = "x2", numberOfArrows = 2, freeParameter = TRUE, label = "e"),  # repeat
    list(from = "F", to = "F", numberOfArrows = 2, value = 1, label = "lam"),             # collides with named
    list(from = "F", to = "x3", numberOfArrows = 1, value = 1),                           # no label
    list(from = "d", to = "x1", type = "data", label = "x1"),                             # data path
    list(from = "x3", to = "x3", numberOfArrows = 2, freeParameter = TRUE, label = "e_2") # pre-existing e_2
  )
  expect_equal(.mxParamLabels(paths), c("lam", "lam", "e", "e_3", "lam_2", NA, NA, "e_2"))
})

test_that("paths sharing only a display label are estimated separately in OpenMx", {
  skip_if_not_installed("OpenMx")
  set.seed(5)
  d <- data.frame(x = rnorm(200, sd = 1), y = rnorm(200, sd = 3))
  gm <- GraphModel() |>
    addVariable("x") |> addVariable("y") |> addConstant() |>
    addData("data", d) |> connectData("data", c("x", "y")) |>
    addPath("x", "x", 2, freeParameter = TRUE, value = 1) |>
    addPath("y", "y", 2, freeParameter = TRUE, value = 1) |>
    addPath("1", "x", 1, freeParameter = TRUE, value = 0) |>
    addPath("1", "y", 1, freeParameter = TRUE, value = 0)
  # give both variances the same display label
  m <- gm@schema$models[[1]]
  for (i in seq_along(m$paths)) if (isTRUE(m$paths[[i]]$numberOfArrows == 2)) m$paths[[i]]$label <- "var"
  gm@schema$models[[1]] <- m
  fit <- suppressMessages(runModel(gm))@lastBuiltModel
  est <- fit$output$estimate
  expect_true(all(c("var", "var_2") %in% names(est)))
  expect_gt(abs(est[["var"]] - est[["var_2"]]), 1)   # sd 1 vs sd 3: clearly unequal
})

# ---- optimization$missingness ----------------------------------------------
# FIML (the default) keeps every row; listwise drops rows with a missing value
# in a mapped column; pairwise is not applied by the OpenMx backend and warns.

missingnessSchema <- function(missingness = NULL, withData = TRUE, allMissing = FALSE) {
  set.seed(7)
  d <- data.frame(x = rnorm(50), y = rnorm(50), z = rnorm(50))
  d$x[1:3] <- NA
  d$z[10] <- NA # unmapped column: must not drop a row
  if (allMissing) d$y[4:50] <- NA
  gm <- GraphModel() |> addVariable("x") |> addVariable("y")
  if (withData) gm <- gm |> addData("data", d) |> connectData("data", c("x", "y"))
  gm <- gm |>
    addPath("x", "x", 2, freeParameter = TRUE, value = 1) |>
    addPath("y", "y", 2, freeParameter = TRUE, value = 1)
  if (!is.null(missingness)) {
    gm@schema$models[[1]]$optimization <- list(missingness = missingness)
  }
  list(schema = gm@schema, data = gm@data)
}

test_that("pairwise missingness with raw data warns that FIML is used", {
  skip_if_not_installed("OpenMx")
  s <- missingnessSchema("pairwise")
  expect_warning(
    om <- schemaToOpenMx(s$schema, s$data),
    "missingness 'pairwise' is not applied.*FIML"
  )
  expect_equal(nrow(om$data$observed), 50)
})

test_that("FIML or absent missingness keeps every row without warning", {
  skip_if_not_installed("OpenMx")
  for (m in list(NULL, "FIML")) {
    s <- missingnessSchema(m)
    expect_no_warning(om <- schemaToOpenMx(s$schema, s$data))
    expect_equal(nrow(om$data$observed), 50)
  }
})

test_that("listwise missingness drops rows missing a mapped column only", {
  skip_if_not_installed("OpenMx")
  s <- missingnessSchema("listwise")
  expect_no_warning(om <- schemaToOpenMx(s$schema, s$data))
  obs <- om$data$observed
  expect_equal(nrow(obs), 47)
  expect_false(anyNA(obs))
})

test_that("listwise missingness that removes every row is an error", {
  skip_if_not_installed("OpenMx")
  s <- missingnessSchema("listwise", allMissing = TRUE)
  expect_error(schemaToOpenMx(s$schema, s$data), "removed all 50 rows")
})

test_that("non-FIML missingness on a model without data does not warn", {
  skip_if_not_installed("OpenMx")
  for (m in c("listwise", "pairwise")) {
    s <- missingnessSchema(m, withData = FALSE)
    expect_no_warning(schemaToOpenMx(s$schema, s$data))
  }
})

test_that(".mxNameMap gives readable legal OpenMx names, one to one", {
  map <- .mxNameMap(c("F->x1", "x1<->x2", "C_{x1,x2}", "x.1", "x_1", "one", "2", "A", "V_{x1}", "F→x1", "a[1]"),
                    .MX_RESERVED_LABELS)
  expect_equal(unname(map), c("F_to_x1", "x1_with_x2", "C_{x1_x2}", "x_1_2", "x_1", "one_", "v2", "A_", "V_{x1}", "F→x1", "a_1_"))
  # legal names keep their own; the illegal "x.1" gives way to the legal "x_1"
  expect_equal(.mxNameBack(unname(map), map), names(map))
  for (n in unname(map)) expect_silent(OpenMx::mxPath("a", "b", labels = n))
})

test_that("illegal names round-trip through OpenMx and a fit", {
  skip_if_not_installed("OpenMx")
  set.seed(7)
  f <- rnorm(300)
  d <- data.frame(`x.1` = f + rnorm(300), x2 = .8 * f + rnorm(300), x3 = .6 * f + rnorm(300), x4 = .7 * f + rnorm(300),
                  check.names = FALSE)
  gm <- GraphModel() |>
    addVariable("F") |> addVariable("x.1") |> addVariable("x2") |> addVariable("x3") |> addVariable("x4") |>
    addConstant() |> addData("data", d) |> connectData("data", c("x.1", "x2", "x3", "x4")) |>
    addPath("F", c("x.1", "x2", "x3", "x4"), 1, freeParameter = list(FALSE, TRUE, "b,1", TRUE), value = 1) |>
    addPath(c("F", "x.1", "x2", "x3", "x4"), c("F", "x.1", "x2", "x3", "x4"), 2, freeParameter = TRUE, value = 1) |>
    addPath("1", c("x.1", "x2", "x3", "x4"), 1, freeParameter = TRUE, value = 0) |>
    addPath("x2", "x3", 2, freeParameter = TRUE, value = 0.1)
  m <- gm@schema$models[[1]]
  label_of <- function(from, to, arrows) {
    which(vapply(m$paths, function(p) identical(p$from, from) && identical(p$to, to) && isTRUE(p$numberOfArrows == arrows), logical(1)))
  }
  m$paths[[label_of("F", "x2", 1)]]$label <- "F->x2"          # anonymous free, labelled
  m$paths[[label_of("x2", "x3", 2)]]$label <- "C_{x2,x3}"     # covariance, comma
  m$paths[[label_of("F", "F", 2)]]$label <- "A"               # a RAM matrix name
  gm@schema$models[[1]] <- m

  mx <- as.MxModel(gm)
  expect_true("x_1" %in% mx$manifestVars)
  expect_true(all(c("F_to_x2", "C_{x2_x3}", "A_", "b_1") %in% names(OpenMx::omxGetParameters(mx))))

  fitted <- suppressMessages(runModel(gm))
  fm <- fitted@schema$models[[1]]
  est <- getFitResults(fitted)$parameterEstimates
  expect_true(all(c("F->x2", "C_{x2,x3}", "A", "b,1") %in% names(est)))
  # estimates are written back to labelled anonymous paths too
  expect_equal(fm$paths[[label_of("F", "x2", 1)]]$value, est[["F->x2"]])

  back <- as.GraphModel(fitted@lastBuiltModel)@schema$models[[1]]
  expect_setequal(vapply(back$nodes, function(n) n$label, character(1)), vapply(m$nodes, function(n) n$label, character(1)))
  find <- function(ps, from, to, arrows) Find(function(p) {
    isTRUE(p$numberOfArrows == arrows) && (identical(c(p$from, p$to), c(from, to)) ||
      (arrows == 2 && identical(c(p$from, p$to), c(to, from))))
  }, ps)
  p <- find(back$paths, "F", "x2", 1)
  expect_equal(p$label, "F->x2")
  expect_true(isTRUE(p$freeParameter))                         # still anonymous, not named "F->x2"
  expect_equal(find(back$paths, "F", "x3", 1)$freeParameter, "b,1")
  expect_equal(find(back$paths, "x2", "x3", 2)$label, "C_{x2,x3}")
  expect_equal(find(back$paths, "F", "F", 2)$label, "A")
  expect_false(is.null(find(back$paths, "1", "x.1", 1)))       # mean into a renamed variable keeps its constant
})
