#' GraphModel S4 Class
#'
#' A schema-first representation of a statistical model (SEM, growth curve, multilevel, etc.)
#' that preserves structural information, UI metadata, and backend-specific configurations.
#'
#' @description
#' The `GraphModel` class is the central object for the OpenMx WebUI package. It stores:
#' - **schema:** The structural definition (nodes, paths, optimization parameters) as a list
#' - **data:** Named list of data.frames or file paths for datasets referenced in the schema
#' - **metadata:** UI state (node positions, colors, labels, unsupported features)
#' - **lastBuiltModel:** Cached mxModel object (or NULL if not yet built)
#'
#' The schema is JSON-serializable and the source of truth. The GraphModel can be converted
#' transparently to backend-specific objects (OpenMx, lavaan, blavaan) without losing
#' structural information.
#'
#' @slot schema
#'   A list representing the graph schema. Must have `schemaVersion` and `models` keys.
#'   See the graph.schema.json for full specification.
#'
#' @slot data
#'   A named list where names are dataset node IDs and values are data.frames or
#'   file paths (character strings). For embedded data, data.frames are stored directly.
#'   For file-based data, file paths are resolved at load time based on schema location
#'   and dataPath argument. Used by the converter to build mxData objects.
#'
#' @slot metadata
#'   A list for storing UI state and other non-schema information. May contain:
#'   - `unsupported`: A list of features not yet supported by the converter
#'   - `positions`: Visual node positions (for round-tripping through the GUI)
#'   - `colors`, `labels`: UI styling information
#'
#' @slot lastBuiltModel
#'   The cached backend-specific model object (typically an mxModel). Set when
#'   `as.MxModel()` or `mxRun()` is called. NULL if not yet built or if schema
#'   has been modified since last build.
#'
#' @slot dataConnections
#'   A list tracking data connection state for each dataset in the schema.
#'   Names are dataset labels, values are lists with:
#'   - `status`: "eager", "lazy", or "unconnected"
#'   - `filepath`: Path to the file (if status is "eager" or "lazy")
#'   - `columns`: Column names from file metadata (for validation)
#'
#' @details
#' Typical workflow:
#' 1. Create a GraphModel from JSON schema: `g <- as.GraphModel(schema, data = list(...))`
#' 2. Optionally inspect the schema: `schema(g)`, `data(g)`, `metadata(g)`
#' 3. Build and run the model: `fit <- mxRun(g)`
#' 4. Export for later use: `exportSchema(g, "model.json")`
#'
#' @seealso
#' - [as.GraphModel()] for creating instances
#' - [as.MxModel()] for converting to OpenMx
#' - [schema()], [data()], [metadata()] for accessors
#'
#' @examples
#' \dontrun{
#' # Create from JSON schema
#' schema_list <- list(
#'   schemaVersion = 1,
#'   models = list(
#'     model1 = list(
#'       nodes = list(...),
#'       paths = list(...)
#'     )
#'   )
#' )
#' 
#' g <- as.GraphModel(schema_list, data = list(mydata = my_df))
#' 
#' # Inspect structure
#' schema(g)
#' data(g)
#' metadata(g)
#' 
#' # Build and run
#' fit <- mxRun(g)
#' summary(fit)
#' }
#'
#' @export
setClass(
  "GraphModel",
  slots = c(
    schema = "list",
    data = "list",
    metadata = "list",
    lastBuiltModel = "ANY",
    dataConnections = "list"
  ),
  validity = function(object) {
    # Basic validity checks
    if (!is.list(object@schema)) {
      return("@schema must be a list")
    }
    
    if (!is.list(object@data)) {
      return("@data must be a list")
    }
    
    if (!is.list(object@metadata)) {
      return("@metadata must be a list")
    }
    
    if (!is.list(object@dataConnections)) {
      return("@dataConnections must be a list")
    }
    
    # Schema must have schemaVersion and models
    if (!"schemaVersion" %in% names(object@schema)) {
      return("@schema must have 'schemaVersion'")
    }
    
    if (!"models" %in% names(object@schema)) {
      return("@schema must have 'models'")
    }
    
    TRUE
  }
)
# Initialize method to ensure dataConnections slot is always set
setMethod(
  "initialize",
  "GraphModel",
  function(.Object, schema = list(), data = list(), metadata = list(), 
           lastBuiltModel = NULL, dataConnections = list(), ...) {
    .Object <- callNextMethod()
    .Object@schema <- schema
    .Object@data <- data
    .Object@metadata <- metadata
    .Object@lastBuiltModel <- lastBuiltModel
    .Object@dataConnections <- dataConnections
    validObject(.Object)
    .Object
  }
)