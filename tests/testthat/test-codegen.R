# Round-trip tests for .generateEditCode(): the generated code must reproduce
# the edited model when evaluated against the original.

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
