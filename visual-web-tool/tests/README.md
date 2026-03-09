# Testing Infrastructure

This directory contains all tests for the Visual Web Tool project.

## Structure

```
tests/
├── schemas/              # Schema validation tests
├── converters/          # Export format converter tests
├── fixtures/            # Test data files
│   ├── models/         # Example graph JSON files
│   └── data/           # CSV data files for testing
├── integration/        # End-to-end workflow tests
└── utils/              # Shared test utilities
```

## Quick Start

### Install Dependencies

```bash
npm install
```

This will install Vitest and related testing libraries.

### Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

### Visual Layout Reports

The layout tests (`utils/autoLayout.test.ts`) produce HTML reports for visual
validation of node positioning. Reports are written to `dist/test-reports/` and
are not committed to git.

```bash
# 1. Run the tests (writes layout data to dist/test-reports/)
npm test

# 2. Generate HTML reports from that data
npm run test:report
```

Open `dist/test-reports/index.html` in a browser to inspect diagrams for each
fixture model. Useful when modifying the RAMPath algorithm or adding new layout
fixtures.

## Test Files

### Schema Tests (`schemas/validation.test.ts`)

Tests the JSON schema validation using AJV. Covers:
- Required fields (schemaVersion, models)
- Node type validation (variable, constant, dataset)
- Path configuration options
- Parameter types and optimization settings
- Self-loop configurations
- Dataset metadata
- Multilevel node support
- Tags support

### Test Utilities (`utils/test-helpers.ts`)

Shared utilities for all tests:
- `validateGraph(graph)` - Validate a graph against the schema
- `loadFixture(filePath)` - Load a JSON fixture file
- `loadFixturesFromDir(dirPath)` - Load all JSON files from a directory
- `formatValidationErrors(errors)` - Pretty-print validation errors

## Example Fixtures

Fixture files are located in `tests/fixtures/models/` and `tests/fixtures/data/`.

### Current Fixtures

- `graph.example.json` - Reference from `examples/` (symlinked or copied)

### Adding New Fixtures

1. Create a model in `tests/fixtures/models/<model-name>.json`
2. Ensure it validates against the schema
3. Reference it in tests using `loadFixture('models/<model-name>.json')`

## Test Categories

### Schema & Validation (Current)

- ✅ Schema conformance
- ✅ Node type coverage
- ✅ Path configuration matrix
- ✅ Parameter types validation
- ⏳ Dataset validation

### Converters (Planned)

- lavaan R syntax generation
- OpenMx R code generation
- Export format correctness

### Integration (Planned)

- Round-trip validation
- Multi-model workflows
- CSV data integration

## Next Steps

1. **Install dependencies**: `npm install`
2. **Run baseline tests**: `npm test`
3. **Add example fixtures** for different SEM structures
4. **Implement converter tests** for lavaan/OpenMx export
5. **Build integration tests** for end-to-end workflows
