# GraphModel verb DSL -- functions for building and editing a GraphModel's
# schema directly from R. See ai-workflow/TASKS.md ("GraphModel verb DSL --
# full redesign") for the settled design this implements. No file-level doc
# topic here deliberately -- an earlier `?GraphModel-verbs` index topic was
# retired as hard to discover and not worth maintaining; see the per-function
# docs and (eventually) the package-level index instead.

# TRUE if `x` is the "unchanged" sentinel for a change*() "new value"
# argument: a single NA. Applies only to change*() arguments whose role is
# "the new value of an existing field", where FALSE separately means "clear
# this field" -- not to add*() verbs' optional fields (no prior state to
# protect, NULL is fine there) or to lookup/filter arguments (no "clear"
# concept applies to a filter).
.isUnchanged <- function(x) length(x) == 1 && is.na(x)

# Apply addTags/removeTags to an existing tags vector, honoring `strict`.
# Shared by changePath()/changeVariable()/changeData(). Returns NULL (not
# character(0)) when the result is empty, so absence stays meaningful the
# same way it does for freeParameter/description elsewhere in this file.
.applyTagChanges <- function(currentTags, addTags, removeTags, strict, subjectLabel) {
  currentTags <- currentTags %||% character(0)
  if (!is.null(addTags)) {
    if (strict) {
      dup <- intersect(addTags, currentTags)
      if (length(dup) > 0) {
        stop(sprintf(
          "%s already tagged: %s. Use strict = FALSE to ignore.",
          subjectLabel, paste(dup, collapse = ", ")
        ), call. = FALSE)
      }
    }
    currentTags <- union(currentTags, addTags)
  }
  if (!is.null(removeTags)) {
    if (strict) {
      missing <- setdiff(removeTags, currentTags)
      if (length(missing) > 0) {
        stop(sprintf(
          "%s not tagged: %s. Use strict = FALSE to ignore.",
          subjectLabel, paste(missing, collapse = ", ")
        ), call. = FALSE)
      }
    }
    currentTags <- setdiff(currentTags, removeTags)
  }
  if (length(currentTags) == 0) NULL else currentTags
}

# Determine whether a path matches a from/to/numberOfArrows filter, treating
# from/to as an unordered pair when numberOfArrows == 2 (a covariance path
# has no inherent direction) and order-sensitive otherwise. Internal helper
# shared by paths(), and (via .findPathIndices()) the mutation verbs -- so
# the symmetry rule lives in exactly one place. Mirrors the fix applied to
# pathKey() in R/io.R, which has the same rule but is a separate, private
# closure there (drawSemHints round-trip vs. this DSL).
.pathMatchesFilter <- function(p, from = NULL, to = NULL, numberOfArrows = NULL) {
  # Numeric equality (==), not identical(): numberOfArrows may be stored as
  # integer (addPath()/convertPath() coerce via as.integer()) or double (a
  # hand-written literal, or a value parsed from JSON) depending on how the
  # path was created. identical(2L, 2) is FALSE in R, so using it here would
  # make an entirely correct-looking filter call silently fail to match.
  if (!is.null(numberOfArrows)) {
    if (is.null(p$numberOfArrows) || !isTRUE(p$numberOfArrows == numberOfArrows)) {
      return(FALSE)
    }
  }
  if (is.null(from) && is.null(to)) {
    return(TRUE)
  }
  symmetric <- isTRUE((p$numberOfArrows %||% NA) == 2)
  if (symmetric) {
    endpoints <- c(p$from, p$to)
    if (!is.null(from) && !is.null(to)) {
      return(setequal(c(from, to), endpoints))
    }
    if (!is.null(from)) {
      return(from %in% endpoints)
    }
    return(to %in% endpoints)
  }
  (is.null(from) || identical(p$from, from)) && (is.null(to) || identical(p$to, to))
}

# Indices of every STRUCTURAL path in `pathList` matching the given filter.
# Internal helper used only by the structural path verbs (addPath,
# removePath, changePath, convertPath) -- never by paths(), which must still
# surface non-structural (e.g. type: "data") paths when browsing. Excludes
# any entry lacking numberOfArrows, rather than checking `type != "data"`
# specifically, so it generalizes to any future non-structural path kind
# (operator operands, link functions) without a new exclusion each time.
.findPathIndices <- function(pathList, from = NULL, to = NULL, numberOfArrows = NULL) {
  which(vapply(pathList, function(p) {
    !is.null(p$numberOfArrows) && .pathMatchesFilter(p, from = from, to = to, numberOfArrows = numberOfArrows)
  }, logical(1)))
}

# TRUE if a non-structural (no numberOfArrows) path exists between from/to --
# used to give a specific, redirecting error instead of a generic "not
# found" when someone tries to touch a data connection through the
# structural path verbs.
.dataPathEndpointsExist <- function(pathList, from, to) {
  any(vapply(pathList, function(p) {
    is.null(p$numberOfArrows) && identical(p$from, from) && identical(p$to, to)
  }, logical(1)))
}

# Absence/ambiguity error shared by removePath() and changePath(). Checks
# for a same-endpoints data connection first, to redirect rather than give a
# generic "not found" when that's what actually happened.
.pathLookupError <- function(pathList, idx, from, to, numberOfArrows) {
  if (length(idx) == 0) {
    if (.dataPathEndpointsExist(pathList, from, to)) {
      stop(sprintf(
        "'%s' to '%s' is a data connection, not a structural path -- use connectData()/disconnectData()/reconnectData() instead.",
        from, to
      ), call. = FALSE)
    }
    stop(sprintf(
      "No path found between '%s' and '%s'%s.",
      from, to,
      if (is.null(numberOfArrows)) "" else sprintf(" with numberOfArrows = %d", numberOfArrows)
    ), call. = FALSE)
  }
  if (length(idx) > 1) {
    stop(sprintf(
      "Ambiguous: %d paths found between '%s' and '%s'. Specify numberOfArrows to disambiguate.",
      length(idx), from, to
    ), call. = FALSE)
  }
}

