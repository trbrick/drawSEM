#' Rename Data.Frame Columns to Match Variable Names
#'
#' Maps CSV column names to variable node IDs in the schema.
#'
#' @param df A data.frame to rename
#' @param mapping A named list: names are variable IDs, values are CSV column names
#'
#' @return The data.frame with only mapped columns, renamed to match variable IDs
#'
#' @keywords internal
renameDataColumns <- function(df, mapping) {
  if (length(mapping) == 0) {
    return(df[, 0, drop = FALSE])  # Return empty data.frame with 0 columns
  }
  
  # Select only mapped columns and rename them
  mapped_cols <- unlist(mapping)
  
  # Check that all mapped columns exist
  missing_cols <- setdiff(mapped_cols, names(df))
  if (length(missing_cols) > 0) {
    stop(
      sprintf(
        "Data columns not found: %s",
        paste(missing_cols, collapse = ", ")
      ),
      call. = FALSE
    )
  }
  
  # Select columns and create new data.frame with renamed columns
  result <- df[, mapped_cols, drop = FALSE]
  names(result) <- names(mapping)
  
  result
}

#' Infer Manifest Variables from Nodes and Paths
#'
#' A variable is manifest if it has variableCharacteristics$manifestLatent="manifest"
#' or (if not explicitly set) has incoming paths from dataset nodes.
#'
#' @param nodes List of node specifications
#' @param paths List of path specifications
#'
#' @return Character vector of manifest variable labels
#'
#' @keywords internal
inferManifestVariables <- function(nodes, paths) {
  # Find dataset node labels
  dataset_labels <- sapply(
    nodes,
    function(n) if (n$type == "dataset") n$label else NULL
  )
  dataset_labels <- dataset_labels[!sapply(dataset_labels, is.null)]
  dataset_labels <- as.character(dataset_labels)
  
  # Build set of manifest variables from:
  # 1. Explicit variableCharacteristics$manifestLatent="manifest" 
  # 2. Inferred from incoming dataMapping paths
  manifest <- sapply(
    nodes,
    function(n) {
      # Check if explicitly set
      if (n$type == "variable") {
        vc <- n$variableCharacteristics
        if (!is.null(vc) && !is.null(vc$manifestLatent) && vc$manifestLatent == "manifest") {
          return(n$label)
        }
      }
      NULL
    }
  )
  
  manifest <- manifest[!sapply(manifest, is.null)]
  explicit_manifest <- unique(as.character(manifest))
  
  # Find variables with incoming dataMapping paths FROM dataset nodes
  inferred_manifest <- sapply(
    paths,
    function(p) {
      # Detect data paths by explicit type or by source being a dataset node
      if (p$from %in% dataset_labels &&
          (isTRUE(p$type == "data") ||
           (!is.null(p$parameterType) && p$parameterType == "dataMapping"))) {
        p$to
      } else {
        NULL
      }
    }
  )
  
  inferred_manifest <- inferred_manifest[!sapply(inferred_manifest, is.null)]
  inferred_manifest <- unique(as.character(inferred_manifest))
  
  # Combine explicit and inferred
  unique(c(explicit_manifest, inferred_manifest))
}

#' Infer Latent Variables from Nodes and Manifest Variables
#'
#' A variable is latent if it has variableCharacteristics$manifestLatent="latent"
#' or (if not explicitly set) is not in the manifest set.
#'
#' @param nodes List of node specifications
#' @param manifest_vars Character vector of manifest variable labels
#'
#' @return Character vector of latent variable labels
#'
#' @keywords internal
inferLatentVariables <- function(nodes, manifest_vars) {
  # All variable nodes that are either explicitly latent or not manifest
  latent <- sapply(
    nodes,
    function(n) {
      if (n$type == "variable") {
        # Check if explicitly set to latent
        vc <- n$variableCharacteristics
        if (!is.null(vc) && !is.null(vc$manifestLatent) && vc$manifestLatent == "latent") {
          return(n$label)
        }
        # Otherwise, latent if not in manifest set
        if (!(n$label %in% manifest_vars)) {
          return(n$label)
        }
      }
      NULL
    }
  )
  
  latent <- latent[!sapply(latent, is.null)]
  unique(as.character(latent))
}

