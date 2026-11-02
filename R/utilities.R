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

#' Format a Single pendingCore Entry
#'
#' One-line human-readable descriptor of a pendingCore entry, used in import,
#' export, and conversion messages: "<model>: <kind> (<nativeForm>) [<detail>]".
#'
#' @param model_id The model ID the entry belongs to
#' @param entry A single extensions$pendingCore entry
#'
#' @return A single-length character descriptor
#'
#' @keywords internal
formatPendingEntry <- function(model_id, entry) {
  unwrap <- function(x) if (is.list(x)) unlist(x) else x

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
  desc
}

#' Classify pendingCore Entries for Backend Conversion
#'
#' Assigns each of a model's pendingCore entries a disposition when converting to
#' a backend model:
#' \itemize{
#'   \item \strong{reconstructed} — rebuilt into the backend model by a
#'     reconstructor. No reconstructors exist yet, so this is always empty; the
#'     structure is in place for them to slot in without restructuring callers.
#'   \item \strong{ignored} — explicitly disregarded via \code{onUnsupported =
#'     "ignore"} (the fitted model is reduced).
#'   \item \strong{unhandled} — neither; the caller must refuse.
#' }
#'
#' @param pending A model's extensions$pendingCore list (may be NULL/empty)
#' @param onUnsupported Either "stop" or "ignore"
#'
#' @return A list with elements reconstructed, ignored, unhandled (each a list of
#'   entries)
#'
#' @keywords internal
disposePendingCore <- function(pending, onUnsupported = "stop") {
  result <- list(reconstructed = list(), ignored = list(), unhandled = list())
  if (is.null(pending) || length(pending) == 0) {
    return(result)
  }

  for (entry in pending) {
    # No backend reconstructors yet: every entry is either ignored or unhandled.
    if (identical(onUnsupported, "ignore")) {
      result$ignored[[length(result$ignored) + 1]] <- entry
    } else {
      result$unhandled[[length(result$unhandled) + 1]] <- entry
    }
  }
  result
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

  for (model_id in names(schema$models)) {
    pending <- schema$models[[model_id]]$extensions$pendingCore
    if (is.null(pending) || length(pending) == 0) {
      next
    }
    for (entry in pending) {
      descriptors <- c(descriptors, formatPendingEntry(model_id, entry))
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

# ---- OpenMx names -------------------------------------------------------------
# drawSEM names may use characters OpenMx forbids in names and labels (the
# editor's generated `F->x1` and `C_{x1,x2}`, or a variable `x.1`).
# schemaToOpenMx() gives OpenMx a readable legal name for each (`F_to_x1`,
# `C_{x1_x2}`, `x_1`), and everything that reads OpenMx names back (the fit
# write-back, as.GraphModel() on an MxModel) maps them back. The map is never
# stored: it is recomputed from the drawSEM model (the schema, or the
# drawSemHints fragment escrowed on the MxModel), so it cannot drift. Names
# OpenMx already accepts map to themselves.

# Characters imxVerifyName()/imxVerifyReference() reject, plus "." (the
# model-path separator), square brackets and "," (bracket references).
.MX_ILLEGAL_CHARS <- "[-+!~?:*/^%<>=&|$.,\\[\\]]"
.MX_RESERVED_NAMES <- c("data", "objective", "likelihood", "fitfunction", "expectation", "compute", "one")
# A parameter label may not also name an object in the model: the RAM matrices.
.MX_RESERVED_LABELS <- c(.MX_RESERVED_NAMES, "A", "S", "F", "M")

.mxIsLegalName <- function(x, reserved) {
  nzchar(x) && !grepl(.MX_ILLEGAL_CHARS, x, perl = TRUE) &&
    is.na(suppressWarnings(as.numeric(x))) && !(x %in% reserved)
}

# A readable legal form of an illegal name: arrows become words, any other
# illegal character "_"; a number gets a "v" prefix, a reserved name a "_" suffix.
.mxLegalName <- function(x, reserved) {
  y <- gsub("<->", "_with_", x, fixed = TRUE)
  y <- gsub("->", "_to_", y, fixed = TRUE)
  y <- gsub("<-", "_from_", y, fixed = TRUE)
  y <- gsub(.MX_ILLEGAL_CHARS, "_", y, perl = TRUE)
  y <- gsub("_{2,}", "_", y)
  if (!nzchar(y)) y <- "_"
  if (!is.na(suppressWarnings(as.numeric(y)))) y <- paste0("v", y)
  if (y %in% reserved) y <- paste0(y, "_")
  y
}

# drawSEM name -> OpenMx name for each distinct name in `x` (NA dropped), as a
# named character vector. Legal names keep their own; the others take their
# legal form, suffixed _2, _3, ... where that is taken, in order of `x`. One to
# one, so the map inverts (see .mxNameBack()).
.mxNameMap <- function(x, reserved) {
  x <- unique(as.character(x[!is.na(x)]))
  out <- setNames(x, x)
  legal <- vapply(x, .mxIsLegalName, logical(1), reserved = reserved)
  taken <- x[legal]
  for (name in x[!legal]) {
    base <- .mxLegalName(name, reserved)
    candidate <- base
    k <- 2L
    while (candidate %in% taken) {
      candidate <- paste0(base, "_", k)
      k <- k + 1L
    }
    out[[name]] <- candidate
    taken <- c(taken, candidate)
  }
  out
}

# Map names through `map` (drawSEM -> OpenMx); names not in it, and NA, pass through.
.mxNameTo <- function(x, map) {
  out <- as.character(x)
  hit <- !is.na(out) & out %in% names(map)
  out[hit] <- unname(map[out[hit]])
  out
}

# The inverse: OpenMx names back to drawSEM names.
.mxNameBack <- function(x, map) {
  .mxNameTo(x, setNames(names(map), unname(map)))
}

# The OpenMx names for one schema model: `variables` and `labels` (parameter
# labels, see .mxParamLabels()) as drawSEM -> OpenMx maps, and `model`, the
# model name's map.
.openMxNames <- function(model, model_id = NULL) {
  nodes <- model$nodes %||% list()
  variables <- vapply(
    Filter(function(n) identical(n$type, "variable"), nodes),
    function(n) as.character(n$label), character(1)
  )
  list(
    variables = .mxNameMap(variables, .MX_RESERVED_NAMES),
    labels = .mxNameMap(.mxParamLabels(model$paths %||% list()), .MX_RESERVED_LABELS),
    model = .mxNameMap(model$label %||% model_id %||% "model", .MX_RESERVED_NAMES)
  )
}

# OpenMx parameter labels for `paths`, one per path (NA where none).
# OpenMx constrains every parameter that shares a label to be equal, so only a
# shared named free parameter (freeParameter = the same string) may share one.
# A named free parameter is labelled with its name. Any other path is labelled
# with its display label, made unique where it repeats another path's display
# label or coincides with a named free parameter (suffix _2, _3, ...), so
# display labels never create equality constraints drawSEM did not declare.
.mxParamLabels <- function(paths) {
  is_named <- function(p) is.character(p$freeParameter) && length(p$freeParameter) == 1 && nzchar(p$freeParameter)
  display <- function(p) {
    if (is.character(p$label) && length(p$label) == 1 && nzchar(p$label)) p$label else NA_character_
  }
  is_data <- function(p) isTRUE(p$type == "data") ||
    (!is.null(p$parameterType) && identical(p$parameterType, "dataMapping"))

  named <- unique(unlist(lapply(paths, function(p) if (is_named(p)) p$freeParameter)))
  taken <- unique(c(named, stats::na.omit(vapply(paths, display, character(1)))))
  used <- named
  out <- rep(NA_character_, length(paths))
  for (i in seq_along(paths)) {
    p <- paths[[i]]
    if (is_data(p)) next
    if (is_named(p)) {
      out[[i]] <- p$freeParameter
      next
    }
    lab <- display(p)
    if (is.na(lab)) next
    if (lab %in% used) {
      k <- 2L
      while (paste0(lab, "_", k) %in% c(taken, used)) k <- k + 1L
      lab <- paste0(lab, "_", k)
    }
    used <- c(used, lab)
    out[[i]] <- lab
  }
  out
}

#' Build Path List for mxModel
#'
#' Converts schema paths to a list of mxPath specifications.
#'
#' @param paths List of path specifications
#' @param constantNodeLabels Character vector of every constant node label in the
#'   model (see [getConstantNodeLabels()]). May be `NULL` or `character(0)` when
#'   the model has no constant nodes.
#' @param parameterTypes The model's `optimization$parameterTypes` (named list of
#'   per-type defaults `{prior, bounds, start}`), or `NULL`.
#'
#' @details
#' Bounds and starting values follow the schema's cascade: a path's own
#' `optimization` value wins over its `parameterType`'s default (see
#' `.resolvePathBounds()` and `.resolvePathStart()`). Priors are never applied
#' (OpenMx is frequentist). A `parameterType` not defined in `parameterTypes`
#' contributes no defaults (no warning: imported and editor-built models
#' routinely carry type names without definitions).
#'
#' @return A list of path specifications, ready for mxPath()
#'
#' @keywords internal
buildPathList <- function(paths, constantNodeLabels = character(0),
                          parameterTypes = NULL) {
  constantNodeLabels <- as.character(constantNodeLabels %||% character(0))
  paths_list <- list()
  param_labels <- .mxParamLabels(paths)

  for (i in seq_along(paths)) {
    path <- paths[[i]]
    # Skip data paths (dataset→variable mappings, no structural mxPath entry)
    if (isTRUE(path$type == "data") ||
        (!is.null(path$parameterType) && path$parameterType == "dataMapping")) {
      next
    }

    # (0-headed paths never reach here: they are relocated to
    # extensions$pendingCore on import and refused/ignored at conversion time.)

    # Get from/to labels
    from_label <- path$from
    to_label <- path$to
    
    # Convert any constant node label to "one" for mxPath. Only the `from` side
    # is translated: constant nodes are sources only (the editor rejects them as
    # path destinations), and OpenMx has no representation for a path into the
    # unit constant.
    if (length(constantNodeLabels) > 0 && from_label %in% constantNodeLabels) {
      from_label <- "one"
    }
    
    # Parameter label for mxPath (see .mxParamLabels())
    param_name <- param_labels[[i]]
    
    # Determine free/fixed: freeParameter = TRUE or non-empty string means free; absent means fixed
    is_free <- isTRUE(path$freeParameter) || (is.character(path$freeParameter) && nzchar(path$freeParameter))

    type_defaults <- .pathTypeDefaults(path, parameterTypes)

    # Starting value. For a free path the cascade is path optimization$start >
    # parameterType start > path$value. A fixed path's value is model content,
    # not a starting value, so `start` never overrides it.
    start_value <- if (is_free) .resolvePathStart(path, type_defaults) else NULL
    if (is.null(start_value)) {
      start_value <- if (!is.null(path$value)) path$value else NA
    }
    
    # If free parameter with no/null value, use default 0.1
    if (is_free && (is.na(start_value) || is.null(start_value))) {
      start_value <- 0.1
    }
    # A fixed path with no value takes the schema's default value (1.0)
    if (!is_free && (is.null(start_value) || is.na(start_value))) {
      start_value <- .pathValueDefault()
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
    
    # Add bounds if present (per-path bounds, else the parameterType default)
    bounds <- .resolvePathBounds(path, type_defaults)
    if (!is.null(bounds)) {
      path_spec$bounds <- bounds
    }
    
    paths_list[[length(paths_list) + 1]] <- path_spec
  }
  
  paths_list
}

#' Parameter-type defaults for a path
#'
#' Looks up `path$parameterType` in the model's `parameterTypes`. Returns `NULL`
#' when the path has no type or the type is not defined.
#'
#' @keywords internal
#' @noRd
.pathTypeDefaults <- function(path, parameterTypes) {
  type <- path$parameterType
  if (is.null(parameterTypes) || !is.character(type) || length(type) != 1 ||
      is.na(type) || !nzchar(type) || !(type %in% names(parameterTypes))) {
    return(NULL)
  }
  defaults <- parameterTypes[[type]]
  if (is.list(defaults)) defaults else NULL
}

#' Resolve a path's bounds through the parameterType cascade
#'
#' The `[lower, upper]` pair is the unit of the cascade: a per-path
#' `optimization$bounds` array replaces the type's array wholesale (it is not
#' merged element by element). Within the chosen pair, a `null`/`NA` element
#' means unbounded on that side. An explicit per-path `bounds: null` makes the
#' path unbounded, overriding the type's bounds; only an absent `bounds` key
#' falls through to the type default (developer decision 2026-10-22). Schemas
#' are read with `simplifyVector = FALSE`, so an explicit null is a present key
#' with a NULL value.
#'
#' @return The chosen bounds (list or vector of length 2), or `NULL`.
#'
#' @keywords internal
#' @noRd
.resolvePathBounds <- function(path, type_defaults) {
  opt <- path$optimization
  if (is.list(opt) && "bounds" %in% names(opt)) return(opt$bounds)
  type_defaults$bounds
}

#' Resolve a free path's starting value through the parameterType cascade
#'
#' Path `optimization$start` wins over the parameterType's `start`. At either
#' level only a finite number counts as set; `"auto"`, `null`/`NA` or any other
#' string means "not set at this level" and falls through. Returns `NULL` when
#' neither level sets a number (the caller then uses `path$value`).
#'
#' @keywords internal
#' @noRd
.resolvePathStart <- function(path, type_defaults) {
  numeric_start <- function(x) {
    if (is.list(x) && length(x) == 1) x <- x[[1]]
    if (is.numeric(x) && length(x) == 1 && is.finite(x)) as.numeric(x) else NULL
  }
  path_start <- if (is.list(path$optimization)) numeric_start(path$optimization$start) else NULL
  if (!is.null(path_start)) return(path_start)
  numeric_start(type_defaults$start)
}

#' Get Constant Node Labels
#'
#' Finds every constant node in a list of nodes and returns their labels. A model
#' may carry more than one constant node (node labels are unique, so additional
#' constants carry distinct labels such as `"1b"`); all of them contribute to the
#' means model and all are translated to OpenMx's `"one"` when building mxPaths.
#'
#' @param nodes List of node specifications
#'
#' @return A character vector of constant node labels, `character(0)` if none
#'
#' @keywords internal
getConstantNodeLabels <- function(nodes) {
  labels <- vapply(
    nodes,
    function(node) {
      if (isTRUE(node$type == "constant")) as.character(node$label %||% NA) else NA_character_
    },
    character(1)
  )

  unique(as.character(labels[!is.na(labels)]))
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

