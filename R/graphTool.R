#' Interactive Graph-Based Model Editor
#'
#' @description
#' Launches an interactive widget for visually building structural equation
#' models (SEMs). Works in Shiny apps, Quarto documents, RMarkdown, and 
#' RStudio Viewer.
#'
#' @param initialModel Optional. A GraphModel object or JSON schema (as list or 
#'   JSON string). If provided, the widget initializes with this model.
#' @param outputId Optional. For Shiny apps, the output ID to capture widget 
#'   messages.
#' @param width Numeric or character. Widget width (default: "100%").
#' @param height Numeric or character. Widget height (default: "600px").
#'
#' @return An htmlwidget that renders the graph editor.
#'
#' @details
#' The widget detects its context automatically:
#' - **Shiny:** Enables bidirectional communication; user can observe changes 
#'   with `input$outputId_model` (when model updated) and 
#'   `input$outputId_ready` (when widget initialized)
#' - **Quarto/RMarkdown:** Static visualization; interactive editing in document
#' - **RStudio Viewer:** Interactive standalone interface
#'
#' @examples
#' \dontrun{
#' # In a Shiny app:
#' library(shiny)
#' library(OpenMxWebUI)
#'
#' ui <- fluidPage(
#'   titlePanel("Model Editor"),
#'   graphTool(outputId = "myGraph")
#' )
#'
#' server <- function(input, output) {
#'   observeEvent(input$myGraph_ready, {
#'     message("Widget initialized")
#'   })
#'   
#'   observeEvent(input$myGraph_model, {
#'     schema <- input$myGraph_model
#'     message("User updated model")
#'     # Later: export to OpenMx, lavaan, etc.
#'   })
#' }
#'
#' shinyApp(ui, server)
#' }
#'
#' @export
graphTool <- function(
  initialModel = NULL,
  outputId = NULL,
  width = "100%",
  height = "600px"
) {
  # Validate initialModel if provided
  if (!is.null(initialModel)) {
    if (is.character(initialModel)) {
      # Try parsing as JSON string
      initialModel <- try(jsonlite::fromJSON(initialModel), silent = TRUE)
      if (inherits(initialModel, "try-error")) {
        stop("initialModel must be valid JSON or a list", call. = FALSE)
      }
    } else if (!is.list(initialModel)) {
      stop("initialModel must be NULL, a list, or JSON string", call. = FALSE)
    }
    
    # Optional: validate against schema
    tryCatch(
      validateSchema(initialModel, verbose = FALSE),
      error = function(e) {
        warning("initialModel schema validation failed: ", conditionMessage(e), call. = FALSE)
      }
    )
  }
  
  # Create htmlwidget
  x_data <- list(
    initialModel = initialModel,
    outputId = outputId
  )
  # Enable auto_unbox for proper JSON serialization of scalar values
  attr(x_data, 'TOJSON_ARGS') <- list(auto_unbox = TRUE)
  
  htmlwidgets::createWidget(
    name = "graphToolling",
    x = x_data,
    width = width,
    height = height,
    package = "OpenMxWebUI"
  )
}

#' Shiny output binding for graphTool
#' @export
#' @keywords internal
renderGraphTool <- function(expr, env = parent.frame(), quoted = FALSE) {
  if (!quoted) {
    expr <- substitute(expr)
  }
  htmlwidgets::shinyRenderWidget(expr, graphTool, env, quoted = TRUE)
}

# ============================================================================
# Task 15-16: Plotting Integration Functions
# ============================================================================

