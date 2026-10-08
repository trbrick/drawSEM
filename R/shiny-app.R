#' @include drawSEM.R io.R fitting.R GraphModel-methods.R utilities.R
NULL

# ============================================================================
#  Internal helpers
# ============================================================================

#' Resolve initialModel argument to a GraphModel
#'
#' Converts NULL, list, JSON string, file path, MxModel, or GraphModel into a
#' GraphModel, merging any user-supplied data.
#'
#' @noRd
.resolveInitialModel <- function(initialModel, data) {
  # Normalise data= argument
  if (!is.null(data)) {
    if (is.data.frame(data)) {
      data <- list(data = data)
    } else if (!is.list(data)) {
      stop("'data' must be a data.frame or a named list of data.frames",
           call. = FALSE)
    }
  }

  if (is.null(initialModel)) {
    # Minimal empty schema
    schema <- list(
      schemaVersion = 0L,
      models = list(model1 = list(nodes = list(), paths = list()))
    )
    gm <- methods::new("GraphModel", schema = schema)
    if (!is.null(data)) gm@data <- data
    return(gm)
  }

  # MxModel: extract data before conversion
  if (methods::is(initialModel, "MxModel")) {
    gm <- as.GraphModel(initialModel)
    if (!is.null(data)) gm@data <- c(gm@data, data)
    return(gm)
  }

  # GraphModel, list, JSON string, or file path
  gm <- as.GraphModel(initialModel)
  if (!is.null(data)) gm@data <- c(gm@data, data)
  gm
}


# ── Edit history (undo/redo) across Done and reopening ─────────────────
# The editor sends its undo history on Done as one JSON string (format in
# drawsem-web/src/utils/editHistory.ts); R keeps it, opaque, in
# GraphModel@metadata$editHistory and hands it back to the widget when the
# model is reopened. It is never part of the schema, so exportSchema() and
# image export never see it.

# The history string from a done_request payload, or NULL.
.editHistoryFrom <- function(payload) {
  h <- payload$editHistory
  if (is.character(h) && length(h) == 1L && !is.na(h) && nzchar(h)) h else NULL
}

# Attach a history string to a semWidget() (kept separate from the schema).
.withEditHistory <- function(widget, editHistory) {
  if (is.character(editHistory) && length(editHistory) == 1L && nzchar(editHistory)) {
    widget$x$editHistory <- editHistory
  }
  widget
}

# Whether the model's latest fit record matches its current structure.
.fitIsCurrent <- function(gm) {
  fit <- suppressWarnings(getFitResults(gm))
  !is.null(fit) && !identical(fit, NA)
}

.fitStatusOf <- function(gm) {
  if (isTRUE(suppressWarnings(getFitResults(gm))$converged)) "converged" else "failed"
}

#' Build the drawSEM Shiny UI
#' @noRd
.drawSEM_ui <- function() {

  # The widget in 'shiny' viewMode provides its own full toolbar:
  # add nodes/paths, load data/model, save, image, export, fit, done.
  # R only needs to host the widget container and a modal root for
  # server-side dialogs (image downloads, data loading, code results).

  shiny::tagList(
    shiny::tags$head(
      shiny::tags$style(
        "html,body{margin:0;padding:0;overflow:hidden;height:100%;background:#fff;}
         #drawsem-widget-container{
           position:fixed; top:0; left:0; right:0; bottom:0; overflow:hidden;
         }
         #drawsem-widget-container .shiny-html-output,
         #drawsem-widget-container .shiny-html-output>div,
         #drawsem-widget-container .html-widget-output,
         #drawsem-widget-container .html-widget {
           width:100% !important;
           height:100% !important;
         }
         #drawsem-widget-container .html-fill-item { flex:none !important; }
         /* Form elements inside Tailwind modals */
         .dsem-label { display:block; font-size:13px; font-weight:500; color:#475569; margin-bottom:4px; }
         .dsem-field { margin-bottom:14px; }
         .dsem-input { display:block; width:100%; padding:7px 10px; font-size:13px;
           border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box; background:white; }
         .dsem-input:focus { outline:none; border-color:#3b82f6;
           box-shadow:0 0 0 3px rgba(59,130,246,0.15); }"
      )
    ),
    shiny::div(id = "drawsem-modal-host"),
    shiny::div(id = "drawsem-widget-container", shiny::uiOutput("sem_widget_ui"))
  )
}


# ---- server-side CSV browser (Load Data) ------------------------------------
# The browser's own upload dialog cannot be pointed at a folder, so Load Data
# browses the R side's file system instead, starting in the directory
# drawSEM() was launched from. These helpers are pure so they can be tested.

# Folders and CSV files directly inside `dir` (full paths, sorted by name,
# hidden entries skipped). Unreadable folders list as empty.
.listCsvDir <- function(dir) {
  entries <- tryCatch(list.files(dir, full.names = TRUE, no.. = TRUE),
                      error = function(e) character(0))
  is_dir <- dir.exists(entries)
  by_name <- function(x) x[order(tolower(basename(x)))]
  list(
    dirs  = by_name(entries[is_dir]),
    files = by_name(entries[!is_dir & grepl("\\.csv$", entries, ignore.case = TRUE)])
  )
}

# Breadcrumbs for `path`, root first: a list of list(name, path).
.pathCrumbs <- function(path) {
  cur <- normalizePath(path, winslash = "/", mustWork = FALSE)
  out <- list()
  repeat {
    parent <- dirname(cur)
    out <- c(list(list(name = if (identical(parent, cur)) cur else basename(cur), path = cur)), out)
    if (identical(parent, cur)) break
    cur <- parent
  }
  out
}

# Places to jump to besides the folder tree: the launch directory, home, and
# the machine's drives (Windows drive letters, macOS volumes, or "/").
.browseRoots <- function(launchDir) {
  drives <- if (.Platform$OS.type == "windows") {
    d <- paste0(LETTERS, ":/")
    stats::setNames(d[dir.exists(d)], substr(d[dir.exists(d)], 1, 2))
  } else if (dir.exists("/Volumes")) {
    v <- list.files("/Volumes", full.names = TRUE)
    stats::setNames(v, basename(v))
  } else {
    c("/" = "/")
  }
  c(`Working directory` = launchDir, Home = path.expand("~"), drives)
}

