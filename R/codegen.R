# Edit-code generation for the drawSEM addin: given the GraphModel a user
# started with and the one they ended with, produce R code that reproduces the
# edit. The addin is layout-only (the editor runs with editMode = "layout"), so
# the code is visual-setter calls -- setLocation() for node positions and
# setVisualization() for the saved view -- read off the edited model by
# projection (.visualEditCode()), never a structural diff.
# The structural verb diff (with JSON fallback) is parked, unexported, in
# codegen-parked.R for a future structural addin.
#
# Calls are built as data (list(fn, args)), not text, so the same list can be
# (a) formatted into code and (b) applied to the "before" model to check it.

# ---- call representation ----------------------------------------------------

.mkCall <- function(fn, ...) list(fn = fn, args = list(...))

# Strip NULLs from a call's args (omitted arguments), keeping order.
.dropNullArgs <- function(call) {
  call$args <- call$args[!vapply(call$args, is.null, logical(1))]
  call
}

.fmtValue <- function(v) {
  if (is.character(v)) return(paste(deparse(v, width.cutoff = 500L), collapse = ""))
  if (is.logical(v) && length(v) == 1) return(if (is.na(v)) "NA" else as.character(v))
  if (is.numeric(v)) {
    s <- format(as.numeric(v), digits = 15, trim = TRUE)
    if (!is.null(names(v))) s <- paste0(names(v), " = ", s)  # c(x = 1, y = 2)
    return(if (length(s) == 1 && is.null(names(v))) s else paste0("c(", paste(s, collapse = ", "), ")"))
  }
  paste(deparse(v, width.cutoff = 500L), collapse = "")
}

# Format one call as `drawSEM::fn(a = 1, b = "x")`, wrapping one argument per
# line (indented by `indent`) when it would exceed `width` characters.
.fmtCall <- function(call, indent = "  ", width = 88L) {
  args <- vapply(names(call$args), function(nm) paste0(nm, " = ", .fmtValue(call$args[[nm]])),
                 character(1))
  one_line <- sprintf("drawSEM::%s(%s)", call$fn, paste(args, collapse = ", "))
  if (nchar(one_line) + nchar(indent) <= width) return(one_line)
  paste0(
    sprintf("drawSEM::%s(\n", call$fn),
    paste0(indent, "  ", args, collapse = ",\n"),
    "\n", indent, ")"
  )
}

# Join calls into a pipe chain assigned to `varName`. `base` is the expression
# at the head of the chain (the variable itself, or `drawSEM::GraphModel()`).
# With `wrapper` (e.g. "drawSEM::as.MxModel"), the whole chain is passed as the
# sole argument of that function, indented inside the call.
.fmtChain <- function(calls, varName, base, wrapper = NULL) {
  indent <- if (is.null(wrapper)) "  " else "    "
  body <- vapply(calls, .fmtCall, character(1), indent = indent)
  chain <- paste0("  ", base, " |>\n",
                  paste0(indent, body, collapse = " |>\n"))
  if (is.null(wrapper)) {
    return(paste0(varName, " <- ", base, " |>\n",
                  paste0(indent, body, collapse = " |>\n"), "\n"))
  }
  paste0(varName, " <- ", wrapper, "(\n", chain, "\n)\n")
}

# ---- canonicalization (for equality checks only) -----------------------------

# Recursively normalize a schema fragment so semantically equal values compare
# identical: named lists key-sorted, all-scalar unnamed lists collapsed to
# vectors, numbers made double (to 12 significant digits), empty containers dropped.
.canonValue <- function(x) {
  if (is.null(x)) return(NULL)
  if (is.data.frame(x)) x <- as.list(x)
  if (is.list(x)) {
    if (length(x) == 0) return(NULL)
    x <- lapply(x, .canonValue)
    x <- x[!vapply(x, is.null, logical(1))]
    if (length(x) == 0) return(NULL)
    if (is.null(names(x))) {
      if (all(vapply(x, function(e) is.atomic(e) && length(e) == 1, logical(1)))) {
        return(.canonValue(unlist(x, use.names = FALSE)))
      }
      return(unname(x))
    }
    return(x[order(names(x))])
  }
  # A lone NA is "no value", the same as an absent field (as.GraphModel() on an
  # MxModel leaves label = NA; the JSON round trip turns it into null).
  if (is.atomic(x) && length(x) == 1 && is.na(x)) return(NULL)
  # 12 significant digits: JSON transport can perturb doubles in the last
  # bits (~1e-16), which is not an edit.
  if (is.numeric(x)) return(signif(as.numeric(x), 12))
  if (is.atomic(x) && length(x) == 0) return(NULL)
  x
}

