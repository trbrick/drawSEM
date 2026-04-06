test_that("hashStructure() creates consistent hashes for same structure", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(id = "x1", label = "x1", type = "variable", variableCharacteristics = list(manifestLatent = "manifest")),
          list(id = "x2", label = "x2", type = "variable", variableCharacteristics = list(manifestLatent = "manifest")),
          list(id = "F1", label = "Factor", type = "variable", variableCharacteristics = list(manifestLatent = "latent"))
        ),
        paths = list(
          list(from = "Factor", to = "x1", numberOfArrows = 1, free = "free", parameterType = "loadings"),
          list(from = "Factor", to = "x2", numberOfArrows = 1, free = "free", parameterType = "loadings")
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
    schemaVersion = 1,
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
    schemaVersion = 1,
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

test_that("getFitResults() returns NULL when no fits available", {
  schema <- list(
    schemaVersion = 1,
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
    schemaVersion = 1,
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
              isDirty = FALSE,
              structureHash = "old_different_hash",  # Doesn't match current structure
              statusRemarks = "Converged",
              fitValue = 100.5,
              degreesOfFreedom = 50,
              sampleSize = 500,
              parameters = list(p1 = 0.5),
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
    schemaVersion = 1,
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
              isDirty = FALSE,
              structureHash = "old_different_hash",  # Intentionally different
              statusRemarks = "Converged",
              fitValue = 100.5,
              parameters = list(p1 = 0.5),
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
  expect_true(result$isDirty)  # Should be marked dirty now
})

test_that("getFitResults(which = 'all') returns all fits", {
  # Create base schema
  schema <- list(
    schemaVersion = 1,
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
      list(timestamp = "2025-02-11T10:00:00Z", backend = "OpenMx", converged = TRUE, structureHash = actual_hash, fitValue = 100.5, parameters = list(), standardErrors = list()),
      list(timestamp = "2025-02-11T11:00:00Z", backend = "OpenMx", converged = TRUE, structureHash = actual_hash, fitValue = 99.5, parameters = list(), standardErrors = list())
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
    schemaVersion = 1,
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
    schemaVersion = 1,
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
    schemaVersion = 1,
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
        parameters = list(p1 = 0.5, p2 = 0.7),
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
    schemaVersion = 1,
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
        parameters = list(p1 = 0.5),
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
