# Git Hooks Setup

Developers should run this once after cloning:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/*
```

This enables:
- **pre-commit hook**: Fails if `inst/extdata/graph.schema.json` (the R package's
  copy of the schema) differs from `drawsem-web/schema/graph.schema.json` (run
  `make` to sync), then auto-rebuilds the widget when web sources, the schema
  (the widget bundles it for validation), build config, or dependencies
  (`package.json` / `package-lock.json`) changed. Before rebuilding it fails if
  `drawsem-web/node_modules` doesn't match `package-lock.json`; run
  `npm install` and commit again
- **post-merge hook**: Auto-rebuilds widget after pulling from main

No manual `npm run build:widget` needed—everything stays in sync automatically.

CI (`.github/workflows/check.yml`) is the backstop: when web files change it
rebuilds the widget from the lockfile (`npm ci`) and fails if the committed
`inst/htmlwidgets/lib/app/` differs. Node version: `drawsem-web/.nvmrc`.
