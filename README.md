# drawSEM

> **Early development notice:** This project is in very early development.
> All interfaces — including the R API, Shiny UI, widget API, and JSON schema
> format — are subject to change without notice between versions.
> The drawSEM JSON schema is **not yet stable**: models saved as `.json` files
> may not load correctly in future versions.
> For any models you want to preserve, export to a stable format such as an
> OpenMx object saved with `saveRDS()` or as OpenMx syntax.

Interactive visual editor for building structural equation models (SEMs). The
project is schema-first: the JSON schema is the source of truth, and backend
objects are derived from it on demand. OpenMx is the current fitting backend;
lavaan and blavaan are planned.

## Installation

### For R Users
No TypeScript or Node.js is required. Install the package and use the
interactive editor:

```r
# From GitHub (development)
devtools::install_github("trbrick/drawSEM")

library(drawSEM)

# Launch the interactive editor (opens in browser)
model <- drawSEM()

# Launch with an existing model
model <- drawSEM(initialModel = myGraphModel)

# Launch with an OpenMx model
model <- drawSEM(initialModel = myMxModel, data = myData)
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

### Interactive Editor
```r
# Start with an empty model
model <- drawSEM()

# Start from a JSON schema file
model <- drawSEM(initialModel = "mymodel.json")

# Start from an OpenMx model (data extracted automatically)
model <- drawSEM(initialModel = fittedMxModel)

# The editor returns a GraphModel when you click "Done"
summary(model)
coef(model)
```

### Visualize a Model (Non-Interactive)
```r
# In Quarto / RMarkdown / RStudio Viewer
library(drawSEM)
g <- as.GraphModel(schema)
plot(g)

# With more control
plotGraphModel(g, editable = FALSE, pathLabelFormat = "values")
```

### Custom Shiny Embedding
```r
# For embedding the widget in a custom Shiny app:
ui <- fluidPage(
  shiny::uiOutput("editor")
)
server <- function(input, output, session) {
  output$editor <- renderGraphModel({
    plotGraphModel(myModel)
  })
  observeEvent(input$graph_model, {
    schema <- input$graph_model
  })
}
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
│   ├── shiny-app.R               # drawSEM() interactive editor launcher
│   ├── drawSEM.R                 # htmlwidget binding & plotGraphModel()
│   ├── GraphModel-class.R        # GraphModel S4 class
│   ├── converters.R              # Schema ↔ OpenMx conversion
│   ├── fitting.R                 # Model fitting & fit results
│   ├── io.R                      # I/O, as.GraphModel(), as.MxModel()
│   └── schema.R                  # Schema validation
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
- Interactive Shiny-based visual editor via `drawSEM()`
- Schema validation, import/export, and GraphModel round-tripping
- OpenMx conversion and fitting via `as.MxModel()` and `runOpenMx()`
- Interactive htmlwidget and standalone web editor builds
- Auto-layout (RAMPath algorithm) and SVG rendering

Planned next:
- lavaan and blavaan backends
- Richer node types such as link functions and operators
- Broader multi-model and composition workflows

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