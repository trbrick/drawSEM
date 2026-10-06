#' @include codegen.R
NULL

# PARKED (2026-10-06): no callers. The structural edit-code generator the addin
# used before it became layout-only (see codegen.R). Kept unexported, and kept
# under test (test-codegen.R), because a future structural addin will need it.
# The last commit where it was wired into the addin is tagged
# parked/structural-addin.
#
# Given the GraphModel a user started with and the one they ended with, it
# produces R code (Tier 2 patch verbs, or a Tier 4 JSON re-embed when the
# change can't be expressed with verbs) that reproduces the edit, and verifies
# the verbs by applying them to `before`. Single-model only, like the verbs.
#
# The widget stamp/drop lists below are workarounds for a lossy widget round
# trip; they are to be deleted when the widget round trip is lossless.

# ---- canonicalization (for equality checks only) -----------------------------

.canonSchema <- function(gm) {
  s <- gm@schema
  s$graph <- NULL   # derived by setLocation(); not part of the edit
  s$models <- lapply(s$models, function(m) {
    nodes <- lapply(m$nodes %||% list(), .roundVisual)
    names(nodes) <- vapply(nodes, function(n) as.character(n$label), character(1))
    paths <- lapply(m$paths %||% list(), function(p) {
      # covariance endpoints are an unordered pair
      if (isTRUE(p$numberOfArrows == 2)) {
        e <- sort(c(as.character(p$from), as.character(p$to)))
        p$from <- e[1]; p$to <- e[2]
      }
      p
    })
    names(paths) <- vapply(paths, .pathKey, character(1))
    m$nodes <- nodes[order(names(nodes))]
    m$paths <- paths[order(names(paths))]
    m
  })
  .canonValue(s)
}

# Leaf paths where two canonicalized values differ, for diagnostics
# (e.g. "models/model1/paths/1|y|y/label"). Capped at `max` entries.
.canonDiff <- function(a, b, path = "", max = 8L) {
  out <- character(0)
  if (is.list(a) && is.list(b)) {
    keys <- union(names(a) %||% seq_along(a), names(b) %||% seq_along(b))
    for (k in keys) {
      if (length(out) >= max) break
      ak <- if (is.null(names(a))) a[[as.integer(k)]] else a[[k]]
      bk <- if (is.null(names(b))) b[[as.integer(k)]] else b[[k]]
      out <- c(out, .canonDiff(ak, bk, paste0(path, "/", k), max - length(out)))
    }
    return(out)
  }
  if (identical(a, b)) character(0) else path
}

# ---- widget stamps (the ignore-list) -----------------------------------------
# The widget is a stamping channel: on load it writes defaults the user never
# chose, and they come back in the edited schema (drawsem-web/src/utils/
# runtimeConverter.ts, autoLayout.ts). They are not edits. This table is the
# ONE place that knowledge lives; a test pins the sizes to constants.ts. It is
# deliberately an ignore-list, not an allowlist of editable fields: an unlisted
# difference is treated as a real edit (worst case an ugly-but-correct JSON
# fallback), whereas an allowlist would silently drop edits to any new widget
# feature. Each stamp is ignored only where the original lacked the field.
.widgetStamps <- list(
  nodeTypes  = c("variable", "dataset"),   # node types that get default width/height
  nodeWidth  = 60,                         # MANIFEST_/DATASET_DEFAULT_W
  nodeHeight = 60,                         # MANIFEST_/DATASET_DEFAULT_H
  pathValue  = 1                           # value given to a path that had none
)

# Fields the widget drops on its way back to R (runtimeToSchema.ts emits only
# schemaVersion + the model's label/nodes/paths and optimization$parameterTypes).
# They are not user deletions; restore them from the original so they neither
# register as edits nor vanish from a JSON fallback. INTERIM: delete this when
# the widget round trip stops dropping fields. Only the fields the widget
# cannot edit are listed; path/node-level drops (tags, extensions, angle) are
# not handled here.
.widgetDrops <- list(
  top   = c("meta"),
  model = c("meta", "description", "extensions", "optimization")
)

