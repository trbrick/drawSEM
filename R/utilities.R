#' Rename Data.Frame Columns to Match Variable Names
#'
#' Maps CSV column names to variable node IDs in the schema.
#'
#' @param df A data.frame to rename
#' @param mapping A named list: names are variable IDs, values are CSV column names
#'
#' @return The data.frame with only mapped columns, renamed to match variable IDs
#'
#' @keywords internal
renameDataColumns <- function(df, mapping) {
  if (length(mapping) == 0) {
    return(df[, 0, drop = FALSE])  # Return empty data.frame with 0 columns
  }
  
  # Select only mapped columns and rename them
  mapped_cols <- unlist(mapping)
  
  # Check that all mapped columns exist
  missing_cols <- setdiff(mapped_cols, names(df))
  if (length(missing_cols) > 0) {
    stop(
      sprintf(
        "Data columns not found: %s",
        paste(missing_cols, collapse = ", ")
      ),
      call. = FALSE
    )
  }
  
  # Select columns and create new data.frame with renamed columns
  result <- df[, mapped_cols, drop = FALSE]
  names(result) <- names(mapping)
  
  result
}

#' Infer Manifest Variables from Nodes and Paths
#'
#' A variable is manifest if it has incoming paths from dataset nodes.
#'
#' @param nodes List of node specifications
#' @param paths List of path specifications
#'
#' @return Character vector of manifest variable labels
#'
#' @keywords internal
inferManifestVariables <- function(nodes, paths) {
  # Find dataset node labels
  dataset_labels <- sapply(
    nodes,
    function(n) if (n$type == "dataset") n$label else NULL
  )
  dataset_labels <- dataset_labels[!sapply(dataset_labels, is.null)]
  dataset_labels <- as.character(dataset_labels)
  
  # Find variables with incoming paths FROM dataset nodes
  manifest <- sapply(
    paths,
    function(p) {
      if (p$fromLabel %in% dataset_labels && 
          (is.null(p$parameterType) || p$parameterType == "dataMapping")) {
        return(p$toLabel)
      }
      NULL
    }
  )
  
  manifest <- manifest[!sapply(manifest, is.null)]
  unique(as.character(manifest))
}

#' Infer Latent Variables from Nodes and Manifest Variables
#'
#' A variable is latent if it's not manifest.
#'
#' @param nodes List of node specifications
#' @param manifest_vars Character vector of manifest variable labels
#'
#' @return Character vector of latent variable labels
#'
#' @keywords internal
inferLatentVariables <- function(nodes, manifest_vars) {
  # All variable nodes that are NOT manifest
  latent <- sapply(
    nodes,
    function(n) {
      if (n$type == "variable" && !(n$label %in% manifest_vars)) {
        return(n$label)
      }
      NULL
    }
  )
  
  latent <- latent[!sapply(latent, is.null)]
  unique(as.character(latent))
}

#' Collect Unsupported Features from Schema
#'
#' Identifies features not yet implemented in v0.1.
#'
#' @param schema The schema list
#'
#' @return A list with boolean flags for each unsupported feature type
#'
#' @keywords internal
collectUnsupportedFeatures <- function(schema) {
  unsupported <- list(
    zeroHeadedPaths = FALSE,
    linkFunctions = FALSE,
    operators = FALSE,
    priors = FALSE
  )
  
  # Iterate through all models
  for (model in schema$models) {
    # Check for 0-headed paths
    for (path in model$paths) {
      if (path$numberOfArrows == 0) {
        unsupported$zeroHeadedPaths <- TRUE
        break
      }
    }
    
    # Check for link function and operator nodes
    for (node in model$nodes) {
      if (node$type == "linkFunction") {
        unsupported$linkFunctions <- TRUE
      }
      if (node$type == "operator") {
        unsupported$operators <- TRUE
      }
    }
    
    # Check for priors
    for (path in model$paths) {
      if (!is.null(path$optimization) && !is.null(path$optimization$prior)) {
        unsupported$priors <- TRUE
        break
      }
    }
  }
  
  unsupported
}

#' Store Optimization Metadata
#'
#' Extracts bounds and priors from paths for later application.
#'
#' @param paths List of path specifications
#'
#' @return A list of parameter metadata
#'
#' @keywords internal
storeOptimizationMetadata <- function(paths) {
  metadata <- list(
    bounds = list(),
    priors = list()
  )
  
  for (i in seq_along(paths)) {
    path <- paths[[i]]
    
    # Skip data mapping paths
    if (!is.null(path$parameterType) && path$parameterType == "dataMapping") {
      next
    }
    
    # Store bounds if present
    if (!is.null(path$optimization) && !is.null(path$optimization$bounds)) {
      metadata$bounds[[i]] <- path$optimization$bounds
    }
    
    # Store prior if present
    if (!is.null(path$optimization) && !is.null(path$optimization$prior)) {
      metadata$priors[[i]] <- path$optimization$prior
    }
  }
  
  metadata
}

#' Build Path List for mxModel
#'
#' Converts schema paths to a list of mxPath specifications.
#'
#' @param paths List of path specifications
#' @param constantNodeLabel Label of the constant node (if any)
#'
#' @return A list of path specifications, ready for mxPath()
#'
#' @keywords internal
buildPathList <- function(paths, constantNodeLabel = NULL) {
  paths_list <- list()
  
  for (path in paths) {
    # Skip data mapping paths
    if (!is.null(path$parameterType) && path$parameterType == "dataMapping") {
      next
    }
    
    # Skip unsupported 0-headed paths
    if (path$numberOfArrows == 0) {
      next
    }
    
    # Get from/to labels
    from_label <- path$fromLabel
    to_label <- path$toLabel
    
    # Convert constant node label to "one" for mxPath
    if (!is.null(constantNodeLabel) && from_label == constantNodeLabel) {
      from_label <- "one"
    }
    
    # Extract parameter name (label)
    param_name <- if (!is.null(path$label) && nzchar(path$label)) path$label else NA
    
    # Extract starting value
    start_value <- if (!is.null(path$value)) path$value else NA
    
    # Determine free/fixed
    is_free <- if (!is.null(path$free)) path$free == "free" else TRUE
    
    # If free parameter with no/null value, use default 0.1
    if (is_free && (is.na(start_value) || is.null(start_value))) {
      start_value <- 0.1
    }
    
    # Build path specification
    path_spec <- list(
      from = from_label,
      to = to_label,
      arrows = path$numberOfArrows,
      labels = param_name,
      values = start_value,
      free = is_free
    )
    
    # Add bounds if present
    if (!is.null(path$optimization) && !is.null(path$optimization$bounds)) {
      path_spec$bounds <- path$optimization$bounds
    }
    
    paths_list[[length(paths_list) + 1]] <- path_spec
  }
  
  paths_list
}

#' Get Constant Node Label
#'
#' Finds the constant node in a list of nodes and returns its label.
#'
#' @param nodes List of node specifications
#'
#' @return The label of the constant node (or NULL if none found)
#'
#' @keywords internal
getConstantNodeLabel <- function(nodes) {
  for (node in nodes) {
    if (node$type == "constant") {
      return(node$label)
    }
  }
  
  NULL
}

