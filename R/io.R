#' @include GraphModel-class.R GraphModel-methods.R validators.R utilities.R converters.R
NULL

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
if (!isGeneric("as.GraphModel")) {
  setGeneric("as.GraphModel", function(x, ...) standardGeneric("as.GraphModel"))
}

setMethod(
  "as.GraphModel",
  "ANY",
  function(x, metadata = NULL, data = NULL, ...) {
    # Parse input into schema list
    if (is.character(x)) {
      if (file.exists(x)) {
        # It's a file path
        schema <- loadSchema(x)
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
    } else {
      stop(
        "x must be a schema list, JSON string, or file path",
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

if (!isGeneric("as.MxModel")) {
  setGeneric("as.MxModel", function(x, ...) standardGeneric("as.MxModel"))
}

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
# Check if mxRun generic exists, if not create it
if (!isGeneric("mxRun")) {
  setGeneric("mxRun", function(model, ...) standardGeneric("mxRun"))
}

setMethod(
  "mxRun",
  "GraphModel",
  function(model, ...) {
    # Build model if needed
    om_model <- as.MxModel(model)
    
    # Run with OpenMx
    fit <- OpenMx::mxRun(om_model, ...)
    
    # Store fitted model back
    builtModel(model) <- fit
    
    # Return the fit object
    fit
  }
)

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
    meta = graph_obj@schema$meta,
    models = graph_obj@schema$models,
    metadata = graph_obj@metadata
  )
  
  # Write to file
  tryCatch(
    jsonlite::write_json(output, filepath, pretty = pretty),
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
  
  schema <- loadSchema(filepath)
  
  # Extract metadata if present
  metadata <- schema$meta %||% list()
  
  # Initialize data list (to be populated below)
  bound_data <- list()
  connections <- list()
  
  # If user provided data, validate and use it
  if (!is.null(data) && is.list(data) && length(data) > 0) {
    bound_data <- data
    # Mark user-provided data as "user_bound"
    for (dataset_name in names(data)) {
      connections[[dataset_name]] <- list(
        status = "user_bound",
        filepath = NA_character_
      )
    }
  }
  
  # Extract all dataset nodes from all models in schema
  all_datasets <- list()
  if (!is.null(schema$models)) {
    for (model_id in names(schema$models)) {
      model <- schema$models[[model_id]]
      dataset_nodes <- Filter(function(n) n$type == "dataset", model$nodes %||% list())
      for (node in dataset_nodes) {
        dataset_label <- node$label
        if (!(dataset_label %in% names(all_datasets))) {
          all_datasets[[dataset_label]] <- list(
            node = node,
            datasetFile = node$datasetFile %||% list()
          )
        }
      }
    }
  }
  
  # Try to eagerly load files from schema for datasets not already bound
  for (dataset_label in names(all_datasets)) {
    # Skip if already bound by user
    if (dataset_label %in% names(bound_data)) {
      next
    }
    
    dataset_info <- all_datasets[[dataset_label]]
    datasetFile <- dataset_info$datasetFile
    
    # If schema specifies a file, try to find and load it
    if (!is.null(datasetFile$fileName)) {
      file_path <- file.path(datapath, datasetFile$fileName)
      
      if (file.exists(file_path)) {
        # File exists, try to load and validate
        tryCatch(
          {
            df <- read.csv(file_path, stringsAsFactors = FALSE)
            
            # Validate columns match schema
            schema_cols <- datasetFile$columns %||% c()
            file_cols <- colnames(df)
            
            if (length(schema_cols) > 0) {
              missing_cols <- setdiff(schema_cols, file_cols)
              if (length(missing_cols) > 0) {
                # Column mismatch - mark as unconnected for lazy load
                warning(
                  sprintf(
                    "Dataset '%s': File '%s' missing columns: %s. Will attempt lazy load at model-build time.",
                    dataset_label, datasetFile$fileName, paste(missing_cols, collapse = ", ")
                  ),
                  call. = FALSE
                )
                connections[[dataset_label]] <- list(
                  status = "lazy",
                  filepath = file_path,
                  columns = file_cols
                )
              } else {
                # Columns match - eager load successful
                bound_data[[dataset_label]] <- df
                connections[[dataset_label]] <- list(
                  status = "eager",
                  filepath = file_path,
                  columns = file_cols
                )
              }
            } else {
              # No schema columns specified, just load it
              bound_data[[dataset_label]] <- df
              connections[[dataset_label]] <- list(
                status = "eager",
                filepath = file_path,
                columns = file_cols
              )
            }
          },
          error = function(e) {
            # File exists but couldn't be read - mark for lazy load
            warning(
              sprintf(
                "Dataset '%s': Failed to read file '%s': %s. Will attempt lazy load at model-build time.",
                dataset_label, file_path, conditionMessage(e)
              ),
              call. = FALSE
            )
            connections[[dataset_label]] <<- list(
              status = "lazy",
              filepath = file_path
            )
          }
        )
      } else {
        # File not found - mark as unconnected, will attempt lazy load later
        connections[[dataset_label]] <- list(
          status = "lazy",
          filepath = file_path
        )
      }
    } else {
      # No file specified in schema
      connections[[dataset_label]] <- list(
        status = "unconnected",
        filepath = NA_character_
      )
    }
  }
  
  # Create GraphModel
  gm <- as.GraphModel(
    schema,
    metadata = metadata,
    data = bound_data
  )
  
  # Store connection state
  gm@dataConnections <- connections
  
  gm
}
#' Convert MxRAMModel to GraphModel
#'
#' Convert an OpenMx RAM model to a GraphModel for visualization and manipulation.
#'
#' @param x An MxRAMModel object (from OpenMx)
#'
#' @return A GraphModel object with schema extracted from the model structure
#'
#' @details
#' Extracts the model structure, parameters, and data from an MxRAMModel:
#' - Manifest and latent variables become nodes
#' - Asymmetric (A) and symmetric (S) matrix paths become graph edges
#' - Current parameter values and free/fixed status are preserved
#' - Data from the model is linked by reference
#' - Fit function type is extracted (ML, WLS, etc.)
#' - Unsupported features (constraints, algebras, thresholds) are warned about
#'
#' @examples
#' \dontrun{
#' library(OpenMx)
#' # Fit an MxModel
#' fit <- mxRun(myModel)
#' # Convert to GraphModel for visualization
#' gm <- as.GraphModel(fit)
#' graphTool(gm)
#' }
#'
#' @export
#' @rdname as.GraphModel
setMethod(
  "as.GraphModel",
  "MxRAMModel",
  function(x) {
    # Get model name
    model_name <- x$name %||% "model1"
    
    # Get manifest and latent variables
    manifest_vars <- x$manifestVars %||% c()
    latent_vars <- x$latentVars %||% c()
    
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
    
    # Add constant node (for means)
    nodes[[length(nodes) + 1]] <- list(
      label = "1",
      type = "constant"
    )
    
    # Extract paths from A and S matrices
    paths <- list()
    
    # Helper to add path from matrix
    add_paths_from_matrix <- function(matrix_name, num_arrows) {
      mat <- x[[matrix_name]]
      if (is.null(mat)) return(NULL)
      
      row_names <- rownames(mat$values) %||% seq_len(nrow(mat$values))
      col_names <- colnames(mat$values) %||% seq_len(ncol(mat$values))
      
      path_list <- list()
      for (i in seq_len(nrow(mat$values))) {
        for (j in seq_len(ncol(mat$values))) {
          val <- mat$values[i, j]
          if (!is.na(val) && val != 0) {
            label <- mat$labels[i, j] %||% NA
            free <- mat$free[i, j] %||% FALSE
            
            path_list[[length(path_list) + 1]] <- list(
              fromLabel = col_names[j],
              toLabel = row_names[i],
              numberOfArrows = num_arrows,
              value = val,
              free = if (free) "free" else "fixed",
              label = label,
              parameterType = NA_character_
            )
          }
        }
      }
      path_list
    }
    
    # Extract asymmetric (A) paths - single headed arrows
    a_paths <- add_paths_from_matrix("A", 1)
    if (!is.null(a_paths)) paths <- c(paths, a_paths)
    
    # Extract symmetric (S) paths - double headed arrows
    s_paths <- add_paths_from_matrix("S", 2)
    if (!is.null(s_paths)) paths <- c(paths, s_paths)
    
    # Update with fitted values if available (from fitted model)
    if (!is.null(x$output) && !is.null(x$output$estimate)) {
      # Update path values with fitted estimates
      for (i in seq_along(paths)) {
        param_label <- paths[[i]]$label
        if (!is.na(param_label) && param_label %in% names(x$output$estimate)) {
          paths[[i]]$value <- x$output$estimate[param_label]
        }
      }
    }
    
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
    
    # Build optimization configuration
    optimization <- list(
      fitFunction = fit_function,
      parameterTypes = list()
    )
    
    # Handle data
    data_list <- list()
    data_connections <- list()
    if (!is.null(x$data)) {
      data_obj <- x$data
      # Infer data name from model or use "data"
      data_name <- "data"
      if (!is.null(data_obj$observed)) {
        data_list[[data_name]] <- data_obj$observed
        data_connections[[data_name]] <- list(
          status = "user_bound",
          filepath = NA_character_
        )
      }
    }
    
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