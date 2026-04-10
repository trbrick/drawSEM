#' Schema Validation Functions
#'
#' Comprehensive validation of graph schemas using a hybrid approach:
#' jsonlite for JSON structure + hand-rolled business logic.
#'
#' @keywords internal
NULL

#' Validate Schema Structure
#'
#' @param schema A list or JSON string representing a schema
#'
#' @return Invisibly returns TRUE if valid. Throws error if invalid.
#'
#' @details
#' Checks required top-level fields: `schemaVersion`, `models`.
#' Does not validate against the formal JSON schema (that's done in TypeScript).
#'
#' @keywords internal
validateSchemaStructure <- function(schema) {
  # Handle JSON string input
  if (is.character(schema)) {
    schema <- tryCatch(
      jsonlite::fromJSON(schema, simplifyVector = FALSE, simplifyDataFrame = FALSE),
      error = function(e) {
        stop("Invalid JSON string: ", conditionMessage(e), call. = FALSE)
      }
    )
  }
  
  if (!is.list(schema)) {
    stop("schema must be a list or JSON string", call. = FALSE)
  }
  
  # Check required top-level fields
  required_fields <- c("schemaVersion", "models")
  missing_fields <- setdiff(required_fields, names(schema))
  
  if (length(missing_fields) > 0) {
    stop(
      "Schema missing required fields: ",
      paste(missing_fields, collapse = ", "),
      call. = FALSE
    )
  }
  
  # Check models is non-empty list
  if (!is.list(schema$models) || length(schema$models) == 0) {
    stop("schema$models must be a non-empty list", call. = FALSE)
  }
  
  invisible(schema)
}

#' Validate Node Integrity
#'
#' Checks that:
#' - Node IDs are unique within each model
#' - Node IDs are non-empty strings
#' - Node types are valid
#'
#' @param schema A validated schema list
#'
#' @return Invisibly returns TRUE. Throws error if invalid.
#'
#' @keywords internal
validateNodeIntegrity <- function(schema) {
  for (model_id in names(schema$models)) {
    model <- schema$models[[model_id]]
    
    if (!is.list(model$nodes)) {
      stop(
        sprintf("Model '%s': nodes must be a list", model_id),
        call. = FALSE
      )
    }
    
    # Check for duplicate node labels
    node_labels <- sapply(model$nodes, function(n) n$label %||% "")
    node_labels_clean <- node_labels[nzchar(node_labels)]
    
    if (length(node_labels_clean) != length(unique(node_labels_clean))) {
      dup_labels <- node_labels_clean[duplicated(node_labels_clean)]
      stop(
        sprintf(
          "Model '%s': Duplicate node labels: %s",
          model_id,
          paste(dup_labels, collapse = ", ")
        ),
        call. = FALSE
      )
    }
    
    # Check node types
    valid_types <- c("variable", "constant", "dataset", "linkFunction", "operator")
    for (node in model$nodes) {
      if (!is.null(node$type) && !(node$type %in% valid_types)) {
        stop(
          sprintf(
            "Model '%s': invalid node type '%s'. Must be one of: %s",
            model_id,
            node$type,
            paste(valid_types, collapse = ", ")
          ),
          call. = FALSE
        )
      }
    }
  }
  
  invisible(TRUE)
}