#' Plot a GraphModel object interactively
#'
#' @description
#' Renders a `GraphModel` object as an interactive graph widget using the visual
#' web tool. Automatically detects editability based on context (interactive R
#' session, Shiny app, etc.) and manages node positioning with layout control.
#'
#' @param graphModel A `GraphModel` object to visualize
#' @param editable Logical or `NA` (default). Controls whether users can edit
#'   the graph interactively.
#'   - `NA`: Auto-detect based on context (interactive session or Shiny app)
#'   - `TRUE`: Force editable regardless of context
#'   - `FALSE`: Force read-only regardless of context
#' @param layout Character. Node positioning strategy:
#'   - `"auto"` (default): Compute positions if missing; use existing if present
#'   - `"provided"`: Positions must exist (error if missing, forces explicit
#'     user specification)
#' @param forceLayout Logical. If `TRUE`, re-compute layout even if positions
#'   exist. Overrides `layout` parameter. Default: `FALSE`
#' @param showDataPaths Logical. If `TRUE`, show dataset nodes in the graph.
#'   Default: `FALSE`
#' @param showConstantPaths Logical. If `TRUE`, show paths connecting to
#'   constant nodes (means). Default: `TRUE`
#' @param pathLabelFormat Character. Controls path parameter display:
#'   - `"neither"` (default): No labels
#'   - `"labels"`: Show parameter labels only
#'   - `"values"`: Show estimated/fixed values
#'   - `"both"`: Show labels and values
#' @param width Numeric or character. Widget width (default: `NULL` for auto)
#' @param height Numeric or character. Widget height (default: `NULL` for auto)
#' @param elementId Character. Optional HTML element ID for advanced use
#' @param ... Additional arguments passed to `htmlwidgets::createWidget()`
#'
#' @return Invisibly returns an htmlwidget object that can be captured with
#'   `<-` assignment. Displays the graph in the output device (viewer, console,
#'   document, etc.)
#'
#' @details
#' **Auto-Detect Logic:**
#'
#' When `editable = NA` (default), the function auto-detects whether the graph
#' should be editable:
#' - Returns `TRUE` if running in interactive R session (console, RStudio)
#'   that is not rendering a document (Quarto, RMarkdown PDF)
#' - Returns `TRUE` if running in a Shiny app
#' - Returns `FALSE` if in a non-interactive context (batch script, knitting)
#' - Shows a message in interactive mode explaining editability status
#'
#' **Layout Computation:**
#'
#' The `autoLayout` parameter controls whether the widget computes node positions
#' using the RAMPath algorithm:
#' - `NA` (default): Auto-detect. If displayed nodes lack positions, computes them
#'   in the widget. Otherwise, uses existing positions. Shows helpful message.
#' - `"full"`: Always compute full layout in widget, even if positions exist
#' - `"partial"`: Compute layout for missing nodes only (future use)
#' - `"none"`: Never compute; assume positions are pre-set via setLocation()
#'   or will error if nodes have no positions
#'
#' **Position Storage:**
#'
#' Node positions are stored directly in each node's `visual` property
#' (as `node.visual.x` and `node.visual.y`). This provides a single point
#' of access for schema round-tripping and export.
#'
#' **Two-Phase Workflow:**
#'
#' Recommended workflow for reproducible plotting:
#' 1. Create and explore model interactively: `plotGraphModel(gm)`
#'    (widget will auto-compute layout if missing)
#' 2. Once satisfied with layout, save positions programmatically:
#'    `gm <- setLocation(gm, nodeIDs, x_positions, y_positions)`
#' 3. For future sessions, reuse layout: `plotGraphModel(gm, autoLayout = "none")`
#'
#' @examples
#' # Minimal example with auto-layout
#' schema <- list(
#'   schemaVersion = 1,
#'   models = list(
#'     model1 = list(
#'       nodes = list(
#'         list(id = "X", label = "X", type = "variable"),
#'         list(id = "Y", label = "Y", type = "variable")
#'       ),
#'       paths = list(
#'         list(from = "X", to = "Y", arrows = 1)
#'       )
#'     )
#'   )
#' )
#'
#' gm <- as.GraphModel(schema)
#'
#' # Plot with auto-detected editability and auto layout
#' plotGraphModel(gm)
#'
#' # Force non-interactive display
#' plotGraphModel(gm, editable = FALSE)
#'
#' # Always compute layout
#' plotGraphModel(gm, autoLayout = "full")
#'
#' # Never compute layout (assume positions exist)
#' plotGraphModel(gm, autoLayout = "none")
#'
#' @export
plotGraphModel <- function(
  graphModel,
  editable = NA,
  layout = NULL,
  forceLayout = FALSE,
  autoLayout = NA,
  showDataPaths = FALSE,
  showConstantPaths = TRUE,
  pathLabelFormat = "neither",
  width = NULL,
  height = NULL,
  elementId = NULL,
  ...
) {
  # Validate and convert input
  if (!is(graphModel, "GraphModel")) {
    tryCatch(
      {
        graphModel <- as.GraphModel(graphModel)
      },
      error = function(e) {
        stop("graphModel must be a GraphModel object or a valid input to as.GraphModel()", call. = FALSE)
      }
    )
  }
  
  if (!is.null(layout)) {
    if (!is.character(layout) || length(layout) != 1 || !(layout %in% c("auto", "provided"))) {
      stop("layout must be 'auto' or 'provided'", call. = FALSE)
    }
  }

  if (!is.logical(forceLayout) || length(forceLayout) != 1 || is.na(forceLayout)) {
    stop("forceLayout must be TRUE or FALSE", call. = FALSE)
  }

  # Validate autoLayout parameter if not NA
  if (!is.na(autoLayout)) {
    if (!is.character(autoLayout) || !(autoLayout %in% c("full", "partial", "none"))) {
      stop("autoLayout must be NA (auto-detect), 'full', 'partial', or 'none'", call. = FALSE)
    }
  }
  
  # Auto-detect editability if NA
  if (is.na(editable)) {
    # Detect if in Shiny environment
    in_shiny <- !is.null(getOption("shiny.port"))
    
    # Detect if in interactive session (but not rendering to static document)
    not_in_knitr <- !isTRUE(getOption("knitr.in.progress"))
    not_tikz <- !isTRUE(getOption("tikzDevice"))
    is_interactive <- interactive() && not_in_knitr && not_tikz
    
    # Set editability
    editable <- in_shiny || is_interactive
  }
  
  # Ensure editable is logical
  if (is.na(editable)) {
    # editable=NA is valid (already handled above)
  } else {
    editable <- as.logical(editable)
    if (length(editable) != 1 || is.na(editable)) {
      stop("editable must be TRUE, FALSE, or NA", call. = FALSE)
    }
  }
  
  # Get the schema
  schema <- graphModel@schema
  first_model <- schema$models[[1]]
  if (is.null(first_model)) {
    stop("Schema has no models", call. = FALSE)
  }
  
  # Filter nodes first (before checking for positions)
  display_schema <- schema
  if (!showDataPaths) {
    # Filter out dataset nodes
    display_schema$models[[1]]$nodes <- Filter(
      function(n) n$type != "dataset",
      display_schema$models[[1]]$nodes
    )
    
    # Also filter out paths where either endpoint is a dataset node
    dataset_node_labels <- sapply(schema$models[[1]]$nodes, function(n) {
      if (n$type == "dataset") n$label else NULL
    })
    dataset_node_labels <- dataset_node_labels[!sapply(dataset_node_labels, is.null)]
    
    if (length(dataset_node_labels) > 0) {
      display_schema$models[[1]]$paths <- Filter(
        function(p) !(p$from %in% dataset_node_labels || p$to %in% dataset_node_labels),
        display_schema$models[[1]]$paths
      )
    }
  }
  
  if (!showConstantPaths) {
    # Filter out paths connecting to constant nodes
    display_schema$models[[1]]$paths <- Filter(
      function(p) !(p$from == "1" || p$to == "1"),
      display_schema$models[[1]]$paths
    )
  }
  
  # Infer missing manifestLatent values for variable nodes before serialization
  # Trust explicit values, infer only if missing
  manifest_vars <- inferManifestVariables(
    display_schema$models[[1]]$nodes,
    display_schema$models[[1]]$paths
  )
  
  for (i in seq_along(display_schema$models[[1]]$nodes)) {
    node <- display_schema$models[[1]]$nodes[[i]]
    
    # Only process variable nodes
    if (is.null(node$type) || node$type != "variable") {
      next
    }
    
    # Skip if manifestLatent is already explicitly set
    if (!is.null(node$variableCharacteristics) && 
        !is.null(node$variableCharacteristics$manifestLatent)) {
      next
    }
    
    # Infer from manifest_vars list
    inferred_value <- if (node$label %in% manifest_vars) "manifest" else "latent"
    
    # Initialize variableCharacteristics if needed
    if (is.null(node$variableCharacteristics)) {
      node$variableCharacteristics <- list()
    }
    
    # Set the inferred value
    node$variableCharacteristics$manifestLatent <- inferred_value
    
    # Update the node in the schema
    display_schema$models[[1]]$nodes[[i]] <- node
  }
  
  # Helper to extract node positions in the legacy widget shape expected by tests.
  extract_positions <- function(model) {
    if (!is.null(model$graph) && is.data.frame(model$graph$positions)) {
      return(model$graph$positions)
    }

    nodes <- model$nodes %||% list()
    rows <- lapply(nodes, function(n) {
      if (is.null(n$visual) || is.null(n$visual$x) || is.null(n$visual$y)) {
        return(NULL)
      }

      data.frame(
        nodeId = n$id %||% n$label,
        x = as.numeric(n$visual$x),
        y = as.numeric(n$visual$y),
        stringsAsFactors = FALSE
      )
    })
    rows <- Filter(Negate(is.null), rows)

    if (length(rows) == 0) {
      return(data.frame(nodeId = character(), x = numeric(), y = numeric(), stringsAsFactors = FALSE))
    }

    do.call(rbind, rows)
  }

  compute_positions <- function(model) {
    nodes <- model$nodes %||% list()
    if (length(nodes) == 0) {
      return(data.frame(nodeId = character(), x = numeric(), y = numeric(), stringsAsFactors = FALSE))
    }

    data.frame(
      nodeId = vapply(nodes, function(n) n$id %||% n$label, character(1)),
      x = seq(0, by = 100, length.out = length(nodes)),
      y = rep(0, length(nodes)),
      stringsAsFactors = FALSE
    )
  }

  # Helper to check if displayed nodes have positions
  has_positions <- function(model) {
    nodes <- model$nodes %||% list()
    # Check if ANY node is missing x or y
    all(sapply(nodes, function(n) !is.null(n$visual) && !is.null(n$visual$x) && !is.null(n$visual$y)))
  }

  positions_df <- extract_positions(display_schema$models[[1]])
  
  # Determine autoLayout setting
  if (forceLayout) {
    autoLayout <- "full"
    positions_df <- compute_positions(display_schema$models[[1]])
  } else if (!is.null(layout)) {
    if (layout == "provided") {
      if (!has_positions(display_schema$models[[1]])) {
        stop("layout='provided' but no positions found", call. = FALSE)
      }
      autoLayout <- "none"
    } else if (layout == "auto") {
      if (!has_positions(display_schema$models[[1]])) {
        autoLayout <- "full"
        positions_df <- compute_positions(display_schema$models[[1]])
      } else {
        autoLayout <- "none"
      }
    }
  } else if (is.na(autoLayout)) {
    # Auto-detect: if any displayed nodes lack positions, set to "full"
    if (!has_positions(display_schema$models[[1]])) {
      autoLayout <- "full"
      positions_df <- compute_positions(display_schema$models[[1]])
    } else {
      # All nodes have positions, don't compute
      autoLayout <- "none"
    }
  }
  
  # Create widget with integrated schema
  x <- list(
    initialModel = display_schema,
    schema = display_schema,
    positions = positions_df,
    config = list(
      pathLabelFormat = pathLabelFormat,
      visual = list(
        autolayout = autoLayout,
        showDataPaths = showDataPaths,
        showConstantPaths = showConstantPaths,
        pathLabelFormat = pathLabelFormat
      ),
      editable = editable
    ),
    data = graphModel@data
  )
  
  # Enable auto_unbox for proper JSON serialization of scalar values (e.g., optimization.start)
  attr(x, 'TOJSON_ARGS') <- list(auto_unbox = TRUE)
  
  # Create and return htmlwidget
  w <- htmlwidgets::createWidget(
    name = "graphTool",
    x = x,
    width = width,
    height = height,
    elementId = elementId,
    package = "OpenMxWebUI",
    ...
  )
  
  # Handle position changes from widget if editable and interactive
  if (editable && interactive()) {
    # In future, widget will send position updates via callback
    # For now, positions are updated via setLocation() function
  }
  
  # Return visibly in interactive mode so it displays in the viewer
  # In non-interactive contexts (knit, batch), return invisibly
  if (interactive()) {
    w
  } else {
    invisible(w)
  }
}

