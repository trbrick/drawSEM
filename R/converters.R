#' Schema-to-OpenMx Converter
#'
#' Converts a GraphModel schema to an OpenMx mxModel object.
#'
#' @keywords internal
NULL

#' Convert Schema to OpenMx Model
#'
#' @param schema A validated schema list
#' @param data A named list of data.frames (names are dataset node IDs)
#' @param model_id The model ID to convert (if schema has multiple models)
#' @param optimize Logical. If TRUE, apply optimization hints from schema
#'
#' @return An mxModel object ready for mxRun()
#'
#' @details
#' Implements Phases 1-6 of the schema-to-backend conversion strategy:
#' 1. Validate inputs and extract optimization settings
#' 2. Identify data sources and build mxData
#' 3. Identify constant nodes and collect mean paths
#' 4. Identify manifest and latent variables
#' 5. Build mxPath declarations
#' 6. Construct mxModel with correct expectations/fit functions
#'
#' @keywords internal
schemaToOpenMx <- function(schema, data, model_id = NULL, optimize = TRUE) {
  # Determine which model to convert
  if (is.null(model_id)) {
    # Default to first model if not specified
    model_id <- names(schema$models)[1]
  }
  
  if (!(model_id %in% names(schema$models))) {
    stop(
      sprintf("Model '%s' not found in schema", model_id),
      call. = FALSE
    )
  }
  
  model <- schema$models[[model_id]]
  model_label <- model$label %||% model_id
  
  # Extract optimization settings
  opt <- model$optimization %||% list()
  fit_function <- opt$fitFunction %||% "ML"
  missingness_strategy <- opt$missingness %||% "FIML"
  
  # Phase 1: Build mxData ===============================================
  mxdata <- buildMxData(model, data)
  
  # Phase 2: Identify manifest and latent variables =====================
  manifest_vars <- inferManifestVariables(model$nodes, model$paths)
  latent_vars <- inferLatentVariables(model$nodes, manifest_vars)
  
  # Also exclude constant and dataset nodes
  all_var_labels <- sapply(model$nodes, function(n) n$label)
  const_labels <- sapply(model$nodes, function(n) {
    if (n$type == "constant") n$label else NULL
  })
  dataset_labels <- sapply(model$nodes, function(n) {
    if (n$type == "dataset") n$label else NULL
  })
  
  # Convert labels to variable node labels for manifestVars/latentVars
  manifest_var_labels <- sapply(
    model$nodes,
    function(n) if (n$type == "variable" && n$label %in% manifest_vars) n$label else NULL
  )
  manifest_var_labels <- manifest_var_labels[!sapply(manifest_var_labels, is.null)]
  
  latent_var_labels <- sapply(
    model$nodes,
    function(n) if (n$type == "variable" && n$label %in% latent_vars) n$label else NULL
  )
  latent_var_labels <- latent_var_labels[!sapply(latent_var_labels, is.null)]
  
  # Phase 3: Build mxPath list ==========================================
  constant_label <- getConstantNodeLabel(model$nodes)
  paths_to_create <- buildPathList(model$paths, constant_label)
  
  # Convert path specifications to actual mxPath() calls
  mxpaths <- lapply(paths_to_create, function(pspec) {
    # Filter out unsupported fields (bounds, etc.)
    OpenMx::mxPath(
      from = pspec$from,
      to = pspec$to,
      arrows = pspec$arrows,
      labels = pspec$labels,
      values = pspec$values,
      free = pspec$free
    )
  })
  
  # Phase 4: Build mxModel ==============================================
  model_args <- list(
    name = model_label,
    type = "RAM",
    manifestVars = as.character(manifest_var_labels),
    latentVars = as.character(latent_var_labels),
    mxdata
  )
  
  # Add all mxPath objects
  model_args <- c(model_args, mxpaths)
  
  # Create the model
  om_model <- do.call(OpenMx::mxModel, model_args)
  
  # Phase 5: Handle fit function ========================================
  # mxModel with type="RAM" defaults to mxExpectationRAM() and mxFitFunctionML()
  # If user specified a different fit function, we need to modify
  if (fit_function != "ML") {
    if (fit_function %in% c("WLS", "DWLS", "ULS", "GLS")) {
      # Replace fit function
      om_model <- OpenMx::mxModel(
        om_model,
        OpenMx::mxFitFunctionWLS(type = fit_function)
      )
    } else {
      warning(
        sprintf(
          "Fit function '%s' not supported in v0.1. Using ML instead.",
          fit_function
        ),
        call. = FALSE
      )
    }
  }
  
  # Phase 6: Call mxAutoStart if needed =================================
  # Skip mxAutoStart for now - it causes issues with empty data in some models
  # Users can call mxAutoStart manually if needed
  # om_model <- OpenMx::mxAutoStart(om_model)
  
  om_model
}

