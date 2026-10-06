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

# First of model, model2, model3... not already bound in `env`.
.freshModelName <- function(env, base = "model") {
  if (!exists(base, envir = env, inherits = TRUE)) return(base)
  i <- 2L
  while (exists(paste0(base, i), envir = env, inherits = TRUE)) i <- i + 1L
  paste0(base, i)
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

# Comment line placed above inserted code, by kind of code.
.addinHeader <- function(res, origin, fitted) {
  switch(res$tier,
    json = paste0("# drawSEM: whole model re-embedded as JSON (", res$reason, ")\n"),
    convert = paste0(
      "# drawSEM: structural edit; MxModel rebuilt via GraphModel. ",
      if (fitted) "Fit results are discarded -- refit with mxRun(). " else "",
      "Content the schema does not carry (e.g. custom algebras) is not preserved.\n"),
    "# Edited with drawSEM\n")
}

# Shared flow once the model to edit is known. `src` is the object to edit
# (GraphModel or MxModel) or NULL for a blank new model; `varName` is the name
# the generated code assigns to. `launch(gm, onDone)` runs the editor,
# calling `onDone(gm)` on Done if it can, and returns a GraphModel or NULL; `insert(text, row, column, id)` writes into the script.
# Returns the tier of generated code ("none" if nothing was inserted).
.runEdit <- function(ctx, src, varName, launch, insert) {
  isNew  <- is.null(src)
  origin <- if (isNew) "GraphModel" else .addinOriginOf(src)
  before <- if (isNew) GraphModel() else .addinOrigins[[origin]](src)
  fitted <- identical(origin, "MxModel") && length(src@output) > 0

  handled <- FALSE
  tier <- "none"
  finish <- function(after) {
    if (handled) return(invisible(tier))
    handled <<- TRUE
    tier <<- .finishEdit(ctx, before, after, varName, isNew, origin, fitted, insert)
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
.finishEdit <- function(ctx, before, after, varName, isNew, origin, fitted, insert) {
  if (!methods::is(after, "GraphModel")) {
    message("drawSEM: editor closed without Done; nothing inserted.")
    return("none")
  }

  res <- tryCatch(
    .generateEditCode(before, after, varName = varName, isNew = isNew, origin = origin),
    error = function(e) {
      stop("drawSEM: could not generate code for the edit: ", conditionMessage(e), call. = FALSE)
    })
  if (identical(res$tier, "none")) {
    message("drawSEM: no changes; nothing inserted.")
    return("none")
  }
  if (identical(res$tier, "json")) {
    warning("drawSEM: this edit could not be written as verb calls (", res$reason,
            "); inserting the whole model as JSON instead.", call. = FALSE)
  }
  spec <- .addinInsertSpec(ctx)
  text <- paste0(spec$prefix, .addinHeader(res, origin, fitted), res$code)
  message("drawSEM: inserting ", res$tier, " code at line ", spec$row, ".")
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
# names a GraphModel or MxModel in `env`; otherwise start blank), then edit.
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
    message("drawSEM: ", .addinWhyNot(name, env), "; starting a blank model.")
    .runEdit(ctx, NULL, .freshModelName(env), launch, insert)
  }
}

# Real-world plumbing shared by the two exported entry points.
.rstudioLaunch <- function(gm, onDone = NULL) {
  .runDrawSEMGadget(gm, viewer = shiny::dialogViewer("drawSEM", width = 1200, height = 800),
                    onDone = onDone)
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

#' Edit a model visually from the editor (RStudio addin) -- experimental
#'
#' @description
#' **Experimental.** The interface, the shape of the inserted code, and the
#' handling of `MxModel`s may change.
#'
#' Opens the drawSEM editor in a dialog. If the cursor is on (or you have
#' selected) the name of a `GraphModel` or `MxModel` in your global
#' environment, the editor opens that model; otherwise it starts blank. When
#' you click **Done**, the edit is written into your script as R code on the
#' line after the cursor. Nothing is inserted if you made no changes or closed
#' the dialog without clicking Done. To open a specific model without placing
#' the cursor, use [drawSEMEdit()].
#'
#' @details
#' What is inserted depends on the model and the edit:
#' * **GraphModel:** `drawSEM::` verb calls (`addPath()`, `changePath()`,
#'   `setLocation()`, ...) piped from the model and assigned back to it. If the
#'   change can't be expressed with verbs, the whole model is re-embedded as
#'   JSON, with a warning.
#' * **MxModel, layout-only edit:** a `setLocation()` call on the `MxModel`,
#'   which updates only its stored layout, so a fitted model **keeps its fit**.
#' * **MxModel, any other edit:** the model is rebuilt with
#'   `as.MxModel(as.GraphModel(model) |> <verbs>)` and assigned back over the
#'   original. This **discards any fit** and anything the schema doesn't carry
#'   (e.g. custom algebras); the inserted comment says so.
#' * **Blank start:** a from-scratch `drawSEM::GraphModel() |> ...` chain under
#'   a new name.
#'
#' Registered in `inst/rstudio/addins.dcf`; find it under Tools > Addins, and
#' assign a keyboard shortcut in Tools > Modify Keyboard Shortcuts.
#'
#' @return Invisibly, the kind of code inserted: `"patch"`, `"new"`,
#'   `"convert"`, `"json"`, or `"none"`.
#' @seealso [drawSEMEdit()], [drawSEM()] for the same editor without script
#'   integration.
#' @export
drawSEMAddin <- function() {
  ctx <- .captureEditorContext()
  .runEditAddin(ctx, launch = .rstudioLaunch, insert = .rstudioInsert)
}

#' Edit a specific model visually and write the edit into your script -- experimental
#'
#' @description
#' **Experimental.** Like the [drawSEMAddin()] addin, but you name the model
#' instead of placing the cursor on it, so it can be called from the console or
#' a script.
#'
#' Opens the editor on `model`. On **Done**, the edit is inserted into the
#' active source editor on the line after the cursor, as code that updates the
#' variable you passed (see [drawSEMAddin()] for what code is generated for each
#' kind of model and edit). Nothing is inserted if nothing changed or the dialog
#' was closed without Done.
#'
#' @param model A `GraphModel` or `MxModel`, passed as a variable name (the
#'   generated code assigns back to that name).
#'
#' @return Invisibly, the kind of code inserted: `"patch"`, `"convert"`,
#'   `"json"`, or `"none"`.
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