#' List Nodes Matching a Filter
#'
#' Returns every node in `graphModel`'s (first) model matching the given
#' filter, as a plain list -- always a list, whether zero, one, or many
#' nodes match. There is no single-match "give me the one" form: verbs like
#' [changePath()] that need to act on exactly one target perform and assert
#' that lookup internally, rather than this general-purpose browsing
#' accessor guessing what count the caller expects.
#'
#' @param graphModel A `GraphModel` object.
#' @param label Character or `NULL`. If supplied, only nodes with this exact
#'   label are returned.
#' @param type Character or `NULL`. If supplied, only nodes of this `type`
#'   (`"variable"`, `"constant"`, or `"dataset"`) are returned.
#'
#' @return A list of node objects (each itself a list), possibly empty.
#'
#' @examples
#' \dontrun{
#' nodes(gm)                       # every node
#' nodes(gm, label = "F1")         # the node labeled F1 (list of length <= 1)
#' nodes(gm, type = "variable")    # every variable node
#' }
#'
#' @export
nodes <- function(graphModel, label = NULL, type = NULL) {
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  first_model <- graphModel@schema$models[[1]]
  if (is.null(first_model) || is.null(first_model$nodes)) {
    return(list())
  }
  Filter(function(n) {
    (is.null(label) || identical(n$label, label)) &&
      (is.null(type) || identical(n$type, type))
  }, first_model$nodes)
}

#' List Paths Matching a Filter
#'
#' Returns every path in `graphModel`'s (first) model matching the given
#' filter, as a plain list -- always a list, whether zero, one, or many
#' paths match (see [nodes()] for why this doesn't try to collapse to a
#' bare object). `numberOfArrows == 2` (covariance) paths are matched
#' treating `from`/`to` as an unordered pair, since such a path has no
#' inherent direction; `numberOfArrows == 1` (directed) paths are matched
#' order-sensitively, so `from = "A", to = "B"` never matches a `B -> A`
#' path. Unlike the structural path verbs, this surfaces every path
#' including non-structural (e.g. `type: "data"`) ones.
#'
#' @param graphModel A `GraphModel` object.
#' @param from Character or `NULL`. Filter by endpoint label.
#' @param to Character or `NULL`. Filter by endpoint label.
#' @param numberOfArrows Integer or `NULL`. Filter by arrow count.
#'
#' @return A list of path objects (each itself a list), possibly empty.
#'
#' @examples
#' \dontrun{
#' paths(gm)                                   # every path
#' paths(gm, from = "F1", to = "F2")           # matches either arrow direction/type
#' paths(gm, from = "F1", to = "F2", numberOfArrows = 2)
#' }
#'
#' @export
paths <- function(graphModel, from = NULL, to = NULL, numberOfArrows = NULL) {
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  first_model <- graphModel@schema$models[[1]]
  if (is.null(first_model) || is.null(first_model$paths)) {
    return(list())
  }
  Filter(function(p) {
    .pathMatchesFilter(p, from = from, to = to, numberOfArrows = numberOfArrows)
  }, first_model$paths)
}

#' Add a Variable Node to a GraphModel
#'
#' Adds a new `variable` node. Manifest/latent status is inferred from data
#' connections unless explicitly overridden via `manifestLatent`, matching
#' the schema's usual inference rule (see [setManifestLatent()]).
#'
#' @param graphModel A `GraphModel` object to modify.
#' @param label Character. The label for the new variable node. Must be
#'   unique within the model.
#' @param manifestLatent Character or `NULL`. One of `"manifest"` or
#'   `"latent"` to explicitly lock the node's status, or `NULL` (default) to
#'   leave it inferred from structure.
#' @param description Character or `NULL`. An optional human-readable
#'   description for the node.
#' @param tags Character vector or `NULL`. Optional tags for the node.
#'
#' @return The modified `graphModel` object (invisibly).
#'
#' @export
addVariable <- function(graphModel, label, manifestLatent = NULL, description = NULL, tags = NULL) {
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  if (!is.character(label) || length(label) != 1 || nchar(label) == 0) {
    stop("label must be a single non-empty character string", call. = FALSE)
  }
  if (!is.null(manifestLatent) && !manifestLatent %in% c("manifest", "latent")) {
    stop('manifestLatent must be "manifest", "latent", or NULL', call. = FALSE)
  }
  if (!is.null(tags) && !is.character(tags)) {
    stop("tags must be a character vector or NULL", call. = FALSE)
  }

  first_model <- graphModel@schema$models[[1]]
  if (is.null(first_model)) {
    stop("graphModel has no models to add a variable to", call. = FALSE)
  }
  existing_labels <- vapply(first_model$nodes, function(n) as.character(n$label), character(1))
  if (label %in% existing_labels) {
    stop(sprintf("A node with label '%s' already exists", label), call. = FALSE)
  }

  new_node <- list(label = label, type = "variable")
  if (!is.null(manifestLatent)) {
    new_node$variableCharacteristics <- list(manifestLatent = manifestLatent)
  }
  if (!is.null(description)) {
    new_node$description <- description
  }
  if (!is.null(tags)) {
    new_node$tags <- tags
  }

  first_model$nodes[[length(first_model$nodes) + 1]] <- new_node
  graphModel@schema$models[[1]] <- first_model
  invisible(graphModel)
}

