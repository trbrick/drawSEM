#' @include GraphModel-class.R GraphModel-methods.R validators.R utilities.R converters.R
NULL

# ============================================================================
# Helper Functions for Data Persistence
# ============================================================================

#' Infer Column Types from Data Frame
#'
#' Maps R data types to JSON-appropriate type names for roundtrip serialization.
#'
#' @param df A data.frame
#'
#' @return A named character vector where names are column names and values are
#'   JSON types ("number", "string", "boolean", "ordinal")
#'
#' @noRd
inferColumnTypes <- function(df) {
  types <- sapply(df, function(col) {
    if (is.numeric(col)) {
      "number"
    } else if (is.logical(col)) {
      "boolean"
    } else if (is.factor(col) || is.ordered(col)) {
      "ordinal"
    } else {
      "string"  # Default for character and others
    }
  }, USE.NAMES = TRUE)
  
  return(types)
}

#' Convert Data Frame to JSON-Compatible Format
#'
#' Serializes a data.frame into an array of row objects with metadata about
#' column types and names.
#'
#' @param df A data.frame to serialize
#'
#' @return A list with elements:
#'   - `columnTypes`: Named character vector of JSON types
#'   - `object`: Array of row objects (list of lists) for JSON serialization
#'
#' @noRd
dataFrameToJSON <- function(df) {
  if (!is.data.frame(df) || nrow(df) == 0) {
    return(list(
      columnTypes = inferColumnTypes(df),
      object = list()
    ))
  }
  
  # Get column types
  columnTypes <- inferColumnTypes(df)
  
  # Convert each row to a named list
  rows <- lapply(seq_len(nrow(df)), function(i) {
    row_as_list <- as.list(df[i, , drop = TRUE])
    # Ensure all values are properly unboxed
    lapply(row_as_list, function(x) if (length(x) == 1) x[[1]] else x)
  })
  
  list(
    columnTypes = columnTypes,
    object = rows
  )
}

#' Convert JSON Data to Data Frame
#'
#' Deserializes JSON array-of-objects back into a data.frame with proper type
#' coercion based on columnTypes metadata.
#'
#' @param jsonObject A list (from JSON array-of-objects)
#' @param columnTypes A named character vector of JSON types
#'
#' @return A data.frame with columns in the correct order and types
#'
#' @noRd
jsonToDataFrame <- function(jsonObject, columnTypes) {
  if (length(jsonObject) == 0) {
    # Empty data frame
    df <- data.frame()
    return(df)
  }
  
  # Convert list of objects to data frame
  df <- as.data.frame(do.call(rbind, jsonObject), stringsAsFactors = FALSE)
  
  # Apply type coercion based on columnTypes
  for (col_name in names(columnTypes)) {
    if (col_name %in% names(df)) {
      json_type <- columnTypes[[col_name]]
      
      if (json_type == "number") {
        df[[col_name]] <- as.numeric(df[[col_name]])
      } else if (json_type == "boolean") {
        df[[col_name]] <- as.logical(df[[col_name]])
      } else if (json_type == "ordinal") {
        df[[col_name]] <- as.factor(df[[col_name]])
      } else if (json_type == "string") {
        df[[col_name]] <- as.character(df[[col_name]])
      }
    }
  }
  
  return(df)
}

#' Resolve Data File Path
#'
#' Resolves a file path relative to schema directory, with support for absolute
#' paths and override dataPath argument.
#'
#' @param location The path from the schema (may be relative or absolute)
#' @param schemaDir The directory containing the schema file
#' @param dataPath User-specified override path (defaults to ".")
#'
#' @return An absolute file path
#'
#' @noRd
resolveDataPath <- function(location, schemaDir, dataPath = ".") {
  # If location is NULL/NA/empty, return NULL
  if (is.null(location) || is.na(location) || !nzchar(location)) {
    return(NULL)
  }
  
  # Check if path is absolute (starts with / or drive letter on Windows)
  is_absolute <- grepl("^(/|[A-Za-z]:)", location)
  
  if (is_absolute) {
    return(normalizePath(location, mustWork = FALSE))
  }
  
  # If dataPath is ".", use schemaDir
  if (dataPath == ".") {
    return(normalizePath(file.path(schemaDir, location), mustWork = FALSE))
  }
  
  # Otherwise, resolve relative to dataPath
  return(normalizePath(file.path(dataPath, location), mustWork = FALSE))
}

