test_that("hashStructure() creates consistent hashes for same structure", {
  schema <- list(
    schemaVersion = 0,
    models = list(
      model1 = list(
        nodes = list(
          list(id = "x1", label = "x1", type = "variable", variableCharacteristics = list(manifestLatent = "manifest")),
          list(id = "x2", label = "x2", type = "variable", variableCharacteristics = list(manifestLatent = "manifest")),
          list(id = "F1", label = "Factor", type = "variable", variableCharacteristics = list(manifestLatent = "latent"))
        ),
        paths = list(
          list(from = "Factor", to = "x1", numberOfArrows = 1, freeParameter = TRUE, parameterType = "loadings"),
          list(from = "Factor", to = "x2", numberOfArrows = 1, freeParameter = TRUE, parameterType = "loadings")
        ),
        optimization = list(
          fitFunction = "ML",
          missingness = "FIML",
          parameterTypes = list()
        )
      )
    )
  )
  
  gm <- as.GraphModel(schema)
  
  # Hash should be consistent
  hash1 <- hashStructure(gm)
  hash2 <- hashStructure(gm)
  
  expect_equal(hash1, hash2)
  expect_true(is.character(hash1))
  expect_true(nchar(hash1) > 0)
})

test_that("hashStructure() detects structural changes", {
  schema <- list(
    schemaVersion = 0,
    models = list(
      model1 = list(
        nodes = list(
          list(id = "x1", label = "x1", type = "variable", variableCharacteristics = list(manifestLatent = "manifest"))
        ),
        paths = list(),
        optimization = list(fitFunction = "ML", missingness = "FIML", parameterTypes = list())
      )
    )
  )
  
  gm1 <- as.GraphModel(schema)
  hash1 <- hashStructure(gm1)
  
  # Add a node
  schema$models$model1$nodes[[2]] <- list(id = "x2", label = "x2", type = "variable", variableCharacteristics = list(manifestLatent = "manifest"))
  gm2 <- as.GraphModel(schema)
  hash2 <- hashStructure(gm2)
  
  expect_false(identical(hash1, hash2))
})

test_that("hashStructure() ignores visual properties", {
  schema <- list(
    schemaVersion = 0,
    models = list(
      model1 = list(
        nodes = list(
          list(id = "x1", label = "x1", type = "variable", variableCharacteristics = list(manifestLatent = "manifest"))
        ),
        paths = list(),
        optimization = list(fitFunction = "ML", missingness = "FIML", parameterTypes = list())
      )
    )
  )
  
  gm1 <- as.GraphModel(schema)
  hash1 <- hashStructure(gm1)
  
  # Modify visual properties (which shouldn't affect hash)
  schema$models$model1$nodes[[1]]$visual <- list(x = 100, y = 200)
  gm2 <- as.GraphModel(schema)
  hash2 <- hashStructure(gm2)
  
  # Hashes should be the same (visual properties ignored)
  expect_equal(hash1, hash2)
})

# Shared base for the path-field tests below: one fixed loading, so `value` is
# the fixed value rather than a start value.
fixedLoadingSchema <- function() {
  list(
    schemaVersion = 0,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "x1", type = "variable", variableCharacteristics = list(manifestLatent = "manifest")),
          list(label = "Factor", type = "variable", variableCharacteristics = list(manifestLatent = "latent"))
        ),
        paths = list(
          list(from = "Factor", to = "x1", numberOfArrows = 1, value = 1.0)
        ),
        optimization = list(fitFunction = "ML", missingness = "FIML", parameterTypes = list())
      )
    )
  )
}

test_that("hashStructure() detects a changed fixed path value", {
  schema <- fixedLoadingSchema()
  hash1 <- hashStructure(as.GraphModel(schema))

  # freeParameter is absent, so `value` is the fixed loading: changing it
  # changes the model and must make a recorded fit stale.
  schema$models$model1$paths[[1]]$value <- 0.5
  hash2 <- hashStructure(as.GraphModel(schema))

  expect_false(identical(hash1, hash2))
})

