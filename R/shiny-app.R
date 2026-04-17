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
      schemaVersion = 1L,
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


#' Build the drawSEM Shiny UI
#' @noRd
.drawSEM_ui <- function() {

  # The widget in 'shiny' viewMode already shows its full chrome:
  # toolbar (add nodes/paths, import JSON, auto-layout, path-label dropdown),
  # left layer panel, and floating selection popup.  The bottom bar here
  # provides only the R-backend operations the browser can't perform itself.

  bar_sep <- shiny::div(
    style = "border-left:1px solid rgba(255,255,255,0.18); align-self:stretch; margin:8px 3px; flex-shrink:0;"
  )

  bar_btn <- "height:30px; font-size:12px; padding:0 9px; background:transparent; color:#e2e8f0; border:1px solid rgba(255,255,255,0.3); border-radius:4px;"

  bottom_bar <- shiny::div(
    id = "drawsem-bar",
    style = paste0(
      "position:fixed; bottom:0; left:0; right:0; height:44px;",
      "background:#1e293b; color:#e2e8f0;",
      "display:flex; align-items:center; padding:0 10px; gap:4px;",
      "z-index:9999; box-shadow:0 -2px 6px rgba(0,0,0,0.4);",
      "font-family:system-ui,sans-serif; font-size:13px;"
    ),

    shiny::actionButton("new_model_btn", "New",
      icon = shiny::icon("plus"), style = bar_btn),
    shiny::actionButton("data_btn", "Data\u2026",
      icon = shiny::icon("database"), style = bar_btn),
    bar_sep,

    shiny::actionButton(
      "fit_btn", "Fit",
      icon = shiny::icon("play"),
      style = "height:30px; font-size:12px; padding:0 10px; background:#2563eb; color:#fff; border:none; border-radius:4px;"
    ),
    shiny::uiOutput("fit_status_ui", inline = TRUE),
    bar_sep,

    shiny::downloadButton("download_json", "JSON",
      style = paste0(bar_btn, " display:inline-flex; align-items:center; gap:5px; text-decoration:none;")),
    shiny::actionButton("save_to_r_btn", "Save to R\u2026",
      icon = shiny::icon("arrow-up-right-from-square"), style = bar_btn),
    shiny::actionButton("image_btn", "Image\u2026",
      icon = shiny::icon("image"), style = bar_btn),
    bar_sep,
    shiny::actionButton(
      "done_btn", "Done",
      icon = shiny::icon("check"),
      style = "height:30px; font-size:12px; padding:0 10px; background:#16a34a; color:#fff; border:none; border-radius:4px;"
    )
  )

  shiny::tagList(
    shiny::tags$head(
      shiny::tags$script("tailwind.config={corePlugins:{preflight:false}}"),
      shiny::tags$script(src = "https://cdn.tailwindcss.com"),
      shiny::tags$style(
        "html,body{margin:0;padding:0;overflow:hidden;height:100%;background:#fff;}
         #drawsem-widget-container{
           position:fixed; top:0; left:0; right:0; bottom:44px; overflow:hidden;
         }
         #drawsem-widget-container .shiny-html-output,
         #drawsem-widget-container .shiny-html-output>div,
         #drawsem-widget-container .html-widget-output,
         #drawsem-widget-container .html-widget {
           width:100% !important;
           height:100% !important;
         }
         #drawsem-widget-container .html-fill-item { flex:none !important; }
         #drawsem-bar .btn { box-shadow:none !important; }
         #drawsem-bar .btn:hover { filter:brightness(1.2); }
         #download_json .glyphicon, #download_json .fa { margin-right:4px; }
         .shiny-notification-panel { bottom:54px !important; }
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
    shiny::div(id = "drawsem-widget-container", shiny::uiOutput("sem_widget_ui")),
    bottom_bar
  )
}


