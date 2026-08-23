#' drawSEM Layout/Provenance Hints
#'
#' @description
#' Escrows drawSEM state an `mxModel` cannot represent -- node/path visual
#' positions, extra constant/dataset nodes, and exporter provenance -- so a
#' model built in drawSEM, run in OpenMx, and converted back with
#' `as.GraphModel()` recovers layout and identity instead of falling back to
#' auto-layout and the hardcoded constant/dataset labels `"1"`/`"data"`.
#'
#' Stored, by convention, at `m@options$drawSemHints` -- an option key OpenMx
#' does not recognize, and therefore never inspects or validates. Verified (on
#' OpenMx 2.22.11) to survive `mxRun()`, `mxTryHard()`, `mxAutoStart()`,
#' `omxSetParameters()`, `mxModel()` edits, `mxRename()`, `saveRDS()`, and
#' multigroup submodels, `identical()` each time, with no effect on the fit.
#' `mxOption(model, key, value, reset = TRUE)` is the one operation that drops
#' it, because OpenMx resets the entire options list before applying the new
#' key; treat a model with no `drawSemHints` the same as one that never had
#' any -- auto-layout, a single constant node labeled `"1"`, a single dataset
#' node labeled `"data"`.
#'
#' The class is a proper S4 object rather than a plain list so that
#' `length(hints) == 1` by construction: `mxModel`'s `show()` renders the
#' options list via `omxQuotes()`, which errors on any option value whose
#' top-level elements have length > 1 (`if` on a length > 1 condition is an
#' error since R 4.2). `omxQuotes()` has an explicit S4 branch that renders
#' just the class name, so `show(someModel)` never touches `object@model`.
#'
#' Deliberately holds only what the schema fragment cannot re-derive on its
#' own: no structure hash (node/path matching in `as.GraphModel()` handles
#' added, removed, and incomplete nodes; explicit OpenMx-side edits are meant
#' to show up), no constant-node value assignments (already encoded by the
#' fragment's own paths, e.g. `from: "1b"`), no data fingerprint (belongs
#' inside `model$nodes[[i]]$datasetSource`, beside `md5`).
#'
#' @slot schemaVersion Numeric; the schema version of `model`, for migration
#'   dispatch if the fragment shape changes later.
#' @slot model The model's schema fragment (`label`, `nodes`, `paths`,
#'   `optimization`), with every dataset node's `datasetSource$object`
#'   stripped -- embedded data would otherwise dominate the escrowed size.
#' @slot origin Character; the exporter stamp, e.g. `"drawSEM 0.1.0"`.
#' @slot exported Character; ISO-8601 UTC timestamp of when the hints were
#'   written.
#'
#' @keywords internal
setClass(
  "drawSemHints",
  representation(
    schemaVersion = "numeric",
    model = "list",
    origin = "character",
    exported = "character"
  )
)

setValidity("drawSemHints", function(object) {
  errors <- character(0)

  if (length(object@schemaVersion) != 1 || !is.numeric(object@schemaVersion)) {
    errors <- c(errors, "@schemaVersion must be a single numeric value")
  }
  if (!is.list(object@model)) {
    errors <- c(errors, "@model must be a list")
  }
  if (length(object@origin) != 1 || !is.character(object@origin)) {
    errors <- c(errors, "@origin must be a single character value")
  }
  if (length(object@exported) != 1 || !is.character(object@exported)) {
    errors <- c(errors, "@exported must be a single character value")
  }

  if (length(errors) == 0) TRUE else errors
})

#' @keywords internal
#' @noRd
setMethod("show", "drawSemHints", function(object) {
  cat(sprintf(
    "drawSemHints: model '%s', origin '%s', exported %s\n",
    object@model$label %||% "<unnamed>", object@origin, object@exported
  ))
})

#' Strip Embedded Data from a Model Fragment's Dataset Nodes
#'
#' Returns a copy of `model` with `datasetSource$object` removed from every
#' dataset node, keeping `type`, `columnTypes`, `rowCount`, and `md5`. Embedded
#' data can dominate the fragment's size many times over; the live `mxData` is
#' the data of record once the model has been built, so the embedded copy adds
#' nothing `drawSemHints` needs.
#'
#' @param model A single model's schema fragment (`label`, `nodes`, `paths`,
#'   `optimization`)
#'
#' @return The fragment with each dataset node's `datasetSource$object` set to
#'   NULL
#'
#' @keywords internal
stripDatasetObjects <- function(model) {
  model$nodes <- lapply(model$nodes %||% list(), function(node) {
    if (isTRUE(node$type == "dataset") && !is.null(node$datasetSource)) {
      node$datasetSource$object <- NULL
    }
    node
  })
  model
}

#' Build drawSemHints for a Model
#'
#' Constructs the `drawSemHints` object `as.MxModel()` attaches to the built
#' `mxModel` at `@options$drawSemHints`.
#'
#' @param schema The full schema list
#' @param model_id Which model's fragment to escrow
#'
#' @return A `drawSemHints` object
#'
#' @keywords internal
buildDrawSemHints <- function(schema, model_id) {
  model <- schema$models[[model_id]]

  version <- tryCatch(
    as.character(utils::packageVersion("drawSEM")),
    error = function(e) NA_character_
  )

  new(
    "drawSemHints",
    schemaVersion = as.numeric(schema$schemaVersion %||% 0),
    model = stripDatasetObjects(model),
    origin = sprintf("drawSEM %s", version),
    exported = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
  )
}

#' Read Back Valid drawSemHints from a Built MxModel
#'
#' Returns `x@options$drawSemHints` if it is a well-formed `drawSemHints` for
#' the schema version `as.GraphModel()` currently understands, else `NULL` --
#' treating a missing, corrupt, or version-mismatched value exactly like a
#' model that was never built by drawSEM: auto-layout, one constant node
#' labeled `"1"`, one dataset node labeled `"data"`.
#'
#' @param x An MxModel object
#'
#' @return A `drawSemHints` object, or NULL
#'
#' @keywords internal
readDrawSemHints <- function(x) {
  hints <- x@options$drawSemHints
  if (!is(hints, "drawSemHints")) {
    return(NULL)
  }
  if (!isTRUE(validObject(hints, test = TRUE))) {
    return(NULL)
  }
  if (!identical(hints@schemaVersion, 0)) {
    warning(
      sprintf(
        "Ignoring drawSemHints with unrecognized schemaVersion %s",
        paste(hints@schemaVersion, collapse = ", ")
      ),
      call. = FALSE
    )
    return(NULL)
  }
  hints
}

#' Remove drawSemHints from a Built MxModel
#'
#' Strips `@options$drawSemHints` from `model`, if present -- e.g. before
#' sharing a fitted model with a collaborator who doesn't use drawSEM, or to
#' force a later `as.GraphModel()` on it back to auto-layout and the default
#' `"1"`/`"data"` labels. Every other option on the model is left untouched
#' (see `?drawSemHints` for why: this is a single named-list-element removal,
#' not a reset of the whole options list).
#'
#' @param model An MxModel object
#'
#' @return `model` with `@options$drawSemHints` removed
#'
#' @examples
#' \dontrun{
#' om <- as.MxModel(g)
#' om_shareable <- dropDrawSemHints(om)
#' }
#'
#' @export
dropDrawSemHints <- function(model) {
  if (!is(model, "MxModel")) {
    stop("model must be an MxModel", call. = FALSE)
  }
  model@options$drawSemHints <- NULL
  model
}
