#' Load a Graph Schema from JSON File with Optional Data Loading
#'
#' @param filepath Character. Path to JSON file containing schema.
#' @param ... Additional arguments passed to read.csv() when loading file-based data.
#' @param loadData Logical or NA. If TRUE, force load all data files. If FALSE, mark as lazy.
#'   If NA (default), auto-load files < 10MB, lazy-load larger files.
#' @param dataPath Character. Path to prepend to relative data paths in schema.
#'   Defaults to "." (current working directory).
#'
#' @return An S4 GraphModel object with schema and data loaded (if applicable).
#'
#' @details
#' The schema defines the structure of a structural equation model with optional
#' data source references.
#'
#' For file-based data sources, paths are resolved relative to either:
#'   - The schema file directory (if path is relative)
#'   - An absolute path (if path starts with / or drive letter)
#'   - The dataPath argument (overrides schema directory)
#'
#' Embedded data is always loaded into R objects.
#'
#' The loadData parameter controls file loading strategy:
#'   - TRUE: Always load files immediately
#'   - FALSE: Never load, mark for lazy loading
#'   - NA (default): Load if file < 10MB, else lazy-load
#'
#' @examples
#' \dontrun{
#' # Load with default smart loading
#' g <- loadSchema("model.json")
#'
#' # Force load all data
#' g <- loadSchema("model.json", loadData = TRUE)
#'
#' # Load with custom CSV options
#' g <- loadSchema("model.json", stringsAsFactors = FALSE, na.strings = ".")
#' }
#'
#' @export
loadSchema <- function(filepath, ..., loadData = NA, dataPath = ".") {
  if (!file.exists(filepath)) {
    stop("File not found: ", filepath, call. = FALSE)
  }
  
  # Load JSON schema
  schema <- tryCatch(
    jsonlite::read_json(filepath, simplifyVector = FALSE, simplifyDataFrame = FALSE),
    error = function(e) {
      stop("Failed to parse JSON: ", conditionMessage(e), call. = FALSE)
    }
  )
  
  # Normalize schema to handle jsonlite's list-wrapping of scalar values
  schema <- normalizeSchemaFromJSON(schema)
  schema <- normalizeSchemaVersion(schema)
  
  # Get schema directory for relative path resolution
  schemaDir <- dirname(normalizePath(filepath))
  
  # Initialize data list
  data_list <- list()
  
  # Process data sources from all models
  if (!is.null(schema$models)) {
    for (model_id in names(schema$models)) {
      model <- schema$models[[model_id]]
      
      if (!is.null(model$nodes) && length(model$nodes) > 0) {
        # Iterate through nodes with explicit indexing
        for (i in seq_along(model$nodes)) {
          node <- model$nodes[[i]]
          
          # Check if this is a dataset node with datasetSource
          if (!is.null(node$type) && node$type == "dataset" && !is.null(node$datasetSource)) {
            ds <- node$datasetSource
            # Use node label as data identifier (id field may not always be present)
            # Unlist single-value strings from jsonlite parsing
            node_label <- node$label
            if (is.list(node_label)) node_label <- unlist(node_label)
            node_id <- if (!is.null(node_label)) node_label else paste0("dataset_", i)
            
            if (ds$type == "embedded" && !is.null(ds$object)) {
              # Load embedded data
              df <- jsonToDataFrame(ds$object, ds$columnTypes)
              data_list[[node_id]] <- df
            } else if (ds$type == "file" && !is.null(ds$location)) {
              # Resolve file path and decide whether to load
              resolved_path <- resolveDataPath(ds$location, schemaDir, dataPath)
              
              if (!is.null(resolved_path) && file.exists(resolved_path)) {
                # Determine whether to load based on loadData and file size
                file_size <- file.size(resolved_path)
                should_load <- FALSE
                
                if (isTRUE(loadData)) {
                  should_load <- TRUE
                } else if (isFALSE(loadData)) {
                  should_load <- FALSE
                } else if (is.na(loadData)) {
                  # Smart loading: 10MB threshold
                  should_load <- file_size < 10 * 1024 * 1024  # 10MB in bytes
                }
                
                if (should_load) {
                  # Load data using read.csv with user-provided arguments
                  df <- tryCatch(
                    do.call(read.csv, c(list(resolved_path), list(...))),
                    error = function(e) {
                      warning("Failed to load data from ", resolved_path, ": ", conditionMessage(e))
                      NULL
                    }
                  )
                  if (!is.null(df)) {
                    data_list[[node_id]] <- df
                  }
                } else {
                  # Store path for lazy loading
                  data_list[[node_id]] <- resolved_path
                }
              }
            }
          }
        }
      }
    }
  }
  
  # Create GraphModel with loaded data
  as.GraphModel(schema, data = data_list)
}