#' Remove a Variable Node from a GraphModel
#'
#' Removing a node also removes any paths incident to it (there is no valid
#' schema state where a path references a node that no longer exists), with
#' a warning naming how many were removed.
#'
#' @param graphModel A `GraphModel` object to modify.
#' @param label Character. The label of the variable node to remove.
#'
#' @return The modified `graphModel` object (invisibly).
#'
#' @export
removeVariable <- function(graphModel, label) {
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  if (!is.character(label) || length(label) != 1 || nchar(label) == 0) {
    stop("label must be a single non-empty character string", call. = FALSE)
  }

  first_model <- graphModel@schema$models[[1]]
  if (is.null(first_model)) {
    stop("graphModel has no models to remove a variable from", call. = FALSE)
  }
  node_idx <- which(vapply(first_model$nodes, function(n) {
    identical(n$label, label) && identical(n$type, "variable")
  }, logical(1)))
  if (length(node_idx) == 0) {
    stop(sprintf("No variable node found with label '%s'", label), call. = FALSE)
  }

  incident <- vapply(
    first_model$paths,
    function(p) identical(p$from, label) || identical(p$to, label),
    logical(1)
  )
  if (any(incident)) {
    warning(sprintf(
      "Removing node '%s' also removed %d incident path(s)", label, sum(incident)
    ), call. = FALSE)
  }

  first_model$nodes[[node_idx]] <- NULL
  first_model$paths <- first_model$paths[!incident]

  graphModel@schema$models[[1]] <- first_model
  invisible(graphModel)
}

#' Change an Existing Variable Node
#'
#' `manifestLatent` and `description` each follow the convention: `NA`
#' (default) leaves the field unchanged, `FALSE` clears it, any other legal
#' value sets it. `manifestLatent` delegates to the existing
#' [setManifestLatent()] (its validation -- promoting to manifest requires an
#' existing incoming data path -- is not reimplemented here).
#'
#' @param graphModel A `GraphModel` object to modify.
#' @param label Character. The label of the variable node to change.
#' @param manifestLatent `NA` (unchanged, default), `FALSE` (clear the lock,
#'   revert to inference), or `"manifest"`/`"latent"` (set).
#' @param description `NA` (unchanged, default), `FALSE` (clear), or a
#'   character string (set).
#' @param addTags Character vector or `NULL`. Tags to ensure are present.
#' @param removeTags Character vector or `NULL`. Tags to ensure are absent.
#' @param strict Logical, default `FALSE`. If `TRUE`, `addTags`/`removeTags`
#'   error when a tag is already present/absent instead of silently doing
#'   nothing for that tag.
#'
#' @return The modified `graphModel` object (invisibly).
#'
#' @export
changeVariable <- function(graphModel, label, manifestLatent = NA, description = NA,
                            addTags = NULL, removeTags = NULL, strict = FALSE) {
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  if (.isUnchanged(manifestLatent) && .isUnchanged(description) &&
        is.null(addTags) && is.null(removeTags)) {
    stop("changeVariable() requires at least one of manifestLatent, description, addTags, or removeTags to change", call. = FALSE)
  }

  if (!.isUnchanged(manifestLatent)) {
    if (isFALSE(manifestLatent)) {
      graphModel <- setManifestLatent(graphModel, label, value = NULL)
    } else {
      if (!isTRUE(manifestLatent %in% c("manifest", "latent"))) {
        stop('manifestLatent must be "manifest", "latent", FALSE, or NA', call. = FALSE)
      }
      graphModel <- setManifestLatent(graphModel, label, value = manifestLatent)
    }
  }

  first_model <- graphModel@schema$models[[1]]
  if (is.null(first_model)) {
    stop("graphModel has no models to change a variable in", call. = FALSE)
  }
  node_idx <- which(vapply(first_model$nodes, function(n) {
    identical(n$label, label) && identical(n$type, "variable")
  }, logical(1)))
  if (length(node_idx) == 0) {
    stop(sprintf("No variable node found with label '%s'", label), call. = FALSE)
  }
  node <- first_model$nodes[[node_idx]]

  if (!.isUnchanged(description)) {
    node$description <- if (isFALSE(description)) NULL else description
  }
  if (!is.null(addTags) || !is.null(removeTags)) {
    node$tags <- .applyTagChanges(node$tags, addTags, removeTags, strict, sprintf("Variable '%s'", label))
  }

  first_model$nodes[[node_idx]] <- node
  graphModel@schema$models[[1]] <- first_model
  invisible(graphModel)
}

#' Add a Structural Path to a GraphModel
#'
#' Adds a new path between two nodes. Errors if a path already exists with
#' the same `from`, `to`, and `numberOfArrows` -- there is no upsert form;
#' use [changePath()] to modify an existing path's `freeParameter`/`value`,
#' or [convertPath()] to change its arrow count.
#'
#' @param graphModel A `GraphModel` object to modify.
#' @param from Character. Label of the source node.
#' @param to Character. Label of the target node.
#' @param numberOfArrows Integer, `1` or `2`. `1` = directed path
#'   (regression/loading/mean); `2` = covariance or variance.
#' @param freeParameter `NULL`/`FALSE` (fixed, the default), `TRUE` (free,
#'   anonymous), or a non-empty string (free and named -- implies an
#'   equality constraint if the same name is reused elsewhere). An empty
#'   string is rejected.
#' @param value Numeric or `NULL`. The path's fixed or starting value.
#' @param tags Character vector or `NULL`. Optional tags for the path.
#'
#' @return The modified `graphModel` object (invisibly).
#'
#' @export
addPath <- function(graphModel, from, to, numberOfArrows,
                     freeParameter = NULL, value = NULL, tags = NULL) {
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  if (!is.character(from) || length(from) != 1 || !is.character(to) || length(to) != 1) {
    stop("from and to must each be a single character string", call. = FALSE)
  }
  if (!isTRUE(numberOfArrows %in% c(1, 2))) {
    stop("numberOfArrows must be 1 or 2", call. = FALSE)
  }
  if (!is.null(freeParameter) && !isFALSE(freeParameter) && identical(freeParameter, "")) {
    stop('freeParameter must be TRUE, FALSE, NULL, or a non-empty string; use FALSE or NULL to leave it fixed', call. = FALSE)
  }
  if (!is.null(tags) && !is.character(tags)) {
    stop("tags must be a character vector or NULL", call. = FALSE)
  }

  first_model <- graphModel@schema$models[[1]]
  if (is.null(first_model)) {
    stop("graphModel has no models to add a path to", call. = FALSE)
  }

  existing <- .findPathIndices(first_model$paths, from = from, to = to, numberOfArrows = numberOfArrows)
  if (length(existing) > 0) {
    stop(sprintf(
      "A path already exists between '%s' and '%s' with numberOfArrows = %d. Use changePath() to modify it or convertPath() to change its arrow count.",
      from, to, numberOfArrows
    ), call. = FALSE)
  }

  new_path <- list(from = from, to = to, numberOfArrows = as.integer(numberOfArrows))
  if (!is.null(freeParameter) && !isFALSE(freeParameter)) new_path$freeParameter <- freeParameter
  if (!is.null(value)) new_path$value <- value
  if (!is.null(tags)) new_path$tags <- tags

  first_model$paths[[length(first_model$paths) + 1]] <- new_path
  graphModel@schema$models[[1]] <- first_model
  invisible(graphModel)
}

