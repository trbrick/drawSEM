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