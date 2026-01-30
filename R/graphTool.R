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
    name = "graphTool",
    x = list(
      initialModel = initialModel,
      outputId = outputId
    ),
    width = width,
    height = height,
    package = "visualWebTool"
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