# Column names and summary statistics of the data R holds for file-based
# datasets, for the editor's column panel: in Shiny the editor cannot read data
# files itself. Display only, never part of the schema. Embedded datasets are
# left out (the editor summarizes those itself), as are datasets R has no data
# for (the editor shows those as not loaded). Statistics match the editor's
# own (computeColumnStats in CanvasTool). Returns a list keyed by dataset label.
.datasetSummaries <- function(gm) {
  model <- gm@schema$models[[1]] %||% list()
  out <- list()
  for (n in model$nodes %||% list()) {
    if (!identical(n$type, "dataset") || identical(n$datasetSource$type, "embedded")) next
    df <- gm@data[[as.character(n$label)]]
    if (!is.data.frame(df)) next
    out[[as.character(n$label)]] <- list(
      fileName = basename(n$datasetSource$location %||% as.character(n$label)),
      headers  = names(df),
      columns  = unname(lapply(names(df), function(col) .columnSummary(df[[col]], col)))
    )
  }
  out
}

.columnSummary <- function(x, name) {
  present <- x[!is.na(x) & !(is.character(x) & x == "")]
  num <- suppressWarnings(as.numeric(as.character(present)))
  num <- num[!is.na(num)]
  list(
    name        = name,
    distinct    = length(unique(present)),
    cardinality = length(unique(present)),
    mean        = if (length(num) > 0) mean(num) else NULL,
    std         = if (length(num) > 1) stats::sd(num) else NULL,
    min         = if (length(num) > 0) min(num) else NULL,
    max         = if (length(num) > 0) max(num) else NULL,
    count       = length(present)
  )
}

# Default dataset label for a chosen file: its name without the extension.
.datasetLabelFromFile <- function(fileName) {
  tools::file_path_sans_ext(basename(fileName))
}

# TRUE when a node other than a dataset node already uses `label` in the
# schema's first model (where .attachDatasetNode() writes).
.labelTakenByNonDataset <- function(schema, label) {
  model_ids <- names(schema$models %||% list())
  if (length(model_ids) == 0) return(FALSE)
  nodes <- schema$models[[model_ids[[1]]]]$nodes %||% list()
  any(vapply(nodes, function(n) identical(n$label, label) && !identical(n$type, "dataset"), logical(1)))
}

# Add (or refresh) the dataset node labelled `label` for data `df` in the
# schema's first model, recording where the data lives:
#   "embedded": copied into the model (datasetSource type embedded);
#   "file":     a connection to the CSV `file` (stored as `location`, with column
#               types, md5 and row count); R holds the data;
#   "session":  no datasetSource; the data lives only in the R session (it
#               travels with the GraphModel, and JSON exports can embed it).
# An existing dataset node with that label is updated; otherwise a node is
# appended with no position: the editor places it beside the diagram, as Auto
# Layout would (layoutIncomingModel()).
.attachDatasetNode <- function(schema, label, df, source = c("embedded", "file", "session"),
                               file = NULL, location = NULL) {
  source <- match.arg(source)
  model_ids <- names(schema$models %||% list())
  if (length(model_ids) == 0) return(schema)
  model_id <- model_ids[[1]]
  nodes <- schema$models[[model_id]]$nodes %||% list()

  dataset_source <- switch(source,
    embedded = {
      data_as_json <- dataFrameToJSON(df)
      list(
        type = "embedded",
        format = "json",
        encoding = "UTF-8",
        # Named list so JSON serialization produces an object map.
        columnTypes = as.list(data_as_json$columnTypes),
        object = data_as_json$object,
        rowCount = nrow(df)
      )
    },
    file = list(
      type = "file",
      location = location %||% file,
      format = "csv",
      encoding = "UTF-8",
      columnTypes = as.list(dataFrameToJSON(utils::head(df, 1))$columnTypes),
      md5 = unname(tools::md5sum(file)),
      rowCount = nrow(df)
    ),
    session = NULL
  )

  # Position() returns NA (not NULL) when nothing matches.
  existing_idx <- Position(
    function(n) identical(n$type, "dataset") && identical(n$label, label),
    nodes
  )
  if (!is.na(existing_idx)) {
    nodes[[existing_idx]]$datasetSource <- dataset_source   # NULL removes it (session)
  } else {
    node <- list(label = label, type = "dataset")
    if (!is.null(dataset_source)) node$datasetSource <- dataset_source
    nodes[[length(nodes) + 1]] <- node
  }
  schema$models[[model_id]]$nodes <- nodes
  schema
}

# Labels of dataset nodes whose data exists only in the R session (no
# datasetSource, data in gm@data).
.sessionOnlyDatasets <- function(gm) {
  if (is.null(gm)) return(character(0))
  nodes <- gm@schema$models[[1]]$nodes %||% list()
  labs <- vapply(Filter(function(n) identical(n$type, "dataset") && is.null(n$datasetSource), nodes),
                 function(n) as.character(n$label), character(1))
  labs[vapply(labs, function(l) is.data.frame(gm@data[[l]]), logical(1))]
}

# A data file's location as stored in a model: relative to `base` (the folder
# drawSEM() was launched from) when the file is inside it, so reopening the
# model from the same project finds it; absolute otherwise.
.locationFor <- function(path, base) {
  p <- normalizePath(path, winslash = "/", mustWork = FALSE)
  b <- normalizePath(base, winslash = "/", mustWork = FALSE)
  if (startsWith(p, paste0(sub("/$", "", b), "/"))) substring(p, nchar(sub("/$", "", b)) + 2) else p
}

# Data frames (including tibbles) in `env`, for the Load Data dialog's
# "From R session" tab: a named list of their dimensions.
.sessionDataFrames <- function(env = globalenv()) {
  nms <- ls(env)
  keep <- nms[vapply(nms, function(nm) is.data.frame(get(nm, envir = env)), logical(1))]
  stats::setNames(lapply(keep, function(nm) dim(get(nm, envir = env))), keep)
}


