# Bounds and starting values cascade from optimization.parameterTypes to the
# path's own optimization (per-path wins). See buildPathList().

ptypes <- list(
  loading = list(bounds = list(0, 10), start = 0.7),
  variance = list(bounds = c(0.001, NA), start = "auto"),
  nostart = list(start = NULL)
)

test_that("parameterType bounds are applied when the path has none", {
  paths <- list(
    list(from = "F", to = "x1", numberOfArrows = 1, freeParameter = TRUE,
         parameterType = "loading")
  )
  res <- buildPathList(paths, parameterTypes = ptypes)
  expect_equal(res[[1]]$bounds, list(0, 10))
})

test_that("per-path bounds replace the parameterType pair wholesale", {
  paths <- list(
    list(from = "F", to = "x1", numberOfArrows = 1, freeParameter = TRUE,
         parameterType = "loading", optimization = list(bounds = list(NULL, 5)))
  )
  res <- buildPathList(paths, parameterTypes = ptypes)
  # Not merged per element: the lower bound 0 from the type is not kept
  expect_equal(res[[1]]$bounds, list(NULL, 5))
})

test_that("explicit per-path bounds: null makes the path unbounded", {
  paths <- list(
    list(from = "F", to = "x1", numberOfArrows = 1, freeParameter = TRUE,
         parameterType = "loading", optimization = list(bounds = NULL, start = 2))
  )
  res <- buildPathList(paths, parameterTypes = ptypes)
  expect_null(res[[1]]$bounds)
})

test_that("an absent per-path bounds key falls back to the parameterType", {
  paths <- list(
    list(from = "F", to = "x1", numberOfArrows = 1, freeParameter = TRUE,
         parameterType = "loading", optimization = list(start = 2))
  )
  res <- buildPathList(paths, parameterTypes = ptypes)
  expect_equal(res[[1]]$bounds, list(0, 10))
})

test_that("bounds: null read from JSON stays an explicit override", {
  json <- '[
    {"from": "F", "to": "x1", "numberOfArrows": 1, "freeParameter": true,
     "parameterType": "loading", "optimization": {"bounds": null}},
    {"from": "F", "to": "x2", "numberOfArrows": 1, "freeParameter": true,
     "parameterType": "loading", "optimization": {}}
  ]'
  paths <- jsonlite::fromJSON(json, simplifyVector = FALSE)
  res <- buildPathList(paths, parameterTypes = ptypes)
  expect_null(res[[1]]$bounds)
  expect_equal(res[[2]]$bounds, list(0, 10))
})

test_that("unknown or absent parameterType contributes no defaults, silently", {
  paths <- list(
    list(from = "F", to = "x1", numberOfArrows = 1, freeParameter = TRUE,
         value = 0.3, parameterType = "notDefined"),
    list(from = "F", to = "x2", numberOfArrows = 1, freeParameter = TRUE,
         value = 0.4)
  )
  expect_no_warning(res <- buildPathList(paths, parameterTypes = ptypes))
  expect_null(res[[1]]$bounds)
  expect_equal(res[[1]]$values, 0.3)
  expect_null(res[[2]]$bounds)
  expect_equal(res[[2]]$values, 0.4)
})

test_that("start precedence for free paths: path start > type start > value", {
  paths <- list(
    # path-level start wins
    list(from = "F", to = "x1", numberOfArrows = 1, freeParameter = TRUE,
         value = 0.3, parameterType = "loading", optimization = list(start = 1.5)),
    # type-level start wins over value
    list(from = "F", to = "x2", numberOfArrows = 1, freeParameter = TRUE,
         value = 0.3, parameterType = "loading"),
    # no start anywhere: value
    list(from = "x3", to = "x3", numberOfArrows = 2, freeParameter = "v3",
         value = 0.3, parameterType = "nostart"),
    # nothing at all: free default 0.1
    list(from = "x4", to = "x4", numberOfArrows = 2, freeParameter = TRUE)
  )
  res <- buildPathList(paths, parameterTypes = ptypes)
  expect_equal(res[[1]]$values, 1.5)
  expect_equal(res[[2]]$values, 0.7)
  expect_equal(res[[3]]$values, 0.3)
  expect_equal(res[[4]]$values, 0.1)
})

test_that("start 'auto' or null falls through to the next level", {
  paths <- list(
    # path "auto" -> type start
    list(from = "F", to = "x1", numberOfArrows = 1, freeParameter = TRUE,
         value = 0.3, parameterType = "loading", optimization = list(start = "auto")),
    # path null -> type start
    list(from = "F", to = "x2", numberOfArrows = 1, freeParameter = TRUE,
         value = 0.3, parameterType = "loading", optimization = list(start = NULL)),
    # path "auto", type "auto" -> value
    list(from = "x3", to = "x3", numberOfArrows = 2, freeParameter = TRUE,
         value = 0.25, parameterType = "variance", optimization = list(start = "auto")),
    # all unset, no value -> free default
    list(from = "x4", to = "x4", numberOfArrows = 2, freeParameter = TRUE,
         parameterType = "variance")
  )
  res <- buildPathList(paths, parameterTypes = ptypes)
  expect_equal(res[[1]]$values, 0.7)
  expect_equal(res[[2]]$values, 0.7)
  expect_equal(res[[3]]$values, 0.25)
  expect_equal(res[[4]]$values, 0.1)
  expect_equal(res[[3]]$bounds, c(0.001, NA))
})

