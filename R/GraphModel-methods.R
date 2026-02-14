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


# ============================================================================
# Generic Methods for Fitted Model Statistics
# ============================================================================

#' Log-Likelihood of Fitted Model
#'
#' Extract the log-likelihood (negative of fit value) from a fitted GraphModel.
#'
#' @param object A GraphModel object
#' @param ... Additional arguments (currently unused)
#'
#' @return
#' Numeric value of log-likelihood, or NA if:
#' - Model has not been fitted (no fit results in schema)
#' - Fit results are stale (model modified after fitting)
#'
#' @details
#' Returns NA with informative warning if fit is unavailable or stale.
#' Use `getFitResults(..., includeStale = TRUE)` to access stale fits.
#'
#' @examples
#' \dontrun{
#' g_fit <- runOpenMx(g)
#' loglik(g_fit)  # Print log-likelihood
#' }
#'
#' @export
setGeneric("loglik", function(object, ...) standardGeneric("loglik"))

#' @rdname loglik
setMethod("loglik", "GraphModel", function(object, ...) {
  fit_info <- getFitResults(object, which = "latest", includeStale = FALSE)
  
  if (is.null(fit_info)) {
    warning("Fit results unavailable. Model has no valid fit.", call. = FALSE)
    return(NA_real_)
  }
  
  if (identical(fit_info, NA)) {
    return(NA_real_)  # Warning already issued by getFitResults
  }
  
  # Return negative of fit value (fit value is negative LL)
  -(fit_info$fitValue %||% NA_real_)
})


#' Extract Fitted Coefficients
#'
#' Extract fitted parameter values from a fitted GraphModel.
#'
#' @param object A GraphModel object
#' @param ... Additional arguments (currently unused)
#'
#' @return
#' Named numeric vector of fitted parameter values, or NA if:
#' - Model has not been fitted
#' - Fit results are stale
#'
#' @details
#' Returns parameter estimates indexed by path ID. Returns NA with
#' informative warning if fit is unavailable.
#'
#' @examples
#' \dontrun{
#' g_fit <- runOpenMx(g)
#' coef(g_fit)  # Print fitted parameter values
#' }
#'
#' @export
setGeneric("coef", function(object, ...) standardGeneric("coef"))

#' @rdname coef
setMethod("coef", "GraphModel", function(object, ...) {
  fit_info <- getFitResults(object, which = "latest", includeStale = FALSE)
  
  if (is.null(fit_info)) {
    warning("Fit results unavailable. Model has no valid fit.", call. = FALSE)
    return(NA_real_)
  }
  
  if (identical(fit_info, NA)) {
    return(NA_real_)  # Warning already issued by getFitResults
  }
  
  # Convert to numeric vector
  params <- fit_info$parameters %||% list()
  unlist(params)
})


#' Variance-Covariance Matrix
#'
#' Extract the variance-covariance matrix of fitted parameters.
#'
#' @param object A GraphModel object
#' @param ... Additional arguments (currently unused)
#'
#' @return
#' Matrix with standard errors on diagonal, or NA if:
#' - Model has not been fitted
#' - Fit results are stale
#' - Standard errors not available
#'
#' @details
#' Constructs a diagonal matrix from standard errors.
#' Full covariance matrix would require bootstrapping or second derivatives,
#' not currently available in schema.
#'
#' Returns NA with informative warning if unavailable.
#'
#' @examples
#' \dontrun{
#' g_fit <- runOpenMx(g)
#' vcov(g_fit)  # Variance-covariance matrix
#' }
#'
#' @export
setGeneric("vcov", function(object, ...) standardGeneric("vcov"))

#' @rdname vcov
setMethod("vcov", "GraphModel", function(object, ...) {
  fit_info <- getFitResults(object, which = "latest", includeStale = FALSE)
  
  if (is.null(fit_info)) {
    warning("Fit results unavailable. Model has no valid fit.", call. = FALSE)
    return(NA_real_)
  }
  
  if (identical(fit_info, NA)) {
    return(NA_real_)  # Warning already issued by getFitResults
  }
  
  # Build covariance/SE matrix
  se_list <- fit_info$standardErrors %||% list()
  if (length(se_list) == 0) {
    warning("Standard errors unavailable in fit results", call. = FALSE)
    return(NA_real_)
  }
  
  se_vals <- unlist(se_list)
  diag(se_vals^2)  # Variance = SE^2
})


#' Confidence Intervals
#'
#' Extract confidence intervals for fitted parameters.
#'
#' @param object A GraphModel object
#' @param level Confidence level (default: 0.95)
#' @param ... Additional arguments (currently unused)
#'
#' @return
#' Data frame with columns lbound, estimate, ubound for each parameter,
#' or NA if fit unavailable or stale.
#'
#' @details
#' Uses standard errors to compute Wald confidence intervals:
#' estimate ± z_alpha * SE
#'
#' More complex confidence intervals (profile likelihood, bootstrap)
#' would require additional data not currently in schema.
#'
#' @examples
#' \dontrun{
#' g_fit <- runOpenMx(g)
#' confint(g_fit)         # 95% CI
#' confint(g_fit, 0.99)   # 99% CI
#' }
#'
#' @export
setGeneric("confint", function(object, level = 0.95, ...) standardGeneric("confint"))