test_that("hashStructure() detects a changed path label", {
  schema <- fixedLoadingSchema()
  schema$models$model1$paths[[1]]$freeParameter <- TRUE
  hash1 <- hashStructure(as.GraphModel(schema))

  # With freeParameter TRUE rather than a string, buildPathList() falls back to
  # `label` for the mxPath parameter name, so it can constrain paths equal.
  schema$models$model1$paths[[1]]$label <- "lambda1"
  hash2 <- hashStructure(as.GraphModel(schema))

  expect_false(identical(hash1, hash2))
})

test_that("hashStructure() detects changed per-path bounds and priors", {
  schema <- fixedLoadingSchema()
  schema$models$model1$paths[[1]]$freeParameter <- TRUE
  hash1 <- hashStructure(as.GraphModel(schema))

  schema$models$model1$paths[[1]]$optimization <- list(bounds = list(0, 10))
  hash2 <- hashStructure(as.GraphModel(schema))
  expect_false(identical(hash1, hash2))

  schema$models$model1$paths[[1]]$optimization <- list(
    prior = list(distribution = "normal", mean = 0, sd = 1)
  )
  # The OpenMx backend warns that it will not apply the prior; not under test.
  hash3 <- suppressWarnings(hashStructure(as.GraphModel(schema)))
  expect_false(identical(hash1, hash3))
  expect_false(identical(hash2, hash3))
})

test_that("hashStructure() ignores per-path start values", {
  schema <- fixedLoadingSchema()
  schema$models$model1$paths[[1]]$freeParameter <- TRUE
  hash1 <- hashStructure(as.GraphModel(schema))

  # `start` is an advisory computational hint, not model content
  # (SCHEMA-DESIGN.md section 10), so it must not mark a fit stale.
  schema$models$model1$paths[[1]]$optimization <- list(start = 0.7)
  hash2 <- hashStructure(as.GraphModel(schema))

  expect_equal(hash1, hash2)
})

test_that("hashStructure() treats a start-only optimization block as absent", {
  # Regression: an optimization block containing only `start` must hash
  # identically to no optimization block at all, or adding the first start
  # hint to a bare path would itself flip the hash.
  schema1 <- fixedLoadingSchema()
  schema1$models$model1$paths[[1]]$freeParameter <- TRUE
  hash1 <- hashStructure(as.GraphModel(schema1))

  schema2 <- fixedLoadingSchema()
  schema2$models$model1$paths[[1]]$freeParameter <- TRUE
  schema2$models$model1$paths[[1]]$optimization <- list(start = 0.7)
  hash2 <- hashStructure(as.GraphModel(schema2))

  expect_equal(hash1, hash2)
})

test_that("hashStructure() ignores visual, description, and tags on paths and nodes", {
  schema <- fixedLoadingSchema()
  hash1 <- hashStructure(as.GraphModel(schema))

  schema$models$model1$nodes[[1]]$visual <- list(x = 10, y = 20)
  schema$models$model1$nodes[[1]]$description <- "a manifest variable"
  schema$models$model1$nodes[[1]]$tags <- list("demo")
  schema$models$model1$paths[[1]]$visual <- list(curvature = 0.5)
  schema$models$model1$paths[[1]]$description <- "the loading"
  schema$models$model1$paths[[1]]$tags <- list("core")
  hash2 <- hashStructure(as.GraphModel(schema))

  expect_equal(hash1, hash2)
})

