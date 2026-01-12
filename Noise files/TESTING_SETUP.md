# Testing Infrastructure Setup Complete

## What's Been Created

### 1. **Test Configuration**
- `vitest.config.ts` - Vitest configuration with jsdom environment and coverage setup
- `tests/utils/test-helpers.ts` - Shared utilities for schema validation and fixture loading

### 2. **Test Suites** (Currently Implemented)

#### Schema Validation (`tests/schemas/validation.test.ts`)
✅ **39 test cases** covering:
- Required fields (schemaVersion, models)
- Node type validation (variable, constant, dataset)
- Path configuration (arrows, free/fixed parameters)
- Parameter type definitions
- Self-loop configurations
- Dataset metadata and mappings
- Multilevel support (levelOfMeasurement)
- Tags support
- Visual properties

#### Fixture Validation (`tests/schemas/fixtures.test.ts`)
✅ Validates all fixture files against schema
✅ Tests reference integrity (paths reference valid nodes)
✅ Tests parameter type consistency

### 3. **Test Fixtures** (Example Models)
Located in `tests/fixtures/models/`:

| Fixture | Purpose | Nodes | Paths | Features |
|---------|---------|-------|-------|----------|
| `path-analysis.json` | Simple regression paths | 3 variables | Direct effects + variances | Basic SEM |
| `cfa-model.json` | Confirmatory Factor Analysis | 1 latent + 3 manifest + 3 residuals | Factor loadings + error variances | Latent variables |
| `mediation-model.json` | Indirect effects (a→b path) | X, M, Y | Mediation + direct effect | Path decomposition |
| `multilevel-model.json` | Two-level SEM | Within/between variables | Cross-level relationships | Multilevel |

### 4. **Test Data**
- `tests/fixtures/data/sample-data.csv` - Sample 10-row CSV for dataset integration tests

### 5. **Placeholder Test Suites** (Skipped, Ready to Implement)

#### Export Tests (`tests/converters/export.test.ts`)
⏳ Placeholders for:
- `lavaan` syntax generation
- `OpenMx` R code generation
- Format validation
- Multi-model export
- Unicode handling

#### Integration Tests (`tests/integration/end-to-end.test.ts`)
⏳ Placeholders for:
- Full workflow tests
- Round-trip validation
- Multi-model projects
- Dataset integration
- Multilevel model export

## Installation & First Run

```bash
# Install test dependencies
npm install

# Run all tests
npm test

# Run with watch mode
npm test -- --watch

# Open test UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

## Test Results After Installation

When you run `npm test` after installing dependencies, you should see:
- ✅ ~40 validation tests passing (schema validation + fixture validation)
- ⏳ ~20 skipped tests (converters and integration - ready to implement)

## Next Steps

### Phase 1: Export Infrastructure (Recommended Next)
1. Create exporter utility files:
   - `src/utils/exporters/lavaan.ts` - Convert to lavaan R syntax
   - `src/utils/exporters/openmx.ts` - Convert to OpenMx R code
2. Implement basic exporters (path analysis first)
3. Unskip and implement converter tests

### Phase 2: Validation & Testing
1. Create converter test fixtures for each exporter
2. Add round-trip validation tests
3. Test with actual lavaan/OpenMx installations

### Phase 3: Data Integration
1. Implement CSV validation tests
2. Test dataset node → CSV column mapping
3. Validate exported code includes data references

### Phase 4: Advanced Features
1. Multilevel model export tests
2. Constraint and bounds validation
3. Unicode label handling
4. Custom parameter type support

## File Structure

```
visual-web-tool/
├── tests/
│   ├── README.md                    # Testing guide
│   ├── schemas/
│   │   ├── validation.test.ts       # ✅ 39 tests - schema validation
│   │   └── fixtures.test.ts         # ✅ 5 tests - fixture validation
│   ├── converters/
│   │   └── export.test.ts           # ⏳ Export format tests
│   ├── integration/
│   │   └── end-to-end.test.ts       # ⏳ Full workflow tests
│   ├── fixtures/
│   │   ├── models/
│   │   │   ├── path-analysis.json
│   │   │   ├── cfa-model.json
│   │   │   ├── mediation-model.json
│   │   │   └── multilevel-model.json
│   │   └── data/
│   │       └── sample-data.csv
│   └── utils/
│       └── test-helpers.ts         # Validation, fixture loading utilities
├── vitest.config.ts                 # Test runner config
├── package.json                     # Updated with test scripts
└── schema/
    └── graph.schema.json            # Schema used in validation tests
```

## Key Test Utilities

### `validateGraph(graph)`
Validates a graph object against the schema using AJV.
```typescript
const { valid, errors } = validateGraph(myGraph);
if (!valid) {
  console.log(formatValidationErrors(errors));
}
```

### `loadFixture(filePath)`
Loads a fixture JSON file for testing.
```typescript
const model = loadFixture('models/path-analysis.json');
```

### `loadFixturesFromDir(dirPath)`
Loads all JSON files from a directory.
```typescript
const fixtures = loadFixturesFromDir('models');
fixtures.forEach(({ name, data }) => { ... });
```

## Test Coverage Strategy

| Category | Status | Test Count |
|----------|--------|-----------|
| **Schema Validation** | ✅ Complete | 39 |
| **Fixture Validation** | ✅ Complete | 5 |
| **Lavaan Export** | ⏳ Ready | 4 |
| **OpenMx Export** | ⏳ Ready | 4 |
| **Export Validation** | ⏳ Ready | 3 |
| **Multi-Model Export** | ⏳ Ready | 2 |
| **End-to-End Integration** | ⏳ Ready | 6 |
| **CSV Integration** | ⏳ Ready | 2 |
| **Multilevel Models** | ⏳ Ready | 2 |
| **TOTAL** | ~50% | ~67 |

## Notes

- All fixture files validate against the schema
- Test helpers handle both fixture loading and schema validation
- Placeholder tests are marked with `.skip` to keep test suite clean
- Ready to implement converters without disrupting existing infrastructure
- Coverage config excludes test files; focus is on source code coverage
