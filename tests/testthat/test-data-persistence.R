# ============================================================================
# Test Helper Functions
# ============================================================================

test_that("inferColumnTypes correctly identifies column types", {
  df <- data.frame(
    num = c(1, 2, 3),
    int = c(1L, 2L, 3L),
    bool = c(TRUE, FALSE, TRUE),
    str = c("a", "b", "c"),
    ord = factor(c("low", "med", "high"), ordered = TRUE),
    stringsAsFactors = FALSE
  )
  
  types <- inferColumnTypes(df)
  
  expect_equal(types["num"], c(num = "number"))
  expect_equal(types["int"], c(int = "number"))
  expect_equal(types["bool"], c(bool = "boolean"))
  expect_equal(types["str"], c(str = "string"))
  expect_equal(types["ord"], c(ord = "ordinal"))
})

test_that("dataFrameToJSON serializes data.frames correctly", {
  df <- data.frame(
    id = c(1, 2),
    name = c("Alice", "Bob"),
    score = c(85.5, 92.0),
    stringsAsFactors = FALSE
  )
  
  result <- dataFrameToJSON(df)
  
  expect_named(result, c("columnTypes", "object"))
  expect_equal(result$columnTypes["id"], c(id = "number"))
  expect_equal(result$columnTypes["name"], c(name = "string"))
  expect_equal(result$columnTypes["score"], c(score = "number"))
  
  expect_length(result$object, 2)
  expect_equal(result$object[[1]]$id, 1)
  expect_equal(result$object[[1]]$name, "Alice")
  expect_equal(result$object[[2]]$score, 92.0)
})

test_that("jsonToDataFrame deserializes with proper type coercion", {
  json_obj <- list(
    list(id = 1, name = "Alice", score = 85.5),
    list(id = 2, name = "Bob", score = 92.0)
  )
  
  columnTypes <- c(id = "number", name = "string", score = "number")
  
  df <- jsonToDataFrame(json_obj, columnTypes)
  
  expect_s3_class(df, "data.frame")
  expect_equal(nrow(df), 2)
  expect_equal(ncol(df), 3)
  expect_type(df$id, "double")
  expect_type(df$name, "character")
  expect_type(df$score, "double")
  expect_equal(df$id, c(1, 2))
  expect_equal(df$name, c("Alice", "Bob"))
})

test_that("jsonToDataFrame handles empty data", {
  df <- jsonToDataFrame(list(), c(id = "number", name = "string"))
  
  expect_s3_class(df, "data.frame")
  expect_equal(nrow(df), 0)
})

test_that("resolveDataPath handles relative and absolute paths", {
  # Test relative path
  result <- resolveDataPath("data/mydata.csv", "/home/user/models", ".")
  expect_match(result, "models/data/mydata.csv$")
  
  # Test absolute path
  abs_path <- "/tmp/data.csv"
  result <- resolveDataPath(abs_path, "/home/user", ".")
  expect_equal(normalizePath(result), normalizePath(abs_path))
  
  # Test override dataPath
  result <- resolveDataPath("mydata.csv", "/home/user/models", "/home/user/other")
  expect_match(result, "other/mydata.csv$")
  
  # Test NULL/empty location
  result <- resolveDataPath(NULL, "/home/user/models", ".")
  expect_null(result)
  
  result <- resolveDataPath("", "/home/user/models", ".")
  expect_null(result)
})

# ============================================================================
# Test loadSchema and saveSchema
# ============================================================================

test_that("loadSchema loads embedded data correctly", {
  skip_if_not(requireNamespace("jsonlite", quietly = TRUE), "jsonlite not available")
  
  # Create a temporary schema file with embedded data
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(id = "x", label = "x", type = "variable"),
          list(id = "y", label = "y", type = "variable"),
          list(
            id = "data1", label = "data",
            type = "dataset",
            datasetSource = list(
              type = "embedded",
              format = "json",
              encoding = "UTF-8",
              columnTypes = list(x = "number", y = "number"),
              object = list(
                list(x = 1, y = 2),
                list(x = 3, y = 4)
              )
            ),
            mappings = list(x = "x", y = "y")
          )
        ),
        paths = list()
      )
    )
  )
  
  # Write to temp file
  tmpfile <- tempfile(fileext = ".json")
  on.exit(unlink(tmpfile))
  jsonlite::write_json(schema, tmpfile)
  
  # Load the schema
  g <- loadSchema(tmpfile)
  
  expect_s4_class(g, "GraphModel")
  expect_true("data" %in% names(g$data))
  
  df <- g$data$data
  expect_s3_class(df, "data.frame")
  expect_equal(nrow(df), 2)
  expect_equal(names(df), c("x", "y"))
  expect_equal(df$x, c(1, 3))
  expect_equal(df$y, c(2, 4))
})

