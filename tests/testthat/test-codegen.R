# Tests for the addin's edit-code generation. .visualEditCode() is what the
# (layout-only) addin uses; .generateEditCode() is parked (codegen-parked.R) and
# stays under test so it keeps working against the current verbs. Both must
# produce code that reproduces the edit when evaluated against the original.

evalCode <- function(code, model, varName = "model") {
  env <- new.env(parent = globalenv())
  env$model <- model
  eval(parse(text = code), envir = env)
  env[[varName]]
}

fixtureModel <- function(name) {
  f <- testthat::test_path("..", "..", "drawsem-web", "tests", "fixtures", "models", name)
  skip_if_not(file.exists(f), "fixture not available")
  as.GraphModel(f)
}

base_gm <- function() {
  GraphModel() |>
    addVariable("F", manifestLatent = "latent") |>
    addVariable("X1") |>
    addVariable("X2") |>
    addPath("F", "X1", 1, freeParameter = TRUE, value = 1) |>
    addPath("F", "X2", 1, freeParameter = "lam2", value = 1) |>
    addPath("X1", "X2", 2, value = 0) |>
    setLocation(c("F", "X1", "X2"), c(100, 0, 200), c(0, 100, 100))
}

test_that("no edit -> tier none, no code", {
  g <- base_gm()
  r <- .generateEditCode(g, g)
  expect_equal(r$tier, "none")
  expect_null(r$code)
})

test_that("sub-pixel node jitter is not an edit", {
  g <- base_gm()
  g2 <- setLocation(g, "F", 100.2, 0.3)
  expect_equal(.generateEditCode(g, g2)$tier, "none")
})

test_that("layout-only edit emits one vectorized setLocation with final positions", {
  g <- base_gm()
  g2 <- setLocation(g, c("X1", "X2"), c(10, 20), c(150, 150))
  r <- .generateEditCode(g, g2)
  expect_equal(r$tier, "patch")
  expect_match(r$code, "drawSEM::setLocation(", fixed = TRUE)
  expect_equal(lengths(regmatches(r$code, gregexpr("setLocation", r$code))), 1L)
  expect_false(grepl("\"F\"", r$code))   # unmoved node not mentioned
  expect_identical(.canonSchema(evalCode(r$code, g)), .canonSchema(g2))
})

test_that("structural edit round-trips via verbs", {
  g <- base_gm()
  g2 <- g |>
    removePath("X1", "X2", 2) |>
    addVariable("X3", description = "third", tags = "obs") |>
    addPath("F", "X3", 1, freeParameter = TRUE) |>
    changePath("F", "X1", 1, freeParameter = FALSE, value = 0.5) |>
    changeVariable("X1", description = "first") |>
    setLocation("X3", 300, 100)
  r <- .generateEditCode(g, g2)
  expect_equal(r$tier, "patch")
  expect_match(r$code, "drawSEM::removePath", fixed = TRUE)
  expect_match(r$code, "drawSEM::addPath", fixed = TRUE)
  expect_match(r$code, "drawSEM::changePath", fixed = TRUE)
  expect_match(r$code, "^model <- model \\|>")
  expect_identical(.canonSchema(evalCode(r$code, g)), .canonSchema(g2))
})

test_that("removing a node removes its paths explicitly (no cascade warning)", {
  g <- base_gm()
  g2 <- suppressWarnings(removeVariable(g, "X2"))
  r <- .generateEditCode(g, g2)
  expect_equal(r$tier, "patch")
  expect_warning(m <- evalCode(r$code, g), NA)
  expect_identical(.canonSchema(m), .canonSchema(g2))
})

test_that("covariance endpoint order does not register as an edit", {
  g <- base_gm()
  g2 <- g
  p <- g2@schema$models[[1]]$paths
  i <- which(vapply(p, function(x) identical(x$numberOfArrows, 2L) || identical(x$numberOfArrows, 2), logical(1)))
  tmp <- p[[i]]$from; p[[i]]$from <- p[[i]]$to; p[[i]]$to <- tmp
  g2@schema$models[[1]]$paths <- p
  expect_equal(.generateEditCode(g, g2)$tier, "none")
})