#' Collect Unsupported Features from Schema
#'
#' Identifies features not yet implemented in v0.1.
#'
#' @param schema The schema list
#'
#' @return A list with boolean flags for each unsupported feature type
#'
#' @keywords internal
collectUnsupportedFeatures <- function(schema) {
  unsupported <- list(
    zeroHeadedPaths = FALSE,
    linkFunctions = FALSE,
    operators = FALSE,
    priors = FALSE
  )
  
  # Iterate through all models
  for (model in schema$models) {
    # Check for 0-headed paths (guard against NULL for type='data' paths)
    for (path in model$paths) {
      if (!is.null(path$numberOfArrows) && path$numberOfArrows == 0) {
        unsupported$zeroHeadedPaths <- TRUE
        break
      }
    }
    
    # Check for link function and operator nodes
    for (node in model$nodes) {
      if (node$type == "linkFunction") {
        unsupported$linkFunctions <- TRUE
      }
      if (node$type == "operator") {
        unsupported$operators <- TRUE
      }
    }
    
    # Check for priors
    for (path in model$paths) {
      if (!is.null(path$optimization) && !is.null(path$optimization$prior)) {
        unsupported$priors <- TRUE
        break
      }
    }
  }
  
  unsupported
}

#' Relocate Non-Core Elements into extensions$pendingCore
#'
#' Moves elements that the core schema cannot represent (0-headed paths;
#' `linkFunction` / `operator` nodes) out of each model's core `nodes`/`paths`
#' and into `model$extensions$pendingCore`, preserving them verbatim for lossless
#' round-trip. The cleaned core then validates strictly and the rest of the model
#' still loads and renders. When a node is relocated, any path incident to it is
#' relocated too, so the cleaned core has no dangling `from`/`to` references.
#'
#' Priors are intentionally NOT relocated: they are schema-valid core content
#' (`optimization.prior`) that the OpenMx backend simply does not apply. They are
#' the "not applicable" warning tier, handled by the converter, not pendingCore.
#'
#' @param schema The schema list
#'
#' @return The schema with unsupported elements moved to extensions$pendingCore
#'
#' @keywords internal
extractPendingCore <- function(schema) {
  if (is.null(schema$models)) {
    return(schema)
  }

  for (model_id in names(schema$models)) {
    model <- schema$models[[model_id]]
    pending <- list()

    # Unsupported nodes (linkFunction / operator): relocate the node and remember
    # its label so incident paths can be relocated with it.
    removed_node_labels <- character(0)
    keep_nodes <- list()
    for (node in model$nodes) {
      if (!is.null(node$type) && node$type %in% c("linkFunction", "operator")) {
        pending[[length(pending) + 1]] <- list(kind = node$type, object = node)
        if (!is.null(node$label)) {
          removed_node_labels <- c(removed_node_labels, node$label)
        }
      } else {
        keep_nodes[[length(keep_nodes) + 1]] <- node
      }
    }

    # Unsupported paths: 0-headed (OpenMx's structure for Pearson selection) plus
    # any path incident to a relocated node.
    keep_paths <- list()
    for (path in model$paths) {
      is_zero_headed <- !is.null(path$numberOfArrows) && path$numberOfArrows == 0
      touches_removed <-
        (!is.null(path$from) && path$from %in% removed_node_labels) ||
        (!is.null(path$to) && path$to %in% removed_node_labels)

      if (is_zero_headed) {
        pending[[length(pending) + 1]] <- list(
          kind = "selection",
          origin = list(nativeForm = "zeroHeadedPath"),
          object = path
        )
      } else if (touches_removed) {
        pending[[length(pending) + 1]] <- list(kind = "incidentPath", object = path)
      } else {
        keep_paths[[length(keep_paths) + 1]] <- path
      }
    }

    if (length(pending) > 0) {
      model$nodes <- keep_nodes
      model$paths <- keep_paths
      existing <- model$extensions$pendingCore
      if (is.null(existing)) existing <- list()
      model$extensions$pendingCore <- c(existing, pending)
      schema$models[[model_id]] <- model
    }
  }

  schema
}