#' Remove a Structural Path from a GraphModel
#'
#' Cannot remove a `type: "data"` path -- use [disconnectData()] for that.
#'
#' @param graphModel A `GraphModel` object to modify.
#' @param from Character. Label of the source/endpoint node.
#' @param to Character. Label of the target/endpoint node.
#' @param numberOfArrows Integer, `1` or `2`, or `NULL`. Required when
#'   `from`/`to` alone would match more than one path (e.g. both a directed
#'   and a covariance path exist between the same two nodes).
#'
#' @return The modified `graphModel` object (invisibly).
#'
#' @export
removePath <- function(graphModel, from, to, numberOfArrows = NULL) {
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  first_model <- graphModel@schema$models[[1]]
  if (is.null(first_model)) {
    stop("graphModel has no models to remove a path from", call. = FALSE)
  }

  idx <- .findPathIndices(first_model$paths, from = from, to = to, numberOfArrows = numberOfArrows)
  .pathLookupError(first_model$paths, idx, from, to, numberOfArrows)

  first_model$paths[[idx]] <- NULL
  graphModel@schema$models[[1]] <- first_model
  invisible(graphModel)
}

#' Change an Existing Path's Free-Parameter Status, Value, or Tags
#'
#' `from`, `to`, and `numberOfArrows` identify the existing path to change
#' and are never themselves modified by this function -- `changePath()`
#' cannot change a path's arrow count (see [convertPath()]) or redirect its
#' endpoints (a path has no identity independent of what it connects, so
#' redirecting one is [removePath()] + [addPath()], not a property edit).
#' Errors if no such path exists, rather than silently creating one -- see
#' [addPath()] for that. Cannot change a `type: "data"` path -- use
#' [disconnectData()]/[connectData()]/[reconnectData()] for those.
#'
#' `freeParameter` and `value` each follow the convention: `NA` (default)
#' leaves the field unchanged, `FALSE` clears it (`freeParameter` only --
#' `value` has no `FALSE`/clear form, since the schema's own default of 1.0
#' makes "absent" and "explicitly 1.0" equivalent), any other legal value
#' sets it.
#'
#' @param graphModel A `GraphModel` object to modify.
#' @param from Character. Label of the source/endpoint node.
#' @param to Character. Label of the target/endpoint node.
#' @param numberOfArrows Integer, `1` or `2`, or `NULL`. Required when
#'   `from`/`to` alone would match more than one path.
#' @param freeParameter `NA` (unchanged, default), `FALSE` (clear -- fixed),
#'   `TRUE` (free, anonymous), or a non-empty string (free, named). An empty
#'   string is rejected.
#' @param value `NA` (unchanged, default) or a number (set).
#' @param addTags Character vector or `NULL`. Tags to ensure are present.
#' @param removeTags Character vector or `NULL`. Tags to ensure are absent.
#' @param strict Logical, default `FALSE`. If `TRUE`, `addTags`/`removeTags`
#'   error when a tag is already present/absent instead of silently doing
#'   nothing for that tag.
#'
#' @return The modified `graphModel` object (invisibly).
#'
#' @export
changePath <- function(graphModel, from, to, numberOfArrows = NULL,
                        freeParameter = NA, value = NA,
                        addTags = NULL, removeTags = NULL, strict = FALSE) {
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  if (.isUnchanged(freeParameter) && .isUnchanged(value) &&
        is.null(addTags) && is.null(removeTags)) {
    stop("changePath() requires at least one of freeParameter, value, addTags, or removeTags to change", call. = FALSE)
  }
  if (!.isUnchanged(freeParameter) && !isFALSE(freeParameter) && identical(freeParameter, "")) {
    stop('freeParameter must be TRUE, FALSE, NA, or a non-empty string; use FALSE to fix the parameter, or TRUE for an anonymous free one', call. = FALSE)
  }
  if (!.isUnchanged(value) && !is.numeric(value)) {
    stop("value must be numeric or NA", call. = FALSE)
  }

  first_model <- graphModel@schema$models[[1]]
  if (is.null(first_model)) {
    stop("graphModel has no models to change a path in", call. = FALSE)
  }

  idx <- .findPathIndices(first_model$paths, from = from, to = to, numberOfArrows = numberOfArrows)
  .pathLookupError(first_model$paths, idx, from, to, numberOfArrows)

  path <- first_model$paths[[idx]]
  if (!.isUnchanged(freeParameter)) {
    path$freeParameter <- if (isFALSE(freeParameter)) NULL else freeParameter
  }
  if (!.isUnchanged(value)) {
    path$value <- value
  }
  if (!is.null(addTags) || !is.null(removeTags)) {
    path$tags <- .applyTagChanges(path$tags, addTags, removeTags, strict, sprintf("Path '%s' -> '%s'", from, to))
  }
  first_model$paths[[idx]] <- path

  graphModel@schema$models[[1]] <- first_model
  invisible(graphModel)
}

