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
#' Hashes each node, path, and the model's `optimization` block as a whole,
#' minus an explicit exclude-list, rather than an allowlist that has to be
#' extended by hand every time a fitting-relevant key is added to the schema.
#'
#' Excludes:
#' - `visual`, `description`, `tags` on nodes and paths: cosmetic/organizational,
#'   never read by the converter
#' - `start`, wherever it appears (`optimization.parameterTypes.*.start`,
#'   per-path `optimization.start`): an advisory computational hint, not model
#'   content (see `SCHEMA-DESIGN.md` section 10) — it does not change what the
#'   model means, so it must not make a recorded fit stale
#' - Fit results (`provenance`), which are outputs, not inputs
#'
#' Consequently a dataset node's `datasetSource` (file/embedded data, md5,
#' column types) and `bindingMappings` are included: swapping a model's
#' underlying data is a structural change even though today's OpenMx converter
#' doesn't read `bindingMappings` itself.
#'
#' @keywords internal
#' @noRd

# Keys carried on nodes/paths that are cosmetic or organizational, never read
# by the converter, and so must not affect the structural hash.
.hashStructureExcludeKeys <- c("visual", "description", "tags")

# Drops `keys` from a schema fragment (a named list), leaving every other key
# -- known or not yet invented -- untouched. `x[!names(x) %in% keys]` is a
# no-op for keys that were never present, so this is safe on partial objects.
#
# Collapses to NULL when nothing survives, rather than an empty list: an
# `optimization` block that had only `start` must hash identically to one
# that was never present at all, or adding a start hint to a previously-bare
# path would itself flip the hash -- the exact failure mode this excludes.
.hashOmit <- function(x, keys) {
  if (is.null(x) || length(x) == 0) return(NULL)
  filtered <- x[!(names(x) %in% keys)]
  if (length(filtered) == 0) return(NULL)
  filtered
}

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
    nodes = lapply(model$nodes %||% list(), .hashOmit, keys = .hashStructureExcludeKeys),
    paths = lapply(model$paths %||% list(), function(p) {
      p <- .hashOmit(p, .hashStructureExcludeKeys)
      # Per-path override: `start` is advisory (see @details); prior and
      # bounds are model content and stay.
      if (!is.null(p$optimization)) {
        p$optimization <- .hashOmit(p$optimization, "start")
      }
      p
    }),
    optimization = list(
      fitFunction = model$optimization$fitFunction,
      missingness = model$optimization$missingness,
      # Same `start` exclusion as per-path optimization, applied to each
      # semantic parameter type's defaults.
      parameterTypes = lapply(model$optimization$parameterTypes %||% list(), .hashOmit, keys = "start")
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


#' Fit a GraphModel
#'
#' Wrapper around as.MxModel() + mxRun() that fits a GraphModel and
#' stores results back in the schema.
#'
#' @param graphModel A GraphModel object to fit
#' @param backend Character; which backend to fit with. Currently only
#'   `"OpenMx"` is implemented; other values from the schema's
#'   `fitResults.backend` enum (`"lavaan"`, `"blavaan"`, `"other"`) are
#'   accepted as valid input but raise a "not yet implemented" error, so a
#'   typo is caught the same way an unrecognized value would be.
#' @param model_id Character; which model to fit (defaults to first)
#' @param silent Logical; if TRUE, suppress mxRun() status messages
#' @param intervals Logical; if TRUE, compute confidence intervals
#' @param unsafe Logical; if TRUE, ignore errors during optimization
#' @param onUnsupported How to handle non-core `extensions$pendingCore` features:
#'   "stop" (default) refuses with an error listing them; "ignore" fits a reduced
#'   model that omits them (with a warning), leaving them in the schema.
#' @param ... Additional arguments passed to mxRun()
#'
#' @return
#' A new GraphModel with fitted parameters and fit metadata stored in
#' the schema's provenance section. Original graphModel is unchanged
#' (R's copy-on-modify semantics).
#'
#' @details
#' Workflow (backend = "OpenMx"):
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
#' g_fit <- runModel(g, silent = TRUE)
#'
#' # Access fit results
#' loglik(g_fit)
#' coef(g_fit)
#' summary(g_fit)
#' }
#'
#' @export
runModel <- function(
    graphModel,
    backend = "OpenMx",
    model_id = NULL,
    silent = FALSE,
    intervals = FALSE,
    unsafe = FALSE,
    onUnsupported = c("stop", "ignore"),
    ...) {

  backend <- match.arg(backend, c("OpenMx", "lavaan", "blavaan", "other"))
  if (backend != "OpenMx") {
    stop(sprintf("backend = '%s' is not yet implemented; only 'OpenMx' is currently supported.", backend), call. = FALSE)
  }

  onUnsupported <- match.arg(onUnsupported)

  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }

  if (is.null(model_id)) {
    model_id <- names(graphModel@schema$models)[1]
  }

  # Step 1: Convert to mxModel
  message(sprintf("Building mxModel from schema (model_id = '%s')...", model_id))
  mx_model <- as.MxModel(graphModel, model_id = model_id, onUnsupported = onUnsupported)

  if (is.null(mx_model$data)) {
    stop(
      sprintf(
        paste(
          "Model '%s' has no dataset node, so it has no data to fit against",
          "-- this is a template or simulation model, not a fittable one.",
          "Use generateData() to simulate data from it instead."
        ),
        model_id
      ),
      call. = FALSE
    )
  }

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

  # Capture a snapshot of the data that produced this fit, for
  # reproducibility/staleness checks. Pulled from the model's dataset node;
  # omitted when there is no dataset node (e.g. covariance-only fits).
  data_binding <- NULL
  fit_nodes <- graphModel@schema$models[[model_id]]$nodes
  for (node in fit_nodes) {
    if (!is.null(node$type) && node$type == "dataset") {
      ds <- node$datasetSource
      data_binding <- list(
        datasetLabel = node$label,
        md5 = ds$md5,
        rowCount = ds$rowCount
      )
      # Drop NULL components so optional sub-fields are simply absent
      data_binding <- data_binding[!vapply(data_binding, is.null, logical(1))]
      break
    }
  }

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
  if (!is.null(data_binding) && length(data_binding) > 0) {
    fit_entry$dataBinding <- data_binding
  }
  
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
  
  # Step 6: Update path.value fields with fitted parameter estimates
  # This allows the schema to display fitted values for inspection and export
  if (converged && length(estimates) > 0) {
    model$paths <- lapply(model$paths, function(path) {
      # If this path has a freeParameter label, look up its fitted estimate
      if (!is.null(path$freeParameter) && is.character(path$freeParameter)) {
        param_name <- path$freeParameter
        if (param_name %in% names(estimates)) {
          path$value <- as.numeric(estimates[[param_name]])
        }
      } else if (isTRUE(path$freeParameter)) {
        # For anonymous free parameters (freeParameter = true),
        # the Backend names them; we'd need the OpenMx parameter table to match.
        # For now, skip these (they're not commonly used).
      }
      path
    })
  }
  
  result_model@schema$models[[model_id]] <- model
  
  # Step 7: Cache the fitted model
  result_model@lastBuiltModel <- fit_result
  
  message("Fitting complete.")
  result_model
}

