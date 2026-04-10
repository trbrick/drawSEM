# OpenMxWebUI

Interactive visual editor for building structural equation models (SEMs). The
project is schema-first: the JSON schema is the source of truth, and backend
objects are derived from it on demand. OpenMx is the current fitting backend;
lavaan and blavaan are planned.

## Installation

### For R Users (Recommended)
No TypeScript or Node.js required. Just install the R package:

```r
# From GitHub (development)
devtools::install_github("trb21/OpenMx_WebUI")

# Then use it
library(OpenMxWebUI)

# In a Shiny app:
ui <- fluidPage(graphTool(outputId = "myGraph"))
server <- function(input, output) {
  observeEvent(input$myGraph_ready, { message("Ready!") })
}
shinyApp(ui, server)
```

### For Web Developers
To work on the TypeScript codebase:

```bash
git clone https://github.com/trb21/OpenMx_WebUI
cd OpenMx_WebUI

# First-time setup (one time only)
git config core.hooksPath .githooks
chmod +x .githooks/*

# Install Node dependencies
cd visual-web-tool
npm install

# Dev server (localhost:5173)
npm run dev

# Build both targets
npm run build
```

The built widget assets are committed into `inst/htmlwidgets/lib/app/`, so R
users do not need Node.js.

## Usage

### In Shiny
```r
ui <- fluidPage(graphTool(outputId = "graph"))
server <- function(input, output) {
  # React to model changes
  observeEvent(input$graph_model, {
    schema <- input$graph_model
    # Later: export to OpenMx, lavaan, blavaan
  })
}
```

### In Quarto / RMarkdown
```r
library(OpenMxWebUI)
graphTool()  # Interactive widget in document
```

### Load & Validate Schemas
```r
# Load a model schema
schema <- loadSchema("mymodel.json")

# Validate structure
validateSchema(schema)

# Build a GraphModel and fit it in OpenMx
g <- as.GraphModel(schema)
g_fit <- runOpenMx(g)

# Save modified schema
saveSchema(schema, "mymodel_v2.json")
```

## Repository Structure

```
OpenMx_WebUI/                     # R package root
├── R/                            # R source code
│   ├── graphTool.R              # htmlwidget binding
│   └── schema.R                 # Schema utilities
├── inst/
│   ├── htmlwidgets/             # htmlwidgets binding
│   │   ├── graphTool.yaml
│   │   ├── graphTool.js
│   │   └── lib/app/
│   │       └── widget.js        # Built widget (committed)
│   └── extdata/
│       └── graph.schema.json    # Reference schema
├── tests/testthat/              # R unit tests
├── visual-web-tool/             # TypeScript source (for developers)
│   ├── src/
│   ├── vite.config.ts
│   └── package.json
├── DESCRIPTION                  # R package metadata
└── README.md
```

## Development

### Rebuild Widget After Changes
Git hooks handle this automatically. Or manually:

```bash
cd visual-web-tool
npm run build:widget    # Update ../inst/htmlwidgets/lib/app/widget.js
git add ../inst/htmlwidgets/lib/app/
```

### Run R Tests
```r
devtools::test()        # Run all tests
devtools::check()       # Full R CMD check
```

### Run TypeScript Tests
```bash
cd visual-web-tool
npm run test -- --run   # One-time run
npm run test            # Watch mode
```

## Current Status

Implemented now:
- Schema validation, import/export, and GraphModel round-tripping
- OpenMx conversion and fitting via `as.MxModel()` and `runOpenMx()`
- Interactive htmlwidget and standalone web editor builds

Planned next:
- lavaan and blavaan backends
- richer node types such as link functions and operators
- broader multi-model and composition workflows

## Architecture

The system is built on the **Adapter Pattern**:
- **Single React component** (CanvasTool) works in all contexts
- **Pluggable exporters** for different backends (OpenMx, lavaan, blavaan)
- **Context-based injection** (no props drilling)
- **Schema is source of truth** (JSON, backend-agnostic)

Key schema conventions in the current implementation:
- Dataset bindings are represented by paths with `type: "data"`
- Schema objects do not store runtime-only node/path ids
- Path parameter state is carried by `freeParameter`

See `visual-web-tool/README.md` for TypeScript architecture details.

## Acknowledgments

This project was developed with the assistance of:
- **GitHub Copilot** (Microsoft) - Code generation and development assistance
- **Claude Haiku 4.5** - Underlying AI model powering code suggestions and architecture design

## License

MIT
