#' @include shiny-app.R codegen.R
NULL

# RStudio addin: edit a GraphModel visually and write the edit back into the
# open script as R code. Layered so the logic is testable without RStudio:
#   .addinTarget()  / .addinInsertSpec()  -- pure parsing of an editor context
#   .runEditAddin() -- the flow, with `launch` and `insert` injected
#   drawSEMAddin()  -- the exported binding that supplies the real ones

# Identifier under the selection/cursor in an editor context, or NULL.
# `ctx` follows rstudioapi's shape: $contents (lines), $selection[[1]] with
# $range$start/$end (row, column; 1-based) and $text.
.addinTarget <- function(ctx) {
  sel  <- ctx$selection[[1]]
  text <- trimws(sel$text %||% "")
  ident <- "^[A-Za-z.][A-Za-z0-9._]*$"
  if (nzchar(text)) {
    return(if (grepl(ident, text)) text else NULL)
  }
  row  <- sel$range$start[[1]]
  col  <- sel$range$start[[2]]
  line <- ctx$contents[[row]]
  m <- gregexpr("[A-Za-z.][A-Za-z0-9._]*", line)[[1]]
  if (m[1] == -1) return(NULL)
  starts <- as.integer(m)
  ends   <- starts + attr(m, "match.length") - 1L
  hit <- which(starts <= col & col <= ends + 1L)
  if (length(hit) == 0) return(NULL)
  substr(line, starts[hit[1]], ends[hit[1]])
}

# Where to put generated code: the line after the end of the selection (or
# cursor line). Returns list(row, column, prefix): insert at (row, column)
# with `prefix` prepended -- the last line of a document has no following
# line, so there we insert at its end and lead with a newline.
.addinInsertSpec <- function(ctx) {
  sel <- ctx$selection[[1]]
  end_row <- sel$range$end[[1]]
  end_col <- sel$range$end[[2]]
  multi_line <- !identical(sel$range$start[[1]], end_row)
  if (nzchar(sel$text %||% "") && multi_line && end_col == 1) end_row <- end_row - 1L
  n <- length(ctx$contents)
  if (end_row >= n) {
    list(row = n, column = nchar(ctx$contents[[n]]) + 1L, prefix = "\n")
  } else {
    list(row = end_row + 1L, column = 1L, prefix = "")
  }
}

# Model classes the editor can open, and how to turn each into a GraphModel.
# Adding a backend (e.g. lavaan, once as.GraphModel() supports it) is one row.
.addinOrigins <- list(
  GraphModel = function(x) x,
  MxModel    = function(x) as.GraphModel(x)
)

# Which origin an object belongs to, or NULL.
.addinOriginOf <- function(obj) {
  for (cls in names(.addinOrigins)) if (methods::is(obj, cls)) return(cls)
  NULL
}

# One-line explanation of why a name did not resolve to an editable model.
.addinWhyNot <- function(name, env) {
  if (is.null(name)) return("no variable name under the cursor or selection")
  if (!exists(name, envir = env, inherits = TRUE)) {
    return(paste0("'", name, "' is not defined in the global environment"))
  }
  paste0("'", name, "' is not a GraphModel or MxModel (it is ",
         class(get(name, envir = env, inherits = TRUE))[1], ")")
}

# Shared flow once the model to edit is known. `src` is the object to edit
# (GraphModel or MxModel); `varName` is the name the generated code assigns to.
# `launch(gm, onDone)` runs the layout-only editor, calling `onDone(gm)` on Done
# if it can, and returns a GraphModel or NULL; `insert(text, row, column, id)`
# writes into the script. Returns the tier of generated code ("patch", or
# "none" if nothing was inserted).
.runEdit <- function(ctx, src, varName, launch, insert) {
  before <- .addinOrigins[[.addinOriginOf(src)]](src)

  handled <- FALSE
  tier <- "none"
  finish <- function(after) {
    if (handled) return(invisible(tier))
    handled <<- TRUE
    tier <<- .finishEdit(ctx, before, after, varName, insert)
    invisible(tier)
  }
  # Normally finish() runs inside the gadget's Done handler, so it does not
  # depend on code after the gadget returning (see .drawSEM_server). If the
  # gadget instead returns normally without having called it (cancel, or a
  # launcher that does not support onDone), finish it here.
  result <- launch(before, onDone = finish)
  if (!handled) finish(result)
  invisible(tier)
}

# Generate and insert the code for a finished edit; returns the tier.
.finishEdit <- function(ctx, before, after, varName, insert) {
  if (!methods::is(after, "GraphModel")) {
    message("drawSEM: editor closed without Done; nothing inserted.")
    return("none")
  }

  res <- tryCatch(
    .visualEditCode(before, after, varName = varName),
    error = function(e) {
      stop("drawSEM: could not generate code for the edit: ", conditionMessage(e), call. = FALSE)
    })
  if (isTRUE(res$structureChanged)) {
    warning("drawSEM: the editor changed the model's structure, which the addin does not ",
            "support; only node positions were written. Please report this.", call. = FALSE)
  }
  if (identical(res$tier, "none")) {
    message("drawSEM: no layout changes; nothing inserted.")
    return("none")
  }
  spec <- .addinInsertSpec(ctx)
  text <- paste0(spec$prefix, "# Edited with drawSEM (layout)\n", res$code)
  message("drawSEM: inserting layout code at line ", spec$row, ".")
  tryCatch(
    insert(text, spec$row, spec$column, ctx$id),
    error = function(e) {
      # Never lose the generated code: show it so it can be pasted by hand.
      message("drawSEM: could not insert into the editor (", conditionMessage(e),
              "). Generated code:\n", text)
      stop("drawSEM: insertion failed: ", conditionMessage(e), call. = FALSE)
    })
  res$tier
}

