#' GraphModel Verb DSL: Read-Only Accessors and Structural Verbs
#'
#' Functions for building and editing a `GraphModel`'s schema directly from
#' R. These are the drawSEM-native counterpart to authoring a model in
#' OpenMx or lavaan syntax -- everything here operates on and returns a
#' `GraphModel`, following the schema's own field names.
#'
#' All functions in this file operate on the schema's first (and, for now,
#' only) model. Multi-model addressing is intentionally out of scope for
#' this pass.
#'
#' @name GraphModel-verbs
#' @docType methods
NULL

# Determine whether a path matches a from/to/numberOfArrows filter, treating
# from/to as an unordered pair when numberOfArrows == 2 (a covariance path
# has no inherent direction) and order-sensitive otherwise. Internal helper
# shared by paths(), addPath(), removePath(), changePath(), and
# convertPath() so the symmetry rule lives in exactly one place -- mirrors
# the fix applied to pathKey() in R/io.R, which has the same rule but is a
# separate, private closure there (drawSemHints round-trip vs. this DSL).
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

# Indices of every path in `paths` matching the given filter. Internal
# helper shared by the mutation verbs (which must additionally assert on
# the count) and paths() (which does not).
.findPathIndices <- function(pathList, from = NULL, to = NULL, numberOfArrows = NULL) {
  which(vapply(
    pathList, .pathMatchesFilter, logical(1),
    from = from, to = to, numberOfArrows = numberOfArrows
  ))
}

# Ambiguity/absence error text shared by removePath(), changePath(), and
# convertPath() so the three verbs report identically-shaped problems the
# same way.
.pathLookupError <- function(idx, from, to, numberOfArrows, verb) {
  if (length(idx) == 0) {
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
#' path.
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
#'
#' @return The modified `graphModel` object (invisibly).
#'
#' @export
addVariable <- function(graphModel, label, manifestLatent = NULL, description = NULL) {
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  if (!is.character(label) || length(label) != 1 || nchar(label) == 0) {
    stop("label must be a single non-empty character string", call. = FALSE)
  }
  if (!is.null(manifestLatent) && !manifestLatent %in% c("manifest", "latent")) {
    stop('manifestLatent must be "manifest", "latent", or NULL', call. = FALSE)
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
  node_idx <- which(vapply(first_model$nodes, function(n) identical(n$label, label), logical(1)))
  if (length(node_idx) == 0) {
    stop(sprintf("No node found with label '%s'", label), call. = FALSE)
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
#' @param freeParameter `NULL`, logical, or character. `NULL`/absent = fixed;
#'   `TRUE` = free, anonymous; a non-empty string = free and named (implies
#'   an equality constraint if the same name is reused elsewhere).
#' @param value Numeric or `NULL`. The path's fixed or starting value.
#'
#' @return The modified `graphModel` object (invisibly).
#'
#' @export
addPath <- function(graphModel, from, to, numberOfArrows,
                     freeParameter = NULL, value = NULL) {
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  if (!is.character(from) || length(from) != 1 || !is.character(to) || length(to) != 1) {
    stop("from and to must each be a single character string", call. = FALSE)
  }
  if (!isTRUE(numberOfArrows %in% c(1, 2))) {
    stop("numberOfArrows must be 1 or 2", call. = FALSE)
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
  if (!is.null(freeParameter)) new_path$freeParameter <- freeParameter
  if (!is.null(value)) new_path$value <- value

  first_model$paths[[length(first_model$paths) + 1]] <- new_path
  graphModel@schema$models[[1]] <- first_model
  invisible(graphModel)
}

#' Remove a Structural Path from a GraphModel
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
  .pathLookupError(idx, from, to, numberOfArrows, "removePath")

  first_model$paths[[idx]] <- NULL
  graphModel@schema$models[[1]] <- first_model
  invisible(graphModel)
}

#' Change an Existing Path's Free-Parameter Status or Value
#'
#' `from`, `to`, and `numberOfArrows` identify the existing path to change
#' and are never themselves modified by this function -- `changePath()`
#' cannot change a path's arrow count (see [convertPath()]) or redirect its
#' endpoints (a path has no identity independent of what it connects, so
#' redirecting one is [removePath()] + [addPath()], not a property edit).
#' Errors if no such path exists, rather than silently creating one -- see
#' [addPath()] for that.
#'
#' @param graphModel A `GraphModel` object to modify.
#' @param from Character. Label of the source/endpoint node.
#' @param to Character. Label of the target/endpoint node.
#' @param numberOfArrows Integer, `1` or `2`, or `NULL`. Required when
#'   `from`/`to` alone would match more than one path.
#' @param freeParameter `NULL`, logical, or character. The new
#'   free-parameter status (see [addPath()]); only applied if supplied.
#' @param value Numeric or `NULL`. The new value; only applied if supplied.
#'
#' @return The modified `graphModel` object (invisibly).
#'
#' @export
changePath <- function(graphModel, from, to, numberOfArrows = NULL,
                        freeParameter = NULL, value = NULL) {
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  if (is.null(freeParameter) && is.null(value)) {
    stop("changePath() requires at least one of freeParameter or value to change", call. = FALSE)
  }

  first_model <- graphModel@schema$models[[1]]
  if (is.null(first_model)) {
    stop("graphModel has no models to change a path in", call. = FALSE)
  }

  idx <- .findPathIndices(first_model$paths, from = from, to = to, numberOfArrows = numberOfArrows)
  .pathLookupError(idx, from, to, numberOfArrows, "changePath")

  path <- first_model$paths[[idx]]
  if (!is.null(freeParameter)) path$freeParameter <- freeParameter
  if (!is.null(value)) path$value <- value
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
#' needed to disambiguate that direction either.
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