test_that("start never overrides a fixed path's value", {
  paths <- list(
    list(from = "F", to = "x1", numberOfArrows = 1, value = 1,
         parameterType = "loading", optimization = list(start = 3)),
    list(from = "F", to = "x2", numberOfArrows = 1, value = 0.5,
         parameterType = "loading"),
    # fixed, no value: schema default, not the type start
    list(from = "F", to = "x3", numberOfArrows = 1, parameterType = "loading")
  )
  res <- buildPathList(paths, parameterTypes = ptypes)
  expect_equal(res[[1]]$values, 1)
  expect_equal(res[[2]]$values, 0.5)
  expect_equal(res[[3]]$values, .pathValueDefault())
  expect_false(any(vapply(res, `[[`, logical(1), "free")))
})

test_that("data paths are untouched by the cascade", {
  paths <- list(
    list(from = "D", to = "x1", numberOfArrows = 1, type = "data",
         parameterType = "loading")
  )
  expect_length(buildPathList(paths, parameterTypes = ptypes), 0)
})

test_that("schemaToOpenMx applies type bounds and start to mxPath", {
  skip_if_not_installed("OpenMx")
  schema <- list(
    schemaVersion = 0,
    models = list(
      m = list(
        optimization = list(parameterTypes = list(
          loading = list(bounds = list(0, 10), start = 0.7),
          residual = list(bounds = list(0.001, NULL))
        )),
        nodes = list(
          list(label = "F", type = "variable"),
          list(label = "x1", type = "variable")
        ),
        paths = list(
          list(from = "F", to = "x1", numberOfArrows = 1, freeParameter = "lam",
               value = 0.2, parameterType = "loading"),
          list(from = "x1", to = "x1", numberOfArrows = 2, freeParameter = "ex",
               value = 0.5, parameterType = "residual",
               optimization = list(bounds = list(NULL, 4), start = 2)),
          list(from = "F", to = "F", numberOfArrows = 2, value = 1,
               parameterType = "residual", optimization = list(start = 9))
        )
      )
    )
  )
  om <- schemaToOpenMx(schema)
  A <- om$A
  S <- om$S
  expect_equal(A$values["x1", "F"], 0.7)
  expect_equal(A$lbound["x1", "F"], 0)
  expect_equal(A$ubound["x1", "F"], 10)
  expect_equal(S$values["x1", "x1"], 2)
  expect_true(is.na(S$lbound["x1", "x1"]))
  expect_equal(S$ubound["x1", "x1"], 4)
  # fixed path keeps its value; type bounds still attach
  expect_equal(S$values["F", "F"], 1)
  expect_false(S$free["F", "F"])
})

test_that("importing an MxModel does not copy values into optimization.start", {
  skip_if_not_installed("OpenMx")
  mx <- OpenMx::mxModel(
    "m", type = "RAM", manifestVars = c("x", "y"),
    OpenMx::mxPath("x", "y", arrows = 1, free = TRUE, values = 0.4, lbound = 0),
    OpenMx::mxPath(c("x", "y"), arrows = 2, free = TRUE, values = 1)
  )
  gm <- suppressWarnings(as.GraphModel(mx))
  ps <- gm@schema$models[[1]]$paths
  for (p in ps) expect_null(p$optimization$start)
  xy <- Filter(function(p) p$from == "x" && p$to == "y", ps)[[1]]
  expect_equal(xy$value, 0.4)
  expect_equal(xy$optimization$bounds[[1]], 0)
  # A later change to value is what the converter starts from
  gm2 <- changePath(gm, "x", "y", value = 0.9)
  om <- schemaToOpenMx(gm2@schema, gm2@data)
  expect_equal(om$A$values["y", "x"], 0.9)
})

test_that("explicit bounds: null is written as JSON null, not {}", {
  gm <- GraphModel() |> addVariable("x") |>
    addPath("x", "x", 2, freeParameter = TRUE, value = 1)
  gm@schema$models[[1]]$paths[[1]]$optimization <- list(bounds = NULL)
  f <- tempfile(fileext = ".json")
  on.exit(unlink(f))
  exportSchema(gm, f)
  back <- jsonlite::read_json(f, simplifyVector = FALSE)
  opt <- back$models[[1]]$paths[[1]]$optimization
  expect_true("bounds" %in% names(opt))
  expect_null(opt$bounds)
  expect_false(grepl('"bounds":\\s*\\{', paste(readLines(f), collapse = "")))
})
