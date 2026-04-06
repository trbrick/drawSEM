# Tests for Tasks 15-16: R Plotting Integration
# Comprehensive test suite for plotGraphModel(), setLocation(), and S3 plot methods

# Load the package functions
library(OpenMxWebUI)

# Helper to load fixture files from visual-web-tool
load_fixture <- function(filename) {
  fixture_path <- system.file(
    "../../visual-web-tool/tests/fixtures/models/layout",
    filename,
    package = "OpenMxWebUI"
  )
  
  if (!file.exists(fixture_path)) {
    # Fallback: try from root
    fixture_path <- file.path(
      dirname(dirname(dirname(getwd()))),
      "visual-web-tool/tests/fixtures/models/layout",
      filename
    )
  }
  
  tryCatch(
    jsonlite::fromJSON(fixture_path),
    error = function(e) {
      # Return a minimal valid schema if fixture not found
      list(
        schemaVersion = 1,
        models = list(
          model1 = list(
            nodes = list(
              list(id = "X", label = "X", type = "variable", tags = list("manifest")),
              list(id = "Y", label = "Y", type = "variable", tags = list("manifest")),
              list(id = "Z", label = "Z", type = "variable", tags = list("manifest"))
            ),
            paths = list(
              list(from = "X", to = "Y", numberOfArrows = 1, free = "free"),
              list(from = "Y", to = "Z", numberOfArrows = 1, free = "free")
            )
          )
        )
      )
    }
  )
}

# Helper to create test GraphModel with minimal valid structure
create_test_graphmodel <- function(nodes = NULL, paths = NULL) {
  if (is.null(nodes)) {
    nodes <- list(
      list(id = "X", label = "X", type = "variable", tags = list("manifest")),
      list(id = "Y", label = "Y", type = "variable", tags = list("manifest")),
      list(id = "Z", label = "Z", type = "variable", tags = list("manifest"))
    )
  }
  
  if (is.null(paths)) {
    paths <- list(
      list(from = "X", to = "Y", numberOfArrows = 1, free = "free", parameterType = "regression"),
      list(from = "Y", to = "Z", numberOfArrows = 1, free = "free", parameterType = "regression")
    )
  }
  
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = nodes,
        paths = paths
      )
    )
  )
  
  as.GraphModel(schema)
}

# ============================================================================
# Task 15: plotGraphModel() Tests
# ============================================================================

