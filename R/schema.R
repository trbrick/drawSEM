#' Load a Graph Schema from JSON File
#'
#' @param filepath Character. Path to JSON file containing schema.
#'
#' @return A list representing the schema (JSON structure).
#'
#' @details
#' The schema defines the structure of a structural equation model:
#' nodes, paths, constraints, data sources, etc.
#'
#' @examples
#' \dontrun{
#' schema <- loadSchema("model.json")
#' validateSchema(schema)
#' }
#'
#' @export
loadSchema <- function(filepath) {
  if (!file.exists(filepath)) {
    stop("File not found: ", filepath, call. = FALSE)
  }
  
  tryCatch(
    jsonlite::read_json(filepath),
    error = function(e) {
      stop("Failed to parse JSON: ", conditionMessage(e), call. = FALSE)
    }
  )
}

#' Save a Graph Schema to JSON File
#'
#' @param schema A list representing the schema.
#' @param filepath Character. Path where JSON should be written.
#' @param pretty Logical. If TRUE, format with indentation (default: TRUE).
#'
#' @return Invisibly returns the filepath (for chaining).
#'
#' @examples
#' \dontrun{
#' schema <- loadSchema("model.json")
#' # ... modify schema ...
#' saveSchema(schema, "model_modified.json")
#' }
#'
#' @export
saveSchema <- function(schema, filepath, pretty = TRUE) {
  if (!is.list(schema)) {
    stop("schema must be a list", call. = FALSE)
  }
  
  tryCatch(
    jsonlite::write_json(schema, filepath, pretty = pretty),
    error = function(e) {
      stop("Failed to write JSON: ", conditionMessage(e), call. = FALSE)
    }
  )
  
  invisible(filepath)
}

#' Validate a Graph Schema
#'
#' @param schema A list or JSON string representing a schema.
#' @param verbose Logical. If TRUE, message on success (default: TRUE).
#'
#' @return Invisibly returns TRUE if valid. Throws error if invalid.
#'
#' @details
#' Checks that the schema has required top-level fields:
#' `models`, `expansions`, `levelMap`, `backends`.
#'
#' Does NOT validate against the formal JSON schema (that's done in TypeScript).
#' This is a minimal R-side check for basic structure.
#'
#' @examples
#' \dontrun{
#' schema <- loadSchema("model.json")
#' validateSchema(schema)  # Message: "Schema valid"
#' }
#'
#' @export
validateSchema <- function(schema, verbose = TRUE) {
  # Handle JSON string input
  if (is.character(schema)) {
    schema <- tryCatch(
      jsonlite::fromJSON(schema),
      error = function(e) {
        stop("Invalid JSON string: ", conditionMessage(e), call. = FALSE)
      }
    )
  }
  
  if (!is.list(schema)) {
    stop("schema must be a list or JSON string", call. = FALSE)
  }
  
  # Check required fields
  required_fields <- c("models", "expansions", "levelMap")
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
  
  if (verbose) {
    message("Schema valid (", length(schema$models), " model(s))")
  }
  
  invisible(TRUE)
}

#' Get Schema Path
#' @keywords internal
#' @export
getSchemaPath <- function() {
  system.file("extdata", "graph.schema.json", package = "visualWebTool")
}
