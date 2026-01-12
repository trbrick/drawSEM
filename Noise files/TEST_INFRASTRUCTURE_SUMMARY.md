# Testing Infrastructure Status

## ✅ Completed Setup

```
visual-web-tool/
│
├── 📦 Configuration
│   ├── vitest.config.ts                 [Vitest runner config]
│   ├── package.json                     [Updated with test scripts]
│   └── TESTING_SETUP.md                 [This guide]
│
├── 🧪 Test Suites
│   └── tests/
│       ├── 📋 README.md                 [Testing guide]
│       ├── 
│       ├── schemas/
│       │   ├── ✅ validation.test.ts    [39 schema tests - READY]
│       │   └── ✅ fixtures.test.ts      [5 fixture tests - READY]
│       │
│       ├── converters/
│       │   └── ⏳ export.test.ts        [Placeholders for lavaan/OpenMx]
│       │
│       ├── integration/
│       │   └── ⏳ end-to-end.test.ts    [E2E workflow tests]
│       │
│       ├── fixtures/
│       │   ├── models/
│       │   │   ├── 📊 path-analysis.json
│       │   │   ├── 📊 cfa-model.json
│       │   │   ├── 📊 mediation-model.json
│       │   │   └── 📊 multilevel-model.json
│       │   │
│       │   └── data/
│       │       └── 📄 sample-data.csv
│       │
│       └── utils/
│           └── 🔧 test-helpers.ts      [Validation & fixture utils]
```

## 📊 Test Coverage

| Component | Tests | Status |
|-----------|-------|--------|
| **Schema Validation** | 39 | ✅ Implemented & Ready |
| **Fixture Validation** | 5 | ✅ Implemented & Ready |
| **Export (lavaan/OpenMx)** | 8 | ⏳ Placeholders Ready |
| **Integration Tests** | 5 | ⏳ Placeholders Ready |
| **Data Integration** | 2 | ⏳ Placeholders Ready |
| **Multilevel Models** | 2 | ⏳ Placeholders Ready |
| **TOTAL** | ~65 | ~40% Complete |

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run tests (40+ will pass immediately)
npm test

# 3. Watch mode for development
npm test -- --watch

# 4. Interactive UI
npm run test:ui
```

## 📝 Test Examples

### Path Analysis Model
3 observed variables with direct regression paths
- X → M → Y (mediation structure)
- Covariance/variance parameters

### CFA Model
1 latent factor with 3 manifest indicators
- Factor loadings (fixed, free)
- Error variances with self-loops
- Unicode labels (λ₁, δ₂, etc.)

### Mediation Model
Classic 3-variable mediation (indirect effect)
- X → M, M → Y, X → Y
- Parameter constraints ready

### Multilevel Model
Two-level structure (students within schools)
- Within-level variables
- Between-level variables
- Cross-level relationships

## 🔄 Data Flow

```
Schema JSON (graph.schema.json)
    ↓
AJV Validator (test-helpers.ts)
    ↓
Fixture Files (models/*.json)
    ↓
Test Suites (validation.test.ts, fixtures.test.ts)
    ├─→ Export Converters [⏳ TODO]
    └─→ Integration Tests [⏳ TODO]
```

## 🎯 Next Steps Recommended

1. **Install and verify tests pass**
   ```bash
   npm install && npm test
   ```

2. **Implement first exporter (lavaan)**
   - Create `src/utils/exporters/lavaan.ts`
   - Implement basic path analysis → lavaan syntax
   - Implement converter tests

3. **Add export examples**
   - Document lavaan/OpenMx output samples
   - Create reference exports in test fixtures

4. **Multilevel & advanced support**
   - Test multilevel model export
   - Parameter bounds → constraint syntax
   - Unicode label handling

## 📚 Fixture Diversity

All fixtures are valid SEM structures representing different modeling paradigms:

- **Simple**: Path analysis (direct effects only)
- **Latent variables**: CFA (factor loadings, residuals)
- **Indirect effects**: Mediation (a-b decomposition)
- **Hierarchical**: Multilevel (within/between variables)

This ensures converters will be tested across the full range of SEM complexity.

## 🛠️ Test Utilities Reference

```typescript
// Validate a graph
const { valid, errors } = validateGraph(myGraph);

// Load fixture
const model = loadFixture('models/path-analysis.json');

// Load all fixtures
const fixtures = loadFixturesFromDir('models');

// Pretty print errors
console.log(formatValidationErrors(errors));
```

---

**Status**: Infrastructure complete. Ready for Phase 1 (exporters) and Phase 2 (integration).