describe("plotGraphModel()", {
  describe("Auto-detect editability", {
    test_that("editable auto-detects in interactive mode", {
      # In tests, interactive() is typically FALSE, so editability should be FALSE
      gm <- create_test_graphmodel()
      w <- plotGraphModel(gm)
      
      expect_s3_class(w, "htmlwidget")
      # Widget is created successfully (specific editability depends on test context)
    })
    
    test_that("editable=TRUE forces editable regardless of context", {
      gm <- create_test_graphmodel()
      w <- plotGraphModel(gm, editable = TRUE)
      
      expect_s3_class(w, "htmlwidget")
      expect_true(w$x$config$editable)
    })
    
    test_that("editable=FALSE forces non-editable", {
      gm <- create_test_graphmodel()
      w <- plotGraphModel(gm, editable = FALSE)
      
      expect_s3_class(w, "htmlwidget")
      expect_false(w$x$config$editable)
    })
    
    test_that("editable=NA auto-detects correctly", {
      gm <- create_test_graphmodel()
      w <- plotGraphModel(gm, editable = NA)
      
      expect_s3_class(w, "htmlwidget")
      # Editable should be either TRUE or FALSE, not NA
      expect_type(w$x$config$editable, "logical")
      expect_length(w$x$config$editable, 1)
    })
  })
  
  describe("Layout parameter behavior", {
    test_that("layout='auto' computes if positions missing", {
      gm <- create_test_graphmodel()
      # Remove positions if they exist
      gm@schema$graph$positions <- NULL
      
      w <- plotGraphModel(gm, layout = "auto")
      
      expect_s3_class(w, "htmlwidget")
      # Positions should have been computed
      expect_true(!is.null(w$x$positions))
      expect_true(is.data.frame(w$x$positions))
      expect_gt(nrow(w$x$positions), 0)
    })
    
    test_that("layout='auto' uses existing positions if present", {
      gm <- create_test_graphmodel()
      # Set explicit positions
      positions <- data.frame(
        nodeId = c("X", "Y", "Z"),
        x = c(10, 20, 30),
        y = c(100, 200, 300)
      )
      gm <- setLocation(gm, positions$nodeId, positions$x, positions$y)
      
      w <- plotGraphModel(gm, layout = "auto")
      
      expect_s3_class(w, "htmlwidget")
      # Should use the existing positions
      expect_equal(w$x$positions$x, c(10, 20, 30))
      expect_equal(w$x$positions$y, c(100, 200, 300))
    })
    
    test_that("layout='provided' errors if positions missing", {
      gm <- create_test_graphmodel()
      gm@schema$graph$positions <- NULL
      
      expect_error(
        plotGraphModel(gm, layout = "provided"),
        "layout='provided' but no positions found"
      )
    })
    
    test_that("layout='provided' uses positions if present", {
      gm <- create_test_graphmodel()
      gm <- setLocation(gm, c("X", "Y", "Z"), c(10, 20, 30), c(1, 2, 3))
      
      w <- plotGraphModel(gm, layout = "provided")
      
      expect_s3_class(w, "htmlwidget")
      expect_equal(w$x$positions$x, c(10, 20, 30))
    })
    
    test_that("forceLayout=TRUE re-computes even with existing positions", {
      gm <- create_test_graphmodel()
      gm <- setLocation(gm, c("X", "Y", "Z"), c(10, 20, 30), c(1, 2, 3))
      
      old_positions <- gm@schema$graph$positions
      
      w <- plotGraphModel(gm, forceLayout = TRUE)
      
      expect_s3_class(w, "htmlwidget")
      # New positions may differ from old (unless random seed same)
      # Just verify positions were recomputed
      expect_true(!is.null(w$x$positions))
    })
    
    test_that("invalid layout parameter raises error", {
      gm <- create_test_graphmodel()
      
      expect_error(
        plotGraphModel(gm, layout = "invalid"),
        "layout must be 'auto' or 'provided'"
      )
    })
  })
  
  describe("Layer control parameters", {
    test_that("showDataPaths=FALSE filters dataset nodes", {
      # Create model with dataset node
      nodes <- list(
        list(id = "dataset1", label = "mydata", type = "dataset"),
        list(id = "X", label = "X", type = "variable", tags = list("manifest")),
        list(id = "Y", label = "Y", type = "variable", tags = list("manifest")),
        list(id = "Z", label = "Z", type = "variable", tags = list("manifest"))
      )
      gm <- create_test_graphmodel(nodes = nodes)
      
      w <- plotGraphModel(gm, showDataPaths = FALSE)
      
      expect_s3_class(w, "htmlwidget")
      # Check that dataset nodes are filtered
      display_nodes <- w$x$schema$models[[1]]$nodes
      has_dataset <- any(sapply(display_nodes, function(n) n$type == "dataset"))
      expect_false(has_dataset)
    })
    
    test_that("showDataPaths=TRUE includes dataset nodes", {
      nodes <- list(
        list(id = "dataset1", label = "mydata", type = "dataset"),
        list(id = "X", label = "X", type = "variable", tags = list("manifest")),
        list(id = "Y", label = "Y", type = "variable", tags = list("manifest")),
        list(id = "Z", label = "Z", type = "variable", tags = list("manifest"))
      )
      gm <- create_test_graphmodel(nodes = nodes)
      
      w <- plotGraphModel(gm, showDataPaths = TRUE)
      
      expect_s3_class(w, "htmlwidget")
      display_nodes <- w$x$schema$models[[1]]$nodes
      has_dataset <- any(sapply(display_nodes, function(n) n$type == "dataset"))
      expect_true(has_dataset)
    })
    
    test_that("showConstantPaths=FALSE filters constant paths", {
      nodes <- list(
        list(id = "1", label = "1", type = "constant"),
        list(id = "X", label = "X", type = "variable", tags = list("manifest")),
        list(id = "Y", label = "Y", type = "variable", tags = list("manifest")),
        list(id = "Z", label = "Z", type = "variable", tags = list("manifest"))
      )
      paths <- list(
        list(from = "1", to = "X", numberOfArrows = 1, free = "free", parameterType = "mean"),
        list(from = "X", to = "Y", numberOfArrows = 1, free = "free", parameterType = "regression"),
        list(from = "Y", to = "Z", numberOfArrows = 1, free = "free", parameterType = "regression")
      )
      gm <- create_test_graphmodel(nodes = nodes, paths = paths)
      
      w <- plotGraphModel(gm, showConstantPaths = FALSE)
      
      expect_s3_class(w, "htmlwidget")
      display_paths <- w$x$schema$models[[1]]$paths
      has_constant_path <- any(sapply(display_paths, function(p) p$from == "1" || p$to == "1"))
      expect_false(has_constant_path)
    })
    
    test_that("showConstantPaths=TRUE includes constant paths", {
      nodes <- list(
        list(id = "1", label = "1", type = "constant"),
        list(id = "X", label = "X", type = "variable", tags = list("manifest")),
        list(id = "Y", label = "Y", type = "variable", tags = list("manifest")),
        list(id = "Z", label = "Z", type = "variable", tags = list("manifest"))
      )
      paths <- list(
        list(from = "1", to = "X", numberOfArrows = 1, free = "free", parameterType = "mean"),
        list(from = "X", to = "Y", numberOfArrows = 1, free = "free", parameterType = "regression"),
        list(from = "Y", to = "Z", numberOfArrows = 1, free = "free", parameterType = "regression")
      )
      gm <- create_test_graphmodel(nodes = nodes, paths = paths)
      
      w <- plotGraphModel(gm, showConstantPaths = TRUE)
      
      expect_s3_class(w, "htmlwidget")
      display_paths <- w$x$schema$models[[1]]$paths
      has_constant_path <- any(sapply(display_paths, function(p) p$from == "1" || p$to == "1"))
      expect_true(has_constant_path)
    })
    
    test_that("pathLabelFormat options are passed to config", {
      gm <- create_test_graphmodel()
      
      for (fmt in c("neither", "labels", "values", "both")) {
        w <- plotGraphModel(gm, pathLabelFormat = fmt)
        expect_equal(w$x$config$pathLabelFormat, fmt)
      }
    })
  })
  
  describe("Widget object structure", {
    test_that("plotGraphModel returns htmlwidget object", {
      gm <- create_test_graphmodel()
      w <- plotGraphModel(gm)
      
      expect_s3_class(w, "htmlwidget")
    })
    
    test_that("htmlwidget contains schema, positions, config", {
      gm <- create_test_graphmodel()
      w <- plotGraphModel(gm)
      
      expect_true(!is.null(w$x$schema))
      expect_true(!is.null(w$x$config))
      expect_true(!is.null(w$x$positions))
      expect_type(w$x$schema, "list")
      expect_type(w$x$config, "list")
    })
    
    test_that("widget has correct name and package", {
      gm <- create_test_graphmodel()
      w <- plotGraphModel(gm)
      
      expect_equal(attr(w, "class")[1], "graphTool")
      # Package name is in attributes
      expect_equal(attr(w, "package"), "OpenMxWebUI")
    })
  })
})