#' Build mxData Object
#'
#' Constructs an mxData object from schema dataset node(s) and data.
#'
#' @param model The model list from schema
#' @param data A named list of data.frames
#'
#' @return An mxData object (for single dataset) or list of mxData objects
#'
#' @keywords internal
buildMxData <- function(model, data) {
  # Find dataset nodes
  dataset_nodes <- Filter(function(n) n$type == "dataset", model$nodes)
  
  if (length(dataset_nodes) == 0) {
    # Models without datasets (raw covariance structures) don't need mxData
    return(NULL)
  }
  
  if (length(dataset_nodes) > 1) {
    stop(
      "v0.1 does not support multiple datasets per model",
      call. = FALSE
    )
  }
  
  dataset_node <- dataset_nodes[[1]]
  # Use label as the data identifier
  dataset_label <- dataset_node$label
  
  # Get the actual data based on datasetSource type
  df <- NULL
  
  if (!is.null(dataset_node$datasetSource)) {
    ds <- dataset_node$datasetSource
    
    if (ds$type == "embedded" && !is.null(ds$object)) {
      # Load embedded data from schema
      df <- jsonToDataFrame(ds$object, ds$columnTypes)
    } else if (ds$type == "file" && !is.null(ds$location)) {
      # Check if data exists in GraphModel@data (already loaded)
      if (dataset_label %in% names(data) && is.data.frame(data[[dataset_label]])) {
        df <- data[[dataset_label]]
      } else if (dataset_label %in% names(data) && is.character(data[[dataset_label]])) {
        # Data path was stored, load it now
        filepath <- data[[dataset_label]]
        df <- tryCatch(
          read.csv(filepath, stringsAsFactors = FALSE),
          error = function(e) {
            stop(
              sprintf("Failed to load data file '%s': %s", filepath, conditionMessage(e)),
              call. = FALSE
            )
          }
        )
      } else {
        stop(
          sprintf("Data not found for file-based dataset '%s'", dataset_label),
          call. = FALSE
        )
      }
    }
  } else {
    # Fallback: check if data is in the data list
    if (dataset_label %in% names(data)) {
      df <- data[[dataset_label]]
    }
  }
  
  # If still no data, try to get it from the data list
  if (is.null(df)) {
    if (!(dataset_label %in% names(data))) {
      stop(
        sprintf(
          "Dataset '%s' not found in provided data",
          dataset_label
        ),
        call. = FALSE
      )
    }
    df <- data[[dataset_label]]
  }
  
  # Handle file paths (legacy support)
  if (is.character(df)) {
    tryCatch(
      df <- read.csv(df, stringsAsFactors = FALSE),
      error = function(e) {
        stop(
          sprintf("Failed to load data file '%s': %s", df, conditionMessage(e)),
          call. = FALSE
        )
      }
    )
  }
  
  if (!is.data.frame(df)) {
    stop(
      sprintf("Data for dataset '%s' must be a data.frame", dataset_label),
      call. = FALSE
    )
  }
  
  # Build column mapping from data paths for this dataset node.
  # Path label is the source column name; path$to is the variable label.
  mapping <- list()
  data_paths <- Filter(function(path) {
    identical(path$from, dataset_label) &&
      (isTRUE(path$type == "data") || identical(dataset_node$type, "dataset")) &&
      !is.null(path$to)
  }, model$paths %||% list())

  if (length(data_paths) > 0) {
    mapping <- setNames(
      lapply(data_paths, function(path) path$to),
      vapply(data_paths, function(path) {
        if (!is.null(path$label) && nzchar(as.character(path$label))) {
          as.character(path$label)
        } else {
          as.character(path$to)
        }
      }, character(1))
    )
  }
  
  # If no explicit data paths, use matching columns as-is (legacy fallback)
  if (length(mapping) == 0) {
    # Assume column names match variable names
    # Filter to only columns that exist in data
    var_labels <- sapply(model$nodes, function(n) {
      if (n$type == "variable") n$label else NULL
    })
    var_labels <- var_labels[!sapply(var_labels, is.null)]
    
    vars_in_data <- intersect(colnames(df), as.character(var_labels))
    
    if (length(vars_in_data) == 0) {
      # No variable nodes with matching column names - use all columns
      vars_in_data <- colnames(df)
    }
    
    df <- df[, vars_in_data, drop = FALSE]
  } else {
    # Handle data-path mappings: names = CSV columns, values = variable names
    # Select only the mapped columns and rename them
    csv_cols <- names(mapping)
    var_names <- unlist(mapping)
    
    # Filter out any NA values in the mapping
    valid_mask <- !is.na(var_names)
    csv_cols <- csv_cols[valid_mask]
    var_names <- var_names[valid_mask]
    
    # Check that all CSV columns exist in the data
    missing_cols <- setdiff(csv_cols, colnames(df))
    if (length(missing_cols) > 0) {
      stop(
        sprintf(
          "Data columns not found: %s",
          paste(missing_cols, collapse = ", ")
        ),
        call. = FALSE
      )
    }
    
    # Select and rename columns
    df <- df[, csv_cols, drop = FALSE]
    colnames(df) <- var_names
  }
  
  # Create mxData
  OpenMx::mxData(df, type = "raw")
}