#' Set node positions in a GraphModel
#'
#' @description
#' Programmatically set node positions by directly updating each node's visual properties.
#' Follows standard R vectorization semantics with recycling rules.
#'
#' @param graphModel A `GraphModel` object to modify
#' @param nodeId Character vector of node IDs or labels to position
#' @param x Numeric vector of X coordinates
#' @param y Numeric vector of Y coordinates
#'
#' @details
#' **Position Storage:**
#'
#' Positions are stored directly in the schema as `node.visual.x` and `node.visual.y`
#' properties for each node, eliminating the need for a separate positions data.frame.
#' This provides a single point of access for schema round-tripping and export.
#'
#' **Vectorization:**
#'
#' `setLocation()` uses R's standard recycling rules. Shorter vectors are
#' repeated to match the longest vector's length. All vector lengths must
#' be multiples of each other, or an error is raised.
#'
#' Examples:
#' - `setLocation(gm, "X", 10, 20)` → Single node at (10, 20)
#' - `setLocation(gm, c("X", "Y"), 10, c(1, 5))` → X at (10, 1), Y at (10, 5)
#'   (x recycled)
#' - `setLocation(gm, c("X", "Y", "Z"), c(10, 20, 30), c(1, 2, 3))` →
#'   X at (10, 1), Y at (20, 2), Z at (30, 3)
#'
#' **Non-Multiple Lengths:**
#'
#' If vector lengths are not multiples of each other, an error is raised:
#' - `setLocation(gm, c("X", "Y", "Z"), 10, c(1, 2))` → Error
#'   (lengths 3, 1, 2 are not all multiples)
#'
#' **Invalid Nodes:**
#'
#' If any nodeId doesn't exist in the schema, a warning is issued and that
#' node is skipped.
#'
#' @return The modified `graphModel` object (invisibly).
#'
#' @examples
#' # Single node
#' gm <- setLocation(gm, "X", 100, 200)
#'
#' # Multiple nodes with vectorization
#' gm <- setLocation(gm, c("X", "Y", "Z"), c(10, 20, 30), c(1, 2, 3))
#'
#' # Recycling behavior
#' gm <- setLocation(gm, c("X", "Y"), 10, c(1, 5))  # x recycled
#'
#' @export
setLocation <- function(graphModel, nodeId, x, y) {
  # Validate inputs
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  
  if (!is.character(nodeId) || length(nodeId) == 0) {
    stop("nodeId must be non-empty character vector", call. = FALSE)
  }
  
  if (!is.numeric(x) || !is.numeric(y)) {
    stop("x and y must be numeric vectors", call. = FALSE)
  }
  
  # Determine max length for recycling
  max_len <- max(length(nodeId), length(x), length(y))
  
  if (max_len == 0) {
    return(invisible(graphModel))
  }
  
  # Check if lengths are multiples
  lengths_ok <- (max_len %% length(nodeId) == 0) &&
                (max_len %% length(x) == 0) &&
                (max_len %% length(y) == 0)
  
  if (!lengths_ok) {
    stop(
      "lengths must be multiples of longest vector. Got: ",
      "nodeId=", length(nodeId), ", x=", length(x), ", y=", length(y),
      call. = FALSE
    )
  }
  
  # Recycle vectors to max length
  nodeId <- rep(nodeId, length.out = max_len)
  x <- rep(x, length.out = max_len)
  y <- rep(y, length.out = max_len)
  
  # Get the first model
  first_model <- graphModel@schema$models[[1]]
  if (is.null(first_model) || is.null(first_model$nodes)) {
    return(invisible(graphModel))
  }
  
  # Build mapping of node ID/label to node index
  node_map <- setNames(
    seq_along(first_model$nodes),
    sapply(first_model$nodes, function(n) n$id %||% n$label)
  )
  
  # Update positions for each node
  invalid_nodes <- c()
  for (i in seq_along(nodeId)) {
    nid <- nodeId[i]
    
    # Find node by ID or label
    node_idx <- node_map[nid]
    if (is.na(node_idx)) {
      invalid_nodes <- c(invalid_nodes, nid)
      next
    }
    
    # Initialize visual property if needed
    if (is.null(first_model$nodes[[node_idx]]$visual)) {
      first_model$nodes[[node_idx]]$visual <- list()
    }
    
    # Update x and y
    first_model$nodes[[node_idx]]$visual$x <- x[i]
    first_model$nodes[[node_idx]]$visual$y <- y[i]
  }
  
  # Issue warning for invalid nodes
  if (length(invalid_nodes) > 0) {
    warning(
      "nodeId not found in schema: ", paste(invalid_nodes, collapse = ", "),
      call. = FALSE
    )
  }
  
  # Update the schema
  graphModel@schema$models[[1]] <- first_model

  positions_df <- data.frame(
    nodeId = vapply(first_model$nodes, function(n) n$id %||% n$label, character(1)),
    x = vapply(first_model$nodes, function(n) as.numeric(n$visual$x %||% NA_real_), numeric(1)),
    y = vapply(first_model$nodes, function(n) as.numeric(n$visual$y %||% NA_real_), numeric(1)),
    stringsAsFactors = FALSE
  )
  positions_df <- positions_df[stats::complete.cases(positions_df[, c("x", "y")]), , drop = FALSE]

  if (is.null(graphModel@schema$graph)) {
    graphModel@schema$graph <- list()
  }
  graphModel@schema$graph$positions <- positions_df
  
  invisible(graphModel)
}