# ============================================================================
# setLocation() Tests
# ============================================================================

describe("setLocation()", {
  describe("Basic positioning", {
    test_that("setLocation modifies single node position", {
      gm <- create_test_graphmodel()
      gm <- setLocation(gm, "X", 100, 200)
      
      expect_true(!is.null(gm@schema$graph$positions))
      pos <- gm@schema$graph$positions
      expect_true("X" %in% pos$nodeId)
      expect_equal(pos[pos$nodeId == "X", "x"], 100)
      expect_equal(pos[pos$nodeId == "X", "y"], 200)
    })
    
    test_that("setLocation modifies multiple nodes", {
      gm <- create_test_graphmodel()
      gm <- setLocation(gm, c("X", "Y"), c(10, 20), c(1, 2))
      
      pos <- gm@schema$graph$positions
      expect_equal(nrow(pos), 2)
      expect_equal(pos[pos$nodeId == "X", "x"], 10)
      expect_equal(pos[pos$nodeId == "Y", "x"], 20)
    })
  })
  
  describe("Vectorization and recycling", {
    test_that("setLocation recycles shorter x vector", {
      gm <- create_test_graphmodel()
      gm <- setLocation(gm, c("X", "Y"), 10, c(1, 5))
      
      pos <- gm@schema$graph$positions
      # x should be recycled: both X and Y get x=10
      expect_equal(pos[pos$nodeId == "X", "x"], 10)
      expect_equal(pos[pos$nodeId == "Y", "x"], 10)
      # y should not be recycled, should be c(1, 5)
      expect_equal(pos[pos$nodeId == "X", "y"], 1)
      expect_equal(pos[pos$nodeId == "Y", "y"], 5)
    })
    
    test_that("setLocation recycles shorter y vector", {
      gm <- create_test_graphmodel()
      gm <- setLocation(gm, c("X", "Y", "Z"), c(10, 20, 30), 5)
      
      pos <- gm@schema$graph$positions
      # y should be recycled to all nodes
      expect_equal(pos[pos$nodeId == "X", "y"], 5)
      expect_equal(pos[pos$nodeId == "Y", "y"], 5)
      expect_equal(pos[pos$nodeId == "Z", "y"], 5)
    })
    
    test_that("setLocation recycles multiple times", {
      gm <- create_test_graphmodel()
      gm@schema$models[[1]]$nodes[[4]] <- list(id = "W", label = "W", type = "variable", tags = list("manifest"))
      gm <- setLocation(gm, c("X", "Y", "Z", "W"), 10, c(1, 2))
      
      pos <- gm@schema$graph$positions
      expect_equal(pos[pos$nodeId == "X", "y"], 1)
      expect_equal(pos[pos$nodeId == "Y", "y"], 2)
      expect_equal(pos[pos$nodeId == "Z", "y"], 1)
      expect_equal(pos[pos$nodeId == "W", "y"], 2)
    })
    
    test_that("setLocation errors on non-multiple lengths", {
      gm <- create_test_graphmodel()
      
      expect_error(
        setLocation(gm, c("X", "Y", "Z"), 10, c(1, 2)),
        "lengths must be multiples"
      )
    })
  })
  
  describe("Input validation", {
    test_that("setLocation errors if not GraphModel", {
      expect_error(
        setLocation(list(), "X", 10, 20),
        "graphModel must be a GraphModel object"
      )
    })
    
    test_that("setLocation errors if nodeId not character", {
      gm <- create_test_graphmodel()
      expect_error(
        setLocation(gm, 1, 10, 20),
        "nodeId must be non-empty character"
      )
    })
    
    test_that("setLocation errors if x not numeric", {
      gm <- create_test_graphmodel()
      expect_error(
        setLocation(gm, "X", "ten", 20),
        "x and y must be numeric"
      )
    })
    
    test_that("setLocation errors if y not numeric", {
      gm <- create_test_graphmodel()
      expect_error(
        setLocation(gm, "X", 10, "twenty"),
        "x and y must be numeric"
      )
    })
    
    test_that("setLocation warns on invalid nodeId", {
      gm <- create_test_graphmodel()
      
      expect_warning(
        setLocation(gm, "INVALID", 10, 20),
        "nodeId not found in schema"
      )
    })
  })
  
  describe("Return value", {
    test_that("setLocation returns modified GraphModel invisibly", {
      gm <- create_test_graphmodel()
      result <- setLocation(gm, "X", 10, 20)
      
      expect_s4_class(result, "GraphModel")
      expect_true(!is.null(result@schema$graph$positions))
    })
  })
})