#' Convert a Path Between Directed and Covariance Form
#'
#' The only way to change a path's `numberOfArrows`. Deliberately a separate
#' verb rather than a special argument on [changePath()]: `numberOfArrows`
#' is part of a path's lookup identity, so letting it double as both the
#' lookup key and the new value on one function was found to be genuinely
#' ambiguous (the same call could mean either, depending on model state the
#' caller can't see). Inside `convertPath()`, `numberOfArrows` is
#' unambiguously the new value -- `from`/`to` (in the order given) already
#' identify exactly one path even when a reciprocal pair (`t1->t2` and
#' `t2->t1`) both exist, since those are two distinct paths with two
#' distinct `(from, to)` identities, not one ambiguous pair. A covariance
#' path is inherently unique between two given nodes, so nothing further is
#' needed to disambiguate that direction either. Does not apply to
#' `type: "data"` paths, which have no arrows to convert.
#'
#' @param graphModel A `GraphModel` object to modify.
#' @param from Character. Label of the source node -- the source of the
#'   resulting directed path, when converting to `numberOfArrows = 1`.
#' @param to Character. Label of the target node.
#' @param numberOfArrows Integer, `1` or `2`. The new arrow count.
#'
#' @return The modified `graphModel` object (invisibly).
#'
#' @export
convertPath <- function(graphModel, from, to, numberOfArrows) {
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  if (!isTRUE(numberOfArrows %in% c(1, 2))) {
    stop("numberOfArrows must be 1 or 2", call. = FALSE)
  }

  first_model <- graphModel@schema$models[[1]]
  if (is.null(first_model)) {
    stop("graphModel has no models to convert a path in", call. = FALSE)
  }

  source_arrows <- if (numberOfArrows == 1) 2 else 1
  idx <- .findPathIndices(first_model$paths, from = from, to = to, numberOfArrows = source_arrows)
  if (length(idx) == 0) {
    if (.dataPathEndpointsExist(first_model$paths, from, to)) {
      stop(sprintf(
        "'%s' to '%s' is a data connection, not a structural path -- convertPath() does not apply.",
        from, to
      ), call. = FALSE)
    }
    stop(sprintf(
      "No numberOfArrows = %d path found between '%s' and '%s' to convert.",
      source_arrows, from, to
    ), call. = FALSE)
  }
  if (length(idx) > 1) {
    stop(sprintf(
      "Ambiguous: %d paths found between '%s' and '%s' to convert.",
      length(idx), from, to
    ), call. = FALSE)
  }

  # The existing path's own from/to may be stored in either order if it was
  # a covariance (symmetric, no inherent direction) -- always assign the
  # caller's requested from/to explicitly rather than keeping whatever
  # order happened to be stored, so converting to a directed path gets the
  # requested direction regardless.
  path <- first_model$paths[[idx]]
  path$from <- from
  path$to <- to
  path$numberOfArrows <- as.integer(numberOfArrows)
  first_model$paths[[idx]] <- path

  graphModel@schema$models[[1]] <- first_model
  invisible(graphModel)
}

#' Add a Constant Node to a GraphModel
#'
#' Adds a `constant` node (the unit vector, used for means/intercepts).
#' Multiple constant nodes are permitted in the schema -- e.g. for layout,
#' or to attribute different mean paths to visually distinct constants; all
#' of them contribute to the means model. The schema's own convention is to
#' label the first/only constant `"1"`.
#'
#' @param graphModel A `GraphModel` object to modify.
#' @param label Character. The label for the new constant node. Must be
#'   unique within the model. Defaults to `"1"`.
#' @param description Character or `NULL`. An optional human-readable
#'   description for the node.
#' @param tags Character vector or `NULL`. Optional tags for the node.
#'
#' @return The modified `graphModel` object (invisibly).
#'
#' @export
addConstant <- function(graphModel, label = "1", description = NULL, tags = NULL) {
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  if (!is.character(label) || length(label) != 1 || nchar(label) == 0) {
    stop("label must be a single non-empty character string", call. = FALSE)
  }
  if (!is.null(tags) && !is.character(tags)) {
    stop("tags must be a character vector or NULL", call. = FALSE)
  }

  first_model <- graphModel@schema$models[[1]]
  if (is.null(first_model)) {
    stop("graphModel has no models to add a constant to", call. = FALSE)
  }
  existing_labels <- vapply(first_model$nodes, function(n) as.character(n$label), character(1))
  if (label %in% existing_labels) {
    stop(sprintf("A node with label '%s' already exists", label), call. = FALSE)
  }

  new_node <- list(label = label, type = "constant")
  if (!is.null(description)) {
    new_node$description <- description
  }
  if (!is.null(tags)) {
    new_node$tags <- tags
  }

  first_model$nodes[[length(first_model$nodes) + 1]] <- new_node
  graphModel@schema$models[[1]] <- first_model
  invisible(graphModel)
}

