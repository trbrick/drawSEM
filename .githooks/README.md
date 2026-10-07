# Git Hooks Setup

Developers should run this once after cloning:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/*
```

This enables:
- **pre-commit hook**: Fails if `inst/extdata/graph.schema.json` (the R package's
  copy of the schema) differs from `drawsem-web/schema/graph.schema.json` (run
  `make` to sync), then auto-rebuilds the widget when web sources or the schema
  changed (the widget bundles the schema for validation)
- **post-merge hook**: Auto-rebuilds widget after pulling from main

No manual `npm run build:widget` needed—everything stays in sync automatically.