#' Normalize Schema from JSON Parsing
#'
#' Fixes jsonlite quirks where scalar values are wrapped in lists.
#' Recursively unlists single-element lists that should be scalars.
#'
#' @param obj A list potentially containing wrapped scalar values
#'
#' @return The normalized list with scalar values unwrapped
#'
#' @keywords internal
#' @noRd
normalizeSchemaFromJSON <- function(obj) {
  if (!is.list(obj)) {
    return(obj)
  }
  
  # Recursively normalize all elements
  obj <- lapply(obj, function(x) {
    if (is.list(x) && length(x) == 1 && !is.list(x[[1]])) {
      # Single-element list containing a scalar - unwrap it
      return(x[[1]])
    } else if (is.list(x)) {
      # Recursively normalize nested lists
      return(normalizeSchemaFromJSON(x))
    } else {
      return(x)
    }
  })
  
  return(obj)
}

#' Create GraphModel from Schema
#'
#' S4 method to construct a GraphModel object from a JSON schema.
#'
#' @param x A schema as a list, JSON string, or filepath
#' @param metadata Optional list for UI state and unsupported features
#' @param data Optional named list of data.frames (names are dataset node IDs)
#' @param ... Additional arguments (currently unused)
#'
#' @return A GraphModel object
#'
#' @details
#' Accepts three input formats:
#' - **List:** `as.GraphModel(schema_list, data = list(...))`
#' - **JSON string:** `as.GraphModel('{...json...}', data = list(...))`
#' - **File path:** `as.GraphModel('model.json', data = list(...))`
#'
#' The schema is validated on entry. Unsupported features are identified and
#' stored in the metadata for later retrieval or application.
#'
#' @examples
#' \dontrun{
#' # From list
#' schema <- list(
#'   schemaVersion = 1,
#'   models = list(model1 = list(nodes = list(), paths = list()))
#' )
#' g <- as.GraphModel(schema, data = list(mydata = my_df))
#'
#' # From JSON file
#' g <- as.GraphModel("model.json", data = list(mydata = my_df))
#'
#' # Inspect
#' schema(g)
#' data(g)
#' metadata(g)
#' }
#'
#' @export
#' @rdname as.GraphModel
NULL

#' @importFrom methods setGeneric setMethod 
# Create the generic
setGeneric(
  "as.GraphModel", 
  function(x, ...) standardGeneric("as.GraphModel"),
  useAsDefault = FALSE
)

