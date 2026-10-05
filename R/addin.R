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

# The addin flow. `ctx` must already have been captured by the caller, before
# any gadget is launched. `launch(gm)` runs the editor and returns a
# GraphModel or NULL; `insert(text, row, column, id)` writes into the script.
# Returns the tier of generated code ("none" if nothing was inserted).
.runEditAddin <- function(ctx, launch, insert, env = globalenv()) {
  name <- .addinTarget(ctx)
  existing <- !is.null(name) && exists(name, envir = env, inherits = TRUE) &&
    methods::is(get(name, envir = env, inherits = TRUE), "GraphModel")

  if (existing) {
    before  <- get(name, envir = env, inherits = TRUE)
    varName <- name
  } else {
    before  <- GraphModel()
    varName <- .freshModelName(env)
  }

  after <- launch(before)
  if (!methods::is(after, "GraphModel")) {
    message("drawSEM: editor closed without Done; nothing inserted.")
    return(invisible("none"))
  }

  res <- .generateEditCode(before, after, varName = varName, isNew = !existing)
  if (identical(res$tier, "none")) {
    message("drawSEM: no changes; nothing inserted.")
    return(invisible("none"))
  }

  header <- if (identical(res$tier, "json")) {
    warning("drawSEM: this edit could not be written as verb calls (", res$reason,
            "); inserting the whole model as JSON instead.", call. = FALSE)
    paste0("# drawSEM: whole model re-embedded as JSON (", res$reason, ")\n")
  } else {
    "# Edited with drawSEM\n"
  }
  spec <- .addinInsertSpec(ctx)
  insert(paste0(spec$prefix, header, res$code), spec$row, spec$column, ctx$id)
  invisible(res$tier)
}

#' Edit a GraphModel visually from the editor (RStudio addin)
#'
#' Opens the drawSEM editor in a dialog. If the cursor is on (or you have
#' selected) the name of a `GraphModel` in your global environment, the editor
#' opens that model; otherwise it starts blank. When you click **Done**, the
#' edit is written into your script as R code on the line after the cursor:
#' `drawSEM::` verb calls (`addPath()`, `changePath()`, `setLocation()`, ...) if
#' the change can be expressed that way, or the whole model re-embedded as JSON
#' (with a warning) if not. Nothing is inserted if you made no changes or
#' closed the dialog without clicking Done.
#'
#' Registered in `inst/rstudio/addins.dcf`; find it under Tools > Addins, and
#' assign a keyboard shortcut in Tools > Modify Keyboard Shortcuts.
#'
#' @return Invisibly, the kind of code inserted: `"patch"`, `"new"`, `"json"`,
#'   or `"none"`.
#' @seealso [drawSEM()] for the same editor without script integration.
#' @export
drawSEMAddin <- function() {
  if (!requireNamespace("rstudioapi", quietly = TRUE) || !rstudioapi::isAvailable()) {
    stop("drawSEMAddin() must be run from RStudio (package 'rstudioapi' required).",
         call. = FALSE)
  }
  # Capture the editor state BEFORE the gadget opens: once it does, "the
  # active document" can change.
  ctx <- rstudioapi::getSourceEditorContext()
  if (is.null(ctx)) {
    stop("Open an R script or R Markdown file first; drawSEM inserts code into it.",
         call. = FALSE)
  }
  .runEditAddin(
    ctx,
    launch = function(gm) {
      drawSEM(initialModel = gm, viewer = shiny::dialogViewer("drawSEM", width = 1200, height = 800))
    },
    insert = function(text, row, column, id) {
      rstudioapi::insertText(rstudioapi::document_position(row, column), text, id = id)
    }
  )
}
