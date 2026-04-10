#' @include GraphModel-class.R io.R utilities.R
NULL

#' Hash Model Structure for Staleness Detection
#'
#' Computes a digest hash of the fitting-relevant parts of a GraphModel schema.
#' Used to detect whether fit results are stale (model structure changed).
#'
#' @param graphModel A GraphModel object, or NULL to return NA
#' @param model_id Character; which model to hash (defaults to first model)
#'
#' @return Character digest hash, or NA if unable to hash
#'
#' @details
#' Includes in hash:
#' - Node structure (label, type, variableCharacteristics)
#' - Path structure (from, to, numberOfArrows, freeParameter, parameterType)
#' - Optimization parameters (fitFunction, missingness, parameterTypes)
#'
#' Excludes:
#' - Visual properties (positions, colors)
#' - UI metadata
#' - Fit results
#'
#' @keywords internal
#' @noRd
hashStructure <- function(graphModel, model_id = NULL) {
  if (is.null(graphModel) || !is(graphModel, "GraphModel")) {
    return(NA_character_)
  }
  
  # Determine model
  if (is.null(model_id)) {
    model_id <- names(graphModel@schema$models)[1]
  }
  
  model <- graphModel@schema$models[[model_id]]
  if (is.null(model)) {
    return(NA_character_)
  }
  
  # Extract fitting-relevant structure
  relevant_parts <- list(
    nodes = lapply(model$nodes %||% list(), function(n) {
      list(
        label = n$label,
        type = n$type,
        variableCharacteristics = n$variableCharacteristics
      )
    }),
    paths = lapply(model$paths %||% list(), function(p) {
      list(
        from = p$from,
        to = p$to,
        numberOfArrows = p$numberOfArrows,
        freeParameter = p$freeParameter,
        parameterType = p$parameterType
      )
    }),
    optimization = list(
      fitFunction = model$optimization$fitFunction,
      missingness = model$optimization$missingness,
      parameterTypes = model$optimization$parameterTypes
    )
  )
  
  # Serialize and hash
  json_str <- jsonlite::toJSON(relevant_parts, auto_unbox = TRUE, sort_keys = TRUE)
  digest::digest(json_str, algo = "sha256")
}


#' Get Fit Results from GraphModel
#'
#' Retrieve fit results with explicit control over staleness handling.
#'
#' @param graphModel A GraphModel object
#' @param model_id Character; which model to retrieve from (defaults to first)
#' @param which Character; one of:
#'   - "latest" (default): most recent fit only
#'   - "all": all fit results with staleness info
#' @param includeStale Logical; if FALSE (default), returns NA if latest fit is dirty.
#'   If TRUE, returns the fit anyway with a warning.
#' @param index Integer; if specified, gets the fit at this position (overrides `which`)
#'
#' @return
#' For `which = "latest"`: A list with fit data (fitValue, parameterEstimates, SE, etc),
#' or NULL if no fit available, or NA if fit is stale (unless includeStale = TRUE).
#'
#' For `which = "all"`: A list of all fit results, each with transient `isStale` flag.
#'
#' For `index`: The fit at that position.
#'
#' @details
#' Staleness detection:
#' - Compares structureHash in fit result vs. current model structure
#' - If different, marks transient `isStale = TRUE`
#' - By default, NA is returned to prevent use of stale data
#' - Use includeStale = TRUE to override (with warning)
#'
#' @keywords internal
#' @noRd
getFitResults <- function(
    graphModel,
    model_id = NULL,
    which = "latest",
    includeStale = FALSE,
    index = NULL) {
  
  if (!is(graphModel, "GraphModel")) {
    return(NULL)
  }
  
  # Determine model
  if (is.null(model_id)) {
    model_id <- names(graphModel@schema$models)[1]
  }
  
  model <- graphModel@schema$models[[model_id]]
  if (is.null(model) || is.null(model$provenance)) {
    return(NULL)
  }
  
  fit_results <- model$provenance$fitResults %||% list()
  if (length(fit_results) == 0) {
    return(NULL)
  }
  
  # Handle index parameter
  if (!is.null(index)) {
    if (index < 1 || index > length(fit_results)) {
      return(NULL)
    }
    fit <- fit_results[[index]]
  } else if (which == "all") {
    # Return all with transient isStale flags
    current_hash <- hashStructure(graphModel, model_id)
    fit_results <- lapply(fit_results, function(fit) {
      fit$isStale <- !identical(fit$structureHash, current_hash)
      fit
    })
    return(fit_results)
  } else {
    # Get latest
    fit <- fit_results[[length(fit_results)]]
  }
  
  # Check staleness of single fit
  if (!is.null(fit)) {
    current_hash <- hashStructure(graphModel, model_id)
    is_stale <- !identical(fit$structureHash, current_hash)
    fit$isStale <- is_stale
    
    if (is_stale && !includeStale) {
      warning(
        sprintf(
          "Fit results unavailable. Model has no valid fit.\n  Reason: Fit is stale (model modified on %s after fit on %s).\n  Use getFitResults(..., includeStale = TRUE) to access stale fit.",
          model$provenance$lastModified %||% "unknown",
          fit$timestamp %||% "unknown"
        ),
        call. = FALSE
      )
      return(NA)
    }
    
    if (is_stale && includeStale) {
      warning(
        sprintf(
          "Accessing stale fit results (model modified after fitting)."
        ),
        call. = FALSE
      )
    }
  }
  
  fit
}