test_that("from-scratch build starts from GraphModel()", {
  g <- GraphModel()
  g2 <- g |> addVariable("A") |> addVariable("B") |> addPath("A", "B", 1, freeParameter = TRUE) |>
    setLocation(c("A", "B"), c(0, 100), c(0, 0))
  r <- .generateEditCode(g, g2, varName = "fresh", isNew = TRUE)
  expect_equal(r$tier, "new")
  expect_match(r$code, "^fresh <- drawSEM::GraphModel\\(\\) \\|>")
  expect_identical(.canonSchema(evalCode(r$code, g, "fresh")), .canonSchema(g2))
})

test_that("dataset changes fall back to JSON re-embed with a reason", {
  g <- base_gm()
  g2 <- addData(g, "dat", data.frame(X1 = 1:3, X2 = 4:6))
  r <- .generateEditCode(g, g2)
  expect_equal(r$tier, "json")
  expect_match(r$reason, "dataset")
  m <- evalCode(r$code, g)
  expect_identical(.canonSchema(m), .canonSchema(g2))
})

test_that("an edit the verbs can't express falls back to JSON", {
  g <- base_gm()
  g2 <- g
  g2@schema$models[[1]]$paths[[1]]$parameterType <- "loading"
  r <- .generateEditCode(g, g2)
  expect_equal(r$tier, "json")
  expect_identical(.canonSchema(evalCode(r$code, g)), .canonSchema(g2))
})

test_that("fixture models round-trip under layout and structural edits", {
  for (f in c("cfa-model.json", "mediation-model.json")) {
    g <- fixtureModel(f)
    first <- g@schema$models[[1]]
    labels <- vapply(first$nodes, function(n) as.character(n$label), character(1))
    g2 <- setLocation(g, labels[1], 5, 7)
    r <- .generateEditCode(g, g2)
    expect_true(r$tier %in% c("patch", "json"), info = f)
    expect_identical(.canonSchema(evalCode(r$code, g)), .canonSchema(g2), info = f)
  }
})

# ---- widget round trip ------------------------------------------------------
# The widget round trip is lossless: it neither stamps defaults nor drops
# fields, so an unedited round trip differs only by JSON transport (boxing,
# double precision) and a drag changes only visual x/y.

emulateWidget <- function(gm, drag = NULL) {
  s <- jsonlite::fromJSON(
    jsonlite::toJSON(gm@schema, auto_unbox = TRUE, null = "null", na = "null", digits = NA),
    simplifyVector = FALSE)
  m <- s$models[[1]]
  for (i in seq_along(m$nodes)) {
    n <- m$nodes[[i]]
    if (!is.null(drag) && n$label %in% names(drag)) {
      m$nodes[[i]]$visual$x <- drag[[n$label]][1] + 0.37   # sub-pixel noise, like a real drag
      m$nodes[[i]]$visual$y <- drag[[n$label]][2]
    }
  }
  s$models[[1]] <- m
  out <- as.GraphModel(s)
  out@data <- gm@data
  out
}

roundTripFixture <- function() {
  set.seed(1)
  d <- data.frame(x = rnorm(30)); d$y <- d$x * 0.5 + rnorm(30)
  GraphModel() |>
    addVariable("x") |> addVariable("y") |> addConstant() |>
    addData("data", d) |> connectData("data", c("x", "y")) |>
    addPath("x", "y", 1, freeParameter = TRUE, value = 0.3) |>
    addPath("x", "x", 2, freeParameter = TRUE) |>        # free, no value
    addPath("y", "y", 2, freeParameter = TRUE, value = 1) |>
    addPath("1", "x", 1, freeParameter = TRUE, value = 0.1) |>
    addPath("1", "y", 1, freeParameter = TRUE, value = 0.1) |>
    setLocation(c("x", "y", "1", "data"), c(0, 100, 50, 50), c(0, 0, -80, 150))
}