#' Summarize pendingCore Entries
#'
#' Builds human-readable one-line descriptors of every extensions$pendingCore
#' entry across all models, for import/export warnings so the user can judge
#' whether subsequent model edits may have invalidated them.
#'
#' @param schema The schema list
#'
#' @return Character vector of descriptors (empty if none)
#'
#' @keywords internal
summarizePendingCore <- function(schema) {
  descriptors <- character(0)
  if (is.null(schema$models)) {
    return(descriptors)
  }

  unwrap <- function(x) if (is.list(x)) unlist(x) else x

  for (model_id in names(schema$models)) {
    pending <- schema$models[[model_id]]$extensions$pendingCore
    if (is.null(pending) || length(pending) == 0) {
      next
    }

    for (entry in pending) {
      kind <- entry$kind %||% "unknown"
      # origin may be absent, a proper list, or (on legacy files) collapsed to an
      # atomic by JSON normalization; only read nativeForm when it is a list.
      native <- if (is.list(entry$origin)) unwrap(entry$origin$nativeForm) else NULL
      obj <- entry$object

      # Identifying detail from the verbatim object: edge for paths, label for nodes.
      from <- unwrap(obj$from)
      to <- unwrap(obj$to)
      lbl <- unwrap(obj$label)
      detail <- if (!is.null(from) && !is.null(to)) {
        sprintf("%s -> %s", from, to)
      } else if (!is.null(lbl)) {
        as.character(lbl)
      } else {
        NULL
      }

      desc <- sprintf("%s: %s", model_id, kind)
      if (!is.null(native)) desc <- sprintf("%s (%s)", desc, native)
      if (!is.null(detail)) desc <- sprintf("%s [%s]", desc, detail)
      descriptors <- c(descriptors, desc)
    }
  }

  descriptors
}

#' Stamp the Exporter onto pendingCore Entries
#'
#' Records, on each extensions$pendingCore entry's `origin`, the tool and version
#' that serialized it into the file. This is the writer (last-writer-wins), which
#' may differ from the originating tool and can affect how the feature is
#' represented. Operates on and returns a `models` list copy; does not mutate the
#' caller's object.
#'
#' @param models The schema's `models` list
#' @param tool Exporter tool name (default "drawSEM")
#' @param version Exporter version; resolved from the installed package if NULL
#'
#' @return The `models` list with `origin$exporter` set on each pendingCore entry
#'
#' @keywords internal
stampExporter <- function(models, tool = "drawSEM", version = NULL) {
  if (is.null(version)) {
    version <- tryCatch(
      as.character(utils::packageVersion("drawSEM")),
      error = function(e) NA_character_
    )
  }
  for (model_id in names(models)) {
    pending <- models[[model_id]]$extensions$pendingCore
    if (is.null(pending) || length(pending) == 0) {
      next
    }
    for (k in seq_along(pending)) {
      origin <- pending[[k]]$origin
      if (!is.list(origin)) origin <- list()
      origin$exporter <- list(tool = tool, version = version)
      pending[[k]]$origin <- origin
    }
    models[[model_id]]$extensions$pendingCore <- pending
  }
  models
}

#' Warn About pendingCore Features
#'
#' Emits a single warning listing every extensions$pendingCore entry so the user
#' can judge whether model edits may have invalidated them. No-op if none.
#'
#' @param schema The schema list
#' @param context Short lead-in for the message (e.g. "Imported", "Exported")
#'
#' @return Invisibly TRUE if a warning was emitted, FALSE otherwise
#'
#' @keywords internal
warnPendingCore <- function(schema, context) {
  pc <- summarizePendingCore(schema)
  if (length(pc) == 0) {
    return(invisible(FALSE))
  }
  warning(
    sprintf(
      paste0(
        "%s model carries %d pendingCore feature(s), stored verbatim outside ",
        "the core model:\n  - %s\nThese are not part of the fitted core and ",
        "pass through unchanged; if you have edited the model, verify they are ",
        "still valid."
      ),
      context, length(pc), paste(pc, collapse = "\n  - ")
    ),
    call. = FALSE
  )
  invisible(TRUE)
}