#' Remove a Constant Node from a GraphModel
#'
#' By default, removing a constant also removes any mean paths incident to
#' it, with a warning naming how many were removed (see [removeVariable()]
#' for the same rationale). Setting `mergeInto` to another constant's label
#' reassigns those incident paths to the named constant instead of deleting
#' them -- safe to do, since any constant node represents the same "1";
#' reassigning which one a mean path's `from` points to doesn't change what
#' gets estimated, only bookkeeping.
#'
#' @param graphModel A `GraphModel` object to modify.
#' @param label Character. The label of the constant node to remove.
#' @param mergeInto `FALSE` (default -- delete incident paths), or a single
#'   character string naming another existing constant node to reassign
#'   them to instead.
#'
#' @return The modified `graphModel` object (invisibly).
#'
#' @export
removeConstant <- function(graphModel, label, mergeInto = FALSE) {
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  first_model <- graphModel@schema$models[[1]]
  if (is.null(first_model)) {
    stop("graphModel has no models to remove a constant from", call. = FALSE)
  }
  node_idx <- which(vapply(first_model$nodes, function(n) {
    identical(n$label, label) && identical(n$type, "constant")
  }, logical(1)))
  if (length(node_idx) == 0) {
    stop(sprintf("No constant node found with label '%s'", label), call. = FALSE)
  }

  incident <- vapply(
    first_model$paths,
    function(p) identical(p$from, label) || identical(p$to, label),
    logical(1)
  )

  if (isFALSE(mergeInto)) {
    if (any(incident)) {
      warning(sprintf(
        "Removing constant '%s' also removed %d incident path(s)", label, sum(incident)
      ), call. = FALSE)
    }
    first_model$paths <- first_model$paths[!incident]
  } else {
    if (!is.character(mergeInto) || length(mergeInto) != 1) {
      stop("mergeInto must be FALSE or a single character string naming another constant node", call. = FALSE)
    }
    if (identical(mergeInto, label)) {
      stop("mergeInto cannot be the same constant being removed", call. = FALSE)
    }
    target_node <- Find(function(n) identical(n$label, mergeInto) && identical(n$type, "constant"), first_model$nodes)
    if (is.null(target_node)) {
      stop(sprintf("No constant node found with label '%s' to merge into", mergeInto), call. = FALSE)
    }
    first_model$paths <- lapply(first_model$paths, function(p) {
      if (identical(p$from, label)) p$from <- mergeInto
      if (identical(p$to, label)) p$to <- mergeInto
      p
    })
  }

  first_model$nodes[[node_idx]] <- NULL
  graphModel@schema$models[[1]] <- first_model
  invisible(graphModel)
}

#' Add a Dataset Node to a GraphModel
#'
#' `source` dispatches on type: a `data.frame` is embedded directly in the
#' schema (`datasetSource$type = "embedded"`) and recorded in the
#' `GraphModel`'s own `@data` cache; a single file path string creates a
#' file-linked dataset node (`datasetSource$type = "file"`) *without*
#' reading it -- auto-embedding a linked file is deliberately not supported
#' here (use [changeData()] to embed it explicitly later, which does read
#' it). v0.1 supports only one dataset node per model; this is enforced here
#' at add time (the schema-to-OpenMx converter also enforces it, but only at
#' build time, which is a much later and less helpful point to discover the
#' problem).
#'
#' @param graphModel A `GraphModel` object to modify.
#' @param label Character. The label for the new dataset node. Must be
#'   unique within the model.
#' @param source A `data.frame` to embed, or a single file path string to
#'   link without reading.
#' @param tags Character vector or `NULL`. Optional tags for the node.
#'
#' @return The modified `graphModel` object (invisibly).
#'
#' @export
addData <- function(graphModel, label, source, tags = NULL) {
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  if (!is.character(label) || length(label) != 1 || nchar(label) == 0) {
    stop("label must be a single non-empty character string", call. = FALSE)
  }
  if (!is.null(tags) && !is.character(tags)) {
    stop("tags must be a character vector or NULL", call. = FALSE)
  }

  first_model <- graphModel@schema$models[[1]]
  if (is.null(first_model)) {
    stop("graphModel has no models to add a dataset to", call. = FALSE)
  }
  existing_labels <- vapply(first_model$nodes, function(n) as.character(n$label), character(1))
  if (label %in% existing_labels) {
    stop(sprintf("A node with label '%s' already exists", label), call. = FALSE)
  }
  has_dataset <- any(vapply(first_model$nodes, function(n) identical(n$type, "dataset"), logical(1)))
  if (has_dataset) {
    stop("This model already has a dataset node; v0.1 supports only one dataset node per model", call. = FALSE)
  }

  if (is.data.frame(source)) {
    data_as_json <- dataFrameToJSON(source)
    dataset_source <- list(
      type = "embedded", format = "json", encoding = "UTF-8",
      columnTypes = as.list(data_as_json$columnTypes),
      object = data_as_json$object,
      rowCount = nrow(source)
    )
  } else if (is.character(source) && length(source) == 1) {
    ext <- tolower(tools::file_ext(source))
    format <- if (nchar(ext) > 0) ext else "csv"
    dataset_source <- list(
      type = "file", format = format, location = source,
      columnTypes = list()
    )
  } else {
    stop("source must be a data.frame or a single file path string", call. = FALSE)
  }

  new_node <- list(label = label, type = "dataset", datasetSource = dataset_source)
  if (!is.null(tags)) {
    new_node$tags <- tags
  }

  first_model$nodes[[length(first_model$nodes) + 1]] <- new_node
  graphModel@schema$models[[1]] <- first_model
  if (is.data.frame(source)) {
    graphModel@data[[label]] <- source
  }
  graphModel@dataConnections[[label]] <- list(status = "user_bound")
  invisible(graphModel)
}

#' Remove a Dataset Node from a GraphModel
#'
#' Removing a dataset node also removes its `type: "data"` paths, and the
#' corresponding entries in `@data` and `@dataConnections`.
#'
#' @param graphModel A `GraphModel` object to modify.
#' @param label Character. The label of the dataset node to remove.
#'
#' @return The modified `graphModel` object (invisibly).
#'
#' @export
removeData <- function(graphModel, label) {
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  first_model <- graphModel@schema$models[[1]]
  if (is.null(first_model)) {
    stop("graphModel has no models to remove a dataset from", call. = FALSE)
  }
  node_idx <- which(vapply(first_model$nodes, function(n) {
    identical(n$label, label) && identical(n$type, "dataset")
  }, logical(1)))
  if (length(node_idx) == 0) {
    stop(sprintf("No dataset node found with label '%s'", label), call. = FALSE)
  }

  incident <- vapply(
    first_model$paths,
    function(p) isTRUE(p$type == "data") && (identical(p$from, label) || identical(p$to, label)),
    logical(1)
  )
  if (any(incident)) {
    warning(sprintf(
      "Removing dataset '%s' also removed %d data connection(s)", label, sum(incident)
    ), call. = FALSE)
  }

  first_model$nodes[[node_idx]] <- NULL
  first_model$paths <- first_model$paths[!incident]

  graphModel@schema$models[[1]] <- first_model
  graphModel@data[[label]] <- NULL
  graphModel@dataConnections[[label]] <- NULL
  invisible(graphModel)
}

