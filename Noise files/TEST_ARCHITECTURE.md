# Testing Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Visual Web Tool Testing                      │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Test Configuration                          │  │
│  │  • vitest.config.ts (jsdom, coverage)                   │  │
│  │  • package.json (test scripts)                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            ↓                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Test Utilities & Helpers                       │  │
│  │  • tests/utils/test-helpers.ts                           │  │
│  │    - validateGraph()                                     │  │
│  │    - loadFixture()                                       │  │
│  │    - loadFixturesFromDir()                               │  │
│  │    - formatValidationErrors()                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│           ↙              ↓              ↘                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐     │
│  │   SCHEMAS    │  │   FIXTURES   │  │  INTEGRATION     │     │
│  │  39 + 5 tests│  │   + 4 models │  │  18 test skipped │     │
│  │  ✅ READY    │  │  ✅ READY    │  │  ⏳ READY        │     │
│  └──────────────┘  └──────────────┘  └──────────────────┘     │
│         │                │                     │               │
│         ├─ validation    ├─ fixtures           ├─ converters   │
│         │   (39 tests)   │  (5 tests)          │  (8 tests)    │
│         │                │                     │               │
│         │                ├─ path-analysis      ├─ end-to-end   │
│         │                ├─ cfa-model          │  (6 tests)    │
│         │                ├─ mediation          │               │
│         │                └─ multilevel         ├─ data-integ   │
│         │                                      │  (2 tests)    │
│         │                                      │               │
│         └──────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

## Test Execution Flow

```
npm test
   │
   ├─→ Vitest discovers test files
   │      tests/schemas/*.test.ts
   │      tests/converters/*.test.ts
   │      tests/integration/*.test.ts
   │
   ├─→ Load Test Helpers
   │      ✓ AJV validator initialized
   │      ✓ graph.schema.json loaded
   │
   ├─→ Execute Test Suites
   │
   │   SCHEMAS (validation.test.ts)
   │   ├─ ✅ 39 tests PASS
   │   │   • Required fields
   │   │   • Node types (variable, constant, dataset)
   │   │   • Path configurations
   │   │   • Parameter types
   │   │   • Self-loops with sides
   │   │   • Dataset metadata
   │   │   • Multilevel support
   │   │   • Tags
   │   │
   │   └─ Output: 39 passed, 0 failed
   │
   │   FIXTURES (fixtures.test.ts)
   │   ├─ Load models from tests/fixtures/models/
   │   ├─ ✅ 5 tests PASS
   │   │   • path-analysis.json ✓
   │   │   • cfa-model.json ✓
   │   │   • mediation-model.json ✓
   │   │   • multilevel-model.json ✓
   │   │   • Node-path integrity ✓
   │   │
   │   └─ Output: 5 passed, 0 failed
   │
   │   CONVERTERS (export.test.ts)
   │   ├─ ⏳ 8 tests SKIPPED (placeholders ready)
   │   │   • lavaan syntax generation (4)
   │   │   • OpenMx R code generation (4)
   │   │
   │   └─ Output: 8 skipped
   │
   │   INTEGRATION (end-to-end.test.ts)
   │   ├─ ⏳ 16 tests SKIPPED (placeholders ready)
   │   │   • End-to-end workflows (5)
   │   │   • CSV data integration (2)
   │   │   • Multilevel model export (2)
   │   │   • Constraint handling (2)
   │   │   • Round-trip validation (2)
   │   │   • Multi-model projects (1)
   │   │   • etc.
   │   │
   │   └─ Output: 16 skipped
   │
   └─→ Summary Report
       ✅ 44 passed
       ⏳ 24 skipped
       ❌ 0 failed
       
       Coverage:
       └─ Schema & Fixtures: 100%
       └─ Converters: Ready for implementation
       └─ Integration: Ready for implementation
```

## Data Flow: Load Fixture → Validate

```
tests/fixtures/models/path-analysis.json
        │
        ├─ Read file
        ├─ Parse JSON
        ├─ Load via loadFixture()
        │
        ├─→ Validate with AJV
        │    ├─ Check schemaVersion
        │    ├─ Check models dict
        │    ├─ Check nodes array
        │    │   └─ label, type, visual
        │    ├─ Check paths array
        │    │   └─ fromLabel, toLabel, numberOfArrows
        │    └─ Check optimization.parameterTypes
        │
        ├─→ Test assertions
        │    ├─ expect(result.valid).toBe(true)
        │    ├─ expect(nodeCount).toBeGreaterThan(0)
        │    └─ expect(pathReferences).toBeDefined()
        │
        └─→ Result: ✅ PASS (or 📋 FAIL with detailed errors)
```