.restoreWidgetDrops <- function(after, before) {
  if (length(after@schema$models) != 1 || length(before@schema$models) != 1) return(after)
  for (k in .widgetDrops$top) {
    if (is.null(after@schema[[k]]) && !is.null(before@schema[[k]])) after@schema[[k]] <- before@schema[[k]]
  }
  am <- after@schema$models[[1]]; bm <- before@schema$models[[1]]
  for (k in .widgetDrops$model) {
    if (is.null(bm[[k]])) next
    am[[k]] <- if (is.list(bm[[k]]) && is.list(am[[k]])) utils::modifyList(bm[[k]], am[[k]]) else (am[[k]] %||% bm[[k]])
  }
  after@schema$models[[1]] <- am
  after
}

# Remove stamped fields from `after`'s first model, judged against `before`.
.stripWidgetStamps <- function(after, before) {
  after <- .restoreWidgetDrops(after, before)
  if (length(after@schema$models) != 1 || length(before@schema$models) != 1) return(after)
  am <- after@schema$models[[1]]
  bn <- .nodeMap(before@schema$models[[1]])
  bp <- stats::setNames(before@schema$models[[1]]$paths %||% list(),
                        vapply(before@schema$models[[1]]$paths %||% list(), .pathKey, character(1)))
  st <- .widgetStamps

  for (i in seq_along(am$nodes)) {
    n <- am$nodes[[i]]
    if (!(n$type %in% st$nodeTypes)) next
    old <- bn[[as.character(n$label)]]$visual    # NULL for a new node
    if (!is.null(n$visual$width) && is.null(old$width) &&
        isTRUE(as.numeric(n$visual$width) == st$nodeWidth)) am$nodes[[i]]$visual$width <- NULL
    if (!is.null(n$visual$height) && is.null(old$height) &&
        isTRUE(as.numeric(n$visual$height) == st$nodeHeight)) am$nodes[[i]]$visual$height <- NULL
  }
  for (i in seq_along(am$paths)) {
    p <- am$paths[[i]]
    old <- bp[[.pathKey(p)]]                      # NULL for a new path
    if (!is.null(old) && is.null(.canonValue(old$value)) && !is.null(p$value) &&
        isTRUE(as.numeric(p$value) == st$pathValue)) {
      am$paths[[i]]$value <- NULL
    }
    if (is.null(old$visual$loopSide) && !is.null(p$visual$loopSide)) am$paths[[i]]$visual$loopSide <- NULL
    if (length(am$paths[[i]]$visual) == 0) am$paths[[i]]$visual <- NULL
  }
  for (i in seq_along(am$nodes)) if (length(am$nodes[[i]]$visual) == 0) am$nodes[[i]]$visual <- NULL
  after@schema$models[[1]] <- am
  after
}

# ---- the diff ----------------------------------------------------------------

.pathMap <- function(model, structural) {
  paths <- Filter(function(p) structural == !is.null(p$numberOfArrows), model$paths %||% list())
  stats::setNames(paths, vapply(paths, .pathKey, character(1)))
}
.chr <- function(x) if (is.null(x)) NULL else as.character(unlist(x))
.sameNodeCore <- function(a, b) {
  a$visual <- NULL; b$visual <- NULL
  identical(.canonValue(a), .canonValue(b))
}

