# Testing Infrastructure - Getting Started

## Installation & Verification (5 minutes)

```bash
cd visual-web-tool

# Install Vitest and testing dependencies
npm install

# Run tests (should see ~44 passing, 24 skipped)
npm test

# Expected output:
# ✓ tests/schemas/validation.test.ts (39)
# ✓ tests/schemas/fixtures.test.ts (5)
# ◯ tests/converters/export.test.ts (8 skipped)
# ◯ tests/integration/end-to-end.test.ts (16 skipped)
#
# Test Files  4 passed (4)
# Tests      44 passed, 24 skipped (68)
```

## What's Included

### ✅ Ready Now (Implemented)
- **Schema Validation** - 39 tests validating JSON against graph.schema.json
- **Fixture Validation** - 5 tests validating all example models
- **Test Utilities** - Schema validator, fixture loader, error formatter
- **Example Models** - 4 diverse SEM structures (path analysis, CFA, mediation, multilevel)
- **Documentation** - This guide + architecture overview

### ⏳ Placeholders Ready (Easy to Implement)
- **Export Converters** - 8 test placeholders for lavaan & OpenMx
- **Integration Tests** - 16 test placeholders for end-to-end workflows

## Next Steps (Choose One)

### Option A: Implement Export to lavaan (Recommended First)
Create `src/utils/exporters/lavaan.ts` with a function that converts models to lavaan R syntax:

```typescript
// Input: Graph model from schema
// Output: lavaan syntax string

// Example:
// Model: X → M → Y (mediation)
// Output: 
// M ~ a*X
// Y ~ b*M + cp*X
// indirect := a*b
// total := cp + a*b
```

**Time estimate**: 2-3 hours
**Test count**: 4 converter tests ready to implement

### Option B: Implement Export to OpenMx (More Complex)
Create `src/utils/exporters/openmx.ts` for OpenMx R code generation:

```typescript
// Input: Graph model
// Output: OpenMx R code

// Example:
// myModel <- mxModel(
//   type="RAM",
//   manifestVars=c("X", "M", "Y"),
//   mxPath(from="X", to="M", labels="a"),
//   ...
// )
```

**Time estimate**: 3-4 hours
**Test count**: 4 converter tests ready to implement

### Option C: Build Full Data Integration
Implement CSV data handling with dataset nodes:

```typescript
// Link dataset nodes to CSV columns
// Validate mappings
// Export with data references
```

**Time estimate**: 4-5 hours
**Test count**: 2 data integration tests ready

## Development Workflow

### 1. Start Test in Watch Mode
```bash
npm test -- --watch
```
Tests will re-run as you save files.

### 2. Open Interactive Test UI (Optional)
```bash
npm run test:ui
```
Browser dashboard shows test status in real-time.

### 3. Pick a Test Placeholder and Implement
Example: Converting path-analysis model to lavaan:

```bash
# Look at the test
cat tests/converters/export.test.ts

# See what fixture it uses
# tests/fixtures/models/path-analysis.json

# Run tests in watch
npm test -- --watch tests/converters

# Implement the converter
# Create src/utils/exporters/lavaan.ts

# Unskip the test (remove .skip)
# Tests will start running as you implement
```

### 4. Reference Fixture Models
Available in `tests/fixtures/models/`:
- `path-analysis.json` - Simplest (start here)
- `cfa-model.json` - Latent variables
- `mediation-model.json` - Indirect effects
- `multilevel-model.json` - Hierarchical structure

## Test Command Reference

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test tests/converters/export.test.ts

# Run tests matching pattern
npm test -- --grep "lavaan"

# Interactive UI
npm run test:ui

# Coverage report
npm run test:coverage

# Verbose output
npm test -- --reporter=verbose
```

## Key Files to Know

| File | Purpose |
|------|---------|
| `tests/utils/test-helpers.ts` | Use `validateGraph()`, `loadFixture()`, `formatValidationErrors()` |
| `tests/fixtures/models/*.json` | Reference models for testing |
| `schema/graph.schema.json` | Schema definition (what validators check against) |
| `TESTING_SETUP.md` | Detailed testing guide |
| `TEST_ARCHITECTURE.md` | System architecture & test flow |

## Common Tasks

### Add a New Example Model
1. Create `tests/fixtures/models/my-model.json`
2. Follow structure of existing models
3. Validate runs `npm test -- --grep "fixture"`

### Implement an Exporter
1. Create `src/utils/exporters/myformat.ts`
2. Implement conversion function
3. Unskip tests in `tests/converters/export.test.ts`
4. Watch tests fail, then pass

### Add a New Test
1. Create file in appropriate test directory
2. Use `loadFixture()` to load test data
3. Use `validateGraph()` to check validity
4. Use test utilities from `test-helpers.ts`

## Troubleshooting

### Tests don't run after `npm install`
```bash
# Make sure installation completed
npm install

# Try clearing cache
rm -rf node_modules package-lock.json
npm install

# Try running specific test
npm test tests/schemas/validation.test.ts
```

### Import errors in test files
```bash
# This is expected before npm install
# All errors will resolve after:
npm install
```

### Want to skip a test temporarily
```typescript
it.skip('test name', () => {
  // test code
});
```

### Want to run only one test
```typescript
it.only('test name', () => {
  // test code
});
```

## Success Criteria

After running `npm install && npm test`:
- [ ] See "44 passed" (validation + fixtures)
- [ ] See "24 skipped" (converter + integration placeholders)
- [ ] No errors or failures
- [ ] Output mentions all 4 test suites

## Next Phase: After Phase 1 Complete

Once you've implemented exporters:
1. All converter tests will pass
2. You can then focus on integration tests
3. End-to-end workflows verify full pipeline
4. Multi-model projects ensure proper handling

## Questions?

Refer to:
- `tests/README.md` - Testing basics
- `TESTING_SETUP.md` - Detailed guide
- `TEST_ARCHITECTURE.md` - System design
- Example tests in `tests/schemas/validation.test.ts`