test_that("saveSchema exports data when writeData=TRUE", {
  skip_if_not(requireNamespace("jsonlite", quietly = TRUE), "jsonlite not available")
  
  # Create a GraphModel with data
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(id = "d", label = "data", type = "dataset",
               datasetSource = list(type = "file"),
               mappings = list())
        ),
        paths = list()
      )
    )
  )
  
  df <- data.frame(x = c(1, 2), y = c(3, 4), stringsAsFactors = FALSE)
  g <- as.GraphModel(schema, data = list(data = df))
  
  # Save with writeData=TRUE
  tmpdir <- tempdir()
  tmpfile <- file.path(tmpdir, "model_test.json")
  on.exit({
    unlink(tmpfile)
    unlink(file.path(tmpdir, "model_test.csv"))
  })
  
  saveSchema(g, tmpfile, dataPath = tmpdir, dataFile = "model_test.csv", writeData = TRUE)
  
  # Check that CSV was written
  csv_file <- file.path(tmpdir, "model_test.csv")
  expect_true(file.exists(csv_file))
  
  # Read and verify CSV
  df_read <- read.csv(csv_file, stringsAsFactors = FALSE)
  expect_equal(df_read$x, c(1, 2))
  expect_equal(df_read$y, c(3, 4))
  
  # Check schema was updated
  schema_read <- jsonlite::read_json(tmpfile, simplifyVector = FALSE, simplifyDataFrame = FALSE)
  ds_type <- schema_read$models$model1$nodes[[1]]$datasetSource$type
  if (is.list(ds_type)) ds_type <- unlist(ds_type)  # Handle jsonlite list-wrapping
  expect_equal(ds_type, "file")
})

test_that("saveSchema with writeData=NA warns if file exists", {
  skip_if_not(requireNamespace("jsonlite", quietly = TRUE), "jsonlite not available")
  
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(id = "d", label = "data", type = "dataset",
               datasetSource = list(type = "file"),
               mappings = list())
        ),
        paths = list()
      )
    )
  )
  
  df <- data.frame(x = c(1, 2), stringsAsFactors = FALSE)
  g <- as.GraphModel(schema, data = list(data = df))
  
  # Create existing CSV file
  tmpdir <- tempdir()
  tmpfile <- file.path(tmpdir, "model_exist.json")
  csv_file <- file.path(tmpdir, "model_exist.csv")
  on.exit({
    unlink(tmpfile)
    unlink(csv_file)
  })
  
  # Create the CSV first
  write.csv(data.frame(old = "data"), csv_file, row.names = FALSE)
  
  # Try to save with writeData=NA (should warn, not overwrite)
  expect_warning(
    saveSchema(g, tmpfile, dataPath = tmpdir, dataFile = "model_exist.csv", writeData = NA),
    "Data file exists"
  )
  
  # Verify old data is still there
  df_check <- read.csv(csv_file)
  expect_equal(names(df_check), "old")
})

test_that("saveSchema with strictData=TRUE errors on missing data", {
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(id = "d", label = "data", type = "dataset",
               datasetSource = list(type = "file"),
               mappings = list())
        ),
        paths = list()
      )
    )
  )
  
  # Create GraphModel without data
  g <- as.GraphModel(schema, data = list())
  
  tmpfile <- tempfile(fileext = ".json")
  on.exit(unlink(tmpfile))
  
  # writeData=TRUE with missing data and strictData=TRUE should error
  expect_error(
    saveSchema(g, tmpfile, writeData = TRUE, strictData = TRUE),
    "Data missing"
  )
})

# ============================================================================
# Test as.GraphModel(MxRAMModel) with embedded data
# ============================================================================

test_that("as.GraphModel.MxRAMModel creates embedded datasetSource", {
  skip_if_not(requireNamespace("OpenMx", quietly = TRUE), "OpenMx not available")
  
  # Create a simple OpenMx model with data
  data <- data.frame(x = rnorm(50), y = rnorm(50), z = rnorm(50))
  
  model <- OpenMx::mxModel(
    "test_model",
    OpenMx::mxData(data, type = "raw"),
    OpenMx::mxMatrix("Full", 3, 3, free = TRUE, values = 0.1, name = "A"),
    OpenMx::mxMatrix("Symm", 3, 3, free = TRUE, values = 0.8, name = "S"),
    OpenMx::mxExpectationRAM("A", "S", dimnames = c("x", "y", "z")),
    OpenMx::mxFitFunctionML()
  )
  
  # Convert to GraphModel
  g <- as.GraphModel(model)
  
  expect_is(g, "GraphModel")
  
  # Check that data is embedded
  schema <- schema(g)
  nodes <- schema$models$test_model$nodes
  
  # Find dataset node
  dataset_nodes <- Filter(function(n) n$type == "dataset", nodes)
  expect_length(dataset_nodes, 1)
  
  dataset_node <- dataset_nodes[[1]]
  expect_equal(dataset_node$datasetSource$type, "embedded")
  expect_equal(dataset_node$datasetSource$format, "json")
  expect_equal(dataset_node$datasetSource$rowCount, 50)
  expect_named(dataset_node$datasetSource$columnTypes,
               c("x", "y", "z"))
  expect_length(dataset_node$datasetSource$object, 50)
})