#' Build the drawSEM Shiny server
#' @noRd
.drawSEM_server <- function(input, output, session, initialGM, onDone = NULL,
                            editMode = "full") {
  currentModel             <- shiny::reactiveVal(initialGM)
  # Start from the model's latest fit: none -> unfitted; current -> converged
  # (or failed); out of date -> stale.
  initialFit <- if (!is.null(initialGM)) suppressWarnings(getFitResults(initialGM)) else NULL
  initialStatus <- if (is.null(initialFit)) {
    "unfitted"
  } else if (identical(initialFit, NA)) {
    "stale"
  } else if (isTRUE(initialFit$converged)) {
    "converged"
  } else {
    "failed"
  }
  fitStatus                <- shiny::reactiveVal(initialStatus)
  svgData                  <- shiny::reactiveVal(NULL)
  lastVarname              <- shiny::reactiveVal("myModel")
  lastStructuralFingerprint <- shiny::reactiveVal(
    if (identical(initialStatus, "unfitted")) NULL else hashStructure(initialGM))

  # ── Tailwind modal helpers ─────────────────────────────────────────────
  .modal <- function(id, title, body, footer = NULL, size = "m") {
    max_w <- switch(size, s = "320px", l = "720px", "520px")
    close_js <- sprintf("Shiny.setInputValue('modal_close','%s',{priority:'event'})", id)
    btn_style <- function(primary) {
      base <- "cursor:pointer; border-radius:6px; padding:6px 14px; font-size:13px; font-family:system-ui,sans-serif;"
      if (primary) paste0(base, "background:#2563eb; color:#fff; border:none;")
      else         paste0(base, "background:#fff; color:#374151; border:1px solid #d1d5db;")
    }
    # Wrap each footer element so Shiny's actionButton/downloadButton get correct display
    footer_wrapped <- if (!is.null(footer)) {
      shiny::div(
        style = "padding:12px 20px 16px; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:8px; flex-shrink:0;",
        footer
      )
    }
    environment(btn_style) <- environment()
    shiny::div(
      id = id,
      style = "position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; padding:16px;",
      onclick = close_js,
      shiny::div(
        style = sprintf("background:white; border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,0.3); width:100%%; max-width:%s; max-height:85vh; display:flex; flex-direction:column; font-family:system-ui,sans-serif;", max_w),
        onclick = "event.stopPropagation()",
        shiny::div(
          style = "display:flex; align-items:center; justify-content:space-between; padding:16px 20px 12px; border-bottom:1px solid #e2e8f0; flex-shrink:0;",
          shiny::tags$h2(style = "margin:0; font-size:15px; font-weight:600; color:#1e293b;", title),
          shiny::tags$button(
            style = "background:none; border:none; color:#94a3b8; font-size:22px; line-height:1; cursor:pointer; padding:0;",
            onclick = close_js, shiny::HTML("&times;")
          )
        ),
        shiny::div(style = "padding:16px 20px; overflow-y:auto; flex:1;", body),
        footer_wrapped
      )
    )
  }
  .closeModal <- function(id) shiny::removeUI(paste0("#", id), immediate = TRUE)

  # Close modal when backdrop or × is clicked
  shiny::observeEvent(input$modal_close, {
    .closeModal(input$modal_close)
  }, ignoreNULL = TRUE, ignoreInit = TRUE)

  # ── Data / Load helpers ───────────────────────────────────────────────
  # `forLabel`: connect data to this existing dataset node (its label is
  # pre-filled, so Attach refreshes that node rather than adding one).
  .showDataModal <- function(gm, forLabel = NULL) {
    dataset_list <- if (!is.null(gm) && length(gm@data) > 0) {
      rows <- lapply(names(gm@data), function(nm) {
        val  <- gm@data[[nm]]
        desc <- if (is.data.frame(val)) sprintf("%d \u00d7 %d", nrow(val), ncol(val)) else as.character(val)
        shiny::tags$tr(
          shiny::tags$td(style = "font-weight:600; padding:2px 8px;", nm),
          shiny::tags$td(style = "color:#555; padding:2px 8px;", desc)
        )
      })
      shiny::tagList(
        shiny::tags$hr(style = "border:none; border-top:1px solid #e2e8f0; margin:12px 0;"),
        shiny::tags$p(style = "font-size:12px; font-weight:600; color:#64748b; margin:0 0 6px;", "Loaded datasets"),
        shiny::tags$table(style = "font-size:12px; width:100%;", shiny::tags$tbody(rows))
      )
    } else {
      shiny::p("No datasets loaded yet.", style = "color:#888; font-size:13px;")
    }
    dataTab("file")
    selectedRObject(NULL)
    tab_btn <- function(id, text) {
      shiny::tags$button(type = "button", id = paste0("dsem-data-tab-", id),
        onclick = sprintf("Shiny.setInputValue('data_tab','%s',{priority:'event'})", id), text)
    }
    body_ui <- shiny::tagList(
      shiny::tags$style(
        "#dsem-modal-data .dsem-tabs { display:flex; gap:4px; border-bottom:1px solid #e2e8f0; margin-bottom:10px; }
         #dsem-modal-data .dsem-tabs button { background:none; border:none; border-bottom:2px solid transparent;
           padding:6px 10px; font-size:13px; cursor:pointer; color:#475569; }"
      ),
      shiny::div(class = "dsem-tabs", tab_btn("file", "File"), tab_btn("r", "From R session")),
      shiny::uiOutput("data_source_ui"),
      shiny::div(class = "dsem-field",
        shiny::tags$label(class = "dsem-label", `for` = "csv_dataset_name", "Dataset label"),
        shiny::textInput("csv_dataset_name", NULL, value = forLabel %||% "",
                         placeholder = "e.g. mydata", width = "100%")
      ),
      shiny::div(class = "dsem-field",
        shiny::checkboxInput("data_embed", "Embed the data in the model", value = FALSE),
        shiny::uiOutput("data_embed_help")
      ),
      shiny::actionButton("attach_csv_btn", "Attach",
        style = "background:#2563eb; color:#fff; border:none; border-radius:6px; padding:6px 14px; font-size:13px; cursor:pointer;"),
      dataset_list
    )
    footer_ui <- shiny::tags$button(
      style = "background:#fff; color:#374151; border:1px solid #d1d5db; border-radius:6px; padding:6px 14px; font-size:13px; cursor:pointer; font-family:system-ui;",
      onclick = "Shiny.setInputValue('modal_close','dsem-modal-data',{priority:'event'})",
      "Close"
    )
    shiny::insertUI("#drawsem-modal-host", "afterBegin",
      .modal("dsem-modal-data",
             if (is.null(forLabel)) "Manage Datasets" else paste0("Connect data to '", forLabel, "'"),
             body_ui, footer_ui),
      immediate = TRUE)
  }

  .showLoadModal <- function() {
    body_ui <- shiny::div(class = "dsem-field",
      shiny::tags$label(class = "dsem-label", `for` = "load_model_json", "Schema JSON file"),
      shiny::fileInput("load_model_json", NULL,
        accept = c(".json", "application/json"), width = "100%")
    )
    footer_ui <- shiny::tagList(
      shiny::tags$button(
        style = "background:#fff; color:#374151; border:1px solid #d1d5db; border-radius:6px; padding:6px 14px; font-size:13px; cursor:pointer; font-family:system-ui;",
        onclick = "Shiny.setInputValue('modal_close','dsem-modal-load',{priority:'event'})",
        "Cancel"
      ),
      shiny::actionButton("confirm_load_model_btn", "Load",
        style = "background:#2563eb; color:#fff; border:none; border-radius:6px; padding:6px 14px; font-size:13px; cursor:pointer;")
    )
    shiny::insertUI("#drawsem-modal-host", "afterBegin",
      .modal("dsem-modal-load", "Load Model from JSON", body_ui, footer_ui, size = "s"),
      immediate = TRUE)
  }

  # ── Widget (rendered once with initial model) ──────────────────────────
  output$sem_widget_ui <- shiny::renderUI({
    schema <- if (!is.null(initialGM)) initialGM@schema else NULL
    widget <- semWidget(initialModel = schema, width = "100%", height = "100%", editMode = editMode)
    .withEditHistory(widget, if (!is.null(initialGM)) initialGM@metadata$editHistory)
  })

  # ── Model updates from JS ──────────────────────────────────────────────
  # After a fit, R pushes update_model and the widget echoes the model back.
  # The echo is structurally identical, so the hashStructure() check below
  # keeps the fit "converged"; no echo suppression is needed.
  shiny::observeEvent(input$graph_model, {
    tryCatch({
      gm  <- as.GraphModel(input$graph_model)
      old <- currentModel()
      if (!is.null(old) && length(old@data) > 0) {
        for (nm in names(old@data)) {
          if (is.null(gm@data[[nm]])) gm@data[[nm]] <- old@data[[nm]]
        }
      }
      # Keep the fitted MxModel across echoes; as.MxModel() uses it only while
      # the model still matches what was fitted.
      gm <- .carryCachedFit(gm, old)
      currentModel(gm)
      # Empty model (Clear) → reset to unfitted
      first_model <- (gm@schema$models %||% list())[[1]]
      is_empty <- length(first_model$nodes %||% list()) == 0 &&
                  length(first_model$paths %||% list()) == 0
      if (is_empty) {
        .sendFitStatus("unfitted")
        svgData(NULL)
      } else if (fitStatus() == "stale" && .fitIsCurrent(gm)) {
        # Back at the fitted structure (e.g. undo/redo): the editor carries the
        # fit results forward, so the fit applies again.
        lastStructuralFingerprint(hashStructure(gm))
        .sendFitStatus(.fitStatusOf(gm))
      } else if (fitStatus() == "converged") {
        # Only dirty the fit on structural changes — visual-only moves do not
        # reset a converged fit.
        new_fp <- hashStructure(gm)
        if (!identical(new_fp, lastStructuralFingerprint())) {
          .sendFitStatus("stale")
        }
        lastStructuralFingerprint(new_fp)
      }
    }, error = function(e) {
      shiny::showNotification(paste("Error parsing model:", conditionMessage(e)),
                              type = "error", duration = 8)
    })
  }, ignoreNULL = TRUE, ignoreInit = TRUE)

  # Column information for file-based datasets R holds data for (see
  # .datasetSummaries()); sent on startup and after every model pushed.
  .sendDatasetSummaries <- function(gm) {
    if (is.null(gm)) return(invisible())
    session$sendCustomMessage("dataset_summaries", list(datasets = .datasetSummaries(gm)))
  }

  # ── Sync fit status to React toolbar ──────────────────────────────────
  .sendFitStatus <- function(status) {
    fitStatus(status)
    session$sendCustomMessage("fit_status_update", list(status = status))
  }

  # ── Signal readiness: push current fit status to toolbar ───────────────
  shiny::observeEvent(input$graph_tool_ready, {
    session$sendCustomMessage("fit_status_update", list(status = fitStatus()))
    .sendDatasetSummaries(currentModel())
  }, ignoreNULL = TRUE)

  # ── Data modal ("Load Data" toolbar button in Shiny mode) ─────────────
  shiny::observeEvent(input$load_data_request, {
    selectedCsv(NULL)
    label <- input$load_data_request$datasetLabel
    .showDataModal(currentModel(), if (is.character(label) && nzchar(label)) label)
  }, ignoreNULL = TRUE)

  # ── Load Model modal ("Load Model" toolbar button in Shiny mode) ───────
  shiny::observeEvent(input$load_model_request, {
    .showLoadModal()
  }, ignoreNULL = TRUE)

  shiny::observeEvent(input$confirm_load_model_btn, {
    shiny::req(input$load_model_json)
    tryCatch({
      gm <- loadGraphModel(input$load_model_json$datapath)
      currentModel(gm)
      fitStatus("unfitted")
      svgData(NULL)
      session$sendCustomMessage("update_model", list(schema = gm@schema, kind = "load"))
      .sendDatasetSummaries(gm)
      .closeModal("dsem-modal-load")
      shiny::showNotification("Model loaded.", type = "message", duration = 2)
    }, error = function(e) {
      shiny::showNotification(paste("Could not load model:", conditionMessage(e)),
                              type = "error", duration = 8)
    })
  })

  # ── CSV browser (Load Data) ──────────────────────────────────────────
  # Starts in the directory drawSEM() was launched from; the folder shown is
  # remembered for the rest of the session.
  launchDir   <- normalizePath(getwd(), winslash = "/")
  csvDir      <- shiny::reactiveVal(launchDir)
  selectedCsv <- shiny::reactiveVal(NULL)
  dataTab <- shiny::reactiveVal("file")            # Load Data tab: "file" or "r"
  selectedRObject <- shiny::reactiveVal(NULL)      # data frame name picked on the "r" tab

  shiny::observeEvent(input$data_tab, dataTab(input$data_tab))

  output$data_source_ui <- shiny::renderUI({
    active <- dataTab()
    tab_css <- shiny::tags$style(sprintf(
      "#dsem-data-tab-%s { border-bottom-color:#2563eb !important; color:#1e293b !important; font-weight:600; }", active))
    if (identical(active, "r")) {
      frames <- .sessionDataFrames()
      chosen <- selectedRObject()
      row_style <- "display:flex; justify-content:space-between; padding:3px 8px; cursor:pointer; border-radius:4px; font-size:13px;"
      rows <- lapply(names(frames), function(nm) {
        d <- frames[[nm]]
        shiny::div(style = paste0(row_style, if (identical(nm, chosen)) "background:#dbeafe; font-weight:600;" else ""),
                   onclick = sprintf("Shiny.setInputValue('data_r_pick', %s, {priority:'event'})",
                                     jsonlite::toJSON(nm, auto_unbox = TRUE)),
                   shiny::span(nm), shiny::span(style = "color:#64748b;", sprintf("%d \u00d7 %d", d[1], d[2])))
      })
      shiny::tagList(tab_css, shiny::div(class = "dsem-field",
        shiny::tags$label(class = "dsem-label", "Data frame in the R session"),
        shiny::div(style = "border:1px solid #e2e8f0; border-radius:6px; max-height:220px; overflow:auto; padding:4px;",
          if (length(rows)) rows else shiny::div(style = "color:#94a3b8; font-size:12px; padding:6px 8px;",
                                                  "No data frames in the global environment."))))
    } else {
      shiny::tagList(tab_css, shiny::div(class = "dsem-field",
        shiny::tags$label(class = "dsem-label", "CSV file"),
        shiny::uiOutput("csv_browser")))
    }
  })

  output$data_embed_help <- shiny::renderUI({
    off <- if (identical(dataTab(), "r")) {
      "Off: the data stays in this R session. It travels with the model in R, and JSON exports can embed it."
    } else {
      "Off: the model records where the file is, and R reads it."
    }
    shiny::div(style = "font-size:12px; color:#64748b; margin-top:-6px;", off)
  })

  # Picking a data frame defaults the dataset label to its name, unless one was typed.
  shiny::observeEvent(input$data_r_pick, {
    nm <- as.character(input$data_r_pick)
    if (!nm %in% names(.sessionDataFrames())) return()
    selectedRObject(nm)
    if (!nzchar(trimws(input$csv_dataset_name %||% ""))) {
      shiny::updateTextInput(session, "csv_dataset_name", value = nm)
    }
  })

  # onclick handler that sends `path` to input `id` (paths JSON-escaped).
  .sendPath <- function(id, path) {
    sprintf("Shiny.setInputValue('%s', %s, {priority:'event'})",
            id, jsonlite::toJSON(path, auto_unbox = TRUE))
  }

  output$csv_browser <- shiny::renderUI({
    dir     <- csvDir()
    listing <- .listCsvDir(dir)
    chosen  <- selectedCsv()
    row_style <- "display:flex; align-items:center; gap:6px; padding:3px 8px; cursor:pointer; border-radius:4px; font-size:13px;"
    chip_style <- "background:#f1f5f9; border:1px solid #e2e8f0; border-radius:12px; padding:1px 8px; font-size:12px; cursor:pointer; color:#334155;"

    roots <- .browseRoots(launchDir)
    jump <- lapply(names(roots), function(nm) {
      shiny::tags$button(type = "button", style = chip_style,
                         onclick = .sendPath("csv_browser_nav", roots[[nm]]), nm)
    })
    crumbs <- .pathCrumbs(dir)
    crumb_ui <- lapply(seq_along(crumbs), function(i) {
      cr <- crumbs[[i]]
      shiny::tagList(
        if (i > 1) shiny::span(style = "color:#94a3b8;", "/"),
        shiny::tags$a(href = "#", style = "color:#2563eb; text-decoration:none;",
                      onclick = paste0(.sendPath("csv_browser_nav", cr$path), "; return false;"),
                      cr$name)
      )
    })
    up <- dirname(dir)
    dir_rows <- lapply(listing$dirs, function(d) {
      shiny::div(style = row_style, onclick = .sendPath("csv_browser_nav", d),
                 shiny::span("\U0001F4C1"), basename(d))
    })
    file_rows <- lapply(listing$files, function(f) {
      sel <- identical(f, chosen)
      shiny::div(style = paste0(row_style, if (sel) "background:#dbeafe; font-weight:600;" else ""),
                 onclick = .sendPath("csv_browser_pick", f),
                 shiny::span("\U0001F4C4"), basename(f))
    })
    empty <- if (length(dir_rows) + length(file_rows) == 0) {
      shiny::div(style = "color:#94a3b8; font-size:12px; padding:6px 8px;", "No folders or CSV files here.")
    }

    shiny::tagList(
      shiny::div(style = "display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px;", jump),
      shiny::div(style = "display:flex; flex-wrap:wrap; align-items:center; gap:3px; font-size:12px; margin-bottom:4px;",
        shiny::tags$button(type = "button", style = chip_style, title = "Up one folder",
                           disabled = if (identical(up, dir)) NA,
                           onclick = .sendPath("csv_browser_nav", up), "\u2191 Up"),
        crumb_ui),
      shiny::div(style = "border:1px solid #e2e8f0; border-radius:6px; height:220px; overflow:auto; padding:4px;",
                 dir_rows, file_rows, empty),
      shiny::div(style = "font-size:12px; color:#475569; margin-top:4px;",
                 if (is.null(chosen)) "No file selected." else paste("Selected:", basename(chosen)))
    )
  })

  shiny::observeEvent(input$csv_browser_nav, {
    target <- as.character(input$csv_browser_nav)
    if (dir.exists(target)) csvDir(normalizePath(target, winslash = "/"))
  })

  # Picking a file also defaults the dataset label to its name, unless one
  # was typed.
  shiny::observeEvent(input$csv_browser_pick, {
    path <- as.character(input$csv_browser_pick)
    if (!file.exists(path)) return()
    selectedCsv(path)
    if (!nzchar(trimws(input$csv_dataset_name %||% ""))) {
      shiny::updateTextInput(session, "csv_dataset_name", value = .datasetLabelFromFile(path))
    }
  })

  shiny::observeEvent(input$attach_csv_btn, {
    from_r <- identical(dataTab(), "r")
    path <- selectedCsv()
    obj <- selectedRObject()
    if (from_r && is.null(obj)) {
      shiny::showNotification("Choose a data frame first.", type = "warning", duration = 4)
      return()
    }
    if (!from_r && is.null(path)) {
      shiny::showNotification("Choose a CSV file first.", type = "warning", duration = 4)
      return()
    }
    label <- trimws(input$csv_dataset_name %||% "")
    if (nchar(label) == 0) {
      shiny::showNotification("Enter a dataset label first.", type = "warning", duration = 4)
      return()
    }
    # Node labels are unique; only an existing dataset node may be refreshed.
    if (.labelTakenByNonDataset(currentModel()@schema, label)) {
      shiny::showNotification(sprintf("A node named '%s' already exists. Choose another dataset label.", label),
                              type = "warning", duration = 4)
      return()
    }
    embed <- isTRUE(input$data_embed)
    tryCatch({
      gm <- currentModel()
      if (is.null(gm)) {
        shiny::showNotification("No active model.", type = "warning", duration = 4)
        return()
      }
      if (from_r) {
        df <- as.data.frame(get(obj, envir = globalenv()))
        source <- if (embed) "embedded" else "session"
        gm@schema <- .attachDatasetNode(gm@schema, label, df, source)
      } else {
        df <- utils::read.csv(path, stringsAsFactors = FALSE)
        source <- if (embed) "embedded" else "file"
        gm@schema <- .attachDatasetNode(gm@schema, label, df, source,
                                        file = path, location = .locationFor(path, launchDir))
      }
      gm@data[[label]] <- df

      currentModel(gm)
      session$sendCustomMessage("update_model", list(schema = gm@schema, kind = "data"))
      .sendDatasetSummaries(gm)
      .closeModal("dsem-modal-data")
      how <- c(embedded = "embedded in the model", file = "connected to the file", session = "held in the R session")[[source]]
      shiny::showNotification(sprintf("Dataset '%s' attached (%d \u00d7 %d), %s.", label, nrow(df), ncol(df), how),
                              type = "message", duration = 4)
    }, error = function(e) {
      shiny::showNotification(paste("Could not load the data:", conditionMessage(e)),
                              type = "error", duration = 8)
    })
  })

  # ── Fit model ─────────────────────────────────────────────────────────
  shiny::observeEvent(input$fit_model_request, {
    gm <- currentModel()
    if (is.null(gm)) {
      shiny::showNotification("No model to fit.", type = "warning", duration = 4)
      return()
    }
    .sendFitStatus("fitting")

    result <- tryCatch(runModel(gm), error = function(e) e)

    if (inherits(result, "error")) {
      .sendFitStatus("failed")
      shiny::insertUI("#drawsem-modal-host", "afterBegin",
        .modal("dsem-modal-fit-fail", "Fit Failed",
          shiny::tags$pre(
            style = "color:#dc2626; font-family:monospace; white-space:pre-wrap; font-size:12px; margin:0;",
            conditionMessage(result)
          ),
          shiny::tags$button(
            style = "background:#fff; color:#374151; border:1px solid #d1d5db; border-radius:6px; padding:6px 14px; font-size:13px; cursor:pointer; font-family:system-ui;",
            onclick = "Shiny.setInputValue('modal_close','dsem-modal-fit-fail',{priority:'event'})",
            "Close"
          )
        ),
        immediate = TRUE
      )
      return()
    }

    currentModel(result)
    .sendFitStatus("converged")
    lastStructuralFingerprint(hashStructure(result))
    session$sendCustomMessage("update_model", list(schema = result@schema, kind = "fit"))
    .sendDatasetSummaries(result)

    fit_res    <- getFitResults(result)
    modal_body <- if (!is.null(fit_res) && !identical(fit_res, NA)) {
      ests  <- fit_res$parameterEstimates %||% list()
      ses   <- fit_res$standardErrors    %||% list()
      fit_v <- fit_res$fitValue          %||% NA_real_

      # AIC/BIC as OpenMx computed them (the fit record's backendOutput)
      idx <- c(list(`-2LL` = fit_v), .fitInfoCriteria(fit_res))
      idx_rows <- lapply(names(idx), function(nm) {
        val <- idx[[nm]]
        shiny::tags$tr(
          shiny::tags$td(style = "padding:2px 10px; font-weight:600;", nm),
          shiny::tags$td(style = "padding:2px 10px; font-family:monospace;",
                         if (is.na(val)) "NA" else sprintf("%.4f", as.numeric(val)))
        )
      })

      param_content <- if (length(ests) > 0) {
        nms    <- names(ests)
        # SEs aligned to the estimates by name (a missing SE may arrive as NULL)
        se_vec <- vapply(nms, function(nm) {
          v <- ses[[nm]]
          if (is.null(v) || length(v) == 0) NA_real_ else as.numeric(v[[1]])
        }, numeric(1))
        est_vec <- unlist(ests)
        p_rows  <- lapply(nms, function(nm) {
          shiny::tags$tr(
            shiny::tags$td(style = "padding:2px 8px;", nm),
            shiny::tags$td(style = "padding:2px 8px; font-family:monospace;",
                           sprintf("%.4f", est_vec[[nm]])),
            shiny::tags$td(style = "padding:2px 8px; font-family:monospace; color:#555;",
                           if (is.na(se_vec[[nm]])) "\u2014" else sprintf("%.4f", se_vec[[nm]]))
          )
        })
        shiny::tags$table(
          style = "font-size:12px; width:100%; border-collapse:collapse;",
          shiny::tags$thead(shiny::tags$tr(
            shiny::tags$th(style = "text-align:left; padding:2px 8px; border-bottom:1px solid #e2e8f0; font-weight:600;", "Parameter"),
            shiny::tags$th(style = "text-align:left; padding:2px 8px; border-bottom:1px solid #e2e8f0; font-weight:600;", "Estimate"),
            shiny::tags$th(style = "text-align:left; padding:2px 8px; border-bottom:1px solid #e2e8f0; font-weight:600; color:#64748b;", "SE")
          )),
          shiny::tags$tbody(p_rows)
        )
      } else {
        shiny::p("No parameter estimates available.", style = "color:#555;")
      }

      shiny::tagList(
        shiny::tags$h6("Fit indices"),
        shiny::tags$table(style = "font-size:13px; margin-bottom:12px;",
                          shiny::tags$tbody(idx_rows)),
        shiny::tags$hr(),
        shiny::tags$h6("Parameter estimates"),
        param_content
      )
    } else {
      shiny::p("Fitting converged, but no fit results were extracted.", style = "color:#555;")
    }

    shiny::insertUI("#drawsem-modal-host", "afterBegin",
      .modal(
        "dsem-modal-fit-results",
        sprintf("Fit Results \u2014 %s",
                if (!is.null(fit_res) && !identical(fit_res, NA) &&
                    isTRUE(fit_res$converged)) "Converged" else "Complete"),
        modal_body,
        shiny::tags$button(
          style = "background:#fff; color:#374151; border:1px solid #d1d5db; border-radius:6px; padding:6px 14px; font-size:13px; cursor:pointer; font-family:system-ui;",
          onclick = "Shiny.setInputValue('modal_close','dsem-modal-fit-results',{priority:'event'})",
          "Close"
        ),
        size = "l"
      ),
      immediate = TRUE
    )
  })

  # ── Save to R environment (dialog rendered in React, R just assigns) ──
  shiny::observeEvent(input$save_to_env_request, {
    varname <- trimws(input$save_to_env_request$varname %||% "")
    if (!grepl("^[a-zA-Z.][a-zA-Z0-9_.]*$", varname)) {
      shiny::showNotification(
        "Invalid R variable name. Use letters, digits, '.' or '_', starting with a letter or '.'.",
        type = "error", duration = 6)
      return()
    }
    lastVarname(varname)
    assign(varname, currentModel(), envir = .GlobalEnv)
    shiny::showNotification(sprintf("Saved as '%s' in .GlobalEnv.", varname),
                            type = "message", duration = 4)
  }, ignoreNULL = TRUE, ignoreInit = TRUE)

  # ── Image: JS sends SVG directly; R inserts download modal ────────────
  shiny::observeEvent(input$svg_export_data, {
    shiny::req(input$svg_export_data)
    svgData(input$svg_export_data)
    shiny::insertUI("#drawsem-modal-host", "afterBegin",
      .modal("dsem-modal-image", "Export Image",
        shiny::uiOutput("image_modal_body"),
        shiny::tags$button(
          style = "background:#fff; color:#374151; border:1px solid #d1d5db; border-radius:6px; padding:6px 14px; font-size:13px; cursor:pointer; font-family:system-ui;",
          onclick = "Shiny.setInputValue('modal_close','dsem-modal-image',{priority:'event'})",
          "Close"
        ),
        size = "s"
      ),
      immediate = TRUE
    )
  }, ignoreNULL = TRUE, ignoreInit = TRUE)

  # ── Export R code ──────────────────────────────────────────────────────
  shiny::observeEvent(input$export_request, {
    shiny::req(input$export_request)
    fmt <- input$export_request$format %||% "openmx"
    gm  <- currentModel()
    result <- tryCatch({
      if (fmt != "openmx") stop(sprintf("Export format '%s' is not yet supported.", fmt))
      schema_json <- jsonlite::toJSON(gm@schema, auto_unbox = TRUE, null = "null")
      code <- paste0(
        "# Generated by drawSEM\n",
        "library(drawSEM)\n\n",
        "schema_json <- ", deparse(as.character(schema_json)), "\n",
        "gm <- as.GraphModel(schema_json)\n",
        "result <- runModel(gm)\n",
        "summary(result)\n"
      )
      list(success = TRUE, code = code)
    }, error = function(e) {
      list(success = FALSE, error = conditionMessage(e))
    })
    session$sendCustomMessage(paste0("export_", fmt, "_result"), result)
  }, ignoreNULL = TRUE, ignoreInit = TRUE)

  output$image_modal_body <- shiny::renderUI({
    if (is.null(svgData())) {
      return(shiny::p(
        shiny::tags$span(
          style = "display:inline-block; width:12px; height:12px; border:2px solid #94a3b8; border-top-color:#3b82f6; border-radius:50%; animation:spin 0.8s linear infinite;"
        ),
        " Preparing canvas\u2026",
        style = "color:#555; font-size:13px;"
      ))
    }
    shiny::tagList(
      shiny::downloadButton("download_svg", "SVG",
        style = "background:#fff; color:#374151; border:1px solid #d1d5db; border-radius:6px; padding:6px 14px; font-size:13px; display:inline-flex; align-items:center; gap:5px; text-decoration:none; margin-right:6px;"),
      shiny::downloadButton("download_png", "PNG",
        style = "background:#fff; color:#374151; border:1px solid #d1d5db; border-radius:6px; padding:6px 14px; font-size:13px; display:inline-flex; align-items:center; gap:5px; text-decoration:none; margin-right:6px;"),
      shiny::downloadButton("download_pdf", "PDF",
        style = "background:#fff; color:#374151; border:1px solid #d1d5db; border-radius:6px; padding:6px 14px; font-size:13px; display:inline-flex; align-items:center; gap:5px; text-decoration:none;"),
      if (!requireNamespace("rsvg", quietly = TRUE))
        shiny::p("PNG/PDF require rsvg: install.packages('rsvg')",
                 style = "color:#888; font-size:11px; margin-top:8px;")
    )
  })

  # ── Save model as JSON (Save > JSON file in Shiny) ─────────────────────
  # Written by R so that data held only in the R session can be embedded.
  shiny::observeEvent(input$save_json_request, {
    session_only <- .sessionOnlyDatasets(currentModel())
    body_ui <- shiny::tagList(
      if (length(session_only) > 0) shiny::tagList(
        shiny::checkboxInput("json_embed", "Embed data held only in this R session", value = TRUE),
        shiny::div(style = "font-size:12px; color:#64748b; margin:-6px 0 10px;",
          sprintf("Dataset%s %s: without embedding, the file can only be reopened by reconnecting the data.",
                  if (length(session_only) > 1) "s" else "", paste(session_only, collapse = ", ")))
      ),
      shiny::downloadButton("download_json", "Download JSON",
        style = "background:#2563eb; color:#fff; border:none; border-radius:6px; padding:6px 14px; font-size:13px; text-decoration:none;")
    )
    footer_ui <- shiny::tags$button(
      style = "background:#fff; color:#374151; border:1px solid #d1d5db; border-radius:6px; padding:6px 14px; font-size:13px; cursor:pointer; font-family:system-ui;",
      onclick = "Shiny.setInputValue('modal_close','dsem-modal-json',{priority:'event'})",
      "Close"
    )
    shiny::insertUI("#drawsem-modal-host", "afterBegin",
      .modal("dsem-modal-json", "Save Model as JSON", body_ui, footer_ui, size = "s"),
      immediate = TRUE)
  }, ignoreNULL = TRUE)

  output$download_json <- shiny::downloadHandler(
    filename = function() {
      label <- currentModel()@schema$models[[1]]$label %||% "drawSEM_model"
      paste0(gsub("[^A-Za-z0-9._-]+", "_", label), ".json")
    },
    content = function(file) {
      exportSchema(currentModel(), file, embedData = !isFALSE(input$json_embed))
    }
  )

  output$download_svg <- shiny::downloadHandler(
    filename = function() paste0("drawSEM_", format(Sys.time(), "%Y%m%d_%H%M%S"), ".svg"),
    content  = function(file) { shiny::req(svgData()); writeLines(svgData(), file) }
  )

  output$download_png <- shiny::downloadHandler(
    filename = function() paste0("drawSEM_", format(Sys.time(), "%Y%m%d_%H%M%S"), ".png"),
    content  = function(file) {
      shiny::req(svgData())
      if (!requireNamespace("rsvg", quietly = TRUE)) {
        shiny::showNotification("PNG export requires the 'rsvg' package.",
                                type = "error", duration = 8); return()
      }
      tmp <- tempfile(fileext = ".svg"); on.exit(unlink(tmp))
      writeLines(svgData(), tmp); rsvg::rsvg_png(tmp, file)
    }
  )

  output$download_pdf <- shiny::downloadHandler(
    filename = function() paste0("drawSEM_", format(Sys.time(), "%Y%m%d_%H%M%S"), ".pdf"),
    content  = function(file) {
      shiny::req(svgData())
      if (!requireNamespace("rsvg", quietly = TRUE)) {
        shiny::showNotification("PDF export requires the 'rsvg' package.",
                                type = "error", duration = 8); return()
      }
      tmp <- tempfile(fileext = ".svg"); on.exit(unlink(tmp))
      writeLines(svgData(), tmp); rsvg::rsvg_pdf(tmp, file)
    }
  )

  # ── Done ──────────────────────────────────────────────────────────────
  shiny::observeEvent(input$done_request, {
    gm <- currentModel()
    # The editor's undo history, kept with the model so reopening it in the
    # editor restores it (never written to the schema; see .withEditHistory()).
    if (!is.null(gm)) gm@metadata$editHistory <- .editHistoryFrom(input$done_request)
    # Run caller work (e.g. the addin's insert into the editor) HERE, before
    # stopApp(): with dialogViewer() in RStudio, code after runGadget() may
    # never run (rstudio/rstudio#11714).
    if (is.function(onDone)) {
      tryCatch(onDone(gm), error = function(e) {
        message("drawSEM: ", conditionMessage(e))
        shiny::showNotification(conditionMessage(e), type = "error", duration = 10)
      })
    }
    shiny::stopApp(returnValue = gm)
  }, ignoreNULL = TRUE, ignoreInit = TRUE)

  # Reactive state handles, for tests (shiny::testServer exposes a module's
  # return value as session$returned). Unused by the app itself.
  invisible(list(currentModel = currentModel, fitStatus = fitStatus,
                 lastStructuralFingerprint = lastStructuralFingerprint))
}