#' Convert a Dataset Node Between Embedded and File-Linked Form
#'
#' The only way to change a dataset's storage representation. `location`
#' deliberately has no "always required" shape: converting *to* `"embedded"`
#' never accepts `location` at all (it always reads from whatever the
#' dataset's existing `location` already is -- there is exactly one file
#' involved, so there's nothing to specify and nothing that could collide);
#' converting *to* `"file"` requires `location` (the write target -- there's
#' no pre-existing file to conflict with). This asymmetry is deliberate: an
#' earlier design that always required a `source`/`location` argument in
#' both directions had a real collision risk (if the given path didn't match
#' the dataset's current location, it was unclear whether that was an error,
#' a silent swap, or silently ignored) -- requiring it only where there is
#' a genuine new question avoids that ambiguity entirely. Only CSV is
#' currently supported for the actual file read/write; other formats need
#' to be constructed directly.
#'
#' Changing *which* file/data a dataset uses is a different operation --
#' [removeData()] + [addData()] with the new source, not this function.
#'
#' @param graphModel A `GraphModel` object to modify.
#' @param label Character. The label of the dataset node to convert.
#' @param connectionType `"embedded"` or `"file"`. The target representation.
#' @param location Character or `NULL`. Required (and used as the write
#'   target) when `connectionType = "file"`; must be `NULL` when
#'   `connectionType = "embedded"`.
#' @param format Character, default `"csv"`. Recorded on the dataset node
#'   when converting to `"file"`.
#' @param overwrite Logical, default `FALSE`. If `FALSE`, errors rather than
#'   overwriting an existing file at `location`.
#' @param addTags Character vector or `NULL`. Tags to ensure are present.
#' @param removeTags Character vector or `NULL`. Tags to ensure are absent.
#' @param strict Logical, default `FALSE`. If `TRUE`, `addTags`/`removeTags`
#'   error when a tag is already present/absent instead of silently doing
#'   nothing for that tag.
#'
#' @return The modified `graphModel` object (invisibly).
#'
#' @export
changeData <- function(graphModel, label, connectionType, location = NULL,
                        format = "csv", overwrite = FALSE,
                        addTags = NULL, removeTags = NULL, strict = FALSE) {
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  if (!isTRUE(connectionType %in% c("embedded", "file"))) {
    stop('connectionType must be "embedded" or "file"', call. = FALSE)
  }

  first_model <- graphModel@schema$models[[1]]
  if (is.null(first_model)) {
    stop("graphModel has no models to change a dataset in", call. = FALSE)
  }
  node_idx <- which(vapply(first_model$nodes, function(n) {
    identical(n$label, label) && identical(n$type, "dataset")
  }, logical(1)))
  if (length(node_idx) == 0) {
    stop(sprintf("No dataset node found with label '%s'", label), call. = FALSE)
  }
  node <- first_model$nodes[[node_idx]]
  current_type <- node$datasetSource$type %||% NA

  if (identical(connectionType, "embedded")) {
    if (!is.null(location)) {
      stop('location must not be supplied when connectionType = "embedded" -- embedding always reads from the dataset\'s existing location', call. = FALSE)
    }
    if (identical(current_type, "embedded")) {
      stop(sprintf("Dataset '%s' is already embedded; nothing to convert", label), call. = FALSE)
    }
    existing_location <- node$datasetSource$location
    if (is.null(existing_location)) {
      stop(sprintf("Dataset '%s' has no location to read from", label), call. = FALSE)
    }
    df <- utils::read.csv(existing_location, stringsAsFactors = FALSE)
    data_as_json <- dataFrameToJSON(df)
    node$datasetSource <- list(
      type = "embedded", format = "json", encoding = "UTF-8",
      columnTypes = as.list(data_as_json$columnTypes),
      object = data_as_json$object,
      rowCount = nrow(df)
    )
    graphModel@data[[label]] <- df
  } else {
    if (is.null(location)) {
      stop('location is required when connectionType = "file"', call. = FALSE)
    }
    if (identical(current_type, "file")) {
      stop(sprintf("Dataset '%s' is already file-based; nothing to convert", label), call. = FALSE)
    }
    if (file.exists(location) && !overwrite) {
      stop(sprintf("File already exists at '%s'; use overwrite = TRUE to replace it", location), call. = FALSE)
    }
    df <- graphModel@data[[label]]
    if (is.null(df)) {
      stop(sprintf("No embedded data found for dataset '%s'", label), call. = FALSE)
    }
    utils::write.csv(df, location, row.names = FALSE)
    node$datasetSource <- list(
      type = "file", format = format, location = location,
      columnTypes = node$datasetSource$columnTypes %||% list(),
      md5 = tools::md5sum(location)[[1]]
    )
    graphModel@data[[label]] <- NULL
  }

  if (!is.null(addTags) || !is.null(removeTags)) {
    node$tags <- .applyTagChanges(node$tags, addTags, removeTags, strict, sprintf("Dataset '%s'", label))
  }

  first_model$nodes[[node_idx]] <- node
  graphModel@schema$models[[1]] <- first_model
  invisible(graphModel)
}