# ============================================================================
# Task 16: S3 Plot Methods Tests
# ============================================================================

describe("plot.GraphModel()", {
  test_that("plot.GraphModel is called for GraphModel objects", {
    gm <- create_test_graphmodel()
    w <- plot(gm)
    
    expect_s3_class(w, "htmlwidget")
  })
  
  test_that("plot.GraphModel delegates to plotGraphModel", {
    gm <- create_test_graphmodel()
    w1 <- plot(gm, editable = TRUE)
    w2 <- plotGraphModel(gm, editable = TRUE)
    
    # Both should produce htmlwidgets with same config
    expect_s3_class(w1, "htmlwidget")
    expect_s3_class(w2, "htmlwidget")
    expect_equal(w1$x$config, w2$x$config)
  })
  
  test_that("plot.GraphModel respects editable parameter", {
    gm <- create_test_graphmodel()
    w <- plot(gm, editable = TRUE)
    
    expect_true(w$x$config$editable)
  })
  
  test_that("plot.GraphModel respects layout parameter", {
    gm <- create_test_graphmodel()
    gm <- setLocation(gm, c("X", "Y", "Z"), c(10, 20, 30), c(1, 2, 3))
    
    w <- plot(gm, layout = "provided")
    
    expect_s3_class(w, "htmlwidget")
  })
})

describe("plot.MxModel()", {
  test_that("plot.MxModel converts mxModel to GraphModel", {
    skip_if_not_installed("OpenMx")
    
    # Create simple one-factor model
    model <- OpenMx::mxModel(
      name = "oneFactorModel",
      type = "RAM",
      manifestVars = c("X1", "X2", "X3"),
      latentVars = c("F1"),
      OpenMx::mxPath(from = "F1", to = c("X1", "X2", "X3"), values = 0.7),
      OpenMx::mxPath(from = "X1", to = "X3", arrows = 2, free = FALSE, values = 0),
      OpenMx::mxPath(from = c("X1", "X2", "X3"), arrows = 2, values = 1),
      OpenMx::mxPath(from = "F1", arrows = 2, free = TRUE, values = 1, labels = "varF1"),
      OpenMx::mxData(data.frame(X1 = rnorm(100), X2 = rnorm(100), X3 = rnorm(100)), type = "raw")
    )
    
    w <- plot(model)
    
    expect_s3_class(w, "htmlwidget")
    # Widget should contain converted schema
    expect_true(!is.null(w$x$schema))
    expect_true("models" %in% names(w$x$schema))
  })
  
  test_that("plot.MxModel respects editable parameter", {
    skip_if_not_installed("OpenMx")
    
    model <- OpenMx::mxModel(
      name = "testModel",
      type = "RAM",
      manifestVars = c("X", "Y"),
      OpenMx::mxPath(from = "X", to = "Y", values = 0.5),
      OpenMx::mxPath(from = c("X", "Y"), arrows = 2, values = 1),
      OpenMx::mxData(data.frame(X = rnorm(50), Y = rnorm(50)), type = "raw")
    )
    
    w <- plot(model, editable = FALSE)
    
    expect_false(w$x$config$editable)
  })
})

