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
    jsonlite::read_json(filepath, simplifyVector = FALSE, simplifyDataFrame = FALSE),
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



#' Get Schema Path
#' @keywords internal
#' @export
getSchemaPath <- function() {
  system.file("extdata", "graph.schema.json", package = "OpenMxWebUI")
}