#' Simulate Data from a GraphModel
#'
#' Wrapper around as.MxModel() + mxGenerateData() that simulates data
#' consistent with a GraphModel's structure and parameter values (fixed
#' values, or free parameters at their start values). This is the tool for
#' populating a data-less template/simulation model that runModel() refuses
#' to fit.
#'
#' @param graphModel A GraphModel object to simulate data from
#' @param nrows Integer; number of rows to simulate. Passed through to
#'   mxGenerateData(); see its documentation for the default when omitted.
#' @param backend Character; which backend to simulate with. Currently only
#'   `"OpenMx"` is implemented; see [runModel()] for the same convention.
#' @param returnModel Logical; if `FALSE` (default), returns the simulated
#'   data as a data.frame -- mirroring `mxGenerateData()`'s own default. If
#'   `TRUE`, returns a new GraphModel with the simulated data bound in as a
#'   dataset node, ready to fit with [runModel()], instead of the raw
#'   data.frame.
#' @param model_id Character; which model to simulate from (defaults to first)
#' @param onUnsupported How to handle non-core `extensions$pendingCore` features:
#'   "stop" (default) refuses with an error listing them; "ignore" builds a
#'   reduced model that omits them (with a warning).
#' @param ... Additional arguments passed to mxGenerateData()
#'
#' @return A data.frame of simulated data (`returnModel = FALSE`), or a new
#'   GraphModel with the simulated data bound in (`returnModel = TRUE`).
#'   With `returnModel = TRUE`, original graphModel is unchanged (R's
#'   copy-on-modify semantics).
#'
#' @examples
#' \dontrun{
#' g <- as.GraphModel(schema)  # no dataset node -- a template model
#' df <- generateData(g, nrows = 200)
#'
#' g_with_data <- generateData(g, nrows = 200, returnModel = TRUE)
#' g_fit <- runModel(g_with_data)
#' }
#'
#' @export
generateData <- function(
    graphModel,
    nrows = NULL,
    backend = "OpenMx",
    returnModel = FALSE,
    model_id = NULL,
    onUnsupported = c("stop", "ignore"),
    ...) {

  backend <- match.arg(backend, c("OpenMx", "lavaan", "blavaan", "other"))
  if (backend != "OpenMx") {
    stop(sprintf("backend = '%s' is not yet implemented; only 'OpenMx' is currently supported.", backend), call. = FALSE)
  }

  onUnsupported <- match.arg(onUnsupported)

  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }

  if (is.null(model_id)) {
    model_id <- names(graphModel@schema$models)[1]
  }

  message(sprintf("Building mxModel from schema (model_id = '%s')...", model_id))
  mx_model <- as.MxModel(graphModel, model_id = model_id, onUnsupported = onUnsupported)

  result <- OpenMx::mxGenerateData(mx_model, nrows = nrows, returnModel = returnModel, ...)

  if (isTRUE(returnModel)) {
    return(as.GraphModel(result))
  }

  result
}