# The addin flow: resolve the model from the editor context (cursor/selection
# names a GraphModel or MxModel in `env`), then edit. No model -> error: the
# addin is layout-only, so there is nothing to build from a blank start.
# `ctx` must have been captured by the caller before any gadget launched.
.runEditAddin <- function(ctx, launch, insert, env = globalenv()) {
  name <- .addinTarget(ctx)
  obj  <- if (!is.null(name) && exists(name, envir = env, inherits = TRUE)) {
    get(name, envir = env, inherits = TRUE)
  }
  if (!is.null(obj) && !is.null(.addinOriginOf(obj))) {
    message("drawSEM: editing existing ", .addinOriginOf(obj), " '", name, "'.")
    .runEdit(ctx, obj, name, launch, insert)
  } else {
    stop("drawSEM: put the cursor on a model (", .addinWhyNot(name, env), ").", call. = FALSE)
  }
}

# Real-world plumbing shared by the two exported entry points.
.rstudioLaunch <- function(gm, onDone = NULL) {
  .runDrawSEMGadget(gm, viewer = shiny::dialogViewer("drawSEM", width = 1200, height = 800),
                    onDone = onDone, editMode = "layout")
}
.rstudioInsert <- function(text, row, column, id) {
  rstudioapi::insertText(rstudioapi::document_position(row, column), text, id = id)
}
# Capture the editor state BEFORE any gadget opens: once it does, "the active
# document" can change.
.captureEditorContext <- function() {
  if (!requireNamespace("rstudioapi", quietly = TRUE) || !rstudioapi::isAvailable()) {
    stop("This must be run from RStudio (package 'rstudioapi' required).", call. = FALSE)
  }
  ctx <- rstudioapi::getSourceEditorContext()
  if (is.null(ctx)) {
    stop("Open an R script or R Markdown file first; drawSEM inserts code into it.",
         call. = FALSE)
  }
  ctx
}

#' Lay out a model visually from the editor (RStudio addin) -- experimental
#'
#' @description
#' **Experimental.** The interface and the shape of the inserted code may
#' change.
#'
#' Opens the drawSEM editor in a dialog on the `GraphModel` or `MxModel` whose
#' name is under the cursor (or selected) in your script; it is an error if
#' there is none. The editor is **layout-only**: you can move nodes and run
#' Auto Layout, but not change the model's structure. When you click **Done**,
#' the new node positions are written into your script as a
#' `drawSEM::setLocation()` call on the line after the cursor, assigned back to
#' the model. Nothing is inserted if no node moved or the dialog was closed
#' without Done. To open a specific model without placing the cursor, use
#' [drawSEMEdit()].
#'
#' @details
#' `setLocation()` on an `MxModel` updates only its stored layout, so a fitted
#' model **keeps its fit**. A model with no stored positions is auto-laid out
#' when the editor opens; clicking Done then writes that layout, even if you
#' moved nothing.
#'
#' Registered in `inst/rstudio/addins.dcf`; find it under Tools > Addins, and
#' assign a keyboard shortcut in Tools > Modify Keyboard Shortcuts.
#'
#' @return Invisibly, the kind of code inserted: `"patch"` or `"none"`.
#' @seealso [drawSEMEdit()], [drawSEM()] for the full editor without script
#'   integration.
#' @export
drawSEMAddin <- function() {
  ctx <- .captureEditorContext()
  .runEditAddin(ctx, launch = .rstudioLaunch, insert = .rstudioInsert)
}

#' Lay out a specific model visually and write the layout into your script -- experimental
#'
#' @description
#' **Experimental.** Like the [drawSEMAddin()] addin, but you name the model
#' instead of placing the cursor on it, so it can be called from the console or
#' a script.
#'
#' Opens the layout-only editor on `model`. On **Done**, the new node positions
#' are inserted into the active source editor on the line after the cursor, as
#' a `setLocation()` call that updates the variable you passed (see
#' [drawSEMAddin()]). Nothing is inserted if no node moved or the dialog was
#' closed without Done.
#'
#' @param model A `GraphModel` or `MxModel`, passed as a variable name (the
#'   generated code assigns back to that name).
#'
#' @return Invisibly, the kind of code inserted: `"patch"` or `"none"`.
#' @examples
#' \dontrun{
#' drawSEMEdit(mymodel)
#' }
#' @seealso [drawSEMAddin()]
#' @export
drawSEMEdit <- function(model) {
  name <- deparse(substitute(model))
  if (!grepl("^[A-Za-z.][A-Za-z0-9._]*$", name)) {
    stop("'model' must be a variable name (the edit is written back to it), not an expression.",
         call. = FALSE)
  }
  if (is.null(.addinOriginOf(model))) {
    stop("'", name, "' must be a GraphModel or MxModel.", call. = FALSE)
  }
  ctx <- .captureEditorContext()
  .runEdit(ctx, model, name, launch = .rstudioLaunch, insert = .rstudioInsert)
}
