# Git Hooks Setup

Developers should run this once after cloning:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/*
```

This enables:
- **pre-commit hook**: Auto-rebuilds widget before every commit
- **post-merge hook**: Auto-rebuilds widget after pulling from main

No manual `npm run build:widget` needed—everything stays in sync automatically.
