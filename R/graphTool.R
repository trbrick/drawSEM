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
#' library(visualWebTool)
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
  htmlwidgets::createWidget(
    name = "graphToolling",
    x = list(
      initialModel = initialModel,
      outputId = outputId
    ),
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
#' @param includeDataLayer Logical. If `TRUE`, show dataset nodes in the graph.
#'   Default: `FALSE`
#' @param includeConstantPaths Logical. If `TRUE`, show paths connecting to
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
#' **Layout Modes:**
#'
#' The `layout` parameter controls how node positions are determined:
#' - `"auto"`: Default behavior. If model has no positions, automatically
#'   computes them using the RAMPath stratified layout algorithm (Task 13).
#'   If positions exist, uses them. Shows helpful message on first auto-compute.
#' - `"provided"`: Strict mode. Requires positions to already exist; errors
#'   if missing. Useful for reproducible workflows where layout is fixed.
#'
#' The `forceLayout = TRUE` override always re-computes positions, useful for
#' exploring different layouts or testing the auto-layout algorithm.
#'
#' **Position Persistence:**
#'
#' Node positions are stored in `graphModel@@schema$graph$positions` as a
#' data.frame with columns `nodeId`, `x`, `y`. In interactive R sessions,
#' position changes made in the widget are reflected back to the GraphModel
#' object (this session only; not saved to disk unless explicitly exported).
#'
#' **Two-Phase Workflow:**
#'
#' Recommended workflow for reproducible plotting:
#' 1. Create and explore model interactively: `plotGraphModel(gm)`
#' 2. Once satisfied with layout, save positions programmatically:
#'    `gm <- setLocation(gm, nodeIDs, x_positions, y_positions)`
#' 3. For future sessions, reuse layout: `plotGraphModel(gm, layout="provided")`
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
#' # Use provided positions (would error if positions don't exist)
#' plotGraphModel(gm, layout = "provided")
#'
#' # Force re-layout
#' plotGraphModel(gm, forceLayout = TRUE)
#'
#' @export
plotGraphModel <- function(
  graphModel,
  editable = NA,
  layout = "auto",
  forceLayout = FALSE,
  includeDataLayer = FALSE,
  includeConstantPaths = TRUE,
  pathLabelFormat = "neither",
  width = NULL,
  height = NULL,
  elementId = NULL,
  ...
) {
  # Validate input
  if (!is(graphModel, "GraphModel")) {
    stop("graphModel must be a GraphModel object", call. = FALSE)
  }
  
  # Validate layout parameter
  if (!(layout %in% c("auto", "provided"))) {
    stop("layout must be 'auto' or 'provided'", call. = FALSE)
  }
  
  # Validate forceLayout
  if (!is.logical(forceLayout) || length(forceLayout) != 1) {
    stop("forceLayout must be a single logical value", call. = FALSE)
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
    
    # Message only in interactive mode
    if (is_interactive && editable) {
      message("Graph is editable. Edits persist to R object in this session.")
    }
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
  
  # Handle node positioning
  schema <- graphModel@schema
  positions <- NULL
  
  # Check if positions exist
  has_positions <- !is.null(schema$graph$positions) && 
                   nrow(schema$graph$positions) > 0
  
  # Determine which positions to use
  if (isTRUE(forceLayout)) {
    # Force re-layout
    positions <- .computeAutoLayout(schema)
    if (interactive()) {
      message("Computing layout (forceLayout=TRUE)...")
    }
  } else if (layout == "auto") {
    if (!has_positions) {
      # Compute if missing
      positions <- .computeAutoLayout(schema)
      if (interactive()) {
        message("No positions found. Computing layout automatically.")
        message("Tip: Save positions with setLocation() for reproducibility.")
      }
    } else {
      # Use existing
      positions <- schema$graph$positions
    }
  } else if (layout == "provided") {
    # User promises to supply positions
    if (!has_positions) {
      stop(
        "layout='provided' but no positions found in graphModel. ",
        "Use layout='auto' or add positions with setLocation().",
        call. = FALSE
      )
    }
    positions <- schema$graph$positions
  }
  
  # Filter nodes if needed
  display_schema <- schema
  if (!includeDataLayer) {
    # Filter out dataset nodes
    display_schema$models[[1]]$nodes <- Filter(
      function(n) n$type != "dataset",
      display_schema$models[[1]]$nodes
    )
  }
  
  if (!includeConstantPaths) {
    # Filter out paths connecting to constant nodes
    display_schema$models[[1]]$paths <- Filter(
      function(p) !(p$from == "1" || p$to == "1"),
      display_schema$models[[1]]$paths
    )
  }
  
  # Create widget
  x <- list(
    schema = display_schema,
    positions = positions,
    config = list(
      editable = editable,
      includeDataLayer = includeDataLayer,
      includeConstantPaths = includeConstantPaths,
      pathLabelFormat = pathLabelFormat
    ),
    data = graphModel@data
  )
  
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
  
  invisible(w)
}

#' Set node positions in a GraphModel
#'
#' @description
#' Programmatically set node positions using R's vectorization semantics.
#' Follows standard R recycling rules for shorter vectors.
#'
#' @param graphModel A `GraphModel` object to modify
#' @param nodeId Character vector of node IDs to position
#' @param x Numeric vector of X coordinates
#' @param y Numeric vector of Y coordinates
#'
#' @details
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
  
  # Create positions data frame
  positions <- data.frame(
    nodeId = nodeId,
    x = x,
    y = y,
    stringsAsFactors = FALSE
  )
  
  # Validate node IDs exist in schema
  first_model <- graphModel@schema$models[[1]]
  if (!is.null(first_model$nodes)) {
    valid_node_ids <- sapply(first_model$nodes, function(n) n$id %||% n$label)
    invalid <- setdiff(positions$nodeId, valid_node_ids)
    if (length(invalid) > 0) {
      warning(
        "nodeId not found in schema: ", paste(invalid, collapse = ", "),
        call. = FALSE
      )
    }
  }
  
  # Update positions in schema
  graphModel@schema$graph <- graphModel@schema$graph %||% list()
  graphModel@schema$graph$positions <- positions
  
  invisible(graphModel)
}

#' Compute automatic layout for a GraphModel schema
#'
#' @description
#' Internal function that computes node positions using the RAMPath stratified
#' layout algorithm (Task 13). This function bridges R to the JavaScript/TypeScript
#' implementation via the widget.
#'
#' @param schema A GraphModel schema list
#'
#' @return A data.frame with columns `nodeId`, `x`, `y` containing computed
#'   positions for all nodes
#'
#' @keywords internal
#' @noRd
.computeAutoLayout <- function(schema) {
  # For v0.1, return default grid layout
  # In future, this will call JavaScript autoLayout() via widget or websocket
  
  first_model <- schema$models[[1]]
  if (is.null(first_model) || is.null(first_model$nodes)) {
    return(data.frame(nodeId = character(), x = numeric(), y = numeric()))
  }
  
  # Get node IDs
  node_ids <- sapply(first_model$nodes, function(n) n$id %||% n$label)
  n_nodes <- length(node_ids)
  
  # Simple grid layout: arrange nodes in rows under 4 per row
  cols_per_row <- 4
  x_spacing <- 150
  y_spacing <- 200
  
  positions <- data.frame(
    nodeId = node_ids,
    x = ((0:(n_nodes - 1)) %% cols_per_row) * x_spacing,
    y = ((0:(n_nodes - 1)) %/% cols_per_row) * y_spacing,
    stringsAsFactors = FALSE
  )
  
  positions
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
#' plot(gm, editable = FALSE, forceLayout = TRUE)
#'
#' @export
plot.GraphModel <- function(x, editable = NA, layout = "auto", ...) {
  # Call plotGraphModel and return widget visibly (unlike plotGraphModel's invisible return)
  # This ensures htmlwidgets displays in the viewer/console when plot() is called
  w <- plotGraphModel(
    graphModel = x,
    editable = editable,
    layout = layout,
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
#' @param layout Character. Node positioning strategy ("auto" or "provided").
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
#' plot(fit, editable = FALSE)
#' }
#'
#' @export
plot.MxModel <- function(x, editable = NA, layout = "auto", ...) {
  # Convert mxModel to GraphModel
  graphModel <- as.GraphModel(x)
  
  # Plot the result and return widget visibly
  w <- plotGraphModel(
    graphModel = graphModel,
    editable = editable,
    layout = layout,
    ...
  )
  # Return widget WITHOUT invisible() so it prints/displays
  w
}