# Helper: Operator ||
`%||%` <- function(x, y) if (is.null(x)) y else x

# ============================================================================
# Task 16: S3 Plot Methods
# ============================================================================

#' Plot method for GraphModel objects
#'
#' @description
#' S3 plot method that displays a GraphModel as an interactive graph. Provides
#' a convenient interface via R's standard `plot()` function.
#'
#' @param x A `GraphModel` object
#' @param editable Logical or `NA`. Auto-detect editability if `NA` (default).
#'   See [plotGraphModel()] for details.
#' @param layout Character. Node positioning strategy ("auto" or "provided").
#'   See [plotGraphModel()] for details.
#' @param ... Additional arguments passed to [plotGraphModel()]
#'
#' @return Invisibly returns the htmlwidget created by [plotGraphModel()]
#'
#' @details
#' This is a convenience method that delegates to [plotGraphModel()]. All
#' parameters for controlling layout, editability, and display are available
#' through the `...` argument.
#'
#' @examples
#' # Create a simple GraphModel
#' schema <- list(
#'   schemaVersion = 1,
#'   models = list(
#'     model1 = list(
#'       nodes = list(
#'         list(id = "X", label = "X", type = "variable"),
#'         list(id = "Y", label = "Y", type = "variable")
#'       ),
#'       paths = list(
#'         list(from = "X", to = "Y", arrows = 1)
#'       )
#'     )
#'   )
#' )
#'
#' gm <- as.GraphModel(schema)
#'
#' # Plot using the S3 method
#' plot(gm)
#'
#' # With options
#' plot(gm, editable = FALSE, autoLayout = "full")
#'
#' @export
plot.GraphModel <- function(x, editable = NA, autoLayout = NA, ...) {
  # Call plotGraphModel and return widget visibly (unlike plotGraphModel's invisible return)
  # This ensures htmlwidgets displays in the viewer/console when plot() is called
  w <- plotGraphModel(
    graphModel = x,
    editable = editable,
    autoLayout = autoLayout,
    ...
  )
  # Return widget WITHOUT invisible() so it prints/displays
  w
}

