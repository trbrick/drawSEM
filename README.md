# drawSEM

Interactive visual editor for building structural equation models (SEMs). The
project is schema-first: the JSON schema is the source of truth, and backend
objects are derived from it on demand. OpenMx is the current fitting backend;
lavaan and blavaan are planned.

## Installation

### For R Users
No TypeScript or Node.js is required. Install the package and use the widget:

```r
# From GitHub (development)
devtools::install_github("trbrick/drawSEM")

library(drawSEM)

ui <- fluidPage(drawSEM(outputId = "myGraph"))
server <- function(input, output) {
  observeEvent(input$myGraph_ready, { message("Ready!") })
}
shinyApp(ui, server)
```

### For Web Developers
To work on the frontend source:

```bash
git clone https://github.com/trb21/drawSEM
cd drawSEM

git config core.hooksPath .githooks
chmod +x .githooks/*

cd drawsem-web
npm install
npm run dev
npm run build
```

The built widget assets are committed into `inst/htmlwidgets/lib/app/`, so R
users do not need Node.js.

## Usage

### In Shiny
```r
ui <- fluidPage(drawSEM(outputId = "graph"))
server <- function(input, output) {
  observeEvent(input$graph_model, {
    schema <- input$graph_model
  })
}
```

### In Quarto / RMarkdown
```r
library(drawSEM)
drawSEM()
```

### Load And Validate Schemas
```r
schema <- loadSchema("mymodel.json")
validateSchema(schema)

g <- as.GraphModel(schema)
g_fit <- runOpenMx(g)

saveSchema(schema, "mymodel_v2.json")
```

## Repository Structure

```text
drawSEM/                          # R package root
├── R/                            # R source code
│   ├── drawSEM.R                 # htmlwidget binding
│   └── schema.R                  # Schema utilities
├── inst/
│   ├── htmlwidgets/
│   │   ├── drawSEM.yaml
│   │   ├── drawSEM.js
│   │   └── lib/app/
│   │       └── widget.js         # Built widget (committed)
│   └── extdata/
│       └── graph.schema.json     # Reference schema
├── tests/testthat/
├── drawsem-web/                  # TypeScript source (for developers)
│   ├── src/
│   ├── vite.config.ts
│   └── package.json
├── DESCRIPTION
└── README.md
```

## Development

### Rebuild Widget After Changes
```bash
cd drawsem-web
npm run build:widget
git add ../inst/htmlwidgets/lib/app/
```

### Run R Tests
```r
devtools::test()
devtools::check()
```

### Run TypeScript Tests
```bash
cd drawsem-web
npm run test -- --run
npm run test
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

The system is built on the adapter pattern:
- Single React component (`CanvasTool`) works in all contexts
- Pluggable exporters for different backends
- Context-based injection
- Schema is the source of truth

Key schema conventions in the current implementation:
- Dataset bindings are represented by paths with `type: "data"`
- Schema objects do not store runtime-only node/path ids
- Path parameter state is carried by `freeParameter`

See `drawsem-web/README.md` for TypeScript architecture details.

## Acknowledgements:

This project was developed with the assistance of:

- **GitHub Copilot** (Microsoft) - Code generation and development assistance
- Underlying AI models for design and implementation:
  - **ChatGPT 5.4**
  - **Claude Sonnet 4.6**

## License

MIT