setMethod(
  "as.GraphModel",
  "ANY",
  function(x, metadata = NULL, data = NULL, ...) {
    # Parse input into schema list
    if (is.character(x)) {
      if (file.exists(x)) {
        # It's a file path - use loadSchema which handles everything
        # loadSchema returns a complete GraphModel, so just return it
        gm <- loadSchema(x)
        
        # Optionally merge in user-provided metadata and data
        if (!is.null(metadata) && length(metadata) > 0) {
          gm@metadata <- c(gm@metadata, metadata)
        }
        if (!is.null(data) && is.list(data) && length(data) > 0) {
          gm@data <- c(gm@data, data)
        }
        
        return(gm)
      } else {
        # Try to parse as JSON string
        schema <- tryCatch(
          jsonlite::fromJSON(x, simplifyVector = FALSE, simplifyDataFrame = FALSE),
          error = function(e) {
            stop(
              "Input is neither a file path nor valid JSON: ",
              conditionMessage(e),
              call. = FALSE
            )
          }
        )
      }
    } else if (is.list(x)) {
      schema <- x
    } else if (is(x, "GraphModel")) {
      # If already a GraphModel, optionally merge metadata/data and return
      if (!is.null(metadata) && length(metadata) > 0) {
        x@metadata <- c(x@metadata, metadata)
      }
      if (!is.null(data) && is.list(data) && length(data) > 0) {
        x@data <- c(x@data, data)
      }
      return(x)
    } else {
      stop(
        "x must be a schema list, JSON string, file path, or GraphModel",
        call. = FALSE
      )
    }
    
    # Validate schema
    schema <- validateSchema(schema, verbose = TRUE)
    
    # Initialize metadata if not provided
    if (is.null(metadata)) {
      metadata <- list()
    }
    
    # Collect unsupported features
    unsupported <- collectUnsupportedFeatures(schema)
    if (any(unlist(unsupported))) {
      metadata$unsupported <- unsupported
      
      # Issue warnings for detected features
      if (unsupported$zeroHeadedPaths) {
        warning(
          "Unsupported features detected: 0-headed paths (Pearson selection) not supported",
          call. = FALSE
        )
      }
      if (unsupported$linkFunctions) {
        warning(
          "Unsupported features detected: link function nodes not supported (v0.2+)",
          call. = FALSE
        )
      }
      if (unsupported$priors) {
        warning(
          "Unsupported features detected: priors not applied by OpenMx backend",
          call. = FALSE
        )
      }
    }
    
    # Initialize data if not provided
    if (is.null(data)) {
      data <- list()
    }
    
    # Construct GraphModel
    new(
      "GraphModel",
      schema = schema,
      data = data,
      metadata = metadata,
      lastBuiltModel = NULL,
      dataConnections = list()
    )
  }
)

#' Convert GraphModel to MxModel
#'
#' S4 method to build a backend-specific model from a GraphModel.
#'
#' @param x A GraphModel object
#' @param model_id Optional. ID of the model to convert. Defaults to first model in schema.
#' @param data Optional. Named list of data.frames to override or supplement connected data.
#'   If a dataset is in this list, it will be used instead of any eagerly-loaded or lazy-loaded data.
#'
#' @return An MxModel object ready for mxRun()
#'
#' @details
#' Builds the mxModel by:
#' 1. Using any user-provided `data` parameter
#' 2. Using any eagerly-loaded data from `loadGraphModel()`
#' 3. Attempting to lazy-load data from schema-specified files
#' 4. If no data found, building model without mxData and issuing a warning
#'
#' Caches the built model in the GraphModel object.
#'
#' @examples
#' \dontrun{
#' g <- as.GraphModel(schema, data = list(mydata = my_df))
#' om_model <- as.MxModel(g)
#' fit <- mxRun(om_model)
#' }
#'
#' @export as.MxModel
#' @exportMethod as.MxModel
#' @rdname as.MxModel
NULL

setGeneric("as.MxModel", function(x, ...) standardGeneric("as.MxModel"), useAsDefault = FALSE)

setMethod(
  "as.MxModel",
  "GraphModel",
  function(x, model_id = NULL, data = NULL) {
    # Determine which model to build
    if (is.null(model_id)) {
      model_id <- names(x@schema$models)[1]
    }
    
    # Start with existing bound data
    working_data <- x@data
    
    # Merge in user-provided data if given
    if (!is.null(data) && is.list(data)) {
      working_data <- c(working_data, data)
    }
    
    # Try lazy loading for any unconnected datasets
    model <- x@schema$models[[model_id]]
    dataset_nodes <- Filter(function(n) n$type == "dataset", model$nodes %||% list())
    
    for (node in dataset_nodes) {
      dataset_label <- node$label
      
      # If dataset not already in working_data, try lazy load
      if (!(dataset_label %in% names(working_data))) {
        conn <- x@dataConnections[[dataset_label]] %||% list()
        
        if (conn$status %in% c("lazy", "unconnected") && !is.na(conn$filepath)) {
          # Try to load the file
          tryCatch(
            {
              df <- read.csv(conn$filepath, stringsAsFactors = FALSE)
              
              # Quick validation if columns are in connection state
              if (!is.null(conn$columns)) {
                schema_cols <- node$datasetFile$columns %||% c()
                if (length(schema_cols) > 0) {
                  missing_cols <- setdiff(schema_cols, colnames(df))
                  if (length(missing_cols) > 0) {
                    stop(
                      sprintf(
                        "Column mismatch: %s",
                        paste(missing_cols, collapse = ", ")
                      ),
                      call. = FALSE
                    )
                  }
                }
              }
              
              working_data[[dataset_label]] <- df
            },
            error = function(e) {
              warning(
                sprintf(
                  "Could not lazy-load dataset '%s' from '%s': %s",
                  dataset_label, conn$filepath, conditionMessage(e)
                ),
                call. = FALSE
              )
            }
          )
        } else if (conn$status == "unconnected") {
          warning(
            sprintf(
              "Dataset '%s' specified in model but not connected. Build will proceed without mxData.",
              dataset_label
            ),
            call. = FALSE
          )
        }
      }
    }
    
    # Convert to OpenMx
    om_model <- schemaToOpenMx(x@schema, working_data, model_id = model_id, optimize = TRUE)
    
    # Cache it
    x@lastBuiltModel <- om_model
    
    om_model
  }
)

