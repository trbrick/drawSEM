# Tests for the addin flow, with the editor and gadget injected.

mkCtx <- function(lines, sr, sc, er = sr, ec = sc, text = "") {
  list(id = "doc1", contents = lines,
       selection = list(list(range = list(start = c(sr, sc), end = c(er, ec)), text = text)))
}

addinBase <- function() {
  GraphModel() |> addVariable("A") |> addVariable("B") |>
    addPath("A", "B", 1, freeParameter = TRUE, value = 1)
}

test_that(".addinTarget finds the identifier under the cursor or selection", {
  ctx <- mkCtx(c("x <- 1", "fit <- mymodel |> foo()"), 2, 12)
  expect_equal(.addinTarget(ctx), "mymodel")
  expect_equal(.addinTarget(mkCtx("mymodel", 1, 8)), "mymodel")      # cursor at end of word
  expect_equal(.addinTarget(mkCtx("a <- 1", 1, 5, text = "")), NULL) # on a number/space
  expect_equal(.addinTarget(mkCtx("my.model", 1, 1, 1, 9, text = "my.model")), "my.model")
  expect_null(.addinTarget(mkCtx("f(x)", 1, 1, 1, 5, text = "f(x)")))
})

test_that(".addinInsertSpec inserts on the line after, or at doc end", {
  ctx <- mkCtx(c("a", "b", "c"), 1, 1)
  expect_equal(.addinInsertSpec(ctx)[c("row", "column", "prefix")], list(row = 2L, column = 1L, prefix = ""))
  last <- .addinInsertSpec(mkCtx(c("a", "bcd"), 2, 2))
  expect_equal(last$row, 2L); expect_equal(last$column, 4L); expect_equal(last$prefix, "\n")
  # selection ending at column 1 of the next line means the previous line is last
  sel <- .addinInsertSpec(mkCtx(c("a", "b", "c", "d"), 1, 1, 3, 1, text = "a\nb\n"))
  expect_equal(sel$row, 3L)
})

test_that("existing model: edit is inserted as a patch chain at the captured spot", {
  env <- new.env(); env$mm <- addinBase()
  ctx <- mkCtx(c("library(drawSEM)", "mm", "summary(1)"), 2, 1)
  got <- NULL
  tier <- .runEditAddin(
    ctx,
    launch = function(gm) { expect_identical(gm, env$mm); addVariable(gm, "C") },
    insert = function(text, row, column, id) got <<- list(text = text, row = row, column = column, id = id),
    env = env
  )
  expect_equal(tier, "patch")
  expect_equal(got$row, 3L); expect_equal(got$id, "doc1")
  expect_match(got$text, "# Edited with drawSEM\nmm <- mm |>", fixed = FALSE)
  expect_match(got$text, "addVariable", fixed = TRUE)
})

test_that("no target: starts blank and builds from scratch under a fresh name", {
  env <- new.env(); env$model <- 1   # 'model' taken
  got <- NULL
  tier <- .runEditAddin(
    mkCtx("", 1, 1),
    launch = function(gm) { expect_equal(length(nodes(gm)), 0); addVariable(gm, "Z") },
    insert = function(text, row, column, id) got <<- text,
    env = env
  )
  expect_equal(tier, "new")
  expect_match(got, "model2 <- drawSEM::GraphModel() |>", fixed = TRUE)
})

test_that("cancel and no-change insert nothing", {
  env <- new.env(); env$mm <- addinBase()
  ctx <- mkCtx("mm", 1, 1)
  inserted <- FALSE
  ins <- function(...) inserted <<- TRUE
  expect_message(t1 <- .runEditAddin(ctx, function(gm) NULL, ins, env), "closed without Done")
  expect_message(t2 <- .runEditAddin(ctx, function(gm) gm, ins, env), "no changes")
  expect_equal(c(t1, t2), c("none", "none"))
  expect_false(inserted)
})

test_that("JSON fallback warns and inserts a commented re-embed", {
  env <- new.env(); env$mm <- addinBase()
  got <- NULL
  expect_warning(
    .runEditAddin(mkCtx("mm", 1, 1),
      launch = function(gm) { gm@schema$models[[1]]$paths[[1]]$parameterType <- "loading"; gm },
      insert = function(text, ...) got <<- text, env = env),
    "could not be written as verb calls")
  expect_match(got, "^\\n# drawSEM: whole model re-embedded as JSON")
  expect_match(got, "mm <- drawSEM::as.GraphModel(", fixed = TRUE)
})

# ---- MxModel origin ---------------------------------------------------------

fittedMx <- function() {
  skip_if_not_installed("OpenMx")
  set.seed(1)
  d <- data.frame(x = rnorm(50)); d$y <- d$x * 0.5 + rnorm(50)
  gm <- GraphModel() |>
    addVariable("x") |> addVariable("y") |> addConstant() |>
    addData("data", d) |> connectData("data", c("x", "y")) |>
    addPath("x", "y", 1, freeParameter = TRUE, value = 0.3) |>
    addPath("x", "x", 2, freeParameter = TRUE, value = 1) |>
    addPath("y", "y", 2, freeParameter = TRUE, value = 1) |>
    addPath("1", "x", 1, freeParameter = TRUE, value = 0.1) |>
    addPath("1", "y", 1, freeParameter = TRUE, value = 0.1)
  builtModel(suppressMessages(runModel(gm)))
}

runMx <- function(edit) {
  env <- new.env(); env$mm <- fittedMx()
  got <- NULL
  tier <- suppressMessages(.runEditAddin(
    mkCtx(c("mm", "x"), 1, 1),
    launch = edit,
    insert = function(text, ...) got <<- text, env = env))
  list(tier = tier, text = got, env = env)
}

test_that("MxModel opens in the editor as its GraphModel conversion", {
  seen <- NULL
  r <- runMx(function(gm) { seen <<- gm; gm })
  expect_s4_class(seen, "GraphModel")
  expect_equal(r$tier, "none")
})

test_that("MxModel layout-only edit is a setLocation() on the MxModel and keeps the fit", {
  r <- runMx(function(gm) setLocation(gm, "x", 11, 22))
  expect_equal(r$tier, "patch")
  expect_match(r$text, "mm <- mm |>", fixed = TRUE)
  expect_false(grepl("as.MxModel", r$text, fixed = TRUE))
  out <- eval(parse(text = r$text), envir = r$env)   # evaluates `mm <- ...` in env
  expect_gt(length(r$env$mm@output), 0)
})

test_that("MxModel structural edit rebuilds via as.MxModel and warns the fit is discarded", {
  r <- runMx(function(gm) addVariable(gm, "z"))
  expect_equal(r$tier, "convert")
  expect_match(r$text, "mm <- drawSEM::as.MxModel(", fixed = TRUE)
  expect_match(r$text, "drawSEM::as.GraphModel(mm) |>", fixed = TRUE)
  expect_match(r$text, "Fit results are discarded", fixed = TRUE)
  eval(parse(text = r$text), envir = r$env)
  expect_s4_class(r$env$mm, "MxModel")
  expect_equal(length(r$env$mm@output), 0)
})

test_that("drawSEMEdit() rejects expressions and non-models before touching the editor", {
  expect_error(drawSEMEdit(GraphModel()), "variable name")
  notModel <- 1
  expect_error(drawSEMEdit(notModel), "GraphModel or MxModel")
})
