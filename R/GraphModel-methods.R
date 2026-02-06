#' GraphModel Methods: Accessors and Display
#'
#' Methods for inspecting and modifying GraphModel objects.
#'
#' @name GraphModel-methods
#' @docType methods
NULL

#' @rdname GraphModel-methods
#' @export
setMethod(
  "show",
  "GraphModel",
  function(object) {
    cat("GraphModel object\n")
    cat("─────────────────\n")
    
    # Schema info
    n_models <- length(object@schema$models)
    cat(sprintf("Schema:   %d model(s)\n", n_models))
    if (n_models > 0) {
      model_names <- names(object@schema$models)
      cat(sprintf("  Models: %s\n", paste(model_names, collapse = ", ")))
    }
    
    # Data info
    n_datasets <- length(object@data)
    cat(sprintf("Data:     %d dataset(s)\n", n_datasets))
    if (n_datasets > 0) {
      cat(sprintf("  Names:  %s\n", paste(names(object@data), collapse = ", ")))
    }
    
    # Metadata info
    cat(sprintf("Metadata: %d element(s)\n", length(object@metadata)))
    if ("unsupported" %in% names(object@metadata)) {
      n_unsupported <- length(object@metadata$unsupported)
      cat(sprintf("  Unsupported features: %d\n", n_unsupported))
    }
    
    # Built model info
    if (is.null(object@lastBuiltModel)) {
      cat("Built:    Not yet built\n")
    } else {
      model_class <- class(object@lastBuiltModel)[1]
      cat(sprintf("Built:    %s\n", model_class))
    }
  }
)

#' Extract Schema from GraphModel
#'
#' @param object A GraphModel object
#'
#' @return The schema list from the GraphModel
#'
#' @examples
#' \dontrun{
#' g <- as.GraphModel(schema_list)
#' s <- schema(g)
#' }
#'
#' @export
setGeneric(
  "schema",
  function(object) standardGeneric("schema")
)

#' @rdname schema-methods
#' @export
setMethod(
  "schema",
  "GraphModel",
  function(object) object@schema
)

#' Extract Data from GraphModel
#'
#' @param object A GraphModel object
#'
#' @return The data list from the GraphModel
#'
#' @examples
#' \dontrun{
#' g <- as.GraphModel(schema_list, data = list(df1 = my_df))
#' d <- data(g)
#' }
#'
#' @export
setGeneric(
  "data",
  function(object) standardGeneric("data")
)

#' @rdname data-methods
#' @export
setMethod(
  "data",
  "GraphModel",
  function(object) object@data
)

#' Extract Metadata from GraphModel
#'
#' @param object A GraphModel object
#'
#' @return The metadata list from the GraphModel
#'
#' @examples
#' \dontrun{
#' g <- as.GraphModel(schema_list)
#' m <- metadata(g)
#' }
#'
#' @export
setGeneric(
  "metadata",
  function(object) standardGeneric("metadata")
)

#' @rdname metadata-methods
#' @export
setMethod(
  "metadata",
  "GraphModel",
  function(object) object@metadata
)

#' Set Schema in GraphModel
#'
#' @param object A GraphModel object
#' @param value A new schema list
#'
#' @return The modified GraphModel (invisibly)
#'
#' @examples
#' \dontrun{
#' g <- as.GraphModel(schema_list)
#' schema(g) <- new_schema
#' }
#'
#' @export
setGeneric(
  "schema<-",
  function(object, value) standardGeneric("schema<-")
)

#' @rdname schema-methods
#' @export
setMethod(
  "schema<-",
  "GraphModel",
  function(object, value) {
    object@schema <- value
    object@lastBuiltModel <- NULL  # Invalidate cached model
    validObject(object)
    object
  }
)

#' Set Data in GraphModel
#'
#' @param object A GraphModel object
#' @param value A new data list
#'
#' @return The modified GraphModel (invisibly)
#'
#' @examples
#' \dontrun{
#' g <- as.GraphModel(schema_list)
#' data(g) <- list(newdata = new_df)
#' }
#'
#' @export
setGeneric(
  "data<-",
  function(object, value) standardGeneric("data<-")
)

#' @rdname data-methods
#' @export
setMethod(
  "data<-",
  "GraphModel",
  function(object, value) {
    if (!is.list(value)) {
      stop("data must be a list", call. = FALSE)
    }
    object@data <- value
    object
  }
)

#' Set Metadata in GraphModel
#'
#' @param object A GraphModel object
#' @param value A new metadata list
#'
#' @return The modified GraphModel (invisibly)
#'
#' @examples
#' \dontrun{
#' g <- as.GraphModel(schema_list)
#' metadata(g) <- list(positions = list(...))
#' }
#'
#' @export
setGeneric(
  "metadata<-",
  function(object, value) standardGeneric("metadata<-")
)

#' @rdname metadata-methods
#' @export
setMethod(
  "metadata<-",
  "GraphModel",
  function(object, value) {
    if (!is.list(value)) {
      stop("metadata must be a list", call. = FALSE)
    }
    object@metadata <- value
    object
  }
)

#' Get Cached Built Model
#'
#' @param object A GraphModel object
#'
#' @return The lastBuiltModel from the GraphModel (or NULL)
#'
#' @keywords internal
setGeneric(
  "builtModel",
  function(object) standardGeneric("builtModel")
)

#' @rdname builtModel-methods
setMethod(
  "builtModel",
  "GraphModel",
  function(object) object@lastBuiltModel
)

#' Set Cached Built Model
#'
#' @param object A GraphModel object
#' @param value A model object
#'
#' @return The modified GraphModel (invisibly)
#'
#' @keywords internal
setGeneric(
  "builtModel<-",
  function(object, value) standardGeneric("builtModel<-")
)

#' @rdname builtModel-methods
setMethod(
  "builtModel<-",
  "GraphModel",
  function(object, value) {
    object@lastBuiltModel <- value
    object
  }
)
#' Access GraphModel Slots with $ Operator
#'
#' Extract or replace slots in a GraphModel object using the $ operator.
#' Provides convenient access to schema, data, metadata, and lastBuiltModel.
#'
#' @param x A GraphModel object
#' @param name The name of the slot to access: "schema", "data", "metadata", or "lastBuiltModel"
#'
#' @return The contents of the named slot
#'
#' @examples
#' \dontrun{
#' gm <- as.GraphModel(schema, data = list(mydata = df))
#' gm$schema       # Access schema
#' gm$data$mydata  # Access data
#' gm$metadata     # Access metadata
#' }
#'
#' @rdname dollar-methods
#' @export
setMethod(
  "$",
  "GraphModel",
  function(x, name) {
    slot(x, name)
  }
)

#' Replace GraphModel Slots with $<- Operator
#'
#' Replace slots in a GraphModel object using the $<- operator.
#'
#' @param x A GraphModel object
#' @param name The name of the slot to replace
#' @param value The new value for the slot
#'
#' @return The modified GraphModel (invisibly)
#'
#' @examples
#' \dontrun{
#' gm <- as.GraphModel(schema)
#' gm$data <- list(mydata = df)
#' gm$metadata$note <- "Updated"
#' }
#'
#' @rdname dollar-methods
#' @export
setMethod(
  "$<-",
  "GraphModel",
  function(x, name, value) {
    slot(x, name) <- value
    x
  }
)