test_that("hashStructure() detects a changed dataset source", {
  schema <- list(
    schemaVersion = 0,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "x1", type = "variable", variableCharacteristics = list(manifestLatent = "manifest")),
          list(
            label = "data", type = "dataset",
            datasetSource = list(type = "file", location = "a.csv", columnTypes = list(x1 = "number"), md5 = "aaa")
          )
        ),
        paths = list(list(from = "data", to = "x1", type = "data", label = "x1")),
        optimization = list(fitFunction = "ML", missingness = "FIML", parameterTypes = list())
      )
    )
  )
  hash1 <- hashStructure(as.GraphModel(schema))

  # Swapping the underlying data file is a structural change: it is not
  # detected via a separate dataBinding comparison, only via structureHash.
  schema$models$model1$nodes[[2]]$datasetSource$md5 <- "bbb"
  hash2 <- hashStructure(as.GraphModel(schema))

  expect_false(identical(hash1, hash2))
})

test_that("hashStructure() ignores global parameterType start defaults", {
  schema <- fixedLoadingSchema()
  schema$models$model1$optimization$parameterTypes <- list(
    loadings = list(bounds = list(0, NULL))
  )
  hash1 <- hashStructure(as.GraphModel(schema))

  # `start` is advisory (SCHEMA-DESIGN.md section 10) at the parameterType
  # level too, same as per-path -- it must not affect staleness.
  schema$models$model1$optimization$parameterTypes$loadings$start <- 0.3
  hash2 <- hashStructure(as.GraphModel(schema))

  expect_equal(hash1, hash2)

  # But a changed bound is model content.
  schema$models$model1$optimization$parameterTypes$loadings$bounds <- list(0, 10)
  hash3 <- hashStructure(as.GraphModel(schema))
  expect_false(identical(hash1, hash3))
})

test_that("getFitResults() returns NULL when no fits available", {
  schema <- list(
    schemaVersion = 0,
    models = list(
      model1 = list(
        nodes = list(list(id = "x1", label = "x1", type = "variable", variableCharacteristics = list(manifestLatent = "manifest"))),
        paths = list(),
        optimization = list(fitFunction = "ML", missingness = "FIML", parameterTypes = list())
      )
    )
  )
  
  gm <- as.GraphModel(schema)
  result <- getFitResults(gm)
  
  expect_null(result)
})

test_that("getFitResults() returns NA with warning when fit is stale", {
  schema <- list(
    schemaVersion = 0,
    models = list(
      model1 = list(
        nodes = list(list(id = "x1", label = "x1", type = "variable", variableCharacteristics = list(manifestLatent = "manifest"))),
        paths = list(),
        optimization = list(fitFunction = "ML", missingness = "FIML", parameterTypes = list()),
        provenance = list(
          structureHash = "old_different_hash",  # Doesn't match current structure
          fitResults = list(
            list(
              timestamp = "2025-02-11T10:00:00Z",
              backend = "OpenMx",
              converged = TRUE,
              structureHash = "old_different_hash",  # Doesn't match current structure
              statusRemarks = "Converged",
              fitValue = 100.5,
              degreesOfFreedom = 50,
              sampleSize = 500,
              parameterEstimates = list(p1 = 0.5),
              standardErrors = list(p1 = 0.05)
            )
          )
        )
      )
    )
  )
  
  gm <- as.GraphModel(schema)
  
  # Should return NA with warning
  expect_warning(
    result <- getFitResults(gm, includeStale = FALSE),
    "Fit is stale"
  )
  expect_true(is.na(result))
})

test_that("getFitResults() works with includeStale = TRUE", {
  schema <- list(
    schemaVersion = 0,
    models = list(
      model1 = list(
        nodes = list(list(id = "x1", label = "x1", type = "variable", variableCharacteristics = list(manifestLatent = "manifest"))),
        paths = list(),
        optimization = list(fitFunction = "ML", missingness = "FIML", parameterTypes = list()),
        provenance = list(
          structureHash = "current_hash_value",
          fitResults = list(
            list(
              timestamp = "2025-02-11T10:00:00Z",
              backend = "OpenMx",
              converged = TRUE,
              structureHash = "old_different_hash",  # Intentionally different
              statusRemarks = "Converged",
              fitValue = 100.5,
              parameterEstimates = list(p1 = 0.5),
              standardErrors = list(p1 = 0.05)
            )
          )
        )
      )
    )
  )
  
  gm <- as.GraphModel(schema)
  
  # Should return fit with warning since it's stale but includeStale = TRUE
  expect_warning(
    result <- getFitResults(gm, includeStale = TRUE),
    "stale"
  )
  expect_equal(result$fitValue, 100.5)
  expect_true(result$isStale)  # Should be marked stale now
})