#' Mark Fit Results as Dirty (Stale)
#'
#' Updates the structureHash in provenance to detect stale fits.
#' Called after model modifications to indicate that fit results need revalidation.
#'
#' @param graphModel A GraphModel object
#' @param model_id Character; which model to mark (defaults to first)
#'
#' @return The modified GraphModel (invisibly)
#'
#' @details
#' This function:
#' 1. Computes current structure hash
#' 2. Updates provenance.structureHash in schema
#' 3. Marks lastModified timestamp
#' 4. Subsequent calls to getFitResults() will detect staleness
#'
#' Called automatically by:
#' - Node modifications
#' - Path modifications
#' - Optimization parameter changes
#'
#' NOT called by:
#' - Visual property changes
#' - Metadata-only changes
#'
#' @keywords internal
#' @noRd
markFitDirty <- function(graphModel, model_id = NULL) {
  if (!is(graphModel, "GraphModel")) {
    return(invisible(graphModel))
  }
  
  # Determine model
  if (is.null(model_id)) {
    model_id <- names(graphModel@schema$models)[1]
  }
  
  model <- graphModel@schema$models[[model_id]]
  if (is.null(model)) {
    return(invisible(graphModel))
  }
  
  # Ensure provenance exists
  if (is.null(model$provenance)) {
    model$provenance <- list()
  }
  
  # Update structure hash and timestamp
  current_hash <- hashStructure(graphModel, model_id)
  model$provenance$structureHash <- current_hash
  model$provenance$lastModified <- format(Sys.time(), format = "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
  
  # Update back to schema
  graphModel@schema$models[[model_id]] <- model
  
  invisible(graphModel)
}


#' Fit OpenMx Model from GraphModel
#'
#' Wrapper around as.MxModel() + mxRun() that fits a GraphModel and
#' stores results back in the schema.
#'
#' @param graphModel A GraphModel object to fit
#' @param model_id Character; which model to fit (defaults to first)
#' @param silent Logical; if TRUE, suppress mxRun() status messages
#' @param intervals Logical; if TRUE, compute confidence intervals
#' @param unsafe Logical; if TRUE, ignore errors during optimization
#' @param ... Additional arguments passed to mxRun()
#'
#' @return
#' A new GraphModel with fitted parameters and fit metadata stored in
#' the schema's provenance section. Original graphModel is unchanged
#' (R's copy-on-modify semantics).
#'
#' @details
#' Workflow:
#' 1. Convert GraphModel → mxModel (as.MxModel)
#' 2. Fit with mxRun(..., silent=silent, intervals=intervals, unsafe=unsafe, ...)
#' 3. Extract fitted parameters, standard errors, fit value, etc.
#' 4. Store in schema$models[[model_id]]$provenance$fitResults
#' 5. Mark with current structure hash for staleness detection
#' 6. Return new GraphModel with $lastBuiltModel set to fitted mxModel
#'
#' @examples
#' \dontrun{
#' g <- as.GraphModel(schema, data = list(mydata = df))
#' g_fit <- runOpenMx(g, silent = TRUE)
#'
#' # Access fit results
#' loglik(g_fit)
#' coef(g_fit)
#' summary(g_fit)
#' }
#'
#' @export
runOpenMx <- function(
    graphModel,
    model_id = NULL,
    silent = FALSE,
    intervals = FALSE,
    unsafe = FALSE,
    ...) {
  
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  
  if (is.null(model_id)) {
    model_id <- names(graphModel@schema$models)[1]
  }
  
  # Step 1: Convert to mxModel
  message(sprintf("Building mxModel from schema (model_id = '%s')...", model_id))
  mx_model <- as.MxModel(graphModel, model_id = model_id)
  
  # Step 2: Fit with mxRun
  message("Running optimizer with mxRun()...")
  fit_result <- OpenMx::mxRun(
    mx_model,
    silent = silent,
    intervals = intervals,
    unsafe = unsafe,
    ...
  )
  
  # Step 3: Extract results
  message("Extracting fit metadata...")
  
  # Get fit value and status
  fit_value <- fit_result$output$fit
  converged <- (fit_result$output$status[[1]] == 0)
  status_code <- fit_result$output$status[[1]]
  status_remarks <- sprintf(
    "Convergence %s. Code %d",
    if (converged) "detected" else "NOT detected",
    status_code
  )
  
  # Extract parameter estimates and SEs
  estimates <- fit_result$output$estimate
  se_object <- try(OpenMx::SE(fit_result), silent = TRUE)
  standard_errors <- if (inherits(se_object, "try-error")) {
    setNames(rep(NA_real_, length(estimates)), names(estimates))
  } else {
    se_object
  }
  
  # Get sample size and DF
  sample_size <- NA_integer_
  degrees_of_freedom <- NA_integer_
  
  # Try to extract from data
  if (!is.null(fit_result$data) && !is.null(fit_result$data$observed)) {
    obs_data <- fit_result$data$observed
    if (is.matrix(obs_data)) {
      sample_size <- nrow(obs_data)
    } else if (is.data.frame(obs_data)) {
      sample_size <- nrow(obs_data)
    }
  }
  
  # Try to get DF from summary
  tryCatch(
    {
      summary_obj <- summary(fit_result)
      if (!is.null(summary_obj$degreesOfFreedom)) {
        degrees_of_freedom <- summary_obj$degreesOfFreedom
      }
    },
    error = function(e) {
      # Silently continue if summary fails
    }
  )
  
  # Step 4: Create fit result entry
  current_hash <- hashStructure(graphModel, model_id)
  
  fit_entry <- list(
    timestamp = format(Sys.time(), format = "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"),
    backend = "OpenMx",
    converged = converged,
    structureHash = current_hash,
    statusRemarks = status_remarks,
    fitValue = fit_value,
    degreesOfFreedom = degrees_of_freedom,
    sampleSize = sample_size,
    parameterEstimates = as.list(estimates),
    standardErrors = as.list(standard_errors)
  )
  
  # Step 5: Store in GraphModel schema
  result_model <- graphModel
  model <- result_model@schema$models[[model_id]]
  
  # Initialize provenance if needed
  if (is.null(model$provenance)) {
    model$provenance <- list()
  }
  
  # Append fit result
  model$provenance$fitResults <- c(
    model$provenance$fitResults %||% list(),
    list(fit_entry)
  )
  
  # Update hashes and timestamp
  model$provenance$structureHash <- current_hash
  model$provenance$lastModified <- fit_entry$timestamp
  
  result_model@schema$models[[model_id]] <- model
  
  # Step 6: Cache the fitted model
  result_model@lastBuiltModel <- fit_result
  
  message("Fitting complete.")
  result_model
}