# Build the verb calls turning `before` into `after`. Returns
# list(calls = <list>, fallback = NULL | <reason string>).
.diffToCalls <- function(before, after) {
  bm_all <- before@schema$models
  am_all <- after@schema$models
  if (length(bm_all) != 1 || length(am_all) != 1) {
    return(list(fallback = "the model has more than one sub-model (verbs are single-model)"))
  }
  if (!identical(names(bm_all), names(am_all))) {
    return(list(fallback = "the model id changed"))
  }
  bm <- bm_all[[1]]; am <- am_all[[1]]

  bn <- .nodeMap(bm); an <- .nodeMap(am)
  removedN <- setdiff(names(bn), names(an))
  addedN   <- setdiff(names(an), names(bn))
  common   <- intersect(names(bn), names(an))
  # a type change under the same label is a remove + add
  typeChanged <- common[vapply(common, function(l) !identical(bn[[l]]$type, an[[l]]$type), logical(1))]
  removedN <- c(removedN, typeChanged); addedN <- c(addedN, typeChanged)
  common <- setdiff(common, typeChanged)

  datasetTouched <- any(vapply(c(bn[removedN], an[addedN]), function(n) identical(n$type, "dataset"), logical(1))) ||
    any(vapply(common, function(l) identical(an[[l]]$type, "dataset") && !.sameNodeCore(bn[[l]], an[[l]]), logical(1)))
  if (datasetTouched) {
    return(list(fallback = "a dataset node was added, removed or changed (datasets can't be written as verb calls)"))
  }

  typeOf <- function(map, labels, type) labels[vapply(labels, function(l) identical(map[[l]]$type, type), logical(1))]
  rmVars   <- typeOf(bn, removedN, "variable")
  rmConsts <- typeOf(bn, removedN, "constant")
  adVars   <- typeOf(an, addedN, "variable")
  adConsts <- typeOf(an, addedN, "constant")
  if (length(setdiff(removedN, c(rmVars, rmConsts))) || length(setdiff(addedN, c(adVars, adConsts)))) {
    return(list(fallback = "a node of a type without a verb was added or removed"))
  }

  # Keep node order stable: follow the order in the model they come from
  rmVars <- intersect(names(bn), rmVars); rmConsts <- intersect(names(bn), rmConsts)
  adVars <- intersect(names(an), adVars); adConsts <- intersect(names(an), adConsts)

  # structural paths
  bp <- .pathMap(bm, TRUE); ap <- .pathMap(am, TRUE)
  rmPaths <- setdiff(names(bp), names(ap))
  adPaths <- setdiff(names(ap), names(bp))
  chPaths <- intersect(names(bp), names(ap))

  # data paths
  bd <- .pathMap(bm, FALSE); ad <- .pathMap(am, FALSE)
  rmData <- setdiff(names(bd), names(ad))
  adData <- setdiff(names(ad), names(bd))
  chData <- intersect(names(bd), names(ad))

  calls <- list()
  add <- function(call) calls[[length(calls) + 1]] <<- .dropNullArgs(call)

  # -- removals: connections and paths first so node removal never cascades
  grp <- function(keys, map) {
    split(keys, vapply(keys, function(k) as.character(map[[k]]$from), character(1)))
  }
  for (ds in names(g <- grp(rmData, bd))) {
    add(.mkCall("disconnectData", data = ds,
                variable = vapply(g[[ds]], function(k) as.character(bd[[k]]$to), character(1), USE.NAMES = FALSE)))
  }
  for (k in rmPaths) {
    p <- bp[[k]]
    add(.mkCall("removePath", from = p$from, to = p$to, numberOfArrows = as.numeric(p$numberOfArrows)))
  }
  for (l in rmVars)   add(.mkCall("removeVariable", label = l))
  for (l in rmConsts) add(.mkCall("removeConstant", label = l))

  # -- additions
  for (l in adConsts) {
    n <- an[[l]]
    add(.mkCall("addConstant", label = if (!identical(l, "1")) l, description = n$description, tags = .chr(n$tags)))
  }
  for (l in adVars) {
    n <- an[[l]]
    add(.mkCall("addVariable", label = l, manifestLatent = n$variableCharacteristics$manifestLatent,
                description = n$description, tags = .chr(n$tags)))
  }
  for (k in adPaths) {
    p <- ap[[k]]
    add(.mkCall("addPath", from = p$from, to = p$to, numberOfArrows = as.numeric(p$numberOfArrows),
                freeParameter = p$freeParameter, value = p$value, tags = .chr(p$tags)))
  }
  for (ds in names(g <- grp(adData, ad))) {
    vars <- vapply(g[[ds]], function(k) as.character(ad[[k]]$to), character(1), USE.NAMES = FALSE)
    cols <- vapply(g[[ds]], function(k) as.character(ad[[k]]$label %||% ad[[k]]$to), character(1), USE.NAMES = FALSE)
    add(.mkCall("connectData", data = ds, variable = vars, column = if (!identical(vars, cols)) cols))
  }

  # -- changes
  for (l in common) {
    b <- bn[[l]]; a <- an[[l]]
    if (!identical(a$type, "variable")) next
    ml_b <- b$variableCharacteristics$manifestLatent; ml_a <- a$variableCharacteristics$manifestLatent
    tb <- .chr(b$tags); ta <- .chr(a$tags)
    ch <- list(
      manifestLatent = if (!identical(ml_b, ml_a)) (ml_a %||% FALSE),
      description    = if (!identical(b$description, a$description)) (a$description %||% FALSE),
      addTags        = if (length(setdiff(ta, tb))) setdiff(ta, tb),
      removeTags     = if (length(setdiff(tb, ta))) setdiff(tb, ta)
    )
    if (any(!vapply(ch, is.null, logical(1)))) {
      add(do.call(.mkCall, c(list("changeVariable", label = l), ch)))
    }
  }
  for (k in chPaths) {
    b <- bp[[k]]; a <- ap[[k]]
    fp_changed  <- !identical(.canonValue(b$freeParameter), .canonValue(a$freeParameter))
    val_changed <- !identical(.canonValue(b$value), .canonValue(a$value))
    tb <- .chr(b$tags); ta <- .chr(a$tags)
    ch <- list(
      freeParameter = if (fp_changed) (a$freeParameter %||% FALSE),
      value         = if (val_changed) (a$value %||% FALSE),
      addTags       = if (length(setdiff(ta, tb))) setdiff(ta, tb),
      removeTags    = if (length(setdiff(tb, ta))) setdiff(tb, ta)
    )
    if (any(!vapply(ch, is.null, logical(1)))) {
      add(do.call(.mkCall, c(list("changePath", from = b$from, to = b$to,
                                  numberOfArrows = as.numeric(b$numberOfArrows)), ch)))
    }
  }
  relabeled <- chData[vapply(chData, function(k) !identical(bd[[k]]$label, ad[[k]]$label), logical(1))]
  for (ds in names(g <- grp(relabeled, ad))) {
    vars <- vapply(g[[ds]], function(k) as.character(ad[[k]]$to), character(1), USE.NAMES = FALSE)
    cols <- vapply(g[[ds]], function(k) as.character(ad[[k]]$label %||% ad[[k]]$to), character(1), USE.NAMES = FALSE)
    add(.mkCall("reconnectData", data = ds, variable = vars, column = cols))
  }

  # -- layout: final locations of every node that is new or moved, in one call
  moved <- character(0); xs <- numeric(0); ys <- numeric(0)
  for (l in names(an)) {
    v <- an[[l]]$visual
    if (is.null(v$x) || is.null(v$y)) next
    x <- round(as.numeric(v$x)); y <- round(as.numeric(v$y))
    old <- bn[[l]]$visual
    if (l %in% names(bn) && !is.null(old$x) && !is.null(old$y) &&
        round(as.numeric(old$x)) == x && round(as.numeric(old$y)) == y) next
    moved <- c(moved, l); xs <- c(xs, x); ys <- c(ys, y)
  }
  if (length(moved)) add(.mkCall("setLocation", nodeId = moved, x = xs, y = ys))

  list(calls = calls, fallback = NULL)
}