test_that("getFitResults(which = 'all') returns all fits", {
  # Create base schema
  schema <- list(
    schemaVersion = 0,
    models = list(
      model1 = list(
        nodes = list(list(id = "x1", label = "x1", type = "variable", variableCharacteristics = list(manifestLatent = "manifest"))),
        paths = list(),
        optimization = list(fitFunction = "ML", missingness = "FIML", parameterTypes = list())
      )
    )
  )
  
  gm <- as.GraphModel(schema)
  # Compute the actual structure hash for this model
  actual_hash <- hashStructure(gm)
  
  # Now add provenance with fits using the actual hash
  schema$models$model1$provenance <- list(
    structureHash = actual_hash,
    fitResults = list(
      list(timestamp = "2025-02-11T10:00:00Z", backend = "OpenMx", converged = TRUE, structureHash = actual_hash, fitValue = 100.5, parameterEstimates = list(), standardErrors = list()),
      list(timestamp = "2025-02-11T11:00:00Z", backend = "OpenMx", converged = TRUE, structureHash = actual_hash, fitValue = 99.5, parameterEstimates = list(), standardErrors = list())
    )
  )
  
  gm <- as.GraphModel(schema)
  all_fits <- getFitResults(gm, which = "all")
  
  expect_length(all_fits, 2)
  expect_equal(all_fits[[1]]$fitValue, 100.5)
  expect_equal(all_fits[[2]]$fitValue, 99.5)
})

test_that("markFitDirty() updates structure hash and timestamp", {
  schema <- list(
    schemaVersion = 0,
    models = list(
      model1 = list(
        nodes = list(list(id = "x1", label = "x1", type = "variable", variableCharacteristics = list(manifestLatent = "manifest"))),
        paths = list(),
        optimization = list(fitFunction = "ML", missingness = "FIML", parameterTypes = list())
      )
    )
  )
  
  gm <- as.GraphModel(schema)
  original_hash <- hashStructure(gm)
  
  # Mark dirty
  gm_marked <- markFitDirty(gm)
  
  # Check that provenance was updated
  expect_false(is.null(gm_marked$schema$models$model1$provenance))
  expect_equal(gm_marked$schema$models$model1$provenance$structureHash, original_hash)
  expect_false(is.null(gm_marked$schema$models$model1$provenance$lastModified))
})

test_that("loglik() returns NA when no fit available", {
  schema <- list(
    schemaVersion = 0,
    models = list(
      model1 = list(
        nodes = list(list(id = "x1", label = "x1", type = "variable", variableCharacteristics = list(manifestLatent = "manifest"))),
        paths = list(),
        optimization = list(fitFunction = "ML", missingness = "FIML", parameterTypes = list())
      )
    )
  )
  
  gm <- as.GraphModel(schema)
  
  expect_warning(
    result <- loglik(gm),
    "no valid fit"
  )
  expect_true(is.na(result))
})

test_that("coef() returns parameters from fit", {
  # Create base schema
  schema <- list(
    schemaVersion = 0,
    models = list(
      model1 = list(
        nodes = list(list(id = "x1", label = "x1", type = "variable", variableCharacteristics = list(manifestLatent = "manifest"))),
        paths = list(),
        optimization = list(fitFunction = "ML", missingness = "FIML", parameterTypes = list())
      )
    )
  )
  
  gm <- as.GraphModel(schema)
  actual_hash <- hashStructure(gm)
  
  # Add provenance with fit using the actual hash
  schema$models$model1$provenance <- list(
    structureHash = actual_hash,
    fitResults = list(
      list(
        timestamp = "2025-02-11T10:00:00Z",
        backend = "OpenMx",
        converged = TRUE,
        structureHash = actual_hash,
        fitValue = 100,
        parameterEstimates = list(p1 = 0.5, p2 = 0.7),
        standardErrors = list(p1 = 0.05, p2 = 0.07)
      )
    )
  )
  
  gm <- as.GraphModel(schema)
  coeffs <- coef(gm)
  
  expect_equal(coeffs[["p1"]], 0.5)
  expect_equal(coeffs[["p2"]], 0.7)
})