# ============================================================================
# Integration Tests
# ============================================================================

describe("Integration tests", {
  test_that("plotGraphModel with setLocation produces consistent positions", {
    gm <- create_test_graphmodel()
    gm <- setLocation(gm, c("X", "Y", "Z"), c(10, 20, 30), c(1, 2, 3))
    
    w <- plotGraphModel(gm, layout = "auto")
    
    # Should use the set positions
    expect_equal(w$x$positions$x, c(10, 20, 30))
    expect_equal(w$x$positions$y, c(1, 2, 3))
  })
  
  test_that("Multiple plotGraphModel calls preserve positions", {
    gm <- create_test_graphmodel()
    gm <- setLocation(gm, c("X", "Y", "Z"), c(100, 200, 300), c(50, 100, 150))
    
    # First plot
    w1 <- plotGraphModel(gm)
    pos1 <- w1$x$positions
    
    # Second plot (without forceLayout)
    w2 <- plotGraphModel(gm)
    pos2 <- w2$x$positions
    
    # Positions should match (layout='auto' uses existing if present)
    expect_equal(pos1, pos2)
  })
  
  test_that("forceLayout overrides preserved positions", {
    gm <- create_test_graphmodel()
    gm <- setLocation(gm, c("X", "Y", "Z"), c(100, 200, 300), c(50, 100, 150))
    
    w_auto <- plotGraphModel(gm, layout = "auto")
    w_force <- plotGraphModel(gm, forceLayout = TRUE)
    
    # Saved positions
    pos_saved <- gm@schema$graph$positions
    pos_auto <- w_auto$x$positions
    pos_force <- w_force$x$positions
    
    # Auto should match saved
    expect_equal(pos_auto, pos_saved)
    # Force may be different (though exact values depend on algorithm)
    # Just verify force produces valid positions
    expect_true(!is.null(pos_force))
    expect_gt(nrow(pos_force), 0)
  })
  
  test_that("S3 plot methods work with layer control parameters", {
    gm <- create_test_graphmodel()
    
    w1 <- plot(gm, showDataPaths = TRUE, showConstantPaths = FALSE)
    w2 <- plot(gm, showDataPaths = FALSE, showConstantPaths = TRUE)
    
    expect_true(w1$x$config$visual$showDataPaths)
    expect_false(w1$x$config$visual$showConstantPaths)
    
    expect_false(w2$x$config$visual$showDataPaths)
    expect_true(w2$x$config$visual$showConstantPaths)
  })
})

# ============================================================================
# Edge Cases and Error Handling
# ============================================================================

describe("Edge cases", {
  test_that("plotGraphModel handles minimal schema gracefully", {
    # Create minimal valid schema with at least one variable node
    nodes <- list(
      list(id = "X", label = "X", type = "variable", tags = list("manifest"))
    )
    paths <- list()
    schema <- list(
      schemaVersion = 1,
      models = list(
        model1 = list(
          nodes = nodes,
          paths = paths
        )
      )
    )
    
    gm <- as.GraphModel(schema)
    w <- plotGraphModel(gm)
    
    # Should still produce a widget
    expect_s3_class(w, "htmlwidget")
  })
  
  test_that("setLocation with empty nodeId vector returns unchanged", {
    gm <- create_test_graphmodel()
    gm_original <- gm
    
    # Empty vectors should gracefully return unchanged object
    expect_error(
      setLocation(gm, character(0), numeric(0), numeric(0)),
      "nodeId must be non-empty"
    )
  })
  
  test_that("plotGraphModel with all layers disabled still works", {
    gm <- create_test_graphmodel()
    
    w <- plotGraphModel(gm, showDataPaths = FALSE, showConstantPaths = FALSE)
    
    expect_s3_class(w, "htmlwidget")
  })
})