test_that("an unedited widget round trip is no change (GraphModel)", {
  g <- roundTripFixture()
  expect_equal(.generateEditCode(g, emulateWidget(g))$tier, "none")
})

test_that("a drag through the widget is only setLocation, with final rounded positions", {
  g <- roundTripFixture()
  r <- .generateEditCode(g, emulateWidget(g, drag = list(x = c(10, 20), y = c(120, 30))))
  expect_equal(r$tier, "patch")
  expect_match(r$code, "setLocation", fixed = TRUE)
  expect_false(grepl("addPath|changePath|JSON", r$code))
  expect_match(r$code, "x = c(10, 120)", fixed = TRUE)
})

test_that("a structural edit through the widget is a verb patch, not JSON", {
  g <- roundTripFixture()
  w <- emulateWidget(addVariable(g, "z"))
  r <- .generateEditCode(g, w)
  expect_equal(r$tier, "patch")
  expect_match(r$code, "addVariable", fixed = TRUE)
})

test_that("a fitted MxModel dragged through the widget stays a setLocation (fit kept)", {
  skip_if_not_installed("OpenMx")
  g <- roundTripFixture()
  g <- changePath(g, "x", "x", 2, value = 1)   # an MxModel path always has a value
  mx <- builtModel(suppressMessages(runModel(g)))
  before <- as.GraphModel(mx)
  r <- .generateEditCode(before, emulateWidget(before, drag = list(x = c(10, 20))),
                         varName = "mm", origin = "MxModel")
  expect_equal(r$tier, "patch")
  expect_false(grepl("as.MxModel", r$code, fixed = TRUE))
  expect_equal(.generateEditCode(before, emulateWidget(before), "mm", origin = "MxModel")$tier, "none")
})

# ---- schema-declared equivalences -------------------------------------------

test_that("absent path value equals an explicit schema default (value = 1)", {
  g <- base_gm()
  g2 <- g
  g2@schema$models[[1]]$paths[[1]]$value <- NULL   # was value = 1
  expect_identical(.canonSchema(g), .canonSchema(g2))
  expect_equal(.generateEditCode(g, g2)$tier, "none")
  expect_equal(.generateEditCode(g2, g)$tier, "none")
  # a non-default value is still a real difference
  g3 <- g2; g3@schema$models[[1]]$paths[[1]]$value <- 0.5
  expect_false(identical(.canonSchema(g2), .canonSchema(g3)))
})

test_that("explicit null value is not filled with the default", {
  g <- base_gm()
  g2 <- g
  g2@schema$models[[1]]$paths[1] <- list(utils::modifyList(g2@schema$models[[1]]$paths[[1]],
                                                             list(value = NULL), keep.null = TRUE))
  expect_true("value" %in% names(g2@schema$models[[1]]$paths[[1]]))
  expect_false(identical(.canonSchema(g), .canonSchema(g2)))
})

test_that("schema defaults are read from the shipped schema, not hard-coded", {
  d <- .schemaDefaults()
  at <- vapply(d, function(x) paste(x$at, collapse = "/"), character(1))
  expect_true("models/*/paths/[]/value" %in% at)
  expect_equal(d[[which(at == "models/*/paths/[]/value")]]$value, 1)
})

test_that("absent node width is not equal to an explicit width 60 (no schema default)", {
  g <- base_gm()
  g2 <- g
  g2@schema$models[[1]]$nodes[[2]]$visual$width <- 60
  expect_false(identical(.canonSchema(g), .canonSchema(g2)))
  expect_false(.generateEditCode(g, g2)$tier == "none")
})