#' @rdname confint
setMethod("confint", "GraphModel", function(object, level = 0.95, ...) {
  fit_info <- getFitResults(object, which = "latest", includeStale = FALSE)
  
  if (is.null(fit_info)) {
    warning("Fit results unavailable. Model has no valid fit.", call. = FALSE)
    return(NA_real_)
  }
  
  if (identical(fit_info, NA)) {
    return(NA_real_)  # Warning already issued
  }
  
  # Extract parameters and SEs
  params <- unlist(fit_info$parameters %||% list())
  se_vals <- unlist(fit_info$standardErrors %||% list())
  
  if (length(params) != length(se_vals)) {
    warning("Parameter and SE count mismatch", call. = FALSE)
    return(NA_real_)
  }
  
  # Compute Wald CIs
  alpha <- 1 - level
  z_crit <- qnorm(1 - alpha / 2)
  
  data.frame(
    lbound = params - z_crit * se_vals,
    estimate = params,
    ubound = params + z_crit * se_vals,
    row.names = names(params)
  )
})


#' Summary of Fitted GraphModel
#'
#' Print comprehensive summary of fitted model with convergence status,
#' parameter estimates, and staleness warnings.
#'
#' @param object A GraphModel object
#' @param ... Additional arguments (currently unused)
#'
#' @return
#' Invisibly returns a list with summary information:
#' - converged: logical
#' - fitValue: numeric
#' - parameters: named numeric vector
#' - standardErrors: named numeric vector
#' - isDirty: logical (fit is stale)
#'
#' @details
#' Prints:
#' - **Convergence Status:** Whether optimizer converged
#' - **⚠ STALE FIT WARNING:** If fit is outdated
#' - **Fit Value:** Negative log-likelihood or equivalent
#' - **Degrees of Freedom:** If available
#' - **Sample Size:** If available
#' - **Parameter Estimates:** Table with values and SE
#'
#' @examples
#' \dontrun{
#' g_fit <- runOpenMx(g)
#' summary(g_fit)
#' }
#'
#' @export
setMethod("summary", "GraphModel", function(object, ...) {
  # Get all fit results to check staleness
  all_fits <- getFitResults(object, which = "all")
  
  if (is.null(all_fits)) {
    cat("GraphModel Summary\n")
    cat("──────────────────\n")
    cat("No fit results available.\n")
    cat("Use runOpenMx(model) to fit the model.\n")
    return(invisible(list(
      converged = NA,
      fitValue = NA,
      parameters = NA,
      isDirty = NA
    )))
  }
  
  # Get latest fit
  latest_fit <- all_fits[[length(all_fits)]]
  
  cat("GraphModel Summary\n")
  cat("──────────────────\n")
  
  # Convergence status
  converged <- latest_fit$converged %||% NA
  if (is.na(converged)) {
    cat("Convergence: Unknown\n")
  } else {
    cat(sprintf("Convergence: %s\n", if (converged) "YES" else "NO"))
  }
  
  # Status remarks
  if (!is.null(latest_fit$statusRemarks)) {
    cat(sprintf("Status: %s\n", latest_fit$statusRemarks))
  }
  
  # Staleness warning
  is_dirty <- latest_fit$isDirty %||% FALSE
  if (is_dirty) {
    cat("\n⚠️  WARNING: Fit results are STALE\n")
    cat("   (Model has been modified since fitting.)\n")
    cat("   Re-run with: runOpenMx(model)\n\n")
  }
  
  # Fit value
  if (!is.null(latest_fit$fitValue)) {
    cat(sprintf("Fit Value: %.4f\n", latest_fit$fitValue))
  }
  
  # DF and sample size
  if (!is.null(latest_fit$degreesOfFreedom) && !is.na(latest_fit$degreesOfFreedom)) {
    cat(sprintf("Degrees of Freedom: %d\n", latest_fit$degreesOfFreedom))
  }
  
  if (!is.null(latest_fit$sampleSize) && !is.na(latest_fit$sampleSize)) {
    cat(sprintf("Sample Size: %d\n", latest_fit$sampleSize))
  }
  
  cat("\n")
  
  # Parameter estimates table
  params <- unlist(latest_fit$parameters %||% list())
  se_vals <- unlist(latest_fit$standardErrors %||% list())
  
  if (length(params) > 0) {
    est_table <- data.frame(
      Estimate = params,
      Std.Err = se_vals,
      row.names = names(params)
    )
    cat("Parameter Estimates:\n")
    print(est_table)
  }
  
  # Return summary info invisibly
  invisible(list(
    converged = converged,
    fitValue = latest_fit$fitValue,
    parameters = params,
    standardErrors = se_vals,
    isDirty = is_dirty
  ))
})