#' Validate Path References
#'
#' Checks that:
#' - All paths reference existing nodes (by label)
#' - from and to are non-empty strings
#' - numberOfArrows is valid (0, 1, or 2)
#'
#' @param schema A validated schema list
#'
#' @return Invisibly returns TRUE. Throws error if invalid.
#'
#' @keywords internal
validatePathReferences <- function(schema) {
  for (model_id in names(schema$models)) {
    model <- schema$models[[model_id]]
    
    if (!is.list(model$paths)) {
      stop(
        sprintf("Model '%s': paths must be a list", model_id),
        call. = FALSE
      )
    }
    
    # Build set of node labels
    node_labels <- sapply(model$nodes, function(n) n$label %||% "")
    node_labels <- node_labels[nzchar(node_labels)]
    
    # Validate each path
    for (i in seq_along(model$paths)) {
      path <- model$paths[[i]]
      
      # Handle jsonlite list-wrapping of string values
      from <- path$from
      if (is.list(from)) from <- unlist(from)
      to <- path$to
      if (is.list(to)) to <- unlist(to)
      
      if (is.null(from) || !nzchar(as.character(from))) {
        stop(
          sprintf("Model '%s': path %d missing or empty 'from'", model_id, i),
          call. = FALSE
        )
      }
      
      if (is.null(to) || !nzchar(as.character(to))) {
        stop(
          sprintf("Model '%s': path %d missing or empty 'to'", model_id, i),
          call. = FALSE
        )
      }
      
      # Check nodes exist
      if (!(from %in% node_labels)) {
        stop(
          sprintf(
            "Model '%s': path %d references non-existent node '%s'",
            model_id, i, from
          ),
          call. = FALSE
        )
      }
      
      if (!(to %in% node_labels)) {
        stop(
          sprintf(
            "Model '%s': path %d references non-existent node '%s'",
            model_id, i, to
          ),
          call. = FALSE
        )
      }
      
      # type: "data" paths do not have numberOfArrows
      is_data_path <- isTRUE(path$type == "data")
      
      # Check numberOfArrows (unlist in case jsonlite wrapped it)
      num_arrows <- path$numberOfArrows
      if (is.list(num_arrows)) num_arrows <- unlist(num_arrows)
      
      if (is_data_path) {
        if (!is.null(num_arrows)) {
          stop(
            sprintf("Model '%s': path %d: numberOfArrows must be absent on type='data' paths", model_id, i),
            call. = FALSE
          )
        }
      } else {
        if (is.null(num_arrows) || !is.numeric(num_arrows)) {
          stop(
            sprintf("Model '%s': path %d missing or invalid 'numberOfArrows'", model_id, i),
            call. = FALSE
          )
        }

        # 0-headed paths (OpenMx selection operator) are structurally valid R-side
        # but flagged unsupported by collectUnsupportedFeatures
        if (!(num_arrows %in% c(0, 1, 2))) {
          stop(
            sprintf(
              "Model '%s': path %d: numberOfArrows must be 0, 1, or 2 (got %d)",
              model_id, i, num_arrows
            ),
            call. = FALSE
          )
        }
      }
    }
  }
  
  invisible(TRUE)
}

#' Validate Optimization Parameters
#'
#' Checks that:
#' - Fixed parameters have values (not null)
#' - Free parameters have valid values or are null (will default to 0.1)
#' - freeParameter is TRUE, a non-empty string, or absent (absent means fixed; FALSE is rejected)
#'
#' @param schema A validated schema list
#'
#' @return Invisibly returns TRUE. Throws error if invalid.
#'
#' @keywords internal
validateOptimizationParams <- function(schema) {
  for (model_id in names(schema$models)) {
    model <- schema$models[[model_id]]
    
    for (i in seq_along(model$paths)) {
      path <- model$paths[[i]]
      
      # Skip data paths (no parameter semantics)
      if (isTRUE(path$type == "data") ||
          (!is.null(path$parameterType) && isTRUE(path$parameterType == "dataMapping"))) {
        next
      }
      
      # Check freeParameter
      if (!is.null(path$freeParameter)) {
        if (isFALSE(path$freeParameter)) {
          stop(
            sprintf(
              "Model '%s': path %d: freeParameter: false is not valid; omit freeParameter to indicate a fixed parameter",
              model_id, i
            ),
            call. = FALSE
          )
        }
        if (!isTRUE(path$freeParameter) && !(is.character(path$freeParameter) && nzchar(path$freeParameter))) {
          stop(
            sprintf(
              "Model '%s': path %d: freeParameter must be TRUE or a non-empty string (got '%s')",
              model_id, i, path$freeParameter
            ),
            call. = FALSE
          )
        }
      }
      
      # Fixed parameters must have values
      is_path_fixed <- is.null(path$freeParameter) || isFALSE(path$freeParameter)
      if (is_path_fixed && is.null(path$value)) {
        stop(
          sprintf(
            "Model '%s': path %d: fixed parameters must have a value (got NULL)",
            model_id, i
          ),
          call. = FALSE
        )
      }
    }
  }
  
  invisible(TRUE)
}

#' Comprehensive Schema Validation
#'
#' @param schema A list or JSON string representing a schema
#' @param verbose Logical. If TRUE, message on success (default: TRUE)
#'
#' @return Invisibly returns the schema list if valid. Throws error if invalid.
#'
#' @details
#' Performs the following checks:
#' 1. Structure validation (required fields)
#' 2. Node integrity (unique IDs, valid types)
#' 3. Path references (nodes exist, valid arrows)
#' 4. Optimization parameters (fixed have values, etc.)
#'
#' @keywords internal
#' @export
validateSchema <- function(schema, verbose = TRUE) {
  # Parse and validate structure
  schema <- validateSchemaStructure(schema)
  
  # Validate node integrity
  validateNodeIntegrity(schema)
  
  # Validate path references
  validatePathReferences(schema)
  
  # Validate optimization parameters
  validateOptimizationParams(schema)
  
  if (verbose) {
    n_models <- length(schema$models)
    message(sprintf("%d model%s loaded.", n_models, if (n_models == 1) "" else "s"))
  }
  
  invisible(schema)
}