test_that("a boxed vs unboxed tag compares equal", {
  g <- addVariable(base_gm(), "T1", tags = "obs")
  g2 <- g
  i <- which(vapply(g2@schema$models[[1]]$nodes, function(n) identical(n$label, "T1"), logical(1)))
  g2@schema$models[[1]]$nodes[[i]]$tags <- list("obs")
  g3 <- g; g3@schema$models[[1]]$nodes[[i]]$tags <- "obs"
  expect_identical(.canonSchema(g2), .canonSchema(g3))
  expect_equal(.generateEditCode(g3, g2)$tier, "none")
})

# ---- .visualEditCode() (the layout-only addin) --------------------------------

test_that("visual: no move -> none; sub-unit jitter is not a move", {
  g <- base_gm()
  expect_equal(.visualEditCode(g, g)$tier, "none")
  expect_equal(.visualEditCode(g, setLocation(g, "F", 100.3, -0.4))$tier, "none")
})

test_that("visual: moves become one rounded setLocation() that reproduces the positions", {
  g <- base_gm()
  after <- setLocation(g, c("F", "X2"), c(150.6, 210), c(-30, 100))
  r <- .visualEditCode(g, after)
  expect_equal(r$tier, "patch")
  expect_false(r$structureChanged)
  expect_equal(length(r$calls), 1)
  expect_equal(r$calls[[1]]$args, list(nodeId = c("F", "X2"), x = c(151, 210), y = c(-30, 100)))
  out <- evalCode(r$code, g)
  pos <- function(m) vapply(m@schema$models[[1]]$nodes, function(n) c(n$visual$x, n$visual$y), numeric(2))
  expect_equal(pos(out), round(pos(after)))
})

test_that("visual: every node of a positionless model is set", {
  g <- GraphModel() |> addVariable("A") |> addVariable("B") |> addConstant()
  r <- .visualEditCode(g, setLocation(g, c("A", "B", "1"), c(0, 80, 40), c(0, 0, 90)))
  expect_equal(r$calls[[1]]$args$nodeId, c("A", "B", "1"))
})

test_that("visual: non-visual differences are never emitted; structural ones are flagged", {
  g <- base_gm()
  # field-level differences (not structure): ignored, not flagged
  fieldDiff <- g
  fieldDiff@schema$models[[1]]$nodes[[2]]$visual$width <- 60
  fieldDiff@schema$models[[1]]$paths[[3]]$value <- 1
  fieldDiff@schema$models[[1]]$meta <- NULL
  r <- .visualEditCode(g, fieldDiff)
  expect_equal(r$tier, "none"); expect_false(r$structureChanged)
  # structural: flagged, still positions only
  r2 <- .visualEditCode(g, setLocation(addVariable(g, "Z"), "F", 0, 0))
  expect_true(r2$structureChanged)
  expect_equal(r2$calls[[1]]$args$nodeId, "F")
})

test_that("visual: setLocation() on a fitted MxModel keeps the fit", {
  skip_if_not_installed("OpenMx")
  set.seed(2)
  d <- data.frame(x = rnorm(40)); d$y <- d$x + rnorm(40)
  gm <- GraphModel() |> addVariable("x") |> addVariable("y") |> addConstant() |>
    addData("data", d) |> connectData("data", c("x", "y")) |>
    addPath("x", "y", 1, freeParameter = TRUE, value = 0.3) |>
    addPath("x", "x", 2, freeParameter = TRUE, value = 1) |>
    addPath("y", "y", 2, freeParameter = TRUE, value = 1) |>
    addPath("1", "x", 1, freeParameter = TRUE, value = 0) |>
    addPath("1", "y", 1, freeParameter = TRUE, value = 0)
  mx <- builtModel(suppressMessages(runModel(gm)))
  before <- as.GraphModel(mx)
  r <- .visualEditCode(before, setLocation(before, "x", 5, 6), varName = "model")
  out <- evalCode(r$code, mx)
  expect_identical(out@output, mx@output)
})
