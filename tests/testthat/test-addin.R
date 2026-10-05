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