# ============================================================================
#  Public API
# ============================================================================

#' Launch the Interactive SEM Editor
#'
#' Opens the drawSEM visual editor in a browser (or RStudio pane) via a Shiny
#' gadget. Provides panels for loading models, binding data, fitting in OpenMx,
#' and exporting results. Returns a \code{\link{GraphModel}} when the editor is
#' closed with "Done".
#'
#' @param initialModel Optional starting model. Accepts:
#'   \itemize{
#'     \item \code{NULL} — opens an empty model (default)
#'     \item \code{\link{GraphModel}} — opens with the supplied model
#'     \item \code{MxModel} — converted via \code{\link{as.GraphModel}};
#'       data is extracted automatically
#'     \item \code{list} — a schema list
#'     \item \code{character} — a JSON string, or a path to a \code{.json}
#'       schema file
#'   }
#' @param data Optional. A \code{data.frame} or named list of
#'   \code{data.frame}s to pre-load. When \code{initialModel} is an MxModel,
#'   data is already extracted automatically; this argument adds extra
#'   datasets or overrides them.
#' @param viewer Shiny viewer. Default: \code{\link[shiny]{browserViewer}()}
#'   opens a full browser tab. Alternatives: \code{shiny::dialogViewer()} or
#'   \code{shiny::paneViewer()}.
#' @param \dots Additional arguments passed to \code{\link[shiny]{runGadget}()}.
#'
#' @return A \code{\link{GraphModel}} representing the final model state, or
#'   \code{NULL} if the editor was closed without clicking Done. The editor's
#'   undo history is kept in its \code{@metadata$editHistory} (not in the
#'   schema, so never in exported files), and reopening the returned model with
#'   \code{drawSEM()} restores it.
#'
#' @examples
#' \dontrun{
#' # Open with an empty model
#' model <- drawSEM()
#'
#' # Open with an existing GraphModel
#' model <- drawSEM(initialModel = myGraphModel)
#'
#' # Open with a fitted MxModel (data auto-extracted)
#' model <- drawSEM(initialModel = fittedMxModel)
#'
#' # Open from a JSON schema file
#' model <- drawSEM(initialModel = "mymodel.json")
#'
#' # Use the RStudio viewer pane instead of the browser
#' model <- drawSEM(viewer = shiny::paneViewer())
#' }
#'
#' @seealso \code{\link{plotGraphModel}} for non-interactive display,
#'   \code{\link{renderGraphModel}} for custom Shiny embedding.
#'
#' @export
drawSEM <- function(
    initialModel = NULL,
    data         = NULL,
    viewer       = shiny::browserViewer(),
    ...) {

  .runDrawSEMGadget(.resolveInitialModel(initialModel, data), viewer, onDone = NULL, ...)
}

# Run the editor gadget on a resolved GraphModel. `onDone(gm)`, if given, is
# called inside the Done handler before the gadget stops (see above).
# `editMode = "layout"` restricts the editor to visual changes (the addin).
.runDrawSEMGadget <- function(gm, viewer, onDone = NULL, editMode = "full", ...) {
  ui <- .drawSEM_ui()

  server <- function(input, output, session) {
    .drawSEM_server(input, output, session, initialGM = gm, onDone = onDone,
                    editMode = editMode)
  }

  app <- shiny::shinyApp(ui = ui, server = server)
  shiny::runGadget(app, viewer = viewer, stopOnCancel = FALSE, ...)
}