test_that("confint() returns confidence interval data frame", {
  # Create base schema
  schema <- list(
    schemaVersion = 0,
    models = list(
      model1 = list(
        nodes = list(list(id = "x1", label = "x1", type = "variable", variableCharacteristics = list(manifestLatent = "manifest"))),
        paths = list(),
        optimization = list(fitFunction = "ML", missingness = "FIML", parameterTypes = list())
      )
    )
  )
  
  gm <- as.GraphModel(schema)
  actual_hash <- hashStructure(gm)
  
  # Add provenance with fit using the actual hash
  schema$models$model1$provenance <- list(
    structureHash = actual_hash,
    fitResults = list(
      list(
        timestamp = "2025-02-11T10:00:00Z",
        backend = "OpenMx",
        converged = TRUE,
        structureHash = actual_hash,
        fitValue = 100,
        parameterEstimates = list(p1 = 0.5),
        standardErrors = list(p1 = 0.05)
      )
    )
  )
  
  gm <- as.GraphModel(schema)
  ci <- confint(gm, level = 0.95)
  
  expect_true(is.data.frame(ci))
  expect_true("p1" %in% rownames(ci))
  expect_true("lbound" %in% colnames(ci))
  expect_true("estimate" %in% colnames(ci))
  expect_true("ubound" %in% colnames(ci))
  expect_true(ci["p1", "lbound"] < ci["p1", "estimate"])
  expect_true(ci["p1", "estimate"] < ci["p1", "ubound"])
})

test_that("runOpenMx records dataBinding matching the dataset node", {
  skip_if_not(requireNamespace("OpenMx", quietly = TRUE), "OpenMx not available")

  df <- data.frame(x = c(1.2, 2.4, 0.8, 3.1, 1.9, 2.7))

  schema <- list(
    schemaVersion = 0,
    models = list(
      model1 = list(
        nodes = list(
          list(id = "x", label = "x", type = "variable"),
          list(id = "const", label = "1", type = "constant"),
          list(
            id = "data1", label = "data", type = "dataset",
            datasetSource = list(
              type = "file", location = "x.csv", format = "csv",
              columnTypes = list(x = "number"),
              md5 = "deadbeefcafe0001",
              rowCount = nrow(df)
            )
          )
        ),
        paths = list(
          list(from = "data", to = "x", type = "data", label = "x"),
          list(
            from = "x", to = "x", numberOfArrows = 2,
            value = 1.0, freeParameter = TRUE
          ),
          list(
            from = "1", to = "x", numberOfArrows = 1,
            value = 0.0, freeParameter = TRUE
          )
        ),
        optimization = list(fitFunction = "ML")
      )
    )
  )

  # Attach the data frame directly (keyed by dataset-node label) rather than
  # round-tripping through JSON, which would mangle embedded column names.
  g <- as.GraphModel(schema, data = list(data = df))

  fitted <- runOpenMx(g, silent = TRUE)
  fits <- fitted@schema$models[["model1"]]$provenance$fitResults
  entry <- fits[[length(fits)]]

  expect_true(entry$converged)
  expect_false(is.null(entry$dataBinding))
  expect_equal(entry$dataBinding$datasetLabel, "data")
  expect_equal(entry$dataBinding$md5, "deadbeefcafe0001")
  expect_equal(entry$dataBinding$rowCount, nrow(df))
})
