import { describe, it, expect } from 'vitest';
import { loadFixture } from '../utils/test-helpers';

describe.skip('Integration - End-to-End', () => {
  it('should complete a full workflow: create → export → validate', () => {
    // 1. Load a model
    const model = loadFixture('models/path-analysis.json');
    
    // 2. Export to lavaan
    // const lavaan = convertToLavaan(model);
    
    // 3. Validate exported syntax
    // expect(isValidLavaanSyntax(lavaan)).toBe(true);
  });

  it('should support round-trip: schema → runtime → schema', () => {
    // 1. Load schema
    const schema = loadFixture('models/cfa-model.json');
    
    // 2. Convert to runtime
    // const runtime = convertDocToRuntime(schema);
    
    // 3. Convert back to schema
    // const schemaRoundTrip = convertRuntimeToSchema(runtime);
    
    // 4. Validate it's still valid
    // expect(validateGraph(schemaRoundTrip).ok).toBe(true);
  });

  it('should handle multi-model projects', () => {
    // 1. Create multi-model project
    const project = {
      schemaVersion: 1,
      meta: { title: 'Multi-Model Project' },
      models: {
        model1: loadFixture('models/path-analysis.json').models.path_model,
        model2: loadFixture('models/cfa-model.json').models.cfa_model,
      },
    };
    
    // 2. Export each model independently
    // const exports = {};
    // for (const [modelId, model] of Object.entries(project.models)) {
    //   exports[modelId] = convertToLavaan({ models: { [modelId]: model } });
    // }
    
    // 3. Verify both models exported
    // expect(Object.keys(exports)).toHaveLength(2);
  });

  it('should preserve data mappings in dataset-linked models', () => {
    // Load model with dataset
    const model = loadFixture('models/path-analysis.json');
    
    // Add dataset if example includes one
    // const withDataset = addDatasetToModel(model, 'sample-data.csv');
    
    // Export and verify column mappings preserved
    // const exported = convertToLavaan(withDataset);
    // expect(exported).toContain('column_name');
  });

  it('should handle optimization constraints in export', () => {
    // Load model with parameter bounds
    const model = loadFixture('models/cfa-model.json');
    
    // Export with constraints
    // const lavaan = convertToLavaan(model);
    
    // Verify constraints are represented
    // expect(lavaan).toMatch(/[0-9.]*\s*<\s*\w+\s*<\s*[0-9.]*|lower=|upper=/);
  });
});

describe.skip('Integration - CSV Data Loading', () => {
  it('should load CSV and create dataset node mapping', () => {
    // const csvPath = 'tests/fixtures/data/sample-data.csv';
    // const metadata = await loadCSVMetadata(csvPath);
    
    // expect(metadata.columns).toContain('x1');
    // expect(metadata.rowCount).toBeGreaterThan(0);
  });

  it('should validate dataset node references actual CSV columns', () => {
    // const model = loadFixture('models/with-dataset.json');
    // const csvPath = 'tests/fixtures/data/sample-data.csv';
    
    // const validation = validateDatasetMapping(model, csvPath);
    // expect(validation.isValid).toBe(true);
  });
});

describe.skip('Integration - Multilevel Models', () => {
  it('should export multilevel model with level indicators', () => {
    const model = loadFixture('models/multilevel-model.json');
    
    // const lavaan = convertToLavaan(model);
    
    // Should include level specification
    // expect(lavaan).toContain('level: 2');
  });

  it('should preserve within/between variable organization', () => {
    const model = loadFixture('models/multilevel-model.json');
    
    // const export = convertToOpenMx(model);
    
    // Level information should be preserved
    // expect(export).toContain('within');
    // expect(export).toContain('between');
  });
});