#' Run GraphModel with OpenMx
#'
#' S4 method to run a GraphModel through mxRun().
#'
#' @param model A GraphModel object
#' @param ... Additional arguments passed to mxRun()
#'
#' @return A fitted mxModel (with class "mxModel")
#'
#' @details
#' Builds the mxModel if not already built, runs it, and stores the fitted
#' result back in the GraphModel. Returns the fitted mxModel directly.
#'
#' @examples
#' \dontrun{
#' g <- as.GraphModel(schema, data = list(mydata = my_df))
#' fit <- mxRun(g)
#' summary(fit)
#' }
#'
#' @export
#' @rdname mxRun
#' S3 method for running GraphModel objects
#' Dispatches to OpenMx for standard MxModel objects
#' @export
mxRun.GraphModel <- function(model, ...) {
  # Build model if needed
  om_model <- as.MxModel(model)
  
  # Run with OpenMx
  fit <- OpenMx::mxRun(om_model, ...)
  
  # Store fitted model back
  builtModel(model) <- fit
  
  # Return the fit object
  fit
}

#' Export GraphModel to JSON File
#'
#' Save a GraphModel's schema and metadata to a JSON file.
#'
#' @param graph_obj A GraphModel object
#' @param filepath Path where JSON should be written
#' @param pretty Logical. If TRUE, format with indentation (default: TRUE)
#'
#' @return Invisibly returns the filepath
#'
#' @details
#' Validates the schema before writing. Does NOT save the cached built model
#' or data objects (these are transient). Only the schema and metadata are saved.
#'
#' @examples
#' \dontrun{
#' g <- as.GraphModel(schema, data = list(mydata = my_df))
#' exportSchema(g, "model_final.json")
#' }
#'
#' @export
exportSchema <- function(graph_obj, filepath, pretty = TRUE) {
  if (!is(graph_obj, "GraphModel")) {
    stop("graph_obj must be a GraphModel", call. = FALSE)
  }
  
  # Validate schema before writing
  validateSchema(graph_obj@schema, verbose = FALSE)
  
  # Build output list
  output <- list(
    schemaVersion = graph_obj@schema$schemaVersion,
    models = graph_obj@schema$models
  )
  
  # Add optional meta field if present in schema
  if (!is.null(graph_obj@schema$meta)) {
    output$meta <- graph_obj@schema$meta
  }
  
  # Add metadata
  output$metadata <- graph_obj@metadata
  
  # Write to file
  # Use auto_unbox=TRUE to serialize length-1 vectors as scalars (not arrays)
  # This ensures value, label, and other scalar fields comply with the schema
  tryCatch(
    jsonlite::write_json(output, filepath, pretty = pretty, auto_unbox = TRUE),
    error = function(e) {
      stop(
        "Failed to write JSON: ",
        conditionMessage(e),
        call. = FALSE
      )
    }
  )
  
  invisible(filepath)
}