#' Store Optimization Metadata
#'
#' Extracts bounds and priors from paths for later application.
#'
#' @param paths List of path specifications
#'
#' @return A list of parameter metadata
#'
#' @keywords internal
storeOptimizationMetadata <- function(paths) {
  metadata <- list(
    bounds = list(),
    priors = list()
  )
  
  for (i in seq_along(paths)) {
    path <- paths[[i]]
    
    # Skip data paths (no parameter semantics)
    if (isTRUE(path$type == "data") ||
        (!is.null(path$parameterType) && path$parameterType == "dataMapping")) {
      next
    }
    
    # Store bounds if present
    if (!is.null(path$optimization) && !is.null(path$optimization$bounds)) {
      metadata$bounds[[i]] <- path$optimization$bounds
    }
    
    # Store prior if present
    if (!is.null(path$optimization) && !is.null(path$optimization$prior)) {
      metadata$priors[[i]] <- path$optimization$prior
    }
  }
  
  metadata
}

#' Build Path List for mxModel
#'
#' Converts schema paths to a list of mxPath specifications.
#'
#' @param paths List of path specifications
#' @param constantNodeLabel Label of the constant node (if any)
#'
#' @return A list of path specifications, ready for mxPath()
#'
#' @keywords internal
buildPathList <- function(paths, constantNodeLabel = NULL) {
  paths_list <- list()
  
  for (path in paths) {
    # Skip data paths (dataset→variable mappings, no structural mxPath entry)
    if (isTRUE(path$type == "data") ||
        (!is.null(path$parameterType) && path$parameterType == "dataMapping")) {
      next
    }

    # Skip 0-headed paths (OpenMx selection operator; unsupported in schema)
    if (!is.null(path$numberOfArrows) && path$numberOfArrows == 0) {
      next
    }
    
    # Get from/to labels
    from_label <- path$from
    to_label <- path$to
    
    # Convert constant node label to "one" for mxPath
    if (!is.null(constantNodeLabel) && from_label == constantNodeLabel) {
      from_label <- "one"
    }
    
    # Parameter label for mxPath:
    # - named free parameter (freeParameter is a non-empty string): use it as the
    #   equality-constraint label in OpenMx
    # - anonymous free or fixed: fall back to path$label (display label), else NA
    param_name <- if (is.character(path$freeParameter) && nzchar(path$freeParameter)) {
      path$freeParameter
    } else if (!is.null(path$label) && is.character(path$label) && nzchar(path$label)) {
      path$label
    } else {
      NA
    }
    
    # Extract starting value
    start_value <- if (!is.null(path$value)) path$value else NA
    
    # Determine free/fixed: freeParameter = TRUE or non-empty string means free; absent means fixed
    is_free <- isTRUE(path$freeParameter) || (is.character(path$freeParameter) && nzchar(path$freeParameter))
    
    # If free parameter with no/null value, use default 0.1
    if (is_free && (is.na(start_value) || is.null(start_value))) {
      start_value <- 0.1
    }
    
    # Build path specification
    path_spec <- list(
      from = from_label,
      to = to_label,
      arrows = path$numberOfArrows,
      labels = param_name,
      values = start_value,
      free = is_free
    )
    
    # Add bounds if present
    if (!is.null(path$optimization) && !is.null(path$optimization$bounds)) {
      path_spec$bounds <- path$optimization$bounds
    }
    
    paths_list[[length(paths_list) + 1]] <- path_spec
  }
  
  paths_list
}

#' Get Constant Node Label
#'
#' Finds the constant node in a list of nodes and returns its label.
#'
#' @param nodes List of node specifications
#'
#' @return The label of the constant node (or NULL if none found)
#'
#' @keywords internal
getConstantNodeLabel <- function(nodes) {
  for (node in nodes) {
    if (node$type == "constant") {
      return(node$label)
    }
  }
  
  NULL
}

#' NULL Coalescing Operator
#'
#' Returns the left side if it's not NULL, otherwise returns the right side.
#'
#' @param x Left side value
#' @param y Right side value (default if x is NULL)
#'
#' @return x if x is not NULL, otherwise y
#'
#' @keywords internal
#' @noRd
`%||%` <- function(x, y) {
  if (is.null(x)) y else x
}