# JSON re-embed (Tier 4): lossless by construction, ugly but never loses the model.
.jsonReembed <- function(gm, varName, wrapper = NULL) {
  json <- tryCatch({
    tmp <- tempfile(fileext = ".json"); on.exit(unlink(tmp), add = TRUE)
    exportSchema(gm, tmp, pretty = TRUE)
    paste(readLines(tmp, warn = FALSE), collapse = "\n")
  }, error = function(e) {
    as.character(jsonlite::toJSON(gm@schema, auto_unbox = TRUE, pretty = TRUE, null = "null", digits = NA))
  })
  expr <- sprintf("drawSEM::as.GraphModel(r\"---(%s)---\")", json)
  if (!is.null(wrapper)) expr <- sprintf("%s(%s)", wrapper, expr)
  sprintf("%s <- %s\n", varName, expr)
}

#' Generate R code reproducing an edit made to a GraphModel
#'
#' Compares the model an edit session started with (`before`) to the one it
#' ended with (`after`) and returns code that turns one into the other.
#' Verb-expressible changes become a pipe chain of `drawSEM::` verbs (patch
#' form, or a from-scratch build when `isNew`). Anything the verbs can't
#' express -- or any case where the generated chain fails to reproduce
#' `after` exactly -- falls back to re-embedding the whole model as JSON,
#' with a warning-worthy `reason`.
#'
#' @param before,after `GraphModel`s.
#' @param varName Name of the variable the code assigns to (and, for an
#'   existing model, pipes from).
#' @param isNew `TRUE` if `before` is a blank starting point rather than an
#'   existing model object: the chain then starts from `drawSEM::GraphModel()`.
#' @param origin `"GraphModel"` (default) if `varName` holds a `GraphModel`, or
#'   `"MxModel"` if it holds an `MxModel` that `before` was converted from.
#'   Layout-only edits then stay a `setLocation()` on the `MxModel` (which
#'   preserves a fit); anything else rebuilds it with `as.MxModel()`.
#' @return A list: `tier` (`"none"`, `"patch"`, `"new"`, `"convert"` or
#'   `"json"`), `code` (character or `NULL` when `tier == "none"`) and `reason`
#'   (why the JSON fallback was used, else `NULL`).
#' @noRd
.generateEditCode <- function(before, after, varName = "model", isNew = FALSE,
                              origin = "GraphModel") {
  wrapper <- if (identical(origin, "MxModel")) "drawSEM::as.MxModel"
  after <- .stripWidgetStamps(after, before)
  if (identical(.canonSchema(before), .canonSchema(after))) {
    return(list(tier = "none", code = NULL, reason = NULL))
  }
  fallback <- function(reason) {
    list(tier = "json", code = .jsonReembed(after, varName, wrapper), reason = reason)
  }

  d <- tryCatch(.diffToCalls(before, after), error = function(e) list(fallback = conditionMessage(e)))
  if (!is.null(d$fallback)) return(fallback(d$fallback))
  if (length(d$calls) == 0) return(fallback("the change has no verb equivalent"))

  applied <- tryCatch(suppressWarnings(.applyCalls(before, d$calls)),
                      error = function(e) e)
  if (inherits(applied, "error")) {
    return(fallback(paste("generated verb calls failed:", conditionMessage(applied))))
  }
  if (!identical(.canonSchema(applied), .canonSchema(after))) {
    where <- .canonDiff(.canonSchema(applied), .canonSchema(after))
    return(fallback(paste0(
      "the generated verb calls did not reproduce the edited model exactly; differs at: ",
      paste(where, collapse = ", "))))
  }

  if (isNew) {
    return(list(tier = "new", code = .fmtChain(d$calls, varName, "drawSEM::GraphModel()"), reason = NULL))
  }
  layoutOnly <- all(vapply(d$calls, function(cl) identical(cl$fn, "setLocation"), logical(1)))
  if (is.null(wrapper) || layoutOnly) {
    # setLocation() accepts an MxModel directly, keeping any fit
    return(list(tier = "patch", code = .fmtChain(d$calls, varName, varName), reason = NULL))
  }
  list(tier = "convert",
       code = .fmtChain(d$calls, varName, sprintf("drawSEM::as.GraphModel(%s)", varName), wrapper),
       reason = NULL)
}

# Blank-start naming for the structural addin's "new" tier.
# First of model, model2, model3... not already bound in `env`.
.freshModelName <- function(env, base = "model") {
  if (!exists(base, envir = env, inherits = TRUE)) return(base)
  i <- 2L
  while (exists(paste0(base, i), envir = env, inherits = TRUE)) i <- i + 1L
  paste0(base, i)
}