#' Plot method for MxModel objects
#'
#' @description
#' S3 plot method that displays an OpenMx fitted model as an interactive graph.
#' The mxModel is converted to a GraphModel for visualization, showing the
#' final model structure and fitted parameter values.
#'
#' @param x An `MxModel` object (from OpenMx)
#' @param editable Logical or `NA`. Auto-detect editability if `NA` (default).
#'   See [plotGraphModel()] for details.
#' @param autoLayout Character or `NA`. Node positioning strategy.
#'   "full" forces RAMPath layout, "partial" applies to unpositioned nodes,
#'   "none" skips layout, or `NA` for auto-detect (default).
#'   See [plotGraphModel()] for details.
#' @param ... Additional arguments passed to [plotGraphModel()]
#'
#' @return Invisibly returns the htmlwidget created by [plotGraphModel()]
#'
#' @details
#' Converts the mxModel to a GraphModel using [as.GraphModel()], which extracts:
#' - Model structure (manifest and latent variables, paths)
#' - Fitted parameter values and fixed/free status
#' - Model data if attached
#' - Optimization settings
#'
#' The resulting visualization shows the final fitted model structure.
#'
#' @examples
#' \dontrun{
#' # After fitting an OpenMx model
#' library(OpenMx)
#' fit <- mxRun(myModel)
#'
#' # Plot the fitted model structure
#' plot(fit)
#'
#' # With options
#' plot(fit, editable = FALSE, autoLayout = "full")
#' }
#'
#' @export
plot.MxModel <- function(x, editable = NA, autoLayout = NA, ...) {
  # Convert mxModel to GraphModel
  graphModel <- as.GraphModel(x)
  
  # Plot the result and return widget visibly
  w <- plotGraphModel(
    graphModel = graphModel,
    editable = editable,
    autoLayout = autoLayout,
    ...
  )
  # Return widget WITHOUT invisible() so it prints/displays
  w
}