#' Connect Dataset Columns to Variable Nodes
#'
#' Adds `type: "data"` paths from a dataset node to one or more variable
#' nodes, with `column` as each path's `label` (the source column name), per
#' the schema's data-connection convention. This is what makes a variable
#' manifest -- see the schema's manifest/latent inference rule. Vectorized
#' over `variable`/`column`; `column = NA` (default) auto-fills from
#' `variable` element-wise, so `connectData(gm, "survey", "cog1")` connects
#' the `cog1` variable to a same-named column. If `column` is supplied
#' explicitly, it must have the same length as `variable` -- no recycling,
#' to avoid silently mispairing a mismatched-length vector.
#'
#' @param graphModel A `GraphModel` object to modify.
#' @param data Character. Label of the dataset node.
#' @param variable Character vector. Label(s) of the variable node(s).
#' @param column Character vector or `NA` (default -- auto-fills from
#'   `variable`). The source column name(s) in the dataset.
#'
#' @return The modified `graphModel` object (invisibly).
#'
#' @export
connectData <- function(graphModel, data, variable, column = NA) {
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  if (!is.character(data) || length(data) != 1) {
    stop("data must be a single character string", call. = FALSE)
  }
  if (!is.character(variable) || length(variable) == 0) {
    stop("variable must be a character vector", call. = FALSE)
  }
  if (length(column) == 1 && is.na(column)) {
    column <- variable
  }
  if (length(column) != length(variable)) {
    stop(sprintf(
      "variable (length %d) and column (length %d) must have the same length",
      length(variable), length(column)
    ), call. = FALSE)
  }

  first_model <- graphModel@schema$models[[1]]
  if (is.null(first_model)) {
    stop("graphModel has no models to add a data connection to", call. = FALSE)
  }
  dataset_node <- Find(function(n) identical(n$label, data) && identical(n$type, "dataset"), first_model$nodes)
  if (is.null(dataset_node)) {
    stop(sprintf("No dataset node found with label '%s'", data), call. = FALSE)
  }
  column_types <- dataset_node$datasetSource$columnTypes

  for (i in seq_along(variable)) {
    v <- variable[[i]]
    col <- column[[i]]

    variable_node <- Find(function(n) identical(n$label, v) && identical(n$type, "variable"), first_model$nodes)
    if (is.null(variable_node)) {
      stop(sprintf("No variable node found with label '%s'", v), call. = FALSE)
    }
    if (!is.null(column_types) && length(column_types) > 0 && !col %in% names(column_types)) {
      stop(sprintf(
        "Column '%s' not found in dataset '%s'. Available columns: %s",
        col, data, paste(names(column_types), collapse = ", ")
      ), call. = FALSE)
    }
    duplicate <- Find(function(p) {
      isTRUE(p$type == "data") && identical(p$from, data) && identical(p$to, v)
    }, first_model$paths)
    if (!is.null(duplicate)) {
      stop(sprintf("A data connection from '%s' to '%s' already exists", data, v), call. = FALSE)
    }

    new_path <- list(from = data, to = v, type = "data", label = col)
    first_model$paths[[length(first_model$paths) + 1]] <- new_path
  }

  graphModel@schema$models[[1]] <- first_model
  invisible(graphModel)
}

#' Disconnect Dataset Columns from Variable Nodes
#'
#' Vectorized over `variable`.
#'
#' @param graphModel A `GraphModel` object to modify.
#' @param data Character. Label of the dataset node.
#' @param variable Character vector. Label(s) of the variable node(s).
#'
#' @return The modified `graphModel` object (invisibly).
#'
#' @export
disconnectData <- function(graphModel, data, variable) {
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  first_model <- graphModel@schema$models[[1]]
  if (is.null(first_model)) {
    stop("graphModel has no models to remove a data connection from", call. = FALSE)
  }

  for (v in variable) {
    idx <- which(vapply(first_model$paths, function(p) {
      isTRUE(p$type == "data") && identical(p$from, data) && identical(p$to, v)
    }, logical(1)))
    if (length(idx) == 0) {
      stop(sprintf("No data connection found from '%s' to '%s'", data, v), call. = FALSE)
    }
    first_model$paths[[idx]] <- NULL
  }

  graphModel@schema$models[[1]] <- first_model
  invisible(graphModel)
}

#' Change Which Column an Existing Data Connection Uses
#'
#' `column` is required -- there is no "leave unchanged" case for an
#' operation whose entire purpose is changing the column. Vectorized over
#' `variable`/`column`, same length requirement as [connectData()]. Errors
#' if the connection doesn't already exist.
#'
#' @param graphModel A `GraphModel` object to modify.
#' @param data Character. Label of the dataset node.
#' @param variable Character vector. Label(s) of the variable node(s).
#' @param column Character vector. The new source column name(s). Must be
#'   the same length as `variable`.
#'
#' @return The modified `graphModel` object (invisibly).
#'
#' @export
reconnectData <- function(graphModel, data, variable, column) {
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  if (length(column) != length(variable)) {
    stop(sprintf(
      "variable (length %d) and column (length %d) must have the same length",
      length(variable), length(column)
    ), call. = FALSE)
  }

  first_model <- graphModel@schema$models[[1]]
  if (is.null(first_model)) {
    stop("graphModel has no models to reconnect data in", call. = FALSE)
  }
  dataset_node <- Find(function(n) identical(n$label, data) && identical(n$type, "dataset"), first_model$nodes)
  if (is.null(dataset_node)) {
    stop(sprintf("No dataset node found with label '%s'", data), call. = FALSE)
  }
  column_types <- dataset_node$datasetSource$columnTypes

  for (i in seq_along(variable)) {
    v <- variable[[i]]
    col <- column[[i]]

    idx <- which(vapply(first_model$paths, function(p) {
      isTRUE(p$type == "data") && identical(p$from, data) && identical(p$to, v)
    }, logical(1)))
    if (length(idx) == 0) {
      stop(sprintf("No data connection found from '%s' to '%s'. Use connectData() to create one.", data, v), call. = FALSE)
    }
    if (!is.null(column_types) && length(column_types) > 0 && !col %in% names(column_types)) {
      stop(sprintf(
        "Column '%s' not found in dataset '%s'. Available columns: %s",
        col, data, paste(names(column_types), collapse = ", ")
      ), call. = FALSE)
    }

    path <- first_model$paths[[idx]]
    path$label <- col
    first_model$paths[[idx]] <- path
  }

  graphModel@schema$models[[1]] <- first_model
  invisible(graphModel)
}