## Fixture Models Overview

```
┌─────────────────────────────────────────────────────────────┐
│              SEM Fixture Models (4 examples)                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PATH ANALYSIS (path-analysis.json)                        │
│  ├─ Structure: X → M → Y (mediation)                       │
│  ├─ Nodes: 3 observed variables                            │
│  ├─ Paths: Regressions + covariances                       │
│  ├─ Features: Direct effects, parameter types             │
│  └─ Use: Basic path model export testing                   │
│                                                             │
│  CFA MODEL (cfa-model.json)                                │
│  ├─ Structure: F →(λ) {X1, X2, X3} + residuals           │
│  ├─ Nodes: 1 latent + 3 manifest + 3 error terms         │
│  ├─ Paths: Factor loadings, error variances               │
│  ├─ Features: Self-loops with sides, Unicode labels       │
│  └─ Use: Latent variable & CFA export testing             │
│                                                             │
│  MEDIATION (mediation-model.json)                          │
│  ├─ Structure: Direct X→M→Y with optional c'              │
│  ├─ Nodes: 3 observed variables                            │
│  ├─ Paths: Indirect path decomposition                     │
│  ├─ Features: Path labels (a, b, c'), constraints         │
│  └─ Use: Mediation effect export & decomposition           │
│                                                             │
│  MULTILEVEL (multilevel-model.json)                        │
│  ├─ Structure: Within-level & between-level              │
│  ├─ Nodes: Variables tagged with level                     │
│  ├─ Paths: Within, between, cross-level paths             │
│  ├─ Features: levelOfMeasurement, hierarchical structure  │
│  └─ Use: Multilevel SEM export & level handling           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Test Categories & Roadmap

```
PHASE 1: FOUNDATION ✅ COMPLETE
├─ Schema validation (39 tests)
├─ Fixture validation (5 tests)
├─ Test utilities
├─ Example models
└─ Documentation

PHASE 2: CONVERTERS ⏳ READY
├─ Implement lavaan exporter
│  ├─ Path analysis → lavaan syntax
│  ├─ CFA → factor syntax
│  ├─ Mediation → indirect paths
│  └─ Multilevel → level: 2
├─ Implement OpenMx exporter
│  ├─ Path analysis → mxPath
│  ├─ CFA → mxPath + manifests/latents
│  ├─ Matrix algebra
│  └─ Constraints
└─ Test coverage (8 converter tests)

PHASE 3: INTEGRATION ⏳ READY
├─ End-to-end workflows (5 tests)
├─ CSV data handling (2 tests)
├─ Round-trip validation (2 tests)
├─ Multi-model export (1 test)
├─ Multilevel handling (2 tests)
└─ Advanced features (4 tests)

PHASE 4: REFINEMENT ⏳ PLANNED
├─ Performance testing
├─ Edge case handling
├─ Error recovery
└─ Documentation & examples
```

## Running Tests

```bash
# Run all tests (showing which are implemented vs skipped)
npm test
→ 44 passed, 24 skipped

# Watch mode for development
npm test -- --watch
→ Re-runs tests on file changes

# Interactive UI
npm run test:ui
→ Opens browser with test dashboard

# Coverage report
npm run test:coverage
→ Generate HTML coverage report
```

## Key Files Reference

| File | Purpose | Status |
|------|---------|--------|
| `vitest.config.ts` | Test runner config | ✅ |
| `package.json` | Test scripts, dependencies | ✅ |
| `tests/utils/test-helpers.ts` | Validation, fixture loading | ✅ |
| `tests/schemas/validation.test.ts` | Schema validation (39 tests) | ✅ |
| `tests/schemas/fixtures.test.ts` | Fixture validation (5 tests) | ✅ |
| `tests/converters/export.test.ts` | Export tests (8 placeholders) | ⏳ |
| `tests/integration/end-to-end.test.ts` | E2E tests (16 placeholders) | ⏳ |
| `tests/fixtures/models/*.json` | Example SEM models (4 fixtures) | ✅ |
| `tests/fixtures/data/*.csv` | Sample data for testing | ✅ |
| `tests/README.md` | Testing guide | ✅ |
| `TESTING_SETUP.md` | Detailed setup documentation | ✅ |

---

**Infrastructure Status**: ✅ Foundation complete. Ready for Phase 2 (converters).
