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

test_that("existing model: a move is inserted as a setLocation() chain at the captured spot", {
  env <- new.env(); env$mm <- addinBase()
  ctx <- mkCtx(c("library(drawSEM)", "mm", "summary(1)"), 2, 1)
  got <- NULL
  tier <- .runEditAddin(
    ctx,
    launch = function(gm, ...) { expect_identical(gm, env$mm); setLocation(gm, "A", 10.4, -20) },
    insert = function(text, row, column, id) got <<- list(text = text, row = row, column = column, id = id),
    env = env
  )
  expect_equal(tier, "patch")
  expect_equal(got$row, 3L); expect_equal(got$id, "doc1")
  expect_match(got$text, "# Edited with drawSEM (layout)\nmm <- mm |>", fixed = TRUE)
  expect_match(got$text, 'drawSEM::setLocation(nodeId = "A", x = 10, y = -20)', fixed = TRUE)
})

test_that("a model without positions inserts the auto-layout for every node on Done", {
  env <- new.env(); env$mm <- addinBase()
  got <- NULL
  tier <- .runEditAddin(mkCtx("mm", 1, 1),
    launch = function(gm, ...) setLocation(gm, c("A", "B"), c(0, 100), c(0, 0)),
    insert = function(text, ...) got <<- text, env = env)
  expect_equal(tier, "patch")
  expect_match(got, 'nodeId = c("A", "B")', fixed = TRUE)
})

test_that("no target: refuses with 'put the cursor on a model'", {
  env <- new.env(); env$model <- 1
  launched <- FALSE
  expect_error(
    .runEditAddin(mkCtx("", 1, 1), launch = function(...) launched <<- TRUE,
                  insert = function(...) NULL, env = env),
    "put the cursor on a model")
  expect_error(
    .runEditAddin(mkCtx("model", 1, 1), launch = function(...) launched <<- TRUE,
                  insert = function(...) NULL, env = env),
    "not a GraphModel or MxModel")
  expect_false(launched)
})

test_that("cancel and no-move insert nothing", {
  env <- new.env(); env$mm <- addinBase()
  ctx <- mkCtx("mm", 1, 1)
  inserted <- FALSE
  ins <- function(...) inserted <<- TRUE
  expect_message(t1 <- .runEditAddin(ctx, function(gm, ...) NULL, ins, env), "closed without Done")
  expect_message(t2 <- .runEditAddin(ctx, function(gm, ...) gm, ins, env), "no layout changes")
  expect_equal(c(t1, t2), c("none", "none"))
  expect_false(inserted)
})

test_that("a structural change from the editor warns and writes only positions", {
  env <- new.env(); env$mm <- addinBase()
  got <- NULL
  expect_warning(
    .runEditAddin(mkCtx("mm", 1, 1),
      launch = function(gm, ...) setLocation(addVariable(gm, "C"), "A", 5, 5),
      insert = function(text, ...) got <<- text, env = env),
    "changed the model's structure")
  expect_false(grepl("addVariable", got, fixed = TRUE))
  expect_match(got, "setLocation", fixed = TRUE)
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
  r <- runMx(function(gm, ...) { seen <<- gm; gm })
  expect_s4_class(seen, "GraphModel")
  expect_equal(r$tier, "none")
})

test_that("MxModel layout-only edit is a setLocation() on the MxModel and keeps the fit", {
  r <- runMx(function(gm, ...) setLocation(gm, "x", 11, 22))
  expect_equal(r$tier, "patch")
  expect_match(r$text, "mm <- mm |>", fixed = TRUE)
  expect_false(grepl("as.MxModel", r$text, fixed = TRUE))
  out <- eval(parse(text = r$text), envir = r$env)   # evaluates `mm <- ...` in env
  expect_gt(length(r$env$mm@output), 0)
})

test_that("drawSEMEdit() rejects expressions and non-models before touching the editor", {
  expect_error(drawSEMEdit(GraphModel()), "variable name")
  notModel <- 1
  expect_error(drawSEMEdit(notModel), "GraphModel or MxModel")
})

test_that("when the launcher calls onDone (inside the gadget), insertion happens once, there", {
  env <- new.env(); env$mm <- addinBase()
  n <- 0; where <- NULL
  .runEditAddin(
    mkCtx("mm", 1, 1),
    launch = function(gm, onDone) {
      edited <- setLocation(gm, "A", 1, 2)
      onDone(edited)             # Done handler runs the insert...
      edited                     # ...and the gadget then also returns the model
    },
    insert = function(text, ...) { n <<- n + 1 },
    env = env)
  expect_equal(n, 1)
})

test_that("the gadget's Done handler calls onDone with the model before stopping", {
  skip_if_not_installed("shiny")
  gm <- addinBase()
  got <- NULL
  app <- shiny::shinyApp(
    ui = .drawSEM_ui(),
    server = function(input, output, session) {
      .drawSEM_server(input, output, session, initialGM = gm, onDone = function(m) got <<- m)
    })
  shiny::testServer(app, {
    session$setInputs(graph_tool_ready = TRUE)
    session$setInputs(done_request = list(timestamp = 1))
    session$flushReact()
  })
  expect_s4_class(got, "GraphModel")
})