#' Load GraphModel from JSON File
#'
#' Load a GraphModel from a previously exported JSON schema file.
#'
#' @param filepath Path to JSON file
#' @param data Optional. Can be a named list of data.frames to bind to the model.
#'   Pass `list()` (empty list) to skip automatic data loading from schema.
#' @param datapath Path to search for CSV files specified in the schema.
#'   Defaults to current working directory. Data files are eagerly loaded if found
#'   and columns match the schema specification.
#'
#' @return A GraphModel object with data connections established
#'
#' @details
#' Data loading strategy:
#' 1. If `data` is provided as a named list, those datasets are bound immediately
#' 2. The function looks for CSV files referenced in the schema (via `datasetFile.fileName`)
#'    in the `datapath` directory
#' 3. Found files are validated (column names must match the schema) and eagerly loaded
#' 4. If a file is not found or columns don't match, it's marked for lazy loading
#'    (will be attempted when `as.MxModel()` is called)
#' 5. When building a model with `as.MxModel()`, any unconnected datasets will be
#'    lazy-loaded from the schema-specified file path
#'
#' @examples
#' \dontrun{
#' # Load with automatic file discovery
#' g <- loadGraphModel("model.json")
#'
#' # Load with explicit data
#' g <- loadGraphModel("model.json", data = list(sample = my_df))
#'
#' # Load from custom path
#' g <- loadGraphModel("model.json", datapath = "~/data/myproject")
#'
#' # Skip automatic data loading
#' g <- loadGraphModel("model.json", data = list())
#' }
#'
#' @export
loadGraphModel <- function(filepath, data = NULL, datapath = getwd()) {
  if (!file.exists(filepath)) {
    stop("File not found: ", filepath, call. = FALSE)
  }
  
  # Load graph model using loadSchema (which handles all data loading)
  gm <- loadSchema(filepath, dataPath = datapath)
  
  # If user provided data, merge it into the model's data
  if (!is.null(data) && is.list(data) && length(data) > 0) {
    # Merge user-provided data with schema-loaded data
    gm@data <- c(gm@data, data)
    
    # Update dataConnections for user-provided data
    for (dataset_name in names(data)) {
      gm@dataConnections[[dataset_name]] <- list(
        status = "user_bound",
        filepath = NA_character_
      )
    }
  }
  
  # Return the GraphModel
  gm
}
#' Infer Parameter Type from Path Structure
#'
#' Determine semantic parameter type based on path endpoints and node types.
#'
#' @param from_label Source node label
#' @param to_label Target node label
#' @param num_arrows Path arrows (1 or 2)
#' @param manifest_vars Character vector of manifest variable labels
#' @param latent_vars Character vector of latent variable labels
#'
#' @return Character; parameter type ("loading", "regression", "covariance", "variance", "mean", "dataMapping")
#'


inferParameterTypeFromStructure <- function(from_label, to_label, num_arrows, manifest_vars, latent_vars) {
  is_manifest_from <- from_label %in% manifest_vars
  is_manifest_to <- to_label %in% manifest_vars
  is_latent_from <- from_label %in% latent_vars
  is_latent_to <- to_label %in% latent_vars
  is_constant_from <- from_label == "1"
  
  # Single-headed arrows
  if (num_arrows == 1) {
    if (is_constant_from) return("mean")
    if (is_latent_from && is_manifest_to) return("loading")
    if (is_manifest_from && is_manifest_to) return("regression")
    if (is_latent_from && is_latent_to) return("regression")
    return("regression")  # Default
  }
  
  # Double-headed arrows (covariances/variances)
  if (num_arrows == 2) {
    if (is_constant_from) return("mean")
    if (identical(from_label, to_label)) return("variance")
    return("covariance")
  }
  
  return("parameter")  # Fallback
}

