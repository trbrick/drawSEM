test_that("as.GraphModel converts simple one-factor path model", {
  skip_if_not(requireNamespace("OpenMx", quietly = TRUE), "OpenMx not available")
  
  # Simplified one-factor model based on OneFactorModel_PathRaw.R
  data <- data.frame(x1 = rnorm(100, 3, 1), 
                     x2 = rnorm(100, 3, 1),
                     x3 = rnorm(100, 3, 1))
  
  model <- OpenMx::mxModel(
    'one_factor_model',
    type = 'RAM',
    manifestVars = c('x1', 'x2', 'x3'),
    latentVars = 'F1',
    OpenMx::mxData(data, type = 'raw'),
    # Residual variances
    OpenMx::mxPath(from = c('x1', 'x2', 'x3'), arrows = 2, 
                   free = TRUE, values = 1,
                   labels = c('e1', 'e2', 'e3')),
    # Latent variance
    OpenMx::mxPath(from = 'F1', arrows = 2, free = TRUE, values = 1, label = 'varF1'),
    # Factor loadings
    OpenMx::mxPath(from = 'F1', to = c('x1', 'x2', 'x3'), arrows = 1,
                   free = c(FALSE, TRUE, TRUE), values = 1,
                   labels = c('l1', 'l2', 'l3')),
    # Means
    OpenMx::mxPath(from = 'one', to = c('x1', 'x2', 'x3', 'F1'), arrows = 1,
                   free = c(TRUE, TRUE, TRUE, FALSE), values = c(1, 1, 1, 0),
                   labels = c('meanx1', 'meanx2', 'meanx3', NA))
  )
  
  g <- as.GraphModel(model)
  
  expect_s4_class(g, "GraphModel")
  expect_equal(g@schema$schemaVersion, 1)
  expect_true("one_factor_model" %in% names(g@schema$models))
  
  # Check that manifest variables are present
  nodes <- g@schema$models$one_factor_model$nodes
  var_nodes <- Filter(function(n) n$type == "variable", nodes)
  var_labels <- sapply(var_nodes, function(n) n$label)
  
  expect_true("x1" %in% var_labels)
  expect_true("x2" %in% var_labels)
  expect_true("x3" %in% var_labels)
  expect_true("F1" %in% var_labels)
  
  # Check that constant node is present (for means)
  const_nodes <- Filter(function(n) n$type == "constant", nodes)
  expect_equal(length(const_nodes), 1)
  expect_equal(const_nodes[[1]]$label, "one")
})

test_that("as.GraphModel handles bivariate path model", {
  skip_if_not(requireNamespace("OpenMx", quietly = TRUE), "OpenMx not available")
  
  # Simple bivariate model using mxPath
  data <- data.frame(x = rnorm(100), y = rnorm(100))
  
  model <- OpenMx::mxModel(
    'bivariate_model',
    type = 'RAM',
    manifestVars = c('x', 'y'),
    OpenMx::mxData(data, type = 'raw'),
    # Variances
    OpenMx::mxPath(from = c('x', 'y'), arrows = 2, free = TRUE, values = 1),
    # Covariance
    OpenMx::mxPath(from = 'x', to = 'y', arrows = 2, free = TRUE, values = 0.3)
  )
  
  g <- as.GraphModel(model)
  
  expect_s4_class(g, "GraphModel")
  expect_equal(g@schema$schemaVersion, 1)
  expect_true("bivariate_model" %in% names(g@schema$models))
  
  # Check that manifest variables are present
  nodes <- g@schema$models$bivariate_model$nodes
  var_nodes <- Filter(function(n) n$type == "variable", nodes)
  var_labels <- sapply(var_nodes, function(n) n$label)
  
  expect_true("x" %in% var_labels)
  expect_true("y" %in% var_labels)
})

test_that("as.GraphModel handles path model with custom variable names", {
  skip_if_not(requireNamespace("OpenMx", quietly = TRUE), "OpenMx not available")
  
  # Model with custom column names
  data <- data.frame(score_pre = rnorm(50), score_post = rnorm(50))
  
  model <- OpenMx::mxModel(
    'prepost_model',
    type = 'RAM',
    manifestVars = c('score_pre', 'score_post'),
    OpenMx::mxData(data, type = 'raw'),
    # Variances
    OpenMx::mxPath(from = c('score_pre', 'score_post'), arrows = 2, 
                   free = TRUE, values = 1),
    # Covariance
    OpenMx::mxPath(from = 'score_pre', to = 'score_post', arrows = 2, 
                   free = TRUE, values = 0.3)
  )
  
  g <- as.GraphModel(model)
  
  expect_s4_class(g, "GraphModel")
  
  # Check that data is properly stored with correct column names
  expect_true("data" %in% names(g@data))
  expect_equal(nrow(g@data$data), 50)
  expect_equal(colnames(g@data$data), c('score_pre', 'score_post'))
  
  # Check that variables are correctly identified
  nodes <- g@schema$models$prepost_model$nodes
  var_nodes <- Filter(function(n) n$type == "variable", nodes)
  var_labels <- sapply(var_nodes, function(n) n$label)
  
  expect_true("score_pre" %in% var_labels)
  expect_true("score_post" %in% var_labels)
})

test_that("as.GraphModel extracts means from mxPath 'one' entries", {
  skip_if_not(requireNamespace("OpenMx", quietly = TRUE), "OpenMx not available")
  
  # Model with means specified via mxPath(from='one', ...)
  # This is the proper modern OpenMx approach, same structure as the one-factor model
  data <- data.frame(x = rnorm(100, mean = 5), y = rnorm(100, mean = 10))
  
  model <- OpenMx::mxModel(
    'means_model',
    type = 'RAM',
    manifestVars = c('x', 'y'),
    OpenMx::mxData(data, type = 'raw'),
    # Variances
    OpenMx::mxPath(from = c('x', 'y'), arrows = 2, 
                   free = TRUE, values = 1,
                   labels = c('var_x', 'var_y')),
    # Covariance
    OpenMx::mxPath(from = 'x', to = 'y', arrows = 2, 
                   free = TRUE, values = 0.3,
                   labels = 'cov_xy'),
    # Means (intercepts) - using same pattern as latent model
    OpenMx::mxPath(from = 'one', to = c('x', 'y'), arrows = 1, 
                   free = TRUE, values = c(5, 10),
                   labels = c('mean_x', 'mean_y'))
  )
  
  g <- as.GraphModel(model)
  
  expect_s4_class(g, "GraphModel")
  expect_equal(g@schema$schemaVersion, 1)
  expect_true("means_model" %in% names(g@schema$models))
  
  # Check that manifest variables are present
  nodes <- g@schema$models$means_model$nodes
  var_nodes <- Filter(function(n) n$type == "variable", nodes)
  var_labels <- sapply(var_nodes, function(n) n$label)
  
  expect_true("x" %in% var_labels)
  expect_true("y" %in% var_labels)
  expect_equal(length(var_labels), 2)
  
  # Check that constant node is present
  const_nodes <- Filter(function(n) n$type == "constant", nodes)
  expect_equal(length(const_nodes), 1)
  expect_equal(const_nodes[[1]]$label, "one")
  
  # Check that paths from 'one' to variables exist and have correct structure
  paths <- g@schema$models$means_model$paths
  one_paths <- Filter(function(p) p$from == "one", paths)
  
  # Should have 2 paths from 'one' (one for each variable mean)
  expect_equal(length(one_paths), 2)
  
  # Verify each path has correct structure
  for (path in one_paths) {
    expect_equal(path$numberOfArrows, 1)
    expect_equal(path$parameterType, "mean")
    expect_equal(path$free, "free")
    expect_true(path$to %in% c('x', 'y'))
  }
  
  # Verify paths are to correct variables with correct values
  one_to_x <- Filter(function(p) p$to == "x", one_paths)
  one_to_y <- Filter(function(p) p$to == "y", one_paths)
  
  expect_equal(length(one_to_x), 1)
  expect_equal(length(one_to_y), 1)
  expect_equal(as.numeric(one_to_x[[1]]$value), 5)
  expect_equal(as.numeric(one_to_y[[1]]$value), 10)
})