#' Save a Graph Schema to JSON File with Optional Data Export
#'
#' @param g An S4 GraphModel object.
#' @param filepath Character. Path where JSON should be written.
#' @param ..., Additional arguments (reserved for future use).
#' @param dataPath Character. Directory where data files should be saved.
#'   Defaults to "." (current working directory).
#' @param dataFile Character or NULL. Filename for exported data. If NULL and data exists,
#'   inferred from schema filename (e.g., "schema.json" → "schema.csv").
#' @param writeData Logical or NA. If TRUE, always write data files. If FALSE, never write.
#'   If NA (default), write if file doesn't exist, warn if exists.
#' @param strictData Logical or NA. If TRUE (error mode), fail if data missing when writeData specified.
#'   If FALSE (warning mode), warn but continue. If NA (default), same as FALSE with warning.
#' @param pretty Logical. If TRUE (default), format JSON with indentation.
#'
#' @return Invisibly returns the filepath (for chaining).
#'
#' @details
#' Data export strategy depends on the writeData parameter:
#'   - TRUE: Always overwrite existing files
#'   - FALSE: Never export data (only schema)
#'   - NA (default): Write if file doesn't exist, warn if it does
#'
#' Relative paths in the schema are stored relative to the schema directory.
#' Absolute paths are stored as-is but may break if the schema is moved.
#'
#' When writeData is requested but data is missing from the GraphModel:
#'   - strictData=TRUE: Error (fail fast)
#'   - strictData=FALSE or NA: Warning (continue with schema-only save)
#'
#' @examples
#' \dontrun{
#' # Create and save with auto data export (first save only)
#' g <- as.GraphModel(schema, data = list(mydata = df))
#' saveSchema(g, "model.json")  # Exports data if file doesn't exist
#'
#' # Save again with forced update
#' saveSchema(g, "model.json", writeData = TRUE)
#'
#' # Save schema only, no data export
#' saveSchema(g, "model.json", writeData = FALSE)
#' }
#'
#' @export
saveSchema <- function(g, filepath, ..., dataPath = ".", dataFile = NULL,
                       writeData = NA, strictData = NA, pretty = TRUE) {
  if (is(g, "GraphModel")) {
    schema <- g$schema
    data_list <- g$data
  } else if (is.list(g)) {
    schema <- g
    data_list <- list()
  } else {
    stop("g must be a GraphModel object or schema list", call. = FALSE)
  }

  schema <- normalizeSchemaVersion(schema)

  # Get schema and data using $ operator
  
  # Get directory info
  schema_basename <- tools::file_path_sans_ext(basename(filepath))
  
  # Infer dataFile if not provided and data export is requested
  if (is.na(writeData) || isTRUE(writeData)) {
    if (is.null(dataFile)) {
      dataFile <- paste0(schema_basename, ".csv")
    }
  }
  
  # Process data sources and export if needed
  if (!is.null(schema$models)) {
    for (model_id in names(schema$models)) {
      model <- schema$models[[model_id]]
      
      if (!is.null(model$nodes) && length(model$nodes) > 0) {
        for (i in seq_along(model$nodes)) {
          node <- model$nodes[[i]]
          
          if (!is.null(node$type) && node$type == "dataset" && !is.null(node$datasetSource)) {
            ds <- node$datasetSource
            # Use node label as data identifier
            # Unlist single-value strings from jsonlite parsing
            node_label <- node$label
            if (is.list(node_label)) node_label <- unlist(node_label)
            node_id <- if (!is.null(node_label)) node_label else paste0("dataset_", i)
            
            # Handle data export for file-based sources
            if (ds$type == "file" || !is.null(dataFile)) {
              # Check if data exists in GraphModel
              has_data <- node_id %in% names(data_list) && is.data.frame(data_list[[node_id]])
              
              if (is.na(writeData) || isTRUE(writeData)) {
                if (!has_data) {
                  # Data missing
                  if (isTRUE(strictData)) {
                    stop("Data missing for dataset node '", node_id, "' but writeData requested",
                         call. = FALSE)
                  } else {
                    # strictData is FALSE or NA - warn and continue
                    warning("Data missing for dataset node '", node_id, "'; schema saved without data",
                            call. = FALSE)
                  }
                } else if (isTRUE(writeData) || is.na(writeData)) {
                  # Data exists, decide whether to write
                  if (is.na(writeData)) {
                    # Check if file exists
                    data_filepath <- file.path(dataPath, dataFile)
                    if (file.exists(data_filepath)) {
                      warning("Data file exists at ", data_filepath,
                              "; use writeData=TRUE to force overwrite", call. = FALSE)
                    } else {
                      # File doesn't exist, write it
                      df <- data_list[[node_id]]
                      tryCatch(
                        write.csv(df, data_filepath, row.names = FALSE),
                        error = function(e) {
                          warning("Failed to write data file: ", conditionMessage(e))
                        }
                      )
                      
                      # Update schema with relative path
                      rel_path <- file.path(dataFile)
                      schema$models[[model_id]]$nodes[[i]]$datasetSource$location <- rel_path
                      schema$models[[model_id]]$nodes[[i]]$datasetSource$type <- "file"
                    }
                  } else if (isTRUE(writeData)) {
                    # writeData=TRUE, always write
                    data_filepath <- file.path(dataPath, dataFile)
                    df <- data_list[[node_id]]
                    tryCatch(
                      write.csv(df, data_filepath, row.names = FALSE),
                      error = function(e) {
                        warning("Failed to write data file: ", conditionMessage(e))
                      }
                    )
                    
                    # Update schema with relative path
                    rel_path <- file.path(dataFile)
                    schema$models[[model_id]]$nodes[[i]]$datasetSource$location <- rel_path
                    schema$models[[model_id]]$nodes[[i]]$datasetSource$type <- "file"
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  
  # Write schema JSON
  tryCatch(
    jsonlite::write_json(schema, filepath, pretty = pretty),
    error = function(e) {
      stop("Failed to write JSON: ", conditionMessage(e), call. = FALSE)
    }
  )
  
  invisible(filepath)
}



#' Get Schema Path
#' @keywords internal
#' @export
getSchemaPath <- function() {
  system.file("extdata", "graph.schema.json", package = "drawSEM")
}