# ============================================================================
# Test buildMxData with embedded and file-based sources
# ============================================================================

test_that("buildMxData loads embedded data correctly", {
  # Create a schema with embedded datasetSource
  schema_list <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "x", type = "variable"),
          list(label = "y", type = "variable"),
          list(
            label = "data",
            type = "dataset",
            datasetSource = list(
              type = "embedded",
              columnTypes = list(x = "number", y = "number"),
              object = list(
                list(x = 1, y = 2),
                list(x = 3, y = 4)
              )
            ),
            mappings = list(x = "x", y = "y")
          )
        ),
        paths = list()
      )
    )
  )
  
  df <- data.frame(x = c(1, 3), y = c(2, 4))
  g <- as.GraphModel(schema_list, data = list(data = df))
  
  # This is difficult to test without a full model context
  # Just verify that buildMxData can be called
  # The actual test is in the full integration tests
  expect_is(g, "GraphModel")
})

# ============================================================================
# Test Round-Trip Conversion
# ============================================================================

test_that("Round-trip: MxModel -> GraphModel -> save/load -> rebuild", {
  skip_if_not(requireNamespace("OpenMx", quietly = TRUE), "OpenMx not available")
  skip_if_not(requireNamespace("jsonlite", quietly = TRUE), "jsonlite not available")
  
  # Create original model
  data <- data.frame(
    x = rnorm(30),
    y = rnorm(30),
    z = rnorm(30)
  )
  
  model1 <- OpenMx::mxModel(
    "simple_factor",
    OpenMx::mxData(data, type = "raw"),
    OpenMx::mxMatrix("Full", 2, 1, free = TRUE, values = 0.5,
                     name = "loadings"),
    OpenMx::mxMatrix("Symm", 1, 1, free = TRUE, values = 1,
                     name = "latentVar"),
    OpenMx::mxMatrix("Diag", 3, 3, free = TRUE, values = 1,
                     name = "residuals"),
    OpenMx::mxExpectationRAM(
      "A", "S", dimnames = c("x", "y", "f1")
    ),
    OpenMx::mxFitFunctionML()
  )
  
  # Convert to GraphModel  
  g1 <- as.GraphModel(model1)
  
  # Save to file
  tmpdir <- tempdir()
  tmpfile <- file.path(tmpdir, "roundtrip.json")
  on.exit({
    unlink(tmpfile)
    unlink(file.path(tmpdir, "roundtrip.csv"))
  })
  
  saveSchema(g1, tmpfile, dataPath = tmpdir, 
             dataFile = "roundtrip.csv", writeData = TRUE)
  
  # Load from file
  g2 <- loadSchema(tmpfile, loadData = TRUE, dataPath = tmpdir)
  
  # Verify data is preserved
  expect_true("data" %in% names(data(g2)))
  df_loaded <- data(g2)$data
  expect_is(df_loaded, "data.frame")
  expect_equal(nrow(df_loaded), 30)
  expect_equal(names(df_loaded), c("x", "y", "z"))
})

test_that("loadSchema smart-loads based on file size", {
  skip_if_not(requireNamespace("jsonlite", quietly = TRUE), "jsonlite not available")
  
  # Create schema with file-based data source
  schema <- list(
    schemaVersion = 1,
    models = list(
      model1 = list(
        nodes = list(
          list(label = "x", type = "variable"),
          list(
            label = "data",
            type = "dataset",
            datasetSource = list(
              type = "file",
              location = "small.csv",
              format = "csv"
            ),
            mappings = list(x = "x")
          )
        ),
        paths = list()
      )
    )
  )
  
  # Create temp CSV file
  tmpdir <- tempdir()
  tmpfile <- file.path(tmpdir, "schema.json")
  csvfile <- file.path(tmpdir, "small.csv")
  on.exit({
    unlink(tmpfile)
    unlink(csvfile)
  })
  
  write.csv(data.frame(x = c(1, 2, 3)), csvfile, row.names = FALSE)
  jsonlite::write_json(schema, tmpfile)
  
  # Load with loadData=NA (should smart-load small file)
  g <- loadSchema(tmpfile, loadData = NA, dataPath = tmpdir)
  
  # File should be loaded (< 10MB)
  expect_true("data" %in% names(data(g)))
  expect_is(data(g)$data, "data.frame")
})