#' Build the drawSEM Shiny server
#' @noRd
.drawSEM_server <- function(input, output, session, initialGM) {
  currentModel             <- shiny::reactiveVal(initialGM)
  fitStatus                <- shiny::reactiveVal("unfitted")
  svgData                  <- shiny::reactiveVal(NULL)
  lastVarname              <- shiny::reactiveVal("myModel")
  suppressNextEcho         <- shiny::reactiveVal(FALSE)
  lastStructuralFingerprint <- shiny::reactiveVal(NULL)

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
  .showDataModal <- function(gm) {
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
    body_ui <- shiny::tagList(
      shiny::div(class = "dsem-field",
        shiny::tags$label(class = "dsem-label", `for` = "load_csv_file", "CSV file"),
        shiny::fileInput("load_csv_file", NULL, accept = ".csv", width = "100%")
      ),
      shiny::div(class = "dsem-field",
        shiny::tags$label(class = "dsem-label", `for` = "csv_dataset_name", "Dataset label"),
        shiny::textInput("csv_dataset_name", NULL, placeholder = "e.g. mydata",
                         width = "100%")
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
      .modal("dsem-modal-data", "Manage Datasets", body_ui, footer_ui),
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
    semWidget(initialModel = schema, width = "100%", height = "100%")
  })

  # ── Model updates from JS ──────────────────────────────────────────────
  shiny::observeEvent(input$graph_model, {
    # When R pushes an update_model after fitting, JS echoes the model back.
    # Suppress that single echo so it does not flip converged→stale.
    if (isTRUE(suppressNextEcho())) {
      suppressNextEcho(FALSE)
      return()
    }
    tryCatch({
      gm  <- as.GraphModel(input$graph_model)
      old <- currentModel()
      if (!is.null(old) && length(old@data) > 0) {
        for (nm in names(old@data)) {
          if (is.null(gm@data[[nm]])) gm@data[[nm]] <- old@data[[nm]]
        }
      }
      currentModel(gm)
      # Only dirty the fit on structural changes — visual-only moves/resizes
      # do not reset a converged fit. Uses the same hashStructure() logic as
      # the schema's provenance.structureHash / fitResults[n].structureHash.
      if (fitStatus() == "converged") {
        new_fp <- hashStructure(gm)
        if (!identical(new_fp, lastStructuralFingerprint())) {
          fitStatus("stale")
        }
        lastStructuralFingerprint(new_fp)
      }
    }, error = function(e) {
      shiny::showNotification(paste("Error parsing model:", conditionMessage(e)),
                              type = "error", duration = 8)
    })
  }, ignoreNULL = TRUE, ignoreInit = TRUE)

  # ── Model name (centre of bar) ─────────────────────────────────────────
  output$model_name_display <- shiny::renderText({
    gm  <- currentModel()
    if (is.null(gm)) return("")
    ids <- names(gm@schema$models %||% list())
    if (length(ids) == 0) return("(unnamed)")
    # Prefer the human-readable label if set, otherwise fall back to the ID key
    labels <- vapply(ids, function(id) {
      lbl <- gm@schema$models[[id]]$label
      if (!is.null(lbl) && nzchar(lbl)) lbl else id
    }, character(1))
    paste(labels, collapse = ", ")
  })

  # ── Fit status dot ────────────────────────────────────────────────────
  output$fit_status_ui <- shiny::renderUI({
    colour <- switch(fitStatus(),
      unfitted  = "#64748b",
      fitting   = "#f59e0b",
      converged = "#22c55e",
      failed    = "#ef4444",
      stale     = "#f97316",
      "#64748b"
    )
    label <- switch(fitStatus(),
      unfitted  = "Not fitted",
      fitting   = "Fitting\u2026",
      converged = "Converged",
      failed    = "Failed",
      stale     = "Stale",
      fitStatus()
    )
    shiny::tags$span(
      style = "display:inline-flex; align-items:center; gap:5px; font-size:11px; color:#cbd5e1;",
      shiny::tags$span(
        style = sprintf("width:7px; height:7px; border-radius:50%%; background:%s; flex-shrink:0;", colour)
      ),
      label
    )
  })

  # ── New empty model ────────────────────────────────────────────────────
  shiny::observeEvent(input$new_model_btn, {
    schema <- list(
      schemaVersion = 1L,
      models = list(model1 = list(nodes = list(), paths = list()))
    )
    gm <- methods::new("GraphModel", schema = schema)
    currentModel(gm)
    fitStatus("unfitted")
    svgData(NULL)
    session$sendCustomMessage("update_model", list(schema = gm@schema))
    shiny::showNotification("New empty model created.", type = "message", duration = 2)
  })

  # ── Data modal ────────────────────────────────────────────────────────
  shiny::observeEvent(input$data_btn, {
    .showDataModal(currentModel())
  })

  # ── Data modal ("Load Data" toolbar button in Shiny mode) ─────────────
  shiny::observeEvent(input$load_data_request, {
    .showDataModal(currentModel())
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
      session$sendCustomMessage("update_model", list(schema = gm@schema))
      .closeModal("dsem-modal-load")
      shiny::showNotification("Model loaded.", type = "message", duration = 2)
    }, error = function(e) {
      shiny::showNotification(paste("Could not load model:", conditionMessage(e)),
                              type = "error", duration = 8)
    })
  })

  shiny::observeEvent(input$attach_csv_btn, {
    shiny::req(input$load_csv_file)
    label <- trimws(input$csv_dataset_name %||% "")
    if (nchar(label) == 0) {
      shiny::showNotification("Enter a dataset label first.", type = "warning", duration = 4)
      return()
    }
    tryCatch({
      df <- utils::read.csv(input$load_csv_file$datapath, stringsAsFactors = FALSE)
      gm <- currentModel()
      if (is.null(gm)) {
        shiny::showNotification("No active model.", type = "warning", duration = 4)
        return()
      }
      gm@data[[label]] <- df
      currentModel(gm)
      .closeModal("dsem-modal-data")
      shiny::showNotification(sprintf("Dataset '%s' attached (%d \u00d7 %d).", label, nrow(df), ncol(df)),
                              type = "message", duration = 4)
    }, error = function(e) {
      shiny::showNotification(paste("Could not read CSV:", conditionMessage(e)),
                              type = "error", duration = 8)
    })
  })

  # ── Fit model ─────────────────────────────────────────────────────────
  shiny::observeEvent(input$fit_btn, {
    gm <- currentModel()
    if (is.null(gm)) {
      shiny::showNotification("No model to fit.", type = "warning", duration = 4)
      return()
    }
    fitStatus("fitting")

    result <- tryCatch(runOpenMx(gm), error = function(e) e)

    if (inherits(result, "error")) {
      fitStatus("failed")
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
    fitStatus("converged")
    lastStructuralFingerprint(hashStructure(result))
    suppressNextEcho(TRUE)
    session$sendCustomMessage("update_model", list(schema = result@schema))

    fit_res    <- getFitResults(result)
    modal_body <- if (!is.null(fit_res) && !identical(fit_res, NA)) {
      ests  <- fit_res$parameterEstimates %||% list()
      ses   <- fit_res$standardErrors    %||% list()
      fit_v <- fit_res$fitValue          %||% NA_real_
      df_v  <- fit_res$degreesOfFreedom  %||% NA_integer_
      n_v   <- fit_res$sampleSize        %||% NA_integer_

      idx <- list(`-2LL` = fit_v)
      if (!is.na(df_v) && !is.na(fit_v)) {
        idx$AIC <- fit_v + 2L * df_v
        if (!is.na(n_v) && n_v > 0L) idx$BIC <- fit_v + log(n_v) * df_v
      }
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
        se_vec <- unlist(ses)
        if (is.null(names(se_vec))) names(se_vec) <- nms
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

  # ── Download JSON ─────────────────────────────────────────────────────
  output$download_json <- shiny::downloadHandler(
    filename = function() {
      gm  <- currentModel()
      mid <- names(gm@schema$models %||% list(model1 = NULL))[1]
      paste0(mid, "_", format(Sys.time(), "%Y%m%d_%H%M%S"), ".json")
    },
    content = function(file) {
      shiny::req(!is.null(currentModel()))
      exportSchema(currentModel(), file)
    }
  )

  # ── Save to R modal ───────────────────────────────────────────────────
  shiny::observeEvent(input$save_to_r_btn, {
    if (is.null(currentModel())) {
      shiny::showNotification("No model to save.", type = "warning", duration = 4)
      return()
    }
    shiny::insertUI("#drawsem-modal-host", "afterBegin",
      .modal("dsem-modal-save", "Save to R Environment",
        shiny::div(class = "dsem-field",
          shiny::tags$label(class = "dsem-label", `for` = "save_r_varname", "Variable name"),
          shiny::textInput("save_r_varname", NULL,
            value = shiny::isolate(lastVarname()), width = "100%")
        ),
        shiny::tagList(
          shiny::tags$button(
            style = "background:#fff; color:#374151; border:1px solid #d1d5db; border-radius:6px; padding:6px 14px; font-size:13px; cursor:pointer; font-family:system-ui;",
            onclick = "Shiny.setInputValue('modal_close','dsem-modal-save',{priority:'event'})",
            "Cancel"
          ),
          shiny::actionButton("confirm_save_r_btn", "Save",
            style = "background:#2563eb; color:#fff; border:none; border-radius:6px; padding:6px 14px; font-size:13px; cursor:pointer;")
        ),
        size = "s"
      ),
      immediate = TRUE
    )
  })

  shiny::observeEvent(input$confirm_save_r_btn, {
    varname <- trimws(input$save_r_varname %||% "")
    if (!grepl("^[a-zA-Z.][a-zA-Z0-9_.]*$", varname)) {
      shiny::showNotification(
        "Invalid R variable name. Use letters, digits, '.' or '_', starting with a letter or '.'.",
        type = "error", duration = 6)
      return()
    }
    lastVarname(varname)
    assign(varname, currentModel(), envir = .GlobalEnv)
    .closeModal("dsem-modal-save")
    shiny::showNotification(sprintf("Saved as '%s' in .GlobalEnv.", varname),
                            type = "message", duration = 4)
  })

  # ── Image export modal ────────────────────────────────────────────────
  shiny::observeEvent(input$image_btn, {
    svgData(NULL)
    session$sendCustomMessage("trigger_svg_export", list())
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
  })

  shiny::observeEvent(input$svg_export_data, {
    shiny::req(input$svg_export_data)
    svgData(input$svg_export_data)
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
  shiny::observeEvent(input$done_btn, {
    shiny::stopApp(returnValue = currentModel())
  })
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
#'   \code{NULL} if the editor was closed without clicking Done.
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

  gm <- .resolveInitialModel(initialModel, data)

  ui <- .drawSEM_ui()

  server <- function(input, output, session) {
    .drawSEM_server(input, output, session, initialGM = gm)
  }

  app    <- shiny::shinyApp(ui = ui, server = server)
  result <- shiny::runGadget(app, viewer = viewer, stopOnCancel = FALSE, ...)
  result
}