.pathKey <- function(p) {
  n <- p$numberOfArrows
  ends <- c(as.character(p$from), as.character(p$to))
  if (is.null(n)) {
    paste(c("data", ends), collapse = "␟")
  } else {
    if (n == 2) ends <- sort(ends)
    paste(c(as.character(n), ends), collapse = "␟")
  }
}

# Round node x/y to whole canvas units: sub-pixel drag noise is not an edit.
.roundVisual <- function(node) {
  if (!is.null(node$visual$x)) node$visual$x <- round(as.numeric(node$visual$x))
  if (!is.null(node$visual$y)) node$visual$y <- round(as.numeric(node$visual$y))
  node
}

# Canonical, order-independent form of a whole GraphModel schema.

# ---- visual-only edit code (the addin's output) -------------------------------

.nodeMap <- function(model) {
  nodes <- model$nodes %||% list()
  stats::setNames(nodes, vapply(nodes, function(n) as.character(n$label), character(1)))
}

# Apply a call list to a GraphModel (used to verify generated code).
.applyCalls <- function(gm, calls) {
  ns <- asNamespace("drawSEM")
  for (cl in calls) {
    gm <- do.call(get(cl$fn, envir = ns, mode = "function"), c(list(gm), cl$args))
  }
  gm
}

# What the layout-only editor must leave alone: node labels/types and path
# keys. Deliberately coarse -- it guards against structural edits, not against
# field-level differences, which a projection never reads.
.structureKey <- function(model) {
  nodes <- vapply(model$nodes %||% list(),
                  function(n) paste(as.character(n$label), as.character(n$type), sep = "\u241f"),
                  character(1))
  paths <- vapply(model$paths %||% list(), .pathKey, character(1))
  list(nodes = sort(nodes), paths = sort(paths))
}

# The setVisualization() call that turns `before`'s saved view (viewport,
# activeLayer, offLayerVisibility) into `after`'s, or NULL when they match.
# Only the keys that differ are set; a key `after` lacks is cleared (FALSE).
.visualizationCall <- function(bm, am) {
  bv <- bm$visualization %||% list()
  av <- am$visualization %||% list()
  args <- list()
  for (k in c("viewport", "activeLayer", "offLayerVisibility")) {
    if (identical(.canonValue(bv[[k]]), .canonValue(av[[k]]))) next
    args[[k]] <- if (is.null(av[[k]])) {
      FALSE
    } else if (k == "viewport") {
      v <- av[[k]]
      vapply(c(x = "x", y = "y", width = "width", height = "height"),
             function(nm) as.numeric(v[[nm]]), numeric(1))
    } else {
      as.character(av[[k]])
    }
  }
  if (length(args) == 0) return(NULL)
  do.call(.mkCall, c(list("setVisualization"), args))
}

# Code for a layout-only edit. `before` is authoritative for everything; only
# node positions and the saved view are read from `after`. Positions are
# rounded to whole canvas units and matched by node label. A node whose
# position is new or changed is set; that includes every node of a model that
# had no positions and was auto-laid out on load (Done pins the layout the
# user saw). The view (visualization viewport / activeLayer /
# offLayerVisibility) is set when it differs (the editor sends it with Done
# only when the user changed it). Any structural difference -- which the
# layout-only editor should make impossible -- is reported in
# `structureChanged` and otherwise ignored.
# Returns list(tier = "patch" | "none", code, calls, structureChanged).
.visualEditCode <- function(before, after, varName = "model") {
  bm <- before@schema$models[[1]] %||% list()
  am <- after@schema$models[[1]] %||% list()
  bn <- .nodeMap(bm)
  an <- .nodeMap(am)

  moved <- character(0); xs <- numeric(0); ys <- numeric(0)
  for (l in names(bn)) {
    v <- an[[l]]$visual
    if (is.null(v$x) || is.null(v$y)) next
    x <- round(as.numeric(v$x)); y <- round(as.numeric(v$y))
    old <- bn[[l]]$visual
    if (!is.null(old$x) && !is.null(old$y) &&
        round(as.numeric(old$x)) == x && round(as.numeric(old$y)) == y) next
    moved <- c(moved, l); xs <- c(xs, x); ys <- c(ys, y)
  }

  structureChanged <- !identical(.structureKey(bm), .structureKey(am))
  calls <- list()
  if (length(moved) > 0) calls <- c(calls, list(.mkCall("setLocation", nodeId = moved, x = xs, y = ys)))
  view <- .visualizationCall(bm, am)
  if (!is.null(view)) calls <- c(calls, list(view))
  if (length(calls) == 0) {
    return(list(tier = "none", code = NULL, calls = list(), structureChanged = structureChanged))
  }
  list(tier = "patch", code = .fmtChain(calls, varName, varName), calls = calls,
       structureChanged = structureChanged)
}