#' Extract Optimization Hints from MxMatrix
#'
#' Extract starting values and bounds from OpenMx matrix specification.
#'
#' @param matrix MxMatrix object
#' @param row_idx Matrix row index
#' @param col_idx Matrix column index
#'
#' @return List with start, bounds (or NULL if defaults)
#'
#' @keywords internal
#' @noRd
extractOptimizationFromMatrix <- function(matrix, row_idx, col_idx) {
  opt_list <- list()
  
  # Extract starting value
  start_val <- as.numeric(matrix$values[row_idx, col_idx])
  if (!is.na(start_val)) {
    opt_list$start <- start_val
  }
  
  # Extract bounds if available
  lbound <- as.numeric(matrix$lbound[row_idx, col_idx])
  ubound <- as.numeric(matrix$ubound[row_idx, col_idx])
  if (!is.na(lbound) || !is.na(ubound)) {
    opt_list$bounds <- c(
      if (is.na(lbound)) NULL else lbound,
      if (is.na(ubound)) NULL else ubound
    )
  }
  
  # Return NULL if no optimization info, otherwise the list
  if (length(opt_list) == 0) NULL else opt_list
}

#' Convert MxModel to GraphModel
#'
#' Convert an OpenMx model to a GraphModel for visualization and manipulation.
#'
#' @param x An MxModel or MxRAMModel object (from OpenMx)
#'
#' @return A GraphModel object with schema extracted from the model structure
#'
#' @details
#' Extracts the model structure, parameters, and data from RAM specification models:
#' - Supports MxModel and MxRAMModel objects created with type="RAM" specification
#' - Manifest and latent variables become nodes
#' - Asymmetric (A) and symmetric (S) matrix paths become graph edges
#' - Current parameter values and free/fixed status are preserved
#' - Parameter types inferred from path structure (loading, regression, etc.)
#' - Optimization hints (start values, bounds) extracted at path level
#' - Data from the model is linked by reference
#' - Fit function type is extracted (ML, WLS, etc.)
#' - Unsupported features (constraints, algebras, thresholds) are warned about
#'
#' Not supported:
#' - LISREL-type models (MxLISRELModel)
#' - State space models
#' - Joint continuous-discrete data models
#'
#' @examples
#' \dontrun{
#' library(OpenMx)
#' # Create and fit an MxRAMModel
#' fit <- mxRun(mxModel('model', type='RAM', ...))
#' # Convert to GraphModel for visualization
#' gm <- as.GraphModel(fit)
#' graphTool(gm)
#' }
#'
#' @export
#' @rdname as.GraphModel
setMethod(
  "as.GraphModel",
  "MxModel",
  function(x) {
    # Get model name
    model_name <- x$name %||% "model1"
    
    # Get manifest and latent variables
    manifest_vars <- x$manifestVars %||% c()
    latent_vars <- x$latentVars %||% c()
    
    # Get A and S matrix names from expectation (they are stored as strings in the expectation)
    a_name <- x$expectation$A %||% "A"
    s_name <- x$expectation$S %||% "S"
    m_name <- x$expectation$M
    
    # If manifest_vars is empty, infer from data and expectation structure
    if (length(manifest_vars) == 0) {
      # expectation$dims contains ALL variables (manifest + latent)
      # Manifests are those that ALSO appear in the observed data column names
      manifest_from_dims <- x$expectation$dims %||% c()
      manifest_from_data <- if (!is.null(x$data) && !is.null(x$data$observed)) {
        names(x$data$observed)
      } else {
        c()
      }
      
      # Only infer if we have both dims and data
      # (intersection ensures we only get variables that are in the data)
      if (length(manifest_from_dims) > 0 && length(manifest_from_data) > 0) {
        manifest_vars <- intersect(manifest_from_dims, manifest_from_data)
      }
      # If we don't have both sources, leave manifest_vars empty
      # (will be inferred in plotGraphModel via inferManifestVariables)
    }
    
    all_vars <- c(manifest_vars, latent_vars)
    
    # Handle data first (before creating nodes) so dataset_node is available
    # Note: MxModel can only have a single mxData object
    data_list <- list()
    data_connections <- list()
    dataset_node <- NULL
    
    if (!is.null(x$data)) {
      data_obj <- x$data
      if (!is.null(data_obj$observed)) {
        df <- data_obj$observed
        # Store with key name since MxModel only has one data object
        data_list$data <- df
        data_connections$data <- list(
          status = "user_bound",
          filepath = NA_character_
        )
        
        # Create dataset node with embedded datasetSource
        data_as_json <- dataFrameToJSON(df)
        
        dataset_node <- list(
          id = "dataset_primary",
          label = "data",
          type = "dataset",
          datasetSource = list(
            type = "embedded",
            format = "json",
            encoding = "UTF-8",
            columnTypes = data_as_json$columnTypes,
            object = data_as_json$object,
            rowCount = nrow(df)
          ),
          mappings = setNames(
            names(df),
            names(df)
          )
        )
      }
    }
    
    # Create nodes for all variables
    nodes <- list()
    
    # Add manifest variable nodes
    for (var in manifest_vars) {
      nodes[[length(nodes) + 1]] <- list(
        label = var,
        type = "variable",
        variableCharacteristics = list(manifestLatent = "manifest"),
        levelOfMeasurement = "individual"
      )
    }
    
    # Add latent variable nodes
    for (var in latent_vars) {
      nodes[[length(nodes) + 1]] <- list(
        label = var,
        type = "variable",
        variableCharacteristics = list(manifestLatent = "latent")
      )
    }
    
    # Add constant node (for means) - use "one" to match OpenMx variable names
    nodes[[length(nodes) + 1]] <- list(
      label = "one",
      type = "constant"
    )
    
    # Add dataset node if data exists
    if (!is.null(dataset_node)) {
      nodes[[length(nodes) + 1]] <- dataset_node
    }
    
    # Extract paths from A and S matrices
    paths <- list()
    
    # Helper to add path from matrix
    add_paths_from_matrix <- function(matrix_name, num_arrows, symmetric = FALSE) {
      mat <- x[[matrix_name]]
      if (is.null(mat)) return(NULL)
      
      row_names <- rownames(mat$values) %||% seq_len(nrow(mat$values))
      col_names <- colnames(mat$values) %||% seq_len(ncol(mat$values))
      
      path_list <- list()
      for (i in seq_len(nrow(mat$values))) {
        for (j in seq_len(ncol(mat$values))) {
          # For symmetric matrices, only process upper triangle (i <= j)
          # This avoids duplicate paths since S[i,j] = S[j,i]
          if (symmetric && i > j) next
          
          val <- mat$values[i, j]

          if (!is.na(val) && val != 0) {
            label <- mat$labels[i, j] %||% NA
            free <- mat$free[i, j] %||% FALSE

            from_label <- col_names[j]
            to_label <- row_names[i]
            
            # Infer parameter type from structure
            param_type <- inferParameterTypeFromStructure(
              from_label, to_label, num_arrows,
              manifest_vars, latent_vars
            )
            
            # Extract optimization info (start, bounds)
            opt_info <- extractOptimizationFromMatrix(mat, i, j)
            
            path <- list(
              fromLabel = from_label,
              toLabel = to_label,
              numberOfArrows = num_arrows,
              value = val,
              free = if (free) "free" else "fixed",
              label = label,
              parameterType = param_type
            )
            
            # Only include optimization if not NULL
            if (!is.null(opt_info)) {
              path$optimization <- opt_info
            }
            
            path_list <- c(path_list, list(path))
          }
        }
      }
      path_list
    }
    
    # Extract asymmetric (A) paths - single headed arrows
    a_paths <- add_paths_from_matrix(a_name, 1)
    paths <- c(paths, a_paths)
    
    # Extract symmetric (S) paths - double headed arrows (upper triangle only)
    s_paths <- add_paths_from_matrix(s_name, 2, symmetric = TRUE)
    paths <- c(paths, s_paths)
    
    # Create data mapping paths if dataset exists
    data_paths <- NULL
    if (!is.null(dataset_node)) {
      data_paths <- list()
      data_cols <- names(df)
      
      # Create a path from dataset node to each manifest variable in the data
      for (var in manifest_vars) {
        if (var %in% data_cols) {
          data_path <- list(
            fromLabel = "data",
            toLabel = var,
            numberOfArrows = 1,
            value = NA_real_,
            free = "fixed",
            label = NA,
            parameterType = "dataMapping"
            # Note: no optimization field for data mapping paths
          )
          data_paths[[length(data_paths) + 1]] <- data_path
        }
      }
    }
    if (!is.null(data_paths)) paths <- c(paths, data_paths)
    
    # Extract means from M vector - create paths from "one" (constant) to variables
    m_paths <- NULL
    m_name <- x$expectation$M
    if (!is.null(m_name) && is.character(m_name) && !is.na(m_name)) {
      m_mat <- x[[m_name]]
      if (!is.null(m_mat)) {
        # M is a matrix object with $values, $labels, $free
        m_values <- as.numeric(m_mat$values)
        m_labels <- as.character(m_mat$labels %||% rep(NA, length(m_values)))
        m_free <- as.logical(m_mat$free %||% rep(FALSE, length(m_values)))
        
        if (!is.null(m_values)) {
          # M is typically 1 x p (1 row, p columns for p manifest variables)
          m_paths <- list()
          for (j in seq_len(length(m_values))) {
            val <- m_values[j]
            if (!is.na(val) && val != 0) {
              # Map to correct manifest variable
              var_name <- manifest_vars[j] %||% paste0("V", j)
              label <- m_labels[j] %||% NA
              free <- m_free[j] %||% FALSE
              
              opt_info <- extractOptimizationFromMatrix(m_mat, 1, j)
              
              mean_path <- list(
                fromLabel = "one",
                toLabel = var_name,
                numberOfArrows = 1,
                value = val,
                free = if (free) "free" else "fixed",
                label = label,
                parameterType = "mean"
              )
              
              # Only include optimization if not NULL
              if (!is.null(opt_info)) {
                mean_path$optimization <- opt_info
              }
              
              m_paths[[length(m_paths) + 1]] <- mean_path
            }
          }
        }
      }
    }
    paths <- c(paths, m_paths)
    
    # Extract fit function type
    fit_func <- x$fitfunction
    fit_function <- "ML"
    if (!is.null(fit_func)) {
      class_name <- class(fit_func)[1]
      if (grepl("WLS", class_name)) fit_function <- "WLS"
      else if (grepl("DWLS", class_name)) fit_function <- "DWLS"
      else if (grepl("ULS", class_name)) fit_function <- "ULS"
      else if (grepl("GLS", class_name)) fit_function <- "GLS"
    }
    
    optimization <- list(
      fitFunction = fit_function
    )
    
    # Build schema
    schema <- list(
      schemaVersion = 1,
      meta = list(
        source = "OpenMx",
        modelName = model_name
      ),
      models = list()
    )
    
    schema$models[[model_name]] <- list(
      label = model_name,
      nodes = nodes,
      paths = paths,
      optimization = optimization
    )
    
    # Issue warnings about unsupported features
    warnings_list <- c()
    
    if (!is.null(x$constraints) && length(x$constraints) > 0) {
      warnings_list <- c(warnings_list, "Constraints not supported - will be dropped")
    }
    
    if (!is.null(x$algebras) && length(x$algebras) > 0) {
      warnings_list <- c(warnings_list, "Algebras not supported - will be dropped")
    }
    
    if (!is.null(x$expectation)) {
      exp_class <- class(x$expectation)[1]
      if (grepl("Threshold|Ordinal", exp_class)) {
        warnings_list <- c(warnings_list, "Ordinal/threshold models not supported - will be dropped")
      }
    }
    
    for (warning_msg in warnings_list) {
      warning(warning_msg, call. = FALSE)
    }
    
    # Create GraphModel
    gm <- as.GraphModel(
      schema,
      data = data_list
    )
    
    gm@dataConnections <- data_connections
    
    gm
  }
)

#' @export
#' @rdname as.GraphModel
setMethod(
  "as.GraphModel",
  "MxRAMModel",
  function(x) {
    # MxRAMModel is a subclass of MxModel; delegate to MxModel method
    # This explicit registration documents that we support RAM-type models
    callNextMethod(x)
  